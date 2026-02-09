import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { EssayGrader } from './components/EssayGrader';
import { AdminPage } from './components/AdminPage';
import { HistoryPage } from './components/HistoryPage';
import { api } from './services/api';

type Page = 'login' | 'grader' | 'admin' | 'history';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('login');
  const [userRole, setUserRole] = useState<'admin' | 'user' | null>(null);
  const [username, setUsername] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user has valid session
    const checkSession = async () => {
      const session = await api.verifySession();
      if (session.valid && session.role && session.username) {
        setUserRole(session.role as 'admin' | 'user');
        setUsername(session.username);
        setCurrentPage(session.role === 'admin' ? 'admin' : 'grader');
      }
      setLoading(false);
    };

    checkSession();
  }, []);

  const handleLoginSuccess = (role: string, username: string) => {
    setUserRole(role as 'admin' | 'user');
    setUsername(username);

    if (role === 'admin') {
      setCurrentPage('admin');
    } else {
      setCurrentPage('grader');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setUserRole(null);
    setUsername('');
    setCurrentPage('login');
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

  if (currentPage === 'login') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentPage === 'admin') {
    return (
      <AdminPage
        onLogout={handleLogout}
        onNavigateToGrader={() => setCurrentPage('grader')}
      />
    );
  }

  if (currentPage === 'history') {
    return <HistoryPage onBack={() => setCurrentPage('grader')} />;
  }

  // Default: Grader page
  return (
    <EssayGrader
      onNavigateToHistory={() => setCurrentPage('history')}
      onLogout={handleLogout}
    />
  );
}

export default App;