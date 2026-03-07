import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { LoginPage } from './components/LoginPage';
import { SSOCallback } from './components/SSOCallback';
import { EssayGrader } from './components/EssayGrader';
import { AdminPage } from './components/AdminPage';
import { HistoryPage } from './components/HistoryPage';
import { ListeningPage } from './components/ListeningPage';

import { api } from './services/api';

function App() {
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [username, setUsername] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Skip session check on callback page — SSOCallback handles its own flow
    if (location.pathname === '/sso-callback') {
      setLoading(false);
      return;
    }

    const checkSession = async () => {
      const session = await api.verifySession();
      if (session.valid && session.role && (session.username || session.name)) {
        setUserRole(session.role as 'admin' | 'user');
        setUsername(session.username || session.name || '');

        if (location.pathname === '/login' || location.pathname === '/') {
          navigate(session.role === 'admin' ? '/admin' : '/grader');
        }
      } else {
        if (location.pathname !== '/login') {
          navigate('/login');
        }
      }
      setLoading(false);
    };

    checkSession();
  }, [navigate]); // Only run on mount

  const handleLoginSuccess = (role: string, uname: string) => {
    setUserRole(role as 'admin' | 'user');
    setUsername(uname);
    navigate(role === 'admin' ? '/admin' : '/grader');
  };

  const handleLogout = async () => {
    // api.logout() redirects to auth-center; no need to navigate manually
    await api.logout();
    setUserRole(null);
    setUsername('');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-indigo-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />

      {/* SSO Callback route — handles JWT from auth-center redirect */}
      <Route path="/sso-callback" element={<SSOCallback onLoginSuccess={handleLoginSuccess} />} />

      <Route path="/grader" element={
        userRole ? (
          <EssayGrader
            onNavigateToHistory={() => navigate('/history')}
            onNavigateToListen={() => navigate('/listen')}
            onLogout={handleLogout}
          />
        ) : <Navigate to="/login" />
      } />

      <Route path="/admin" element={
        userRole === 'admin' ? (
          <AdminPage
            onLogout={handleLogout}
            onNavigateToGrader={() => navigate('/grader')}
          />
        ) : <Navigate to="/login" />
      } />

      <Route path="/history" element={
        userRole ? (
          <HistoryPage onBack={() => navigate('/grader')} />
        ) : <Navigate to="/login" />
      } />

      <Route path="/listen" element={
        userRole ? (
          <ListeningPage />
        ) : <Navigate to="/login" />
      } />

      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;