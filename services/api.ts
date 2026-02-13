import { User, HistoryRecord, LoginResponse, UsageStat } from '../types';

const API_BASE = '/api';

// Helper to get auth token from localStorage
function getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
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
    // Authentication
    async login(username: string, password: string): Promise<LoginResponse> {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success && data.token) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('auth_role', data.role);
            localStorage.setItem('auth_username', data.username);
            if (data.userId) {
                localStorage.setItem('auth_userId', data.userId.toString());
            }
        }

        return data;
    },

    async logout(): Promise<void> {
        await authFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_username');
        localStorage.removeItem('auth_userId');
    },

    async verifySession(): Promise<{ valid: boolean; role?: string; username?: string; userId?: number }> {
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

    // Admin - User Management
    async getUsers(): Promise<User[]> {
        const response = await authFetch(`${API_BASE}/admin/users`);
        const data = await response.json();
        return data.users || [];
    },

    async createUser(username: string, password: string): Promise<{ success: boolean; error?: string }> {
        const response = await authFetch(`${API_BASE}/admin/users`, {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        return await response.json();
    },

    async updateUser(userId: number, username: string, password?: string): Promise<{ success: boolean }> {
        const response = await authFetch(`${API_BASE}/admin/users/${userId}`, {
            method: 'PUT',
            body: JSON.stringify({ username, password })
        });
        return await response.json();
    },

    async deleteUser(userId: number): Promise<{ success: boolean }> {
        const response = await authFetch(`${API_BASE}/admin/users/${userId}`, {
            method: 'DELETE'
        });
        return await response.json();
    },

    async toggleUserStatus(userId: number, status: 'active' | 'suspended'): Promise<{ success: boolean }> {
        const response = await authFetch(`${API_BASE}/admin/users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        return await response.json();
    },

    async getStats(period: 'daily' | 'monthly', userId?: number): Promise<UsageStat[]> {
        let url = `${API_BASE}/admin/stats?period=${period}`;
        if (userId) {
            url += `&userId=${userId}`;
        }
        const response = await authFetch(url);
        const data = await response.json();
        return data.stats || [];
    },

    // History
    async getHistory(): Promise<HistoryRecord[]> {
        const response = await authFetch(`${API_BASE}/history`);
        const data = await response.json();
        return data.history || [];
    },

    async deleteHistory(historyId: number): Promise<{ success: boolean }> {
        const response = await authFetch(`${API_BASE}/history/${historyId}`, {
            method: 'DELETE'
        });
        return await response.json();
    },

    // Grade essay
    async gradeEssay(payload: any, meta: { topic: string; originalContent?: string; isImage?: boolean }): Promise<any> {
        const response = await authFetch(`${API_BASE}/grade`, {
            method: 'POST',
            body: JSON.stringify({ payload, meta })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || error.details || error.error || 'Failed to grade essay');
        }

        return await response.json();
    },

    // Audio Listening
    async uploadAudio(file: File): Promise<{ success: boolean, key: string; url: string }> {
        const formData = new FormData();
        formData.append('file', file);

        const token = getAuthToken();
        const headers: HeadersInit = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Do not set Content-Type for FormData, browser sets it with boundary
        const response = await fetch(`${API_BASE}/audio/upload`, {
            method: 'POST',
            body: formData,
            headers
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    },

    async segmentAudio(key: string): Promise<{ segments: any[] }> {
        const response = await authFetch(`${API_BASE}/audio/segment`, {
            method: 'POST',
            body: JSON.stringify({ key })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            const errorMessage = error.error || error.message || 'Segmentation failed';
            const details = error.details ? ` Details: ${typeof error.details === 'object' ? JSON.stringify(error.details) : error.details}` : '';
            throw new Error(`${errorMessage}${details}`);
        }

        return await response.json();
    },

    async getAudioFiles(): Promise<{ id: number; filename: string; file_key: string; created_at: number; segments_json: string }[]> {
        const response = await authFetch(`${API_BASE}/audio/files`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.files || [];
    },

    async deleteAudio(id: number): Promise<void> {
        const response = await authFetch(`${API_BASE}/audio/files/${id}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to delete audio');
        }
    }
};



