import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface SSOCallbackProps {
    onLoginSuccess: (role: string, username: string) => void;
}

export const SSOCallback: React.FC<SSOCallbackProps> = ({ onLoginSuccess }) => {
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');

        if (!token) {
            setError('No token received from Auth Center.');
            return;
        }

        api.handleSSOCallback(token).then((result) => {
            if (result.success && result.role) {
                onLoginSuccess(result.role, result.username || result.name || '');
                navigate(result.role === 'admin' ? '/admin' : '/grader', { replace: true });
            } else {
                setError(result.error || 'Authentication failed. Please try again.');
            }
        });
    }, [navigate, onLoginSuccess]);

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 px-4">
                <div className="bg-white/80 backdrop-blur-lg p-8 rounded-3xl shadow-2xl max-w-md w-full border border-white/50 text-center">
                    <div className="bg-red-100 text-red-600 rounded-xl p-4 mb-6">
                        <p className="font-semibold">Authentication Error</p>
                        <p className="text-sm mt-1">{error}</p>
                    </div>
                    <button
                        onClick={() => navigate('/login')}
                        className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-blue-600/40 transition-all duration-300"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100">
            <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-indigo-600 border-t-transparent" />
                <p className="mt-4 text-gray-600 font-semibold">Authenticating with Aryuki Auth Center...</p>
            </div>
        </div>
    );
};
