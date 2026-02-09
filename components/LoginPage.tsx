import React, { useState } from 'react';
import { api } from '../services/api';

interface LoginPageProps {
    onLoginSuccess: (role: string, username: string, userId?: number) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await api.login(username, password);

            if (result.success && result.role && result.username) {
                onLoginSuccess(result.role, result.username, result.userId);
            } else {
                setError(result.error || 'Login failed. Please try again.');
            }
        } catch (err) {
            setError('Connection error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 px-4">
            <div className="bg-white/80 backdrop-blur-lg p-8 rounded-3xl shadow-2xl max-w-md w-full border border-white/50 animate-slide-up">
                <div className="text-center mb-10">
                    <div className="bg-gradient-to-tr from-indigo-500 to-blue-600 w-20 h-20 rounded-2xl shadow-lg shadow-indigo-500/30 flex items-center justify-center mx-auto mb-6 transform rotate-3 hover:rotate-6 transition-transform duration-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Gaokao English Grader</h1>
                    <p className="text-gray-500 mt-3 text-sm">Sign in to continue</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="group">
                        <label htmlFor="username" className="block text-sm font-semibold text-gray-700 mb-2 ml-1 transition-colors group-focus-within:text-indigo-600">
                            Username
                        </label>
                        <input
                            type="text"
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-5 py-4 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-300 outline-none shadow-sm"
                            placeholder="Enter username..."
                            autoFocus
                            required
                        />
                    </div>

                    <div className="group">
                        <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2 ml-1 transition-colors group-focus-within:text-indigo-600">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-5 py-4 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all duration-300 outline-none shadow-sm"
                            placeholder="Enter password..."
                            required
                        />
                        {error && <p className="mt-2 text-sm text-red-500 font-medium pl-1 animate-fade-in">{error}</p>}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <p className="mt-8 text-xs text-center text-gray-400 font-medium tracking-wide">
                    POWERED BY GOOGLE CLOUD & GEMINI 3.0
                </p>
            </div>
        </div>
    );
};
