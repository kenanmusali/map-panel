import { useState, useEffect } from 'react';
import { api, getToken, setToken } from './api/client.js';
import Login from './components/Login.jsx';
import Home from './components/Home.jsx';
import Diagram from './components/Diagram.jsx';

export default function App() {
  const [view, setView] = useState('login');
  const [user, setUser] = useState(null);
  const [processId, setProcessId] = useState(null);
  const [bootChecking, setBootChecking] = useState(true);

  // On boot: if token in localStorage, try to verify it
  useEffect(() => {
    (async () => {
      const t = getToken();
      if (!t) { setBootChecking(false); return; }
      try {
        const { user } = await api.me();
        setUser(user);
        setView('home');
      } catch {
        setToken(null);
      } finally {
        setBootChecking(false);
      }
    })();
  }, []);

  function onLogin(u) {
    setUser(u);
    setView('home');
  }

  function onLogout() {
    setUser(null);
    setProcessId(null);
    setView('login');
  }

  function openProcess(id) {
    setProcessId(id);
    setView('diagram');
  }

  function backToHome() {
    setProcessId(null);
    setView('home');
  }

  if (bootChecking) {
    return <div className="boot-screen">Yüklənir...</div>;
  }

  if (view === 'login') return <Login onLogin={onLogin} />;
  if (view === 'home') return <Home onOpen={openProcess} onLogout={onLogout} />;
  if (view === 'diagram') return <Diagram processId={processId} onBack={backToHome} onLogout={onLogout} />;
  return null;
}
