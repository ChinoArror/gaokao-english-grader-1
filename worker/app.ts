import { D1Database, R2Bucket } from "@cloudflare/workers-types";
import legacyWorker from "./index";
import { buildStructuredSystemPrompt, buildStructuredUserPrompt, buildSummaryTitlePrompt, ESSAY_OCR_PROMPT, QUESTION_OCR_PROMPT } from "../promptsV2";
import { EssayType, GradeEssayRequest, GradingTaskResultEnvelope, InlineImagePart, InputMethod, StructuredReport, TaskStatus } from "../types";
import { buildTaskResultEnvelope, normalizeSummaryTitle, parseStructuredReport, reportToStoredFeedback } from "../utils/reportUtils";

export interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    R2: R2Bucket;
    GRADING_QUEUE: any;
    API_KEY?: string;
    API_DOMAIN?: string;
    MODEL_NAME?: string;
    LISTEN_MODEL_NAME?: string;
    SSO_URL?: string;
    SSO_APP_ID?: string;
    SSO_SECRET_KEY?: string;
    ADMIN_USER_ID?: string;
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

const GRADE_CONTINUE_PROMPT =
    'Continue the previous JSON response exactly from where it stopped. Do not restart the JSON object. Output only the remaining JSON text.';

const TASK_PAYLOAD_PREFIX = 'grading-tasks';

const decodeJwtPayload = (token: string): any => {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = atob(base64);
        return JSON.parse(json);
    } catch {
        return null;
    }
};

const getAuthToken = (request: Request): string | null => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
};

async function verifySSOToken(
    token: string,
    env: Env
): Promise<{ valid: boolean; uuid?: string; userId?: string; name?: string; username?: string; isAdmin?: boolean; error?: string }> {
    const ssoUrl = env.SSO_URL || 'https://accounts.aryuki.com';
    const appId = env.SSO_APP_ID || 'gaokao-english-grader';
    const payload = decodeJwtPayload(token);
    if (!payload) return { valid: false, error: 'Invalid token format' };
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { valid: false, error: 'Token expired' };

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

    const adminUserId = env.ADMIN_USER_ID ?? '0';
    const userIdStr = String(payload.user_id ?? payload.userId ?? '');
    return {
        valid: true,
        uuid: payload.uuid,
        userId: userIdStr,
        name: payload.name,
        username: payload.username,
        isAdmin: userIdStr === adminUserId,
    };
}

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
        // already exists
    }

    await db.prepare('CREATE INDEX IF NOT EXISTS idx_grading_tasks_user_created_at ON grading_tasks(user_id, created_at DESC)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_grading_tasks_status_created_at ON grading_tasks(status, created_at DESC)').run();
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_history_task_uuid ON history(task_uuid) WHERE task_uuid IS NOT NULL').run();
}

async function getOrCreateUserId(db: D1Database, uuid: string): Promise<number> {
    const row = await db.prepare('SELECT id FROM users WHERE uuid = ?').bind(uuid).first<{ id: number }>();
    return row?.id ?? 99999;
}

async function checkQuota(uuid: string, env: Env): Promise<void> {
    const url = `${env.SSO_URL || 'https://accounts.aryuki.com'}/api/quota/check?uuid=${uuid}&app_id=${env.SSO_APP_ID}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${env.SSO_SECRET_KEY}` },
        signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
        if (res.status === 429) throw new Error('用量超限，请稍后再试或联系管理员。');
        if (res.status === 403) throw new Error('当前用户没有该应用的使用权限。');
        throw new Error(`额度校验失败：${res.status}`);
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
    } catch (error) {
        console.error('consumeQuota failed:', error);
    }
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

function buildInlineParts(images: InlineImagePart[]) {
    return images.map((image) => ({
        inlineData: {
            mimeType: image.mimeType,
            data: image.data,
        },
    }));
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

function extractCandidateText(candidate: any): string {
    const parts = candidate?.content?.parts || [];
    return parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('');
}

function isTruncatedCandidate(candidate: any): boolean {
    const finishReason = String(candidate?.finishReason || '').toUpperCase();
    return finishReason.includes('MAX');
}

async function transcribeSingleImage(
    apiUrl: string,
    prompt: string,
    image: InlineImagePart,
    pageIndex = 0,
    pageCount = 1
) {
    const initialPrompt = pageCount > 1
        ? `${prompt}\n\nThis is page ${pageIndex + 1} of ${pageCount}. Transcribe only this page and keep the natural reading order.`
        : prompt;

    const data = await runGeminiRequest(apiUrl, {
        contents: [{
            role: 'user',
            parts: [
                { text: initialPrompt },
                ...buildInlineParts([image]),
            ],
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 6144,
        },
    });

    const mergedResponses: string[] = [];
    let latestCandidate = data.candidates?.[0];
    if (latestCandidate) {
        mergedResponses.push(extractCandidateText(latestCandidate));
    }

    let continueAttempts = 0;
    while (latestCandidate && isTruncatedCandidate(latestCandidate) && continueAttempts < 2) {
        continueAttempts += 1;
        const partialText = mergedResponses.join('');
        const continueData = await runGeminiRequest(apiUrl, {
            contents: [{
                role: 'user',
                parts: [
                    {
                        text:
                            `${initialPrompt}\n\nThe transcription was cut off. Continue from exactly where it stopped and output only the remaining missing OCR text for this page. Do not repeat earlier lines.\n\nExisting OCR text:\n${partialText.slice(-2500)}`,
                    },
                    ...buildInlineParts([image]),
                ],
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 6144,
            },
        });

        latestCandidate = continueData.candidates?.[0];
        if (latestCandidate) {
            mergedResponses.push(extractCandidateText(latestCandidate));
        }
    }

    return mergedResponses.join('').trim();
}

async function transcribeImages(apiUrl: string, prompt: string, images: InlineImagePart[]) {
    const pages: string[] = [];
    for (let index = 0; index < images.length; index++) {
        const pageText = await transcribeSingleImage(apiUrl, prompt, images[index], index, images.length);
        if (pageText) pages.push(pageText);
    }
    return pages.join('\n\n');
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

function sanitizeSummaryTitle(value: string, taskUuid: string, status: TaskStatus) {
    const normalized = value
        .replace(/[《》“”"'：:，,。！？!?\s]/g, '')
        .trim();

    if (!normalized) {
        return normalizeSummaryTitle('', taskUuid, status);
    }

    return normalized.slice(0, 15);
}

const buildTaskPayloadKey = (userId: number, taskUuid: string) =>
    `${TASK_PAYLOAD_PREFIX}/${userId}/${taskUuid}.json`;

async function saveTaskPayload(env: Env, payload: StoredTaskPayload) {
    const key = buildTaskPayloadKey(payload.user_id, payload.task_uuid);
    await env.R2.put(key, JSON.stringify(payload), {
        httpMetadata: { contentType: 'application/json' },
    });
    return key;
}

async function loadTaskPayload(env: Env, payloadKey: string): Promise<StoredTaskPayload> {
    const object = await env.R2.get(payloadKey);
    if (!object) throw new Error('Task payload not found');
    return JSON.parse(await object.text()) as StoredTaskPayload;
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
    const row = userId == null
        ? await db.prepare(sql).bind(taskUuid).first<TaskRow>()
        : await db.prepare(sql).bind(taskUuid, userId).first<TaskRow>();
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

async function processQueuedTask(message: QueueTaskMessage, env: Env, ctx: ExecutionContext) {
    const now = Math.floor(Date.now() / 1000);
    const lockAcquired = await acquireUserTaskLock(env.DB, message.user_id, message.task_uuid, now);
    if (!lockAcquired) return { shouldRetry: true };

    try {
        await updateTaskStatus(env.DB, message.task_uuid, 'processing', { error_message: null });
        const payload = await loadTaskPayload(env, message.payload_r2_key);

        if (!env.API_KEY) throw new Error('API_KEY not configured');
        const modelName = env.MODEL_NAME || 'gemini-3-pro-preview';
        const apiUrl = `https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/v1beta/models/${modelName}:generateContent?key=${env.API_KEY}`;

        let finalQuestionText = payload.questionText.trim();
        let finalEssayContent = payload.essayContent.trim();
        let transcription = finalEssayContent;

        if (payload.method === InputMethod.IMAGE) {
            if (!payload.essayImages.length) throw new Error('No essay images provided');
            const [questionOcr, essayOcr] = await Promise.all([
                payload.questionImages.length ? transcribeImages(apiUrl, QUESTION_OCR_PROMPT, payload.questionImages) : Promise.resolve(''),
                transcribeImages(apiUrl, ESSAY_OCR_PROMPT, payload.essayImages),
            ]);
            if (!finalQuestionText) finalQuestionText = questionOcr.trim();
            finalEssayContent = essayOcr.trim();
            transcription = finalEssayContent;
        }

        if (!finalEssayContent) throw new Error('No essay content available for grading');

        const gradingPayload = {
            systemInstruction: {
                parts: [{ text: buildStructuredSystemPrompt(payload.type) }],
            },
            contents: [{
                role: 'user',
                parts: [{ text: buildStructuredUserPrompt(payload.type, finalQuestionText, finalEssayContent) }],
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
        let totalTokenCount = data.usageMetadata?.totalTokenCount || 0;

        if (latestCandidate) {
            const initialText = extractCandidateText(latestCandidate);
            if (initialText) mergedResponses.push(initialText);
        }

        let truncated = isTruncatedCandidate(latestCandidate);
        let continuationCount = 0;

        while (truncated && continuationCount < 2) {
            continuationCount++;
            const continuationData = await runGeminiRequest(apiUrl, {
                ...gradingPayload,
                contents: [
                    ...(gradingPayload.contents || []),
                    { role: 'model', parts: [{ text: mergedResponses.join('') }] },
                    { role: 'user', parts: [{ text: GRADE_CONTINUE_PROMPT }] },
                ],
            });

            latestCandidate = continuationData.candidates?.[0];
            totalTokenCount += continuationData.usageMetadata?.totalTokenCount || 0;

            const continuationText = extractCandidateText(latestCandidate);
            if (!continuationText) break;
            mergedResponses.push(continuationText);
            truncated = isTruncatedCandidate(latestCandidate);
        }

        const report = parseStructuredReport(mergedResponses.join(''));
        if (!report) throw new Error('Failed to parse structured grading report');

        const summaryTitle = sanitizeSummaryTitle(
            await generateSummaryTitle(apiUrl, payload.type, finalQuestionText, finalEssayContent),
            payload.task_uuid,
            'successful'
        );
        const storedFeedback = reportToStoredFeedback(report);
        const timestamp = Math.floor(Date.now() / 1000);

        await updateTaskStatus(env.DB, payload.task_uuid, 'successful', {
            summary_title: summaryTitle,
            topic: finalQuestionText || payload.questionText || '',
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
            finalQuestionText || payload.questionText || '',
            transcription,
            storedFeedback,
            payload.task_uuid
        ).run();

        const historyRow = await env.DB.prepare('SELECT id FROM history WHERE task_uuid = ?').bind(payload.task_uuid).first<{ id: number }>();
        await env.DB.prepare('UPDATE grading_tasks SET history_id = ?, updated_at = ? WHERE task_uuid = ?')
            .bind(historyRow?.id || null, timestamp, payload.task_uuid).run();

        const estimatedTokens = totalTokenCount || Math.ceil((JSON.stringify(gradingPayload).length + storedFeedback.length + transcription.length) / 4);
        ctx.waitUntil(Promise.all([
            env.DB.prepare('INSERT INTO usage_logs (user_id, timestamp, action_type, tokens) VALUES (?, ?, ?, ?)')
                .bind(payload.user_id, timestamp, 'grade_success', estimatedTokens).run(),
            payload.user_uuid ? consumeQuota(payload.user_uuid, estimatedTokens, env) : Promise.resolve(),
        ]));

        await env.R2.delete(message.payload_r2_key);
        return { shouldRetry: false };
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

function shouldHandleHere(pathname: string) {
    return pathname === '/api/grade'
        || pathname === '/api/history'
        || pathname.startsWith('/api/history/')
        || pathname === '/api/tasks/latest-active'
        || pathname.startsWith('/api/tasks/');
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        if (!shouldHandleHere(url.pathname)) {
            return legacyWorker.fetch(request, env as any, ctx);
        }

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

            const token = getAuthToken(request);
            if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);
            const sso = await verifySSOToken(token, env);
            if (!sso.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

            if (url.pathname === '/api/history' && request.method === 'GET') {
                let rows;
                let legacyRows;
                if (sso.isAdmin) {
                    rows = await env.DB.prepare(
                        'SELECT task_uuid, user_id, status, essay_type, input_method, summary_title, topic, error_message, history_id, created_at, updated_at FROM grading_tasks ORDER BY created_at DESC'
                    ).all();
                    legacyRows = await env.DB.prepare(
                        "SELECT id, user_id, timestamp, topic, task_uuid FROM history WHERE task_uuid IS NULL OR task_uuid = '' ORDER BY timestamp DESC"
                    ).all();
                } else {
                    const dbId = await getOrCreateUserId(env.DB, sso.uuid!);
                    rows = await env.DB.prepare(
                        'SELECT task_uuid, user_id, status, essay_type, input_method, summary_title, topic, error_message, history_id, created_at, updated_at FROM grading_tasks WHERE user_id = ? ORDER BY created_at DESC'
                    ).bind(dbId).all();
                    legacyRows = await env.DB.prepare(
                        "SELECT id, user_id, timestamp, topic, task_uuid FROM history WHERE user_id = ? AND (task_uuid IS NULL OR task_uuid = '') ORDER BY timestamp DESC"
                    ).bind(dbId).all();
                }

                const history = (rows.results as TaskRow[]).map((row) => ({
                    id: row.history_id || 0,
                    user_id: row.user_id,
                    timestamp: row.created_at,
                    topic: row.topic || normalizeSummaryTitle(row.summary_title || undefined, row.task_uuid, row.status),
                    original_content: '',
                    feedback: '',
                    task_uuid: row.task_uuid,
                    status: row.status,
                    essay_type: row.essay_type,
                    summary_title: normalizeSummaryTitle(row.summary_title || undefined, row.task_uuid, row.status),
                    updated_at: row.updated_at,
                    error_message: row.error_message || undefined,
                }));

                const legacyHistory = ((legacyRows?.results as any[]) || []).map((row) => ({
                    id: Number(row.id || 0),
                    user_id: Number(row.user_id || 0),
                    timestamp: Number(row.timestamp || 0),
                    topic: row.topic || '历史记录',
                    original_content: '',
                    feedback: '',
                    task_uuid: undefined,
                    status: 'successful' as const,
                    essay_type: undefined,
                    summary_title: row.topic || '历史记录',
                    updated_at: Number(row.timestamp || 0),
                    error_message: undefined,
                }));

                history.push(...legacyHistory);
                history.sort((a, b) => (b.updated_at || b.timestamp) - (a.updated_at || a.timestamp));

                return jsonResponse({ history });
            }

            if (url.pathname === '/api/tasks/latest-active' && request.method === 'GET') {
                const dbId = await getOrCreateUserId(env.DB, sso.uuid!);
                const row = await getLatestActiveTaskRow(env.DB, dbId);
                return jsonResponse({ task: row ? buildTaskResponse(row) : null });
            }

            if (url.pathname.startsWith('/api/tasks/') && request.method === 'GET') {
                const taskUuid = url.pathname.split('/').pop() || '';
                const dbId = sso.isAdmin ? undefined : await getOrCreateUserId(env.DB, sso.uuid!);
                const row = await getTaskRow(env.DB, taskUuid, dbId);
                if (!row) return jsonResponse({ error: 'Task not found' }, 404);
                return jsonResponse(buildTaskResponse(row));
            }

            if (url.pathname.startsWith('/api/history/') && request.method === 'DELETE') {
                const taskUuid = url.pathname.split('/').pop() || '';
                const dbId = sso.isAdmin ? undefined : await getOrCreateUserId(env.DB, sso.uuid!);
                const row = await getTaskRow(env.DB, taskUuid, dbId);
                if (!row) return jsonResponse({ error: 'Task not found' }, 404);
                if (row.history_id) {
                    await env.DB.prepare('DELETE FROM history WHERE id = ?').bind(row.history_id).run();
                }
                await env.DB.prepare('DELETE FROM grading_tasks WHERE task_uuid = ?').bind(taskUuid).run();
                return jsonResponse({ success: true });
            }

            if (url.pathname === '/api/grade' && request.method === 'POST') {
                const contentLength = Number(request.headers.get('content-length') || '0');
                if (contentLength > 10 * 1024 * 1024) {
                    return jsonResponse({ error: 'Uploaded images are too large. Please reduce the image count or file size and try again.' }, 413);
                }

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

                if (method === InputMethod.TEXT) {
                    if (!questionText.trim() || !essayContent.trim()) {
                        return jsonResponse({ error: 'Please provide both question text and essay content.' }, 400);
                    }
                } else if (!essayImages.length && !essayImageFiles.length) {
                    return jsonResponse({ error: 'No essay images provided' }, 400);
                }

                const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');
                const taskUuid = crypto.randomUUID();
                const now = Math.floor(Date.now() / 1000);
                const payload: StoredTaskPayload = {
                    task_uuid: taskUuid,
                    user_id: dbId,
                    user_uuid: sso.isAdmin ? '' : (sso.uuid || ''),
                    type,
                    method,
                    questionText: questionText.trim(),
                    essayContent: essayContent.trim(),
                    questionImages: questionImages.length ? questionImages : await Promise.all(questionImageFiles.map(fileToInlineImagePart)),
                    essayImages: essayImages.length ? essayImages : await Promise.all(essayImageFiles.map(fileToInlineImagePart)),
                };

                const payloadKey = await saveTaskPayload(env, payload);
                await createQueuedTask(env.DB, {
                    task_uuid: taskUuid,
                    user_id: dbId,
                    essay_type: type,
                    input_method: method,
                    topic: questionText.trim(),
                    payload_r2_key: payloadKey,
                    timestamp: now,
                });

                await env.GRADING_QUEUE.send({
                    task_uuid: taskUuid,
                    user_id: dbId,
                    user_uuid: payload.user_uuid,
                    payload_r2_key: payloadKey,
                } satisfies QueueTaskMessage);

                return jsonResponse({
                    task_uuid: taskUuid,
                    status: 'queued',
                    essayType: type,
                    inputMethod: method,
                    summaryTitle: normalizeSummaryTitle('', taskUuid, 'queued'),
                    createdAt: now,
                    updatedAt: now,
                }, 202);
            }

            return jsonResponse({ error: 'Not found' }, 404);
        } catch (error: any) {
            console.error('Task worker error:', error);
            return jsonResponse({ error: 'Internal server error', message: error?.message || 'Unknown error' }, 500);
        }
    },

    async queue(batch: any, env: Env, ctx: ExecutionContext): Promise<void> {
        await ensureUsersTable(env.DB);
        await ensureTaskTables(env.DB);

        for (const message of batch.messages) {
            const result = await processQueuedTask(message.body as QueueTaskMessage, env, ctx);
            if (result.shouldRetry) {
                message.retry({ delaySeconds: 10 });
            } else {
                message.ack();
            }
        }
    },
};
