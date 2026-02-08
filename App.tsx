import React, { useState, useEffect } from 'react';
import { AuthGate } from './components/AuthGate';
import { EssayGrader } from './components/EssayGrader';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check session storage for persistence on refresh (optional but good UX)
  useEffect(() => {
    const sessionAuth = sessionStorage.getItem('gaokao_app_auth');
    if (sessionAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleAuthenticated = () => {
    setIsAuthenticated(true);
    sessionStorage.setItem('gaokao_app_auth', 'true');
  };

  if (!isAuthenticated) {
    return <AuthGate onAuthenticated={handleAuthenticated} />;
  }

  return <EssayGrader />;
}

export default App;