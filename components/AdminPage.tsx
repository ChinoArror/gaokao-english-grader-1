import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UsageStat } from '../types';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Line,
    ComposedChart,
} from 'recharts';

interface AdminPageProps {
    onLogout: () => void;
    onNavigateToGrader: () => void;
}

interface SSOUser {
    uuid: string;
    username: string;
    name: string;
    last_seen: string; // ISO string
}

export const AdminPage: React.FC<AdminPageProps> = ({ onLogout, onNavigateToGrader }) => {
    const [users, setUsers] = useState<SSOUser[]>([]);
    const [usersLoading, setUsersLoading] = useState(true);

    // Stats State
    const [stats, setStats] = useState<UsageStat[]>([]);
    const [statsPeriod, setStatsPeriod] = useState<'daily' | 'monthly'>('daily');
    const [statsLoading, setStatsLoading] = useState(true);

    useEffect(() => {
        loadUsers();
    }, []);

    useEffect(() => {
        loadStats();
    }, [statsPeriod]);

    const loadStats = async () => {
        setStatsLoading(true);
        try {
            const data = await api.getStats(statsPeriod);
            setStats(data);
        } catch (err) {
            console.error('Failed to load stats:', err);
        } finally {
            setStatsLoading(false);
        }
    };

    const loadUsers = async () => {
        try {
            const userData = await api.getUsers();
            setUsers(userData as SSOUser[]);
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setUsersLoading(false);
        }
    };

    /** Format cookie expiry time from last_seen ISO string.
     *  Auth-center JWT typically lasts 7 days from last_seen. */
    const formatExpiry = (lastSeen: string) => {
        try {
            const cookieDays = 7;
            const expiry = new Date(new Date(lastSeen).getTime() + cookieDays * 86400 * 1000);
            return expiry.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch {
            return lastSeen;
        }
    };

    const isExpired = (lastSeen: string) => {
        try {
            const cookieDays = 7;
            const expiry = new Date(new Date(lastSeen).getTime() + cookieDays * 86400 * 1000);
            return expiry < new Date();
        } catch {
            return false;
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 mb-6 border border-white/50">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
                            <p className="text-gray-500 mt-1">Usage analytics and session overview</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onNavigateToGrader}
                                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-green-500/30 hover:shadow-green-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                            >
                                <span className="flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Grader
                                </span>
                            </button>
                            <button
                                id="admin-logout-btn"
                                onClick={onLogout}
                                className="px-6 py-3 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg shadow-red-500/30 hover:shadow-red-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>

                {/* Statistics Section */}
                <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 mb-8 border border-white/50 animate-slide-up">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                        <div className="flex flex-col">
                            <h2 className="text-2xl font-bold text-gray-800">Usage Statistics</h2>
                            <p className="text-sm text-gray-400 mt-1">Tokens in units of 1,000 (k)</p>
                        </div>

                        <div className="bg-gray-100 p-1 rounded-xl flex gap-1">
                            <button
                                onClick={() => setStatsPeriod('daily')}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${statsPeriod === 'daily' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Daily
                            </button>
                            <button
                                onClick={() => setStatsPeriod('monthly')}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${statsPeriod === 'monthly' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Monthly
                            </button>
                        </div>
                    </div>

                    {statsLoading ? (
                        <div className="h-80 flex items-center justify-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
                        </div>
                    ) : stats.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-gray-400">
                            <div className="text-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                <p className="font-medium">No usage data yet</p>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full" style={{ height: 400 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={[...stats].reverse()} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        yAxisId="left"
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        axisLine={false}
                                        tickLine={false}
                                        label={{ value: 'Requests', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#64748b' } }}
                                    />
                                    <YAxis
                                        yAxisId="right"
                                        orientation="right"
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        axisLine={false}
                                        tickLine={false}
                                        label={{ value: 'Tokens (k)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#64748b' } }}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                        cursor={{ fill: '#f1f5f9' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    <Bar yAxisId="left" dataKey="success_count" name="Successful Grades" stackId="a" fill="#34d399" radius={[0, 0, 4, 4]} barSize={32} />
                                    <Bar yAxisId="left" dataKey="error_count" name="Errors" stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} barSize={32} />
                                    <Line yAxisId="right" type="monotone" dataKey="total_tokens" name="Tokens Used" stroke="#818cf8" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>

                {/* SSO Users List — read-only, shows username + cookie expiry */}
                <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/50 animate-slide-up">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800">Active Users</h2>
                            <p className="text-sm text-gray-400 mt-1">Managed by Aryuki Auth Center</p>
                        </div>
                        <a
                            href="https://accounts.aryuki.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-blue-500 text-white text-sm font-semibold rounded-xl shadow hover:shadow-blue-500/40 transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Manage at Auth Center
                        </a>
                    </div>

                    {usersLoading ? (
                        <div className="text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent"></div>
                            <p className="mt-4 text-gray-500">Loading users...</p>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-14 w-14 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <p className="font-medium">No sessions recorded yet</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-4 px-4 font-semibold text-gray-700">Username</th>
                                        <th className="hidden sm:table-cell text-left py-4 px-4 font-semibold text-gray-700">Display Name</th>
                                        <th className="text-left py-4 px-4 font-semibold text-gray-700">Session Expiry</th>
                                        <th className="text-left py-4 px-4 font-semibold text-gray-700">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => {
                                        const expired = isExpired(user.last_seen);
                                        return (
                                            <tr key={user.uuid} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                                                <td className="py-4 px-4 font-medium text-gray-800">{user.username}</td>
                                                <td className="hidden sm:table-cell py-4 px-4 text-gray-600">{user.name || '—'}</td>
                                                <td className="py-4 px-4 text-gray-600 text-sm">{formatExpiry(user.last_seen)}</td>
                                                <td className="py-4 px-4">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${expired ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-800'}`}>
                                                        {expired ? 'Expired' : 'Active'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
