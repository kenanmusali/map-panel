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

  useEffect(() => {

    (async () => {

      const token = getToken();

      if (!token) {

        setBootChecking(false);
        return;
      }

      try {

        const me = await api.me();

        setUser(me);

        localStorage.setItem(
          'role',
          me.role
        );

        localStorage.setItem(
          'username',
          me.username
        );

        setView('home');

      } catch (e) {

        console.error(e);

        setToken(null);

        localStorage.removeItem('role');

        localStorage.removeItem('username');

      } finally {

        setBootChecking(false);
      }

    })();

  }, []);

  function onLogin(data) {

    setUser(data);

    localStorage.setItem(
      'role',
      data.role
    );

    localStorage.setItem(
      'username',
      data.username
    );

    setView('home');
  }

  function onLogout() {

    setToken(null);

    localStorage.removeItem('role');

    localStorage.removeItem('username');

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

    return (
      <div className="boot-screen">
        Yüklənir...
      </div>
    );
  }

  if (view === 'login') {

    return (
      <Login onLogin={onLogin} />
    );
  }

  if (view === 'home') {

    return (
      <Home
        onOpen={openProcess}
        onLogout={onLogout}
      />
    );
  }

  if (view === 'diagram') {

    return (
      <Diagram
        processId={processId}
        onBack={backToHome}
        onLogout={onLogout}
        user={user}
      />
    );
  }

  return null;
}