import { D1Database } from "@cloudflare/workers-types";

export interface Env {
    ASSETS: any;
    DB: D1Database;
    API_KEY?: string;
    API_DOMAIN?: string;
    MODEL_NAME?: string;
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
async function verifySession(db: D1Database, token: string | null): Promise<{ valid: boolean; userId?: number; role?: string; username?: string }> {
    if (!token) return { valid: false };

    const now = Math.floor(Date.now() / 1000);
    const session = await db.prepare(
        'SELECT user_id, role FROM sessions WHERE token = ? AND expires_at > ?'
    ).bind(token, now).first();

    if (!session) return { valid: false };

    let username = 'admin';
    if (session.role === 'user' && session.user_id) {
        const user = await db.prepare('SELECT username FROM users WHERE id = ?')
            .bind(session.user_id).first();
        username = user?.username as string || '';
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
                    'SELECT id, username FROM users WHERE username = ? AND password = ?'
                ).bind(username, hashedPassword).first();

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
                    'SELECT id, username, created_at FROM users ORDER BY created_at DESC'
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

                return jsonResponse({
                    ...data,
                    transcription: transcribedContent
                });
            }

            // Static assets fallback
            return await env.ASSETS.fetch(request);

        } catch (e: any) {
            console.error('Worker error:', e);
            return jsonResponse({
                error: 'Internal server error',
                message: e.message
            }, 500);
        }
    }
};
