import React, { useState } from 'react';
import { APP_PASSWORD } from '../constants';

interface AuthGateProps {
  onAuthenticated: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === APP_PASSWORD) {
      onAuthenticated();
    } else {
      setError('Incorrect password. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100 px-4">
      <div className="bg-white/80 backdrop-blur-lg p-8 rounded-3xl shadow-2xl max-w-md w-full border border-white/50 animate-slide-up">
        <div className="text-center mb-10">
          <div className="bg-gradient-to-tr from-indigo-500 to-blue-600 w-20 h-20 rounded-2xl shadow-lg shadow-indigo-500/30 flex items-center justify-center mx-auto mb-6 transform rotate-3 hover:rotate-6 transition-transform duration-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Gaokao English Grader</h1>
          <p className="text-gray-500 mt-3 text-sm">Please enter access code to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-500 font-medium pl-1 animate-fade-in">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-600/40 transform hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Access Application
          </button>
        </form>
        <p className="mt-8 text-xs text-center text-gray-400 font-medium tracking-wide">
          POWERED BY GOOGLE CLOUD & GEMINI 3.0
        </p>
      </div>
    </div>
  );
};