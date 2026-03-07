import React, { useState } from 'react';
import { api } from '../services/api';

interface LoginPageProps {
    onLoginSuccess: (role: string, username: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
    const [loading, setLoading] = useState(false);

    const handleSSO = () => {
        setLoading(true);
        api.redirectToSSO();
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

                <button
                    id="sso-login-btn"
                    onClick={handleSSO}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                    {loading ? (
                        <>
                            <div className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Redirecting...
                        </>
                    ) : (
                        <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                            Login With Aryuki Auth Center
                        </>
                    )}
                </button>

                <p className="mt-8 text-xs text-center text-gray-400 font-medium tracking-wide">
                    POWERED BY GOOGLE CLOUD &amp; GEMINI 3.0
                </p>
            </div>
        </div>
    );
};
