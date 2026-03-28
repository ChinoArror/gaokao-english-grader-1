import { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { buildStructuredSystemPrompt, buildStructuredUserPrompt, buildSummaryTitlePrompt, ESSAY_OCR_PROMPT, QUESTION_OCR_PROMPT } from "../promptsV2";
import { EssayType, GradeEssayRequest, GradingTaskResultEnvelope, InlineImagePart, InputMethod, StructuredReport, TaskStatus } from "../types";
import { buildTaskResultEnvelope, normalizeSummaryTitle, parseStructuredReport, reportToMarkdown, reportToStoredFeedback } from "../utils/reportUtils";

export interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    R2: R2Bucket;
    GRADING_QUEUE: any;
    API_KEY?: string;
    API_DOMAIN?: string;
    MODEL_NAME?: string;
    LISTEN_MODEL_NAME?: string;
    // SSO
    SSO_URL?: string;
    SSO_APP_ID?: string;
    SSO_SECRET_KEY?: string;
    ADMIN_USER_ID?: string; // "0" per auth-center convention
}

// ─── JWT helpers ────────────────────────────────────────────────────────────

function decodeJwtPayload(token: string): any {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        // atob works in Workers runtime
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(base64);
        return JSON.parse(json);
    } catch {
        return null;
    }
}

/** Verify JWT with Auth-Center and return user info */
async function verifySSOToken(
    token: string,
    env: Env
): Promise<{ valid: boolean; uuid?: string; userId?: string; name?: string; username?: string; isAdmin?: boolean; error?: string }> {
    const ssoUrl = env.SSO_URL || 'https://accounts.aryuki.com';
    const appId = env.SSO_APP_ID || 'gaokao-english-grader';

    // 1. Quick local expiry check
    const payload = decodeJwtPayload(token);
    if (!payload) return { valid: false, error: 'Invalid token format' };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { valid: false, error: 'Token expired' };

    // 2. Authoritative remote verification
    let verifyRes: Response;
    try {
        verifyRes = await fetch(`${ssoUrl}/api/verify?app_id=${appId}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(6000),
        });
    } catch (e: any) {
        return { valid: false, error: `SSO network error: ${e?.message}` };
    }

    if (!verifyRes.ok) {
        return { valid: false, error: `SSO verify failed: HTTP ${verifyRes.status}` };
    }

    // payload already decoded above; trust it after remote OK
    const adminUserId = env.ADMIN_USER_ID ?? '0';
    const userIdStr = String(payload.user_id ?? payload.userId ?? '');
    const isAdmin = userIdStr === adminUserId;

    return {
        valid: true,
        uuid: payload.uuid,
        userId: userIdStr,
        name: payload.name,
        username: payload.username,
        isAdmin,
    };
}

// ─── D1 user upsert ──────────────────────────────────────────────────────────

async function ensureUsersTable(db: D1Database) {
    await db.prepare(
        'CREATE TABLE IF NOT EXISTS users (' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
        'uuid TEXT NOT NULL UNIQUE,' +
        'user_id INTEGER,' +
        'name TEXT,' +
        'username TEXT,' +
        'token TEXT,' +
        'first_seen TEXT NOT NULL,' +
        'last_seen TEXT NOT NULL' +
        ')'
    ).run();
}

async function upsertUser(db: D1Database, info: { uuid: string; userId: string; name: string; username: string; token: string }): Promise<void> {
    const now = new Date().toISOString();
    await db.prepare(
        'INSERT INTO users (uuid, user_id, name, username, token, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(uuid) DO UPDATE SET user_id=excluded.user_id, name=excluded.name, username=excluded.username, token=excluded.token, last_seen=excluded.last_seen'
    ).bind(info.uuid, parseInt(info.userId) || 0, info.name, info.username, info.token, now, now).run();
}

/** Returns the D1 integer id for a user given their uuid (creates if not exist) */
async function getOrCreateUserId(db: D1Database, uuid: string): Promise<number> {
    const row = await db.prepare('SELECT id FROM users WHERE uuid = ?').bind(uuid).first<{ id: number }>();
    return row?.id ?? 99999;
}

// ─── Quota helpers ───────────────────────────────────────────────────────────

async function checkQuota(uuid: string, env: Env): Promise<void> {
    const url = `${env.SSO_URL || 'https://accounts.aryuki.com'}/api/quota/check?uuid=${uuid}&app_id=${env.SSO_APP_ID}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.SSO_SECRET_KEY}` },
        signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
        if (res.status === 429) throw new Error('用量超限，请稍后再试或联系管理员增加额度');
        if (res.status === 403) throw new Error('当前用户未获得该应用的访问权限');
        throw new Error(`权限校验失败：${res.status}`);
    }
}

async function consumeQuota(uuid: string, tokens: number, env: Env): Promise<void> {
    try {
        await fetch(`${env.SSO_URL || 'https://accounts.aryuki.com'}/api/quota/consume`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${env.SSO_SECRET_KEY}`,
            },
            body: JSON.stringify({ uuid, app_id: env.SSO_APP_ID, tokens }),
        });
    } catch (e) {
        console.error('consumeQuota failed:', e);
    }
}

// ─── Auth token extract ──────────────────────────────────────────────────────

function getAuthToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
}

const GRADE_CONTINUE_PROMPT =
    'Continue the previous JSON response exactly from where it stopped. Do not restart the JSON object. Output only the remaining JSON text.';

function extractCandidateText(candidate: any): string {
    const parts = candidate?.content?.parts || [];
    return parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('');
}

function isTruncatedCandidate(candidate: any): boolean {
    const finishReason = String(candidate?.finishReason || '').toUpperCase();
    return finishReason.includes('MAX');
}

function buildInlineParts(images: InlineImagePart[]) {
    return images.map((image) => ({
        inlineData: {
            mimeType: image.mimeType,
            data: image.data,
        },
    }));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';

    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

async function fileToInlineImagePart(file: File): Promise<InlineImagePart> {
    return {
        mimeType: file.type || 'application/octet-stream',
        data: arrayBufferToBase64(await file.arrayBuffer()),
    };
}

function readFormValue(formData: FormData, key: string): string {
    const value = formData.get(key);
    return typeof value === 'string' ? value : '';
}

type ParsedGradeEssayBody = GradeEssayRequest & {
    questionImageFiles?: File[];
    essayImageFiles?: File[];
};

type QueueTaskMessage = {
    task_uuid: string;
    user_id: number;
    user_uuid: string;
    payload_r2_key: string;
};

type StoredTaskPayload = {
    task_uuid: string;
    user_id: number;
    user_uuid: string;
    type: EssayType;
    method: InputMethod;
    questionText: string;
    essayContent: string;
    questionImages: InlineImagePart[];
    essayImages: InlineImagePart[];
};

type TaskRow = {
    task_uuid: string;
    user_id: number;
    status: TaskStatus;
    essay_type: EssayType;
    input_method: InputMethod;
    summary_title: string | null;
    topic: string | null;
    original_content: string | null;
    transcription: string | null;
    report_json: string | null;
    error_message: string | null;
    payload_r2_key: string | null;
    history_id: number | null;
    created_at: number;
    updated_at: number;
};

async function parseGradeEssayBody(request: Request): Promise<ParsedGradeEssayBody> {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const questionImageFiles = formData.getAll('questionImages').filter((entry): entry is File => entry instanceof File);
        const essayImageFiles = formData.getAll('essayImages').filter((entry): entry is File => entry instanceof File);

        return {
            type: readFormValue(formData, 'type') as EssayType,
            method: readFormValue(formData, 'method') as InputMethod,
            questionText: readFormValue(formData, 'questionText'),
            essayContent: readFormValue(formData, 'essayContent'),
            questionImages: [],
            essayImages: [],
            questionImageFiles,
            essayImageFiles,
        };
    }

    return await request.json() as ParsedGradeEssayBody;
}

const TASK_PAYLOAD_PREFIX = 'grading-tasks';

const buildTaskPayloadKey = (userId: number, taskUuid: string) =>
    `${TASK_PAYLOAD_PREFIX}/${userId}/${taskUuid}.json`;

const jsonStringify = (value: unknown) => JSON.stringify(value, null, 2);

async function ensureTaskTables(db: D1Database) {
    await db.prepare(
        'CREATE TABLE IF NOT EXISTS grading_tasks (' +
        'task_uuid TEXT PRIMARY KEY,' +
        'user_id INTEGER NOT NULL,' +
        'status TEXT NOT NULL,' +
        'essay_type TEXT NOT NULL,' +
        'input_method TEXT NOT NULL,' +
        'summary_title TEXT,' +
        'topic TEXT,' +
        'original_content TEXT,' +
        'transcription TEXT,' +
        'report_json TEXT,' +
        'error_message TEXT,' +
        'payload_r2_key TEXT,' +
        'history_id INTEGER,' +
        'created_at INTEGER NOT NULL,' +
        'updated_at INTEGER NOT NULL' +
        ')'
    ).run();

    await db.prepare(
        'CREATE TABLE IF NOT EXISTS task_user_locks (' +
        'user_id INTEGER PRIMARY KEY,' +
        'task_uuid TEXT NOT NULL,' +
        'locked_at INTEGER NOT NULL' +
        ')'
    ).run();

    try {
        await db.prepare('ALTER TABLE history ADD COLUMN task_uuid TEXT').run();
    } catch {
        // ignore if already exists
    }

    await db.prepare('CREATE INDEX IF NOT EXISTS idx_grading_tasks_user_created_at ON grading_tasks(user_id, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_grading_tasks_status_created_at ON grading_tasks(status, created_at DESC)').run();
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_history_task_uuid ON history(task_uuid) WHERE task_uuid IS NOT NULL').run();
}

async function saveTaskPayload(env: Env, payload: StoredTaskPayload) {
    const key = buildTaskPayloadKey(payload.user_id, payload.task_uuid);
    await env.R2.put(key, jsonStringify(payload), {
        httpMetadata: { contentType: 'application/json' },
    });
    return key;
}

async function loadTaskPayload(env: Env, payloadKey: string): Promise<StoredTaskPayload> {
    const object = await env.R2.get(payloadKey);
    if (!object) {
        throw new Error('Task payload not found');
    }

    const raw = await object.text();
    return JSON.parse(raw) as StoredTaskPayload;
}

async function createQueuedTask(db: D1Database, params: {
    task_uuid: string;
    user_id: number;
    essay_type: EssayType;
    input_method: InputMethod;
    topic: string;
    payload_r2_key: string;
    timestamp: number;
}) {
    await db.prepare(
        'INSERT INTO grading_tasks (task_uuid, user_id, status, essay_type, input_method, summary_title, topic, payload_r2_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
        params.task_uuid,
        params.user_id,
        'queued',
        params.essay_type,
        params.input_method,
        normalizeSummaryTitle('', params.task_uuid, 'queued'),
        params.topic,
        params.payload_r2_key,
        params.timestamp,
        params.timestamp
    ).run();
}

async function getTaskRow(db: D1Database, taskUuid: string, userId?: number): Promise<TaskRow | null> {
    const sql = userId == null
        ? 'SELECT * FROM grading_tasks WHERE task_uuid = ?'
        : 'SELECT * FROM grading_tasks WHERE task_uuid = ? AND user_id = ?';
    const stmt = db.prepare(sql);
    const row = userId == null
        ? await stmt.bind(taskUuid).first<TaskRow>()
        : await stmt.bind(taskUuid, userId).first<TaskRow>();
    return row || null;
}

async function getLatestActiveTaskRow(db: D1Database, userId: number): Promise<TaskRow | null> {
    const row = await db.prepare(
        'SELECT * FROM grading_tasks WHERE user_id = ? AND status IN (?, ?) ORDER BY created_at DESC LIMIT 1'
    ).bind(userId, 'queued', 'processing').first<TaskRow>();
    return row || null;
}

function parseTaskReport(row: TaskRow): StructuredReport | null {
    if (!row.report_json) return null;
    return parseStructuredReport(row.report_json);
}

function buildTaskResponse(row: TaskRow): GradingTaskResultEnvelope {
    return buildTaskResultEnvelope({
        task_uuid: row.task_uuid,
        status: row.status,
        essayType: row.essay_type,
        inputMethod: row.input_method,
        summaryTitle: normalizeSummaryTitle(row.summary_title || undefined, row.task_uuid, row.status),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        topic: row.topic || undefined,
        originalContent: row.original_content || undefined,
        transcription: row.transcription || undefined,
        report: parseTaskReport(row),
        errorMessage: row.error_message || undefined,
    });
}

async function acquireUserTaskLock(db: D1Database, userId: number, taskUuid: string, now: number) {
    const result = await db.prepare(
        'INSERT OR IGNORE INTO task_user_locks (user_id, task_uuid, locked_at) VALUES (?, ?, ?)'
    ).bind(userId, taskUuid, now).run();

    return Number(result.meta?.changes || 0) > 0;
}

async function releaseUserTaskLock(db: D1Database, userId: number, taskUuid: string) {
    await db.prepare('DELETE FROM task_user_locks WHERE user_id = ? AND task_uuid = ?').bind(userId, taskUuid).run();
}

async function updateTaskStatus(db: D1Database, taskUuid: string, status: TaskStatus, extra?: Record<string, unknown>) {
    const now = Math.floor(Date.now() / 1000);
    const fields = ['status = ?', 'updated_at = ?'];
    const values: unknown[] = [status, now];

    if (extra) {
        for (const [key, value] of Object.entries(extra)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
    }

    values.push(taskUuid);
    await db.prepare(`UPDATE grading_tasks SET ${fields.join(', ')} WHERE task_uuid = ?`).bind(...values).run();
}

async function generateSummaryTitle(apiUrl: string, type: EssayType, questionText: string, essayText: string) {
    const data = await runGeminiRequest(apiUrl, {
        contents: [{
            role: 'user',
            parts: [{ text: buildSummaryTitlePrompt(type, questionText, essayText) }],
        }],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 96,
        },
    });

    return extractCandidateText(data.candidates?.[0]).trim().replace(/^["'\s]+|["'\s]+$/g, '');
}

async function runGeminiRequest(apiUrl: string, body: unknown): Promise<any> {
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API Error ${response.status}: ${errorText}`);
    }

    return response.json() as any;
}

async function transcribeSingleImage(
    apiUrl: string,
    prompt: string,
    image: InlineImagePart,
    pageIndex = 0,
    pageCount = 1
): Promise<string> {
    const data = await runGeminiRequest(apiUrl, {
        contents: [{
            role: 'user',
            parts: [
                {
                    text: pageCount > 1
                        ? `${prompt}\n\nThis is page ${pageIndex + 1} of ${pageCount}. Transcribe only this page and keep the natural reading order.`
                        : prompt,
                },
                ...buildInlineParts([image]),
            ],
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 3072,
        },
    });

    return extractCandidateText(data.candidates?.[0]).trim();
}

async function transcribeImages(
    apiUrl: string,
    prompt: string,
    inlineImages: InlineImagePart[] = [],
    imageFiles: File[] = []
): Promise<string> {
    const sources: Array<() => Promise<InlineImagePart>> = [
        ...inlineImages.map((image) => async () => image),
        ...imageFiles.map((file) => async () => fileToInlineImagePart(file)),
    ];

    if (!sources.length) return '';

    const pages: string[] = [];

    for (let index = 0; index < sources.length; index++) {
        const image = await sources[index]();
        const pageText = await transcribeSingleImage(apiUrl, prompt, image, index, sources.length);
        if (pageText) {
            pages.push(pageText);
        }
    }

    return pages.join('\n\n');
}

async function processQueuedTask(message: QueueTaskMessage, env: Env, ctx: ExecutionContext) {
    const now = Math.floor(Date.now() / 1000);
    const lockAcquired = await acquireUserTaskLock(env.DB, message.user_id, message.task_uuid, now);

    if (!lockAcquired) {
        return { shouldRetry: true };
    }

    try {
        await updateTaskStatus(env.DB, message.task_uuid, 'processing', {
            error_message: null,
        });

        const payload = await loadTaskPayload(env, message.payload_r2_key);
        const apiKey = env.API_KEY;
        if (!apiKey) {
            throw new Error('API_KEY not configured');
        }

        const modelName = env.MODEL_NAME || 'gemini-3-pro-preview';
        const apiUrl = `https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        let finalQuestionText = (payload.questionText || '').trim();
        let finalEssayContent = (payload.essayContent || '').trim();
        let transcription = finalEssayContent;

        if (payload.method === InputMethod.IMAGE) {
            if (!payload.essayImages.length) {
                throw new Error('No essay images provided');
            }

            const [questionOcr, essayOcr] = await Promise.all([
                payload.questionImages.length
                    ? transcribeImages(apiUrl, QUESTION_OCR_PROMPT, payload.questionImages)
                    : Promise.resolve(''),
                transcribeImages(apiUrl, ESSAY_OCR_PROMPT, payload.essayImages),
            ]);

            if (!finalQuestionText) finalQuestionText = questionOcr.trim();
            finalEssayContent = essayOcr.trim();
            transcription = finalEssayContent;
        }

        if (!finalEssayContent) {
            throw new Error('No essay content available for grading');
        }

        const gradingPayload = {
            systemInstruction: {
                parts: [{ text: buildStructuredSystemPrompt(payload.type) }],
            },
            contents: [{
                role: 'user',
                parts: [{
                    text: buildStructuredUserPrompt(payload.type, finalQuestionText, finalEssayContent),
                }],
            }],
            generationConfig: {
                temperature: 0.35,
                maxOutputTokens: payload.type === EssayType.PRACTICAL ? 10240 : 12288,
                responseMimeType: 'application/json',
            },
        };

        const data = await runGeminiRequest(apiUrl, gradingPayload);
        const mergedResponses: string[] = [];
        let latestCandidate = data.candidates?.[0];
        let finishReason = latestCandidate?.finishReason || null;
        let totalTokenCount = data.usageMetadata?.totalTokenCount || 0;

        if (latestCandidate) {
            const initialText = extractCandidateText(latestCandidate);
            if (initialText) mergedResponses.push(initialText);
        }

        let truncated = isTruncatedCandidate(latestCandidate);
        let continuationCount = 0;

        while (truncated && continuationCount < 2) {
            continuationCount++;

            const continuationPayload = {
                ...gradingPayload,
                contents: [
                    ...(gradingPayload.contents || []),
                    { role: 'model', parts: [{ text: mergedResponses.join('') }] },
                    { role: 'user', parts: [{ text: GRADE_CONTINUE_PROMPT }] },
                ],
            };

            const continuationData = await runGeminiRequest(apiUrl, continuationPayload);
            latestCandidate = continuationData.candidates?.[0];
            finishReason = latestCandidate?.finishReason || finishReason;
            totalTokenCount += continuationData.usageMetadata?.totalTokenCount || 0;

            const continuationText = extractCandidateText(latestCandidate);
            if (!continuationText) break;

            mergedResponses.push(continuationText);
            truncated = isTruncatedCandidate(latestCandidate);
        }

        const combinedResponseText = mergedResponses.join('');
        const report = parseStructuredReport(combinedResponseText);
        if (!report) {
            throw new Error('Failed to parse structured grading report');
        }

        const summaryTitle = normalizeSummaryTitle(
            await generateSummaryTitle(apiUrl, payload.type, finalQuestionText, finalEssayContent),
            payload.task_uuid,
            'successful'
        );
        const storedFeedback = reportToStoredFeedback(report);
        const timestamp = Math.floor(Date.now() / 1000);

        await updateTaskStatus(env.DB, payload.task_uuid, 'successful', {
            summary_title: summaryTitle,
            topic: finalQuestionText || summaryTitle,
            original_content: transcription,
            transcription,
            report_json: storedFeedback,
            error_message: null,
            payload_r2_key: null,
        });

        await env.DB.prepare(
            'INSERT INTO history (user_id, timestamp, topic, original_content, feedback, task_uuid) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
            payload.user_id,
            timestamp,
            summaryTitle,
            transcription,
            storedFeedback,
            payload.task_uuid
        ).run();

        const historyRow = await env.DB.prepare(
            'SELECT id FROM history WHERE task_uuid = ?'
        ).bind(payload.task_uuid).first<{ id: number }>();

        await env.DB.prepare(
            'UPDATE grading_tasks SET history_id = ?, updated_at = ? WHERE task_uuid = ?'
        ).bind(historyRow?.id || null, timestamp, payload.task_uuid).run();

        const estimatedTokens = totalTokenCount ||
            Math.ceil((JSON.stringify(gradingPayload).length + storedFeedback.length + transcription.length) / 4);

        ctx.waitUntil(Promise.all([
            env.DB.prepare('INSERT INTO usage_logs (user_id, timestamp, action_type, tokens) VALUES (?, ?, ?, ?)')
                .bind(payload.user_id, timestamp, 'grade_success', estimatedTokens).run(),
            payload.user_uuid ? consumeQuota(payload.user_uuid, estimatedTokens, env) : Promise.resolve(),
        ]));

        await env.R2.delete(message.payload_r2_key);

        return { shouldRetry: false, finishReason, continuationCount, truncated };
    } catch (error: any) {
        const failedAt = Math.floor(Date.now() / 1000);
        await updateTaskStatus(env.DB, message.task_uuid, 'failed', {
            summary_title: normalizeSummaryTitle('', message.task_uuid, 'failed'),
            error_message: String(error?.message || 'Task processing failed').slice(0, 1000),
            payload_r2_key: null,
        });

        ctx.waitUntil(
            env.DB.prepare('INSERT INTO usage_logs (user_id, timestamp, action_type, error_details) VALUES (?, ?, ?, ?)')
                .bind(message.user_id, failedAt, 'grade_error', String(error?.message || 'Queue processing failed').slice(0, 200)).run()
        );

        await env.R2.delete(message.payload_r2_key).catch(() => undefined);

        return { shouldRetry: false };
    } finally {
        await releaseUserTaskLock(env.DB, message.user_id, message.task_uuid);
    }
}

// ─── Main fetch handler ──────────────────────────────────────────────────────

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const jsonResponse = (data: any, status = 200) =>
            new Response(JSON.stringify(data), {
                status,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });

        try {
            await ensureUsersTable(env.DB);
            await ensureTaskTables(env.DB);

            // ══════════════════════════════════════════════════════════════════
            // SSO Callback — frontend posts the JWT token here after redirect
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/sso-callback' && request.method === 'POST') {
                let token: string;
                try {
                    const body = await request.json<{ token: string }>();
                    token = body?.token;
                } catch {
                    return jsonResponse({ success: false, message: 'Invalid request body' }, 400);
                }
                if (!token) return jsonResponse({ success: false, message: 'No token provided' }, 400);

                const ssoResult = await verifySSOToken(token, env);
                if (!ssoResult.valid) {
                    return jsonResponse({ success: false, message: ssoResult.error }, 401);
                }

                // Upsert user into local D1
                try {
                    await ensureUsersTable(env.DB);
                    await upsertUser(env.DB, {
                        uuid: ssoResult.uuid!,
                        userId: ssoResult.userId!,
                        name: ssoResult.name || ssoResult.username || '',
                        username: ssoResult.username || '',
                        token,
                    });
                } catch (dbErr: any) {
                    return jsonResponse({ success: false, message: `Database error: ${dbErr?.message}` }, 500);
                }

                return jsonResponse({
                    success: true,
                    uuid: ssoResult.uuid,
                    user_id: ssoResult.userId,
                    name: ssoResult.name,
                    username: ssoResult.username,
                    isAdmin: ssoResult.isAdmin,
                });
            }

            // ══════════════════════════════════════════════════════════════════
            // Verify session — frontend calls this on load to check JWT validity
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ valid: false }, 401);

                const ssoResult = await verifySSOToken(token, env);
                if (!ssoResult.valid) return jsonResponse({ valid: false, error: ssoResult.error }, 401);

                return jsonResponse({
                    valid: true,
                    role: ssoResult.isAdmin ? 'admin' : 'user',
                    username: ssoResult.username,
                    name: ssoResult.name,
                    uuid: ssoResult.uuid,
                    userId: ssoResult.userId,
                });
            }

            // ══════════════════════════════════════════════════════════════════
            // Logout — clear SSO cookie via auth-center proxy
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
                // Proxy to auth-center logout (fire-and-forget)
                ctx.waitUntil(
                    fetch(`${env.SSO_URL || 'https://accounts.aryuki.com'}/api/logout`, {
                        method: 'POST',
                        headers: { Cookie: request.headers.get('Cookie') || '' },
                    }).catch(() => { })
                );
                return jsonResponse({ success: true });
            }

            // ══════════════════════════════════════════════════════════════════
            // Admin - Stats
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid || !sso.isAdmin) return jsonResponse({ error: 'Unauthorized' }, 403);

                const urlParams = new URLSearchParams(url.search);
                const period = urlParams.get('period') || 'daily';
                let timeFormat = '%Y-%m-%d';
                if (period === 'monthly') timeFormat = '%Y-%m';

                const stats = await env.DB.prepare(
                    `SELECT strftime('${timeFormat}', datetime(timestamp, 'unixepoch')) as date, user_id, ` +
                    `COUNT(CASE WHEN action_type = 'grade_success' THEN 1 END) as success_count, ` +
                    `COUNT(CASE WHEN action_type = 'grade_error' THEN 1 END) as error_count, ` +
                    `CAST(SUM(tokens) AS FLOAT) / 1000.0 as total_tokens ` +
                    `FROM usage_logs WHERE 1=1 GROUP BY date ORDER BY date DESC LIMIT 100`
                ).all();

                // Enrich with usernames from new users table
                const userIds = [...new Set(stats.results.map((r: any) => r.user_id).filter((id: any) => id != null))];
                let userMap: Record<number, string> = {};
                if (userIds.length > 0) {
                    const placeholders = userIds.map(() => '?').join(',');
                    const users = await env.DB.prepare(`SELECT id, username, name FROM users WHERE id IN (${placeholders})`).bind(...userIds).all();
                    users.results.forEach((u: any) => { userMap[u.id] = u.name || u.username || `User ${u.id}`; });
                }

                const enriched = stats.results.map((r: any) => ({
                    ...r,
                    username: r.user_id === 0 ? 'Admin' : (userMap[r.user_id] || 'Unknown'),
                }));

                return jsonResponse({ stats: enriched });
            }

            // ══════════════════════════════════════════════════════════════════
            // Admin - Users list (simplified: uuid, username, last_seen for cookie expiry display)
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/admin/users' && request.method === 'GET') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid || !sso.isAdmin) return jsonResponse({ error: 'Unauthorized' }, 403);

                const users = await env.DB.prepare(
                    'SELECT uuid, username, name, last_seen FROM users WHERE id != 0 ORDER BY last_seen DESC'
                ).all();
                return jsonResponse({ users: users.results });
            }

            // ══════════════════════════════════════════════════════════════════
            // History endpoints
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/history' && request.method === 'GET') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                let history;
                if (sso.isAdmin) {
                    history = await env.DB.prepare(
                        'SELECT h.*, u.username FROM history h LEFT JOIN users u ON h.user_id = u.id ORDER BY h.timestamp DESC'
                    ).all();
                } else {
                    const dbId = await getOrCreateUserId(env.DB, sso.uuid!);
                    history = await env.DB.prepare(
                        'SELECT * FROM history WHERE user_id = ? ORDER BY timestamp DESC'
                    ).bind(dbId).all();
                }
                return jsonResponse({ history: history.results });
            }

            if (url.pathname.startsWith('/api/history/') && request.method === 'DELETE') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const historyId = url.pathname.split('/').pop();

                if (!sso.isAdmin) {
                    const dbId = await getOrCreateUserId(env.DB, sso.uuid!);
                    const record = await env.DB.prepare('SELECT user_id FROM history WHERE id = ?').bind(historyId).first();
                    if (!record || (record as any).user_id !== dbId) {
                        return jsonResponse({ error: 'Forbidden' }, 403);
                    }
                }

                await env.DB.prepare('DELETE FROM history WHERE id = ?').bind(historyId).run();
                return jsonResponse({ success: true });
            }

            // ══════════════════════════════════════════════════════════════════
            // Grade essay — with quota pre-check and async post-deduction
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/grade' && request.method === 'POST') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const contentLength = Number(request.headers.get('content-length') || '0');
                if (contentLength > 10 * 1024 * 1024) {
                    return jsonResponse({ error: 'Uploaded images are too large. Please reduce the image count or file size and try again.' }, 413);
                }

                // Pre-check quota (blocks if exceeded)
                if (!sso.isAdmin) {
                    try {
                        await checkQuota(sso.uuid!, env);
                    } catch (e: any) {
                        return jsonResponse({ error: e.message }, 429);
                    }
                }

                const body = await parseGradeEssayBody(request);
                const {
                    type,
                    method,
                    questionText = '',
                    essayContent = '',
                    questionImages = [],
                    essayImages = [],
                    questionImageFiles = [],
                    essayImageFiles = [],
                } = body;

                if (type !== EssayType.PRACTICAL && type !== EssayType.CONTINUATION) {
                    return jsonResponse({ error: 'Invalid essay type' }, 400);
                }

                const apiKey = env.API_KEY;
                if (!apiKey) return jsonResponse({ error: 'API_KEY not configured' }, 500);

                const modelName = env.MODEL_NAME || 'gemini-3-pro-preview';
                const apiUrl = `https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

                let finalQuestionText = questionText.trim();
                let finalEssayContent = essayContent.trim();
                let transcription = finalEssayContent;

                try {
                    if (method === 'IMAGE') {
                        if (!essayImages.length && !essayImageFiles.length) {
                            return jsonResponse({ error: 'No essay images provided' }, 400);
                        }

                        const [questionOcr, essayOcr] = await Promise.all([
                            questionImages.length || questionImageFiles.length
                                ? transcribeImages(apiUrl, QUESTION_OCR_PROMPT, questionImages, questionImageFiles)
                                : Promise.resolve(''),
                            transcribeImages(apiUrl, ESSAY_OCR_PROMPT, essayImages, essayImageFiles),
                        ]);

                        if (!finalQuestionText) finalQuestionText = questionOcr.trim();
                        finalEssayContent = essayOcr.trim();
                        transcription = finalEssayContent;
                    }
                } catch (ocrError: any) {
                    return jsonResponse({ error: 'Failed to transcribe uploaded images', details: ocrError?.message }, 500);
                }

                if (!finalEssayContent) {
                    return jsonResponse({ error: 'No essay content available for grading' }, 400);
                }

                const gradingPayload = {
                    systemInstruction: {
                        parts: [{ text: buildStructuredSystemPrompt(type) }],
                    },
                    contents: [{
                        role: 'user',
                        parts: [{
                            text: buildStructuredUserPrompt(type, finalQuestionText, finalEssayContent),
                        }],
                    }],
                    generationConfig: {
                        temperature: 0.35,
                        maxOutputTokens: type === EssayType.PRACTICAL ? 10240 : 12288,
                        responseMimeType: 'application/json',
                    },
                };

                let data: any;
                try {
                    data = await runGeminiRequest(apiUrl, gradingPayload);
                } catch (apiError: any) {
                    const now = Math.floor(Date.now() / 1000);
                    const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');
                    ctx.waitUntil(
                        env.DB.prepare('INSERT INTO usage_logs (user_id, timestamp, action_type, error_details) VALUES (?, ?, ?, ?)')
                            .bind(dbId, now, 'grade_error', String(apiError?.message || 'Gemini request failed').substring(0, 200)).run()
                    );
                    return jsonResponse({ error: 'Gemini API Error', details: apiError?.message }, 500);
                }

                const mergedResponses: string[] = [];
                let latestData = data;
                let latestCandidate = data.candidates?.[0];
                let finishReason = latestCandidate?.finishReason || null;
                let totalTokenCount = data.usageMetadata?.totalTokenCount || 0;

                if (latestCandidate) {
                    const initialText = extractCandidateText(latestCandidate);
                    if (initialText) mergedResponses.push(initialText);
                }

                let truncated = isTruncatedCandidate(latestCandidate);
                let continuationCount = 0;

                while (truncated && continuationCount < 2) {
                    continuationCount++;

                    const continuationPayload = {
                        ...gradingPayload,
                        contents: [
                            ...(gradingPayload.contents || []),
                            { role: 'model', parts: [{ text: mergedResponses.join('') }] },
                            { role: 'user', parts: [{ text: GRADE_CONTINUE_PROMPT }] },
                        ],
                    };

                    try {
                        const continuationData = await runGeminiRequest(apiUrl, continuationPayload);
                        latestData = continuationData;
                        latestCandidate = continuationData.candidates?.[0];
                        finishReason = latestCandidate?.finishReason || finishReason;
                        totalTokenCount += continuationData.usageMetadata?.totalTokenCount || 0;

                        const continuationText = extractCandidateText(latestCandidate);
                        if (!continuationText) break;

                        mergedResponses.push(continuationText);
                        truncated = isTruncatedCandidate(latestCandidate);
                    } catch (continuationError) {
                        console.warn('Gemini continuation request failed:', continuationError);
                        break;
                    }
                }

                const combinedResponseText = mergedResponses.join('');
                const report = parseStructuredReport(combinedResponseText);
                if (!report) {
                    return jsonResponse({
                        error: 'Failed to parse structured grading report',
                        raw: combinedResponseText.slice(0, 4000),
                    }, 500);
                }

                const storedFeedback = reportToStoredFeedback(report);
                const markdown = reportToMarkdown(report, {
                    topic: finalQuestionText || 'Essay Grading',
                    originalContent: transcription,
                    date: new Date().toISOString().slice(0, 10),
                });

                const now = Math.floor(Date.now() / 1000);
                const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');

                // Save history synchronously (user needs it)
                await env.DB.prepare(
                    'INSERT INTO history (user_id, timestamp, topic, original_content, feedback) VALUES (?, ?, ?, ?, ?)'
                ).bind(dbId, now, finalQuestionText || 'Essay Grading', transcription, storedFeedback).run();

                // Estimate tokens
                const estimatedTokens = totalTokenCount ||
                    Math.ceil((JSON.stringify(gradingPayload).length + storedFeedback.length + transcription.length) / 4);

                // Async: log usage + consume quota (fire-and-forget)
                ctx.waitUntil(Promise.all([
                    env.DB.prepare('INSERT INTO usage_logs (user_id, timestamp, action_type, tokens) VALUES (?, ?, ?, ?)')
                        .bind(dbId, now, 'grade_success', estimatedTokens).run(),
                    sso.isAdmin ? Promise.resolve() : consumeQuota(sso.uuid!, estimatedTokens, env),
                ]));

                return jsonResponse({
                    ...latestData,
                    report,
                    feedback: storedFeedback,
                    markdown,
                    transcription,
                    finishReason,
                    truncated,
                    continuationCount,
                });
            }

            // ══════════════════════════════════════════════════════════════════
            // Audio Upload
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/audio/upload' && request.method === 'POST') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const formData = await request.formData();
                const file = formData.get('file') as File;
                if (!file) return jsonResponse({ error: 'No file uploaded' }, 400);

                const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');
                const key = `users/${dbId}/uploads/${crypto.randomUUID()}-${file.name}`;

                await env.R2.put(key, file.stream() as any, {
                    httpMetadata: { contentType: file.type },
                });

                const nowSec = Math.floor(Date.now() / 1000);
                await env.DB.prepare(
                    'INSERT INTO audio_uploads (user_id, filename, file_key, created_at) VALUES (?, ?, ?, ?)'
                ).bind(dbId, file.name, key, nowSec).run();

                return jsonResponse({ success: true, key, url: `/api/audio/proxy/${key}` });
            }

            // ══════════════════════════════════════════════════════════════════
            // Audio Proxy
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname.startsWith('/api/audio/proxy/') && request.method === 'GET') {
                const rawKey = url.pathname.replace('/api/audio/proxy/', '');
                const key = decodeURIComponent(rawKey);
                const object = await env.R2.get(key);
                if (!object) return new Response('File not found', { status: 404 });

                const headers = new Headers() as any;
                object.writeHttpMetadata(headers);
                headers.set('etag', object.httpEtag);
                return new Response(object.body as any, { headers });
            }

            // ══════════════════════════════════════════════════════════════════
            // Audio Segmentation — with quota pre-check and async post-deduction
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/audio/segment' && request.method === 'POST') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                // Pre-check quota
                if (!sso.isAdmin) {
                    try {
                        await checkQuota(sso.uuid!, env);
                    } catch (e: any) {
                        return jsonResponse({ error: e.message }, 429);
                    }
                }

                const { key } = await request.json() as { key: string };
                if (!key) return jsonResponse({ error: 'No key provided' }, 400);

                const object = await env.R2.get(key);
                if (!object) return jsonResponse({ error: 'File not found' }, 404);

                const apiKey = env.API_KEY;
                if (!apiKey) return jsonResponse({ error: 'API_KEY/Configuration error' }, 500);

                // Upload to Google AI File API
                const uploadUrlInit = `https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/upload/v1beta/files?key=${apiKey}`;
                const displayName = key.split('/').pop() || key;
                const contentType = object.httpMetadata?.contentType || 'audio/mpeg';

                const initRes = await fetch(uploadUrlInit, {
                    method: 'POST',
                    headers: {
                        'X-Goog-Upload-Protocol': 'resumable',
                        'X-Goog-Upload-Command': 'start',
                        'X-Goog-Upload-Header-Content-Length': object.size.toString(),
                        'X-Goog-Upload-Header-Content-Type': contentType,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ file: { display_name: displayName } }),
                });

                if (!initRes.ok) {
                    const errorText = await initRes.text();
                    return jsonResponse({ error: 'Google Upload Init Failed', details: errorText }, 500);
                }

                const uploadUrl = initRes.headers.get('x-goog-upload-url');
                if (!uploadUrl) return jsonResponse({ error: 'No upload URL received' }, 500);

                const uploadRes = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Length': object.size.toString(),
                        'X-Goog-Upload-Command': 'upload, finalize',
                        'X-Goog-Upload-Offset': '0',
                    },
                    body: object.body as any,
                });

                if (!uploadRes.ok) {
                    const errorText = await uploadRes.text();
                    return jsonResponse({ error: 'Google Upload Content Failed', details: errorText }, 500);
                }

                const fileData = await uploadRes.json() as any;
                const fileUri = fileData.file.uri;
                let state = fileData.file.state;

                let attempts = 0;
                while (state === 'PROCESSING' && attempts < 10) {
                    await new Promise(r => setTimeout(r, 1000));
                    const getFileRes = await fetch(`https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/v1beta/files/${fileData.file.name.split('/').pop()}?key=${apiKey}`);
                    const getFileData = await getFileRes.json() as any;
                    state = getFileData.state;
                    attempts++;
                }

                if (state !== 'ACTIVE') return jsonResponse({ error: 'File processing timed out or failed', state }, 500);

                const modelName = env.LISTEN_MODEL_NAME || 'gemini-1.5-flash';
                const genUrl = `https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

                const prompt = `Analyze this English listening test audio file (Gaokao style).
It consists of exactly 10 listening segments:
- Questions 1-5 (Short conversations, Part 1)
- Questions 6-10 (Long conversations, Part 2)

Please identify the start timestamp for EACH of the 10 segments.
If a conversation is read twice, the start time is the beginning of the FIRST reading.
Output a JSON object with this exact structure:
{
  "segments": [
    { "id": 1, "startTime": 0.0, "label": "Conversation 1" },
    ...
  ]
}
Return ONLY the JSON.`;

                const genRes = await fetch(genUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: prompt },
                                { file_data: { file_uri: fileUri, mime_type: contentType } },
                            ],
                        }],
                    }),
                });

                if (!genRes.ok) {
                    const errorText = await genRes.text();
                    return jsonResponse({ error: 'Gemini Generation Failed', details: errorText }, 500);
                }

                const genData = await genRes.json() as any;
                let text = genData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();

                const estimatedTokensAudio = genData.usageMetadata?.totalTokenCount || 5000;
                const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');

                try {
                    const result = JSON.parse(text);

                    await env.DB.prepare(
                        'UPDATE audio_uploads SET segments_json = ? WHERE file_key = ?'
                    ).bind(JSON.stringify(result.segments), key).run();

                    // Async: log + consume quota (fire-and-forget, does NOT delay response)
                    ctx.waitUntil(Promise.all([
                        env.DB.prepare('INSERT INTO usage_logs (user_id, timestamp, action_type, tokens) VALUES (?, ?, ?, ?)')
                            .bind(dbId, Math.floor(Date.now() / 1000), 'segment_success', estimatedTokensAudio).run(),
                        sso.isAdmin ? Promise.resolve() : consumeQuota(sso.uuid!, estimatedTokensAudio, env),
                    ]));

                    return jsonResponse({ segments: result.segments });
                } catch (e) {
                    return jsonResponse({ error: 'Failed to parse Gemini response', raw: text }, 500);
                }
            }

            // ══════════════════════════════════════════════════════════════════
            // Get Audio Files
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname === '/api/audio/files' && request.method === 'GET') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');
                const files = await env.DB.prepare(
                    'SELECT * FROM audio_uploads WHERE user_id = ? ORDER BY created_at DESC'
                ).bind(dbId).all();
                return jsonResponse({ files: files.results });
            }

            // ══════════════════════════════════════════════════════════════════
            // Delete Audio File
            // ══════════════════════════════════════════════════════════════════
            if (url.pathname.startsWith('/api/audio/files/') && request.method === 'DELETE') {
                const token = getAuthToken(request);
                if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
                const sso = await verifySSOToken(token, env);
                if (!sso.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const id = url.pathname.split('/').pop();
                const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');

                const fileRecord = await env.DB.prepare(
                    'SELECT * FROM audio_uploads WHERE id = ? AND user_id = ?'
                ).bind(id, dbId).first() as any;

                if (!fileRecord) return jsonResponse({ error: 'File not found' }, 404);

                await env.R2.delete(fileRecord.file_key);
                await env.DB.prepare('DELETE FROM audio_uploads WHERE id = ?').bind(id).run();
                return jsonResponse({ success: true });
            }

            // ══════════════════════════════════════════════════════════════════
            // Static assets fallback (SPA)
            // ══════════════════════════════════════════════════════════════════
            return env.ASSETS.fetch(request);

        } catch (e: any) {
            console.error('Worker error:', e);
            return new Response(JSON.stringify({ error: 'Internal server error', message: e.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
            });
        }
    },
};
