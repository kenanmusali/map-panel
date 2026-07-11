import { useState, useEffect, useRef } from 'react';
import { api, getToken, setToken, storeIdentity, clearIdentity, beat, setForcedLogoutHandler } from './api/client.js';

import Login from './components/Login.jsx';
import SectionsHub from './components/SectionsHub.jsx';
import Home from './components/Home.jsx';
import Diagram from './components/Diagram.jsx';
import PdfList from './components/pdfs/PdfList.jsx';
import SuperAdmin from './components/SuperAdmin.jsx';

export default function App() {
  // views: 'login' | 'hub' | 'diagrams' | 'pdfs' | 'diagram' | 'superadmin'
  const [view, setView] = useState('login');
  const [user, setUser] = useState(null);
  const [processId, setProcessId] = useState(null);
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [bootChecking, setBootChecking] = useState(true);
  const pendingShare = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = params.get('d');
    if (d) {
      pendingShare.current = { id: d, nodeId: params.get('n') || null };
      const clean = window.location.pathname + window.location.hash;
      try { window.history.replaceState({}, '', clean); } catch (e) { }
    }
  }, []);

  function consumeShare() {
    const share = pendingShare.current;
    if (!share) return false;
    pendingShare.current = null;
    const id = /^\d+$/.test(share.id) ? Number(share.id) : share.id;
    openProcess(id, share.nodeId ? (/^\d+$/.test(share.nodeId) ? Number(share.nodeId) : share.nodeId) : null);
    return true;
  }

  function landingFor(role) {
    return role === 'superadmin' ? 'superadmin' : 'hub';
  }

  // Live account enforcement: when the server reports this account was
  // deactivated or deleted, sign the user out on the spot.
  useEffect(() => {
    setForcedLogoutHandler((code) => {
      const wipeDrafts = () => {
        try {
          Object.keys(localStorage)
            .filter(k => k.startsWith('absheron_draft_'))
            .forEach(k => localStorage.removeItem(k));
        } catch (e) { /* ignore */ }
      };
      try { api.presenceLeave(); } catch (e) { /* ignore */ }
      setToken(null);
      clearIdentity();
      setUser(null);
      setProcessId(null);
      setView('login');
      if (code === 'account_deleted') {
        // Deleted → discard every unsaved local edit.
        wipeDrafts();
        setTimeout(() => alert('Hesabınız silindi. Sistemdən çıxarıldınız.'), 50);
      } else if (code === 'account_disabled') {
        // Deactivated → keep the local draft so nothing is lost on this device.
        setTimeout(() => alert('Hesabınız deaktiv edildi. Yadda saxlanmamış dəyişikliklər bu cihazda saxlanıldı.'), 50);
      }
    });
    return () => setForcedLogoutHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { setBootChecking(false); return; }
      try {
        const me = await api.me();
        setUser(me);
        storeIdentity(me);
        if (me.role === 'superadmin') setView('superadmin');
        else if (!consumeShare()) setView('hub');
      } catch (e) {
        setToken(null);
        clearIdentity();
      } finally {
        setBootChecking(false);
      }
    })();
    // eslint-disable-next-line
  }, []);

  function onLogin(data) {
    setUser(data);
    storeIdentity(data);
    if (data.role === 'superadmin') setView('superadmin');
    else if (!consumeShare()) setView('hub');
  }

  function onLogout() {
    api.presenceLeave();
    setToken(null);
    clearIdentity();
    setUser(null);
    setProcessId(null);
    setView('login');
  }

  function pickSection(key) {
    if (key === 'diagrams') setView('diagrams');
    else if (key === 'pdfs') setView('pdfs');
  }

  function openProcess(id, nodeId = null) {
    setProcessId(id);
    setFocusNodeId(nodeId);
    setView('diagram');
  }

  function backToDiagrams() { setProcessId(null); setFocusNodeId(null); setView('diagrams'); }
  function backToHub() { setProcessId(null); setFocusNodeId(null); setView('hub'); }

  /* ---------------- global presence heartbeat + view tracking ---------------- */
  // The Diagram view manages its own richer heartbeat (with the open diagram),
  // so the shell only beats for the non-diagram views.
  useEffect(() => {
    if (!user || view === 'login' || view === 'diagram') return;
    const label = view; // hub | diagrams | pdfs | superadmin
    // Presence beat only — this drives the live "who's online" view. We no longer
    // log a history event for every page view (that was noise + wasted fetches).
    beat(label, null, null);
    const t = setInterval(() => beat(label, null, null), 12000);
    return () => clearInterval(t);
  }, [view, user]);

  useEffect(() => {
    const leave = () => { try { navigator.sendBeacon; } catch {} api.presenceLeave(); };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, []);

  if (bootChecking) return <div className="boot-screen">Yüklənir...</div>;
  if (view === 'login') return <Login onLogin={onLogin} />;
  if (view === 'superadmin') return <SuperAdmin onLogout={onLogout} />;
  if (view === 'hub') return <SectionsHub onPick={pickSection} onLogout={onLogout} />;
  if (view === 'diagrams') return <Home onOpen={openProcess} onLogout={onLogout} onBack={backToHub} />;
  if (view === 'pdfs') return <PdfList onBack={backToHub} onLogout={onLogout} />;
  if (view === 'diagram') {
    return (
      <Diagram
        processId={processId}
        focusNodeId={focusNodeId}
        onBack={backToDiagrams}
        onLogout={onLogout}
        user={user}
      />
    );
  }
  return null;
}
