import { HistoryRecord, UsageStat } from '../types';

const API_BASE = '/api';

const SSO_URL = 'https://accounts.aryuki.com';
const SSO_APP_ID = 'gaokao-english-grader';

// Helper to get SSO JWT token from localStorage
function getAuthToken(): string | null {
    return localStorage.getItem('sso_token');
}

// Helper to make authenticated requests
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getAuthToken();
    const headers = new Headers(options.headers);

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    headers.set('Content-Type', 'application/json');

    return fetch(url, { ...options, headers });
}

export const api = {
    // ── SSO ───────────────────────────────────────────────────────────────────

    /** Redirect to auth-center login page */
    redirectToSSO(): void {
        const callbackUrl = encodeURIComponent(window.location.origin + '/sso-callback');
        window.location.href = `${SSO_URL}/?client_id=${SSO_APP_ID}&redirect=${callbackUrl}`;
    },

    /** Called from /sso-callback page after redirect; posts the token to backend */
    async handleSSOCallback(token: string): Promise<{ success: boolean; role?: string; username?: string; name?: string; uuid?: string; error?: string }> {
        let res: Response;
        try {
            res = await fetch(`${API_BASE}/sso-callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            });
        } catch {
            return { success: false, error: 'Network error' };
        }

        const data = await res.json() as any;
        if (data.success) {
            localStorage.setItem('sso_token', token);
            localStorage.setItem('auth_role', data.isAdmin ? 'admin' : 'user');
            localStorage.setItem('auth_username', data.username || data.name || '');
            localStorage.setItem('user_uuid', data.uuid || '');
        }
        return {
            success: data.success,
            role: data.isAdmin ? 'admin' : 'user',
            username: data.username,
            name: data.name,
            uuid: data.uuid,
            error: data.message,
        };
    },

    async logout(): Promise<void> {
        try {
            await fetch(`${API_BASE}/auth/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${getAuthToken()}` },
                credentials: 'include',
            });
        } catch { /* ignore */ }
        localStorage.removeItem('sso_token');
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_username');
        localStorage.removeItem('user_uuid');
        // Also forward to Auth-Center to clear SSO cookie
        const afterLogoutUrl = encodeURIComponent(window.location.origin + '/login');
        window.location.href = `${SSO_URL}/logout?redirect=${afterLogoutUrl}`;
    },

    async verifySession(): Promise<{ valid: boolean; role?: string; username?: string; name?: string; uuid?: string }> {
        try {
            const response = await authFetch(`${API_BASE}/auth/verify`);
            if (response.ok) {
                return await response.json();
            }
            return { valid: false };
        } catch {
            return { valid: false };
        }
    },

    // ── Admin - Stats ─────────────────────────────────────────────────────────

    async getStats(period: 'daily' | 'monthly'): Promise<UsageStat[]> {
        const url = `${API_BASE}/admin/stats?period=${period}`;
        const response = await authFetch(url);
        const data = await response.json() as any;
        return data.stats || [];
    },

    // ── Admin - Users (read-only, display only) ────────────────────────────────

    async getUsers(): Promise<{ uuid: string; username: string; name: string; last_seen: string }[]> {
        const response = await authFetch(`${API_BASE}/admin/users`);
        const data = await response.json() as any;
        return data.users || [];
    },

    // ── History ───────────────────────────────────────────────────────────────

    async getHistory(): Promise<HistoryRecord[]> {
        const response = await authFetch(`${API_BASE}/history`);
        const data = await response.json() as any;
        return data.history || [];
    },

    async deleteHistory(historyId: number): Promise<{ success: boolean }> {
        const response = await authFetch(`${API_BASE}/history/${historyId}`, {
            method: 'DELETE',
        });
        return await response.json() as any;
    },

    // ── Grade essay ───────────────────────────────────────────────────────────

    async gradeEssay(payload: any, meta: { topic: string; originalContent?: string; isImage?: boolean }): Promise<any> {
        const response = await authFetch(`${API_BASE}/grade`, {
            method: 'POST',
            body: JSON.stringify({ payload, meta }),
        });

        if (!response.ok) {
            const error = await response.json() as any;
            throw new Error(error.message || error.details || error.error || 'Failed to grade essay');
        }

        return await response.json();
    },

    // ── Audio Listening ───────────────────────────────────────────────────────

    async uploadAudio(file: File): Promise<{ success: boolean; key: string; url: string }> {
        const formData = new FormData();
        formData.append('file', file);

        const token = getAuthToken();
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${API_BASE}/audio/upload`, {
            method: 'POST',
            body: formData,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({})) as any;
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json() as any;
    },

    async segmentAudio(key: string): Promise<{ segments: any[] }> {
        const response = await authFetch(`${API_BASE}/audio/segment`, {
            method: 'POST',
            body: JSON.stringify({ key }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({})) as any;
            const errorMessage = error.error || error.message || 'Segmentation failed';
            const details = error.details ? ` Details: ${typeof error.details === 'object' ? JSON.stringify(error.details) : error.details}` : '';
            throw new Error(`${errorMessage}${details}`);
        }

        return await response.json() as any;
    },

    async getAudioFiles(): Promise<{ id: number; filename: string; file_key: string; created_at: number; segments_json: string }[]> {
        const response = await authFetch(`${API_BASE}/audio/files`);
        if (!response.ok) return [];
        const data = await response.json() as any;
        return data.files || [];
    },

    async getAudioBlobUrl(key: string): Promise<string> {
        const token = getAuthToken();
        const headers: HeadersInit = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(`${API_BASE}/audio/proxy/${key}`, { headers });
        if (!response.ok) throw new Error('Failed to load audio file');
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    },

    async deleteAudio(id: number): Promise<void> {
        const response = await authFetch(`${API_BASE}/audio/files/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete audio');
    },
};
