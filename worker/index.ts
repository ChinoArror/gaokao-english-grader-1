import { D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface Env {
    ASSETS: Fetcher;
    DB: D1Database;
    R2: R2Bucket;
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

                // Pre-check quota (blocks if exceeded)
                if (!sso.isAdmin) {
                    try {
                        await checkQuota(sso.uuid!, env);
                    } catch (e: any) {
                        return jsonResponse({ error: e.message }, 429);
                    }
                }

                const body = await request.json() as any;
                const { payload, meta } = body;

                const apiKey = env.API_KEY;
                if (!apiKey) return jsonResponse({ error: 'API_KEY not configured' }, 500);

                const modelName = env.MODEL_NAME || 'gemini-3-pro-preview';
                const apiUrl = `https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const now = Math.floor(Date.now() / 1000);
                    const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');
                    ctx.waitUntil(
                        env.DB.prepare('INSERT INTO usage_logs (user_id, timestamp, action_type, error_details) VALUES (?, ?, ?, ?)')
                            .bind(dbId, now, 'grade_error', `API Error ${response.status}: ${errorText.substring(0, 200)}`).run()
                    );
                    return jsonResponse({ error: `Gemini API Error: ${response.status}`, details: errorText }, response.status);
                }

                const data = await response.json() as any;
                let feedbackText = '';
                let transcribedContent = meta?.originalContent || '';

                if (data.candidates && data.candidates.length > 0) {
                    const parts = data.candidates[0].content?.parts || [];
                    feedbackText = parts.map((p: any) => p.text || '').join('');

                    const transcriptionMatch = feedbackText.match(/<<<TRANSCRIPTION>>>([\s\S]*?)<<<END_TRANSCRIPTION>>>/);
                    if (transcriptionMatch) {
                        transcribedContent = transcriptionMatch[1].trim();
                        feedbackText = feedbackText.replace(/<<<TRANSCRIPTION>>>[\s\S]*?<<<END_TRANSCRIPTION>>>/, '').trim();
                    }
                }

                const now = Math.floor(Date.now() / 1000);
                const dbId = await getOrCreateUserId(env.DB, sso.uuid || '');

                // Save history synchronously (user needs it)
                await env.DB.prepare(
                    'INSERT INTO history (user_id, timestamp, topic, original_content, feedback) VALUES (?, ?, ?, ?, ?)'
                ).bind(dbId, now, meta?.topic || '', transcribedContent, feedbackText).run();

                // Estimate tokens
                const estimatedTokens = data.usageMetadata?.totalTokenCount ||
                    Math.ceil((JSON.stringify(payload).length + feedbackText.length) / 4);

                // Async: log usage + consume quota (fire-and-forget)
                ctx.waitUntil(Promise.all([
                    env.DB.prepare('INSERT INTO usage_logs (user_id, timestamp, action_type, tokens) VALUES (?, ?, ?, ?)')
                        .bind(dbId, now, 'grade_success', estimatedTokens).run(),
                    sso.isAdmin ? Promise.resolve() : consumeQuota(sso.uuid!, estimatedTokens, env),
                ]));

                return jsonResponse({ ...data, transcription: transcribedContent });
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
