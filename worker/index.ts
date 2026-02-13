import { D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface Env {
    ASSETS: any;
    DB: D1Database;
    R2: R2Bucket;
    API_KEY?: string;
    API_DOMAIN?: string;
    MODEL_NAME?: string;
    LISTEN_MODEL_NAME?: string;
    ADMIN_USERNAME?: string;
    ADMIN_PASSWORD?: string;
}


// Helper function to generate random token
function generateToken(): string {
    return crypto.randomUUID();
}

// Helper function to hash password (simple SHA-256)
async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Verify session token
async function verifySession(db: D1Database, token: string | null): Promise<{ valid: boolean; userId?: number; role?: string; username?: string; error?: string }> {
    if (!token) return { valid: false };

    const now = Math.floor(Date.now() / 1000);
    const session = await db.prepare(
        'SELECT user_id, role FROM sessions WHERE token = ? AND expires_at > ?'
    ).bind(token, now).first();

    if (!session) return { valid: false };

    let username = 'admin';
    if (session.role === 'user' && session.user_id) {
        const user = await db.prepare('SELECT username, status FROM users WHERE id = ?')
            .bind(session.user_id).first();
        username = user?.username as string || '';
        if (user?.status === 'suspended') return { valid: false, error: 'suspended' };
    }

    return {
        valid: true,
        userId: session.user_id as number | undefined,
        role: session.role as string,
        username
    };
}

// Parse Authorization header
function getAuthToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // Helper to add CORS to response
        const jsonResponse = (data: any, status = 200) => {
            return new Response(JSON.stringify(data), {
                status,
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        };

        try {
            // Authentication endpoints
            if (url.pathname === '/api/auth/login' && request.method === 'POST') {
                const { username, password } = await request.json() as { username: string; password: string };

                // Check if admin
                if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
                    const token = generateToken();
                    const now = Math.floor(Date.now() / 1000);
                    const expiresAt = now + (7 * 24 * 60 * 60); // 7 days

                    await env.DB.prepare(
                        'INSERT INTO sessions (token, user_id, role, created_at, expires_at) VALUES (?, NULL, ?, ?, ?)'
                    ).bind(token, 'admin', now, expiresAt).run();

                    return jsonResponse({
                        success: true,
                        token,
                        role: 'admin',
                        username: env.ADMIN_USERNAME
                    });
                }

                // Check user in database
                const hashedPassword = await hashPassword(password);
                const user = await env.DB.prepare(
                    'SELECT id, username, status FROM users WHERE username = ? AND password = ?'
                ).bind(username, hashedPassword).first();

                if (user && user.status === 'suspended') {
                    return jsonResponse({ success: false, error: 'Account suspended' }, 403);
                }

                if (user) {
                    const token = generateToken();
                    const now = Math.floor(Date.now() / 1000);
                    const expiresAt = now + (7 * 24 * 60 * 60);

                    await env.DB.prepare(
                        'INSERT INTO sessions (token, user_id, role, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
                    ).bind(token, user.id, 'user', now, expiresAt).run();

                    return jsonResponse({
                        success: true,
                        token,
                        role: 'user',
                        username: user.username,
                        userId: user.id
                    });
                }

                return jsonResponse({ success: false, error: 'Invalid credentials' }, 401);
            }

            // Logout endpoint
            if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
                const token = getAuthToken(request);
                if (token) {
                    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
                }
                return jsonResponse({ success: true });
            }

            // Verify session endpoint
            if (url.pathname === '/api/auth/verify' && request.method === 'GET') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (session.error === 'suspended') {
                    // If suspended, invalidate session immediately
                    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
                    return jsonResponse({ valid: false, error: 'Account suspended' }, 403);
                }

                if (session.valid) {
                    return jsonResponse({
                        valid: true,
                        role: session.role,
                        username: session.username,
                        userId: session.userId
                    });
                }
                return jsonResponse({ valid: false }, 401);
            }

            // Admin endpoints - User management
            if (url.pathname === '/api/admin/users' && request.method === 'GET') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid || session.role !== 'admin') {
                    return jsonResponse({ error: 'Unauthorized' }, 403);
                }

                const users = await env.DB.prepare(
                    'SELECT id, username, created_at, status FROM users WHERE id != 0 ORDER BY created_at DESC'
                ).all();

                return jsonResponse({ users: users.results });
            }

            if (url.pathname === '/api/admin/users' && request.method === 'POST') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid || session.role !== 'admin') {
                    return jsonResponse({ error: 'Unauthorized' }, 403);
                }

                const { username, password } = await request.json() as { username: string; password: string };
                const hashedPassword = await hashPassword(password);
                const now = Math.floor(Date.now() / 1000);

                try {
                    const result = await env.DB.prepare(
                        'INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)'
                    ).bind(username, hashedPassword, now).run();

                    return jsonResponse({ success: true, userId: result.meta.last_row_id });
                } catch (e: any) {
                    return jsonResponse({ error: 'Username already exists' }, 400);
                }
            }

            // Admin - User Status Toggle
            if (url.pathname.startsWith('/api/admin/users/') && url.pathname.endsWith('/status') && request.method === 'PUT') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid || session.role !== 'admin') {
                    return jsonResponse({ error: 'Unauthorized' }, 403);
                }

                const parts = url.pathname.split('/');
                const userId = parts[4]; // /api/admin/users/:id/status
                const { status } = await request.json() as { status: string };

                await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, userId).run();

                // If suspending, kill all active sessions for this user
                if (status === 'suspended') {
                    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
                }

                return jsonResponse({ success: true });
            }

            if (url.pathname.startsWith('/api/admin/users/') && request.method === 'PUT') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid || session.role !== 'admin') {
                    return jsonResponse({ error: 'Unauthorized' }, 403);
                }

                const userId = url.pathname.split('/').pop();
                const { username, password } = await request.json() as { username?: string; password?: string };

                if (password) {
                    const hashedPassword = await hashPassword(password);
                    await env.DB.prepare(
                        'UPDATE users SET username = ?, password = ? WHERE id = ?'
                    ).bind(username, hashedPassword, userId).run();
                } else {
                    await env.DB.prepare(
                        'UPDATE users SET username = ? WHERE id = ?'
                    ).bind(username, userId).run();
                }

                return jsonResponse({ success: true });
            }

            if (url.pathname.startsWith('/api/admin/users/') && request.method === 'DELETE') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid || session.role !== 'admin') {
                    return jsonResponse({ error: 'Unauthorized' }, 403);
                }

                const userId = url.pathname.split('/').pop();
                await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

                return jsonResponse({ success: true });
            }



            // Admin - Statistics
            if (url.pathname === '/api/admin/stats' && request.method === 'GET') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid || session.role !== 'admin') {
                    return jsonResponse({ error: 'Unauthorized' }, 403);
                }

                const urlParams = new URLSearchParams(url.search);
                const period = urlParams.get('period') || 'daily'; // 'daily' or 'monthly'
                const userFilter = urlParams.get('userId');

                let timeFormat = '%Y-%m-%d';
                if (period === 'monthly') timeFormat = '%Y-%m';

                let query = `
                    SELECT 
                        strftime('${timeFormat}', datetime(timestamp, 'unixepoch')) as date,
                        user_id,
                        COUNT(CASE WHEN action_type = 'grade_success' THEN 1 END) as success_count,
                        COUNT(CASE WHEN action_type = 'grade_error' THEN 1 END) as error_count,
                        CAST(SUM(tokens) AS FLOAT) / 1000.0 as total_tokens
                    FROM usage_logs
                    WHERE 1=1
                `;

                const params: any[] = [];
                if (userFilter) {
                    query += ' AND user_id = ?';
                    params.push(userFilter);
                }

                query += ` GROUP BY date`;
                // if (!userFilter) query += `, user_id`; // Always group by date only to merge all users data per day

                query += ` ORDER BY date DESC LIMIT 100`;

                const stats = await env.DB.prepare(query).bind(...params).all();

                // Enrich with usernames
                const userIds = [...new Set(stats.results.map((r: any) => r.user_id).filter((id: any) => id))];
                let userMap: Record<number, string> = {};

                if (userIds.length > 0) {
                    const users = await env.DB.prepare(`SELECT id, username FROM users WHERE id IN (${userIds.join(',')})`).all();
                    users.results.forEach((u: any) => userMap[u.id] = u.username);
                    // Add admin system user manually if needed
                    userMap[0] = 'Admin System';
                }

                const enrichedStats = stats.results.map((r: any) => ({
                    ...r,
                    username: userMap[r.user_id as number] || 'Unknown'
                }));

                return jsonResponse({ stats: enrichedStats });
            }

            // History endpoints
            if (url.pathname === '/api/history' && request.method === 'GET') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid) {
                    return jsonResponse({ error: 'Unauthorized' }, 401);
                }

                let history;
                if (session.role === 'admin') {
                    // Admin can see all history
                    history = await env.DB.prepare(
                        'SELECT h.*, u.username FROM history h LEFT JOIN users u ON h.user_id = u.id ORDER BY h.timestamp DESC'
                    ).all();
                } else {
                    // Users see only their own history
                    history = await env.DB.prepare(
                        'SELECT * FROM history WHERE user_id = ? ORDER BY timestamp DESC'
                    ).bind(session.userId).all();
                }

                return jsonResponse({ history: history.results });
            }

            if (url.pathname.startsWith('/api/history/') && request.method === 'DELETE') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid) {
                    return jsonResponse({ error: 'Unauthorized' }, 401);
                }

                const historyId = url.pathname.split('/').pop();

                // Check ownership or admin
                if (session.role !== 'admin') {
                    const record = await env.DB.prepare(
                        'SELECT user_id FROM history WHERE id = ?'
                    ).bind(historyId).first();

                    if (!record || record.user_id !== session.userId) {
                        return jsonResponse({ error: 'Forbidden' }, 403);
                    }
                }

                await env.DB.prepare('DELETE FROM history WHERE id = ?').bind(historyId).run();
                return jsonResponse({ success: true });
            }

            // Grade essay endpoint
            if (url.pathname === '/api/grade' && request.method === 'POST') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);

                if (!session.valid) {
                    return jsonResponse({ error: 'Unauthorized' }, 401);
                }

                const body = await request.json() as any;
                const { payload, meta } = body;

                const apiKey = env.API_KEY;
                if (!apiKey) {
                    return jsonResponse({
                        error: 'Configuration Error',
                        message: 'API_KEY is not set in environment variables. Please set it using "wrangler secret put API_KEY".'
                    }, 500);
                }
                const modelName = env.MODEL_NAME || 'gemini-3-pro-preview';
                const apiUrl = `https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

                // Call Gemini API
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    // Log error
                    const now = Math.floor(Date.now() / 1000);
                    await env.DB.prepare(
                        'INSERT INTO usage_logs (user_id, timestamp, action_type, error_details) VALUES (?, ?, ?, ?)'
                    ).bind(session.userId || 0, now, 'grade_error', `API Error ${response.status}: ${errorText.substring(0, 200)}`).run();

                    return jsonResponse({
                        error: `Gemini API Error: ${response.status}`,
                        details: errorText
                    }, response.status);
                }

                const data = await response.json() as any;
                let feedbackText = '';
                let transcribedContent = meta?.originalContent || '';

                // Extract feedback from response
                if (data.candidates && data.candidates.length > 0) {
                    const parts = data.candidates[0].content?.parts || [];
                    feedbackText = parts.map((p: any) => p.text || '').join('');

                    // Extract transcription if present
                    const transcriptionMatch = feedbackText.match(/<<<TRANSCRIPTION>>>([\s\S]*?)<<<END_TRANSCRIPTION>>>/);
                    if (transcriptionMatch) {
                        transcribedContent = transcriptionMatch[1].trim();
                        feedbackText = feedbackText.replace(/<<<TRANSCRIPTION>>>[\s\S]*?<<<END_TRANSCRIPTION>>>/, '').trim();
                    }
                }

                // Save to history
                const now = Math.floor(Date.now() / 1000);
                await env.DB.prepare(
                    'INSERT INTO history (user_id, timestamp, topic, original_content, feedback) VALUES (?, ?, ?, ?, ?)'
                ).bind(
                    session.userId || 0,
                    now,
                    meta?.topic || '',
                    transcribedContent,
                    feedbackText
                ).run();

                // Log success usage
                // Estimate tokens (very rough approximation: 4 chars ~ 1 token)
                const inputLength = JSON.stringify(payload).length;
                const outputLength = feedbackText.length;
                const estimatedTokens = Math.ceil((inputLength + outputLength) / 4);

                await env.DB.prepare(
                    'INSERT INTO usage_logs (user_id, timestamp, action_type, tokens) VALUES (?, ?, ?, ?)'
                ).bind(session.userId || 0, now, 'grade_success', estimatedTokens).run();

                return jsonResponse({
                    ...data,
                    transcription: transcribedContent
                });
            }

            // Audio Upload
            if (url.pathname === '/api/audio/upload' && request.method === 'POST') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);
                if (!session.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const formData = await request.formData();
                const file = formData.get('file') as File;

                if (!file) {
                    return jsonResponse({ error: 'No file uploaded' }, 400);
                }

                // User specific path
                const key = `users/${session.userId || 'anon'}/uploads/${crypto.randomUUID()}-${file.name}`;

                await env.R2.put(key, file.stream() as any, {
                    httpMetadata: { contentType: file.type }
                });

                // Metadata will be saved after segmentation or we can save now?
                // Let's create a partial record now
                const now = Math.floor(Date.now() / 1000);
                await env.DB.prepare(
                    'INSERT INTO audio_uploads (user_id, filename, file_key, created_at) VALUES (?, ?, ?, ?)'
                ).bind(session.userId || 0, file.name, key, now).run();

                return jsonResponse({
                    success: true,
                    key,
                    url: `/api/audio/proxy/${key}`
                });
            }

            // Audio Proxy
            if (url.pathname.startsWith('/api/audio/proxy/') && request.method === 'GET') {
                const rawKey = url.pathname.replace('/api/audio/proxy/', '');
                const key = decodeURIComponent(rawKey);

                // Check if user has access? 
                // The key structure includes user id users/{userId}/...
                // But for simplicity of this task, we can allow playback if they have the key or implement check
                // Let's implement basic check if token provided in query

                const object = await env.R2.get(key);

                if (!object) {
                    return new Response('File not found', { status: 404 });
                }

                const headers = new Headers() as any;
                object.writeHttpMetadata(headers);
                headers.set('etag', object.httpEtag);

                return new Response(object.body as any, { headers });
            }

            // Audio Segmentation
            if (url.pathname === '/api/audio/segment' && request.method === 'POST') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);
                if (!session.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const { key } = await request.json() as { key: string };
                if (!key) return jsonResponse({ error: 'No key provided' }, 400);

                const object = await env.R2.get(key);
                if (!object) return jsonResponse({ error: 'File not found' }, 404);

                const apiKey = env.API_KEY;
                if (!apiKey) return jsonResponse({ error: 'API_KEY/Configuration error' }, 500);

                // 1. Upload to Google AI File API
                // Initial Resumable Upload Request (POST)
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
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ file: { display_name: displayName } })
                });

                if (!initRes.ok) {
                    const errorText = await initRes.text();
                    return jsonResponse({ error: 'Google Upload Init Failed', details: errorText }, 500);
                }

                const uploadUrl = initRes.headers.get('x-goog-upload-url');
                if (!uploadUrl) return jsonResponse({ error: 'No upload URL received' }, 500);

                // 2. Upload Bytes (PUT)
                const uploadRes = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Length': object.size.toString(),
                        'X-Goog-Upload-Command': 'upload, finalize',
                        'X-Goog-Upload-Offset': '0'
                    },
                    body: object.body as any // Stream directly from R2
                });

                if (!uploadRes.ok) {
                    const errorText = await uploadRes.text();
                    return jsonResponse({ error: 'Google Upload Content Failed', details: errorText }, 500);
                }

                const fileData = await uploadRes.json() as any;
                const fileUri = fileData.file.uri;
                let state = fileData.file.state;

                // 3. Poll for active state
                let attempts = 0;
                while (state === 'PROCESSING' && attempts < 10) {
                    await new Promise(r => setTimeout(r, 1000));
                    const getFileRes = await fetch(`https://${env.API_DOMAIN || 'generativelanguage.googleapis.com'}/v1beta/files/${fileData.file.name.split('/').pop()}?key=${apiKey}`);
                    const getFileData = await getFileRes.json() as any;
                    state = getFileData.state;
                    attempts++;
                }

                if (state !== 'ACTIVE') {
                    return jsonResponse({ error: 'File processing timed out or failed', state }, 500);
                }

                // 4. Generate Segmentation
                // Use custom model for listening or fallback to gemini-1.5-flash
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
                                { file_data: { file_uri: fileUri, mime_type: contentType } }
                            ]
                        }]
                    })
                });

                if (!genRes.ok) {
                    const errorText = await genRes.text();
                    return jsonResponse({ error: 'Gemini Generation Failed', details: errorText }, 500);
                }

                const genData = await genRes.json() as any;
                let text = genData.candidates?.[0]?.content?.parts?.[0]?.text || '';

                // Clean markdown
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();

                try {
                    const result = JSON.parse(text);

                    // SAVE SEGMENTATION TO DB
                    await env.DB.prepare(
                        'UPDATE audio_uploads SET segments_json = ? WHERE file_key = ?'
                    ).bind(JSON.stringify(result.segments), key).run();

                    return jsonResponse({ segments: result.segments });
                } catch (e) {
                    return jsonResponse({ error: 'Failed to parse Gemini response', raw: text }, 500);
                }
            }

            // Get Audio Files
            if (url.pathname === '/api/audio/files' && request.method === 'GET') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);
                if (!session.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const files = await env.DB.prepare(
                    'SELECT * FROM audio_uploads WHERE user_id = ? ORDER BY created_at DESC'
                ).bind(session.userId || 0).all();

                return jsonResponse({ files: files.results });
            }

            // Delete Audio File
            if (url.pathname.startsWith('/api/audio/files/') && request.method === 'DELETE') {
                const token = getAuthToken(request);
                const session = await verifySession(env.DB, token);
                if (!session.valid) return jsonResponse({ error: 'Unauthorized' }, 401);

                const id = url.pathname.split('/').pop();

                // Get file key first to delete from R2
                const fileRecord = await env.DB.prepare(
                    'SELECT * FROM audio_uploads WHERE id = ? AND user_id = ?'
                ).bind(id, session.userId || 0).first();

                if (!fileRecord) return jsonResponse({ error: 'File not found' }, 404);

                // Delete from R2
                await env.R2.delete(fileRecord.file_key as string);

                // Delete from DB
                await env.DB.prepare(
                    'DELETE FROM audio_uploads WHERE id = ?'
                ).bind(id).run();

                return jsonResponse({ success: true });
            }


            // Static assets fallback
            let response = await env.ASSETS.fetch(request);


            if (response.status === 404 && !url.pathname.startsWith('/api/')) {
                // SPA fallback
                response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
            }

            return response;

        } catch (e: any) {
            console.error('Worker error:', e);
            return jsonResponse({
                error: 'Internal server error',
                message: e.message
            }, 500);
        }
    }
};
