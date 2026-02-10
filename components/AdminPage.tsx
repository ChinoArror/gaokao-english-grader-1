import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import { User, UsageStat } from '../types';
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
    ComposedChart
} from 'recharts';

interface AdminPageProps {
    onLogout: () => void;
    onNavigateToGrader: () => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onLogout, onNavigateToGrader }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');

    // Stats State
    const [stats, setStats] = useState<UsageStat[]>([]);
    const [statsPeriod, setStatsPeriod] = useState<'daily' | 'monthly'>('daily');
    const [statsLoading, setStatsLoading] = useState(true);
    const [selectedUserId, setSelectedUserId] = useState<number | ''>('');

    useEffect(() => {
        loadUsers();
    }, []);

    useEffect(() => {
        loadStats();
    }, [statsPeriod, selectedUserId]);

    const loadStats = async () => {
        setStatsLoading(true);
        try {
            const data = await api.getStats(statsPeriod, selectedUserId === '' ? undefined : Number(selectedUserId));
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
            setUsers(userData);
        } catch (err) {
            console.error('Failed to load users:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const result = await api.createUser(newUsername, newPassword);
            if (result.success) {
                setShowAddModal(false);
                setNewUsername('');
                setNewPassword('');
                loadUsers();
            } else {
                setError(result.error || 'Failed to create user');
            }
        } catch (err) {
            setError('Failed to create user');
        }
    };

    const handleUpdateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setError('');

        try {
            await api.updateUser(
                editingUser.id,
                newUsername,
                newPassword || undefined
            );
            setEditingUser(null);
            setNewUsername('');
            setNewPassword('');
            loadUsers();
        } catch (err) {
            setError('Failed to update user');
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm('Are you sure you want to delete this user? This will also delete all their essay records.')) {
            return;
        }

        try {
            await api.deleteUser(userId);
            loadUsers();
        } catch (err) {
            console.error('Failed to delete user:', err);
        }
    };

    const handleToggleStatus = async (user: User) => {
        const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
        const action = newStatus === 'active' ? 'activate' : 'suspend'; // continue/pause

        if (!confirm(`Are you sure you want to ${action} this user?`)) {
            return;
        }

        try {
            await api.toggleUserStatus(user.id, newStatus);
            loadUsers();
        } catch (err) {
            console.error(`Failed to ${action} user:`, err);
            setError(`Failed to ${action} user`);
        }
    };

    const openEditModal = (user: User) => {
        setEditingUser(user);
        setNewUsername(user.username);
        setNewPassword('');
        setError('');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 p-4 md:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 mb-6 border border-white/50">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800">Admin Dashboard</h1>
                            <p className="text-gray-500 mt-1">Manage users and permissions</p>
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

                        <div className="flex flex-wrap gap-2 items-center">
                            <select
                                value={selectedUserId}
                                onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
                                className="px-4 py-2 rounded-xl border border-gray-200 bg-gray-50/50 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-100 transition-all hover:bg-white cursor-pointer"
                            >
                                <option value="">All Users</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.username}</option>
                                ))}
                            </select>

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
                    </div>

                    {statsLoading ? (
                        <div className="h-80 flex items-center justify-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
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

                {/* User List */}
                <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-2xl p-6 border border-white/50">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-gray-800">Users</h2>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                        >
                            <span className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add User
                            </span>
                        </button>
                    </div>

                    {loading ? (
                        <div className="text-center py-12">
                            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
                            <p className="mt-4 text-gray-500">Loading users...</p>
                        </div>
                    ) : users.length === 0 ? (
                        <div className="text-center py-12">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <p className="mt-4 text-gray-500">No users yet</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-4 px-4 font-semibold text-gray-700">Username</th>
                                        <th className="text-left py-4 px-4 font-semibold text-gray-700">Status</th>
                                        <th className="text-left py-4 px-4 font-semibold text-gray-700">Created</th>
                                        <th className="text-right py-4 px-4 font-semibold text-gray-700">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                                            <td className="py-4 px-4 font-medium text-gray-800">{user.username}</td>
                                            <td className="py-4 px-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.status === 'suspended' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                                    }`}>
                                                    {user.status === 'suspended' ? 'Suspended' : 'Active'}
                                                </span>
                                            </td>
                                            <td className="py-4 px-4 text-gray-600">
                                                {new Date(user.created_at * 1000).toLocaleDateString()}
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => openEditModal(user)}
                                                        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleStatus(user)}
                                                        className={`px-4 py-2 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 ${user.status === 'suspended'
                                                            ? 'bg-green-500 hover:bg-green-600' // Continue
                                                            : 'bg-orange-500 hover:bg-orange-600' // Pause
                                                            }`}
                                                    >
                                                        {user.status === 'suspended' ? 'Continue' : 'Pause'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(user.id)}
                                                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Add User Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-slide-up">
                        <h3 className="text-2xl font-bold text-gray-800 mb-6">Add New User</h3>
                        <form onSubmit={handleAddUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-300 outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-300 outline-none"
                                    required
                                />
                            </div>
                            {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="submit"
                                    className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                                >
                                    Add User
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setNewUsername('');
                                        setNewPassword('');
                                        setError('');
                                    }}
                                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit User Modal */}
            {editingUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full animate-slide-up">
                        <h3 className="text-2xl font-bold text-gray-800 mb-6">Edit User</h3>
                        <form onSubmit={handleUpdateUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Username</label>
                                <input
                                    type="text"
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-300 outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    New Password <span className="text-gray-400">(leave blank to keep current)</span>
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-300 outline-none"
                                />
                            </div>
                            {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="submit"
                                    className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                                >
                                    Update
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingUser(null);
                                        setNewUsername('');
                                        setNewPassword('');
                                        setError('');
                                    }}
                                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
