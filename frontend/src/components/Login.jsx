import { useState } from 'react';
import { LogoMark } from './Logo.jsx';
import { api, setToken } from '../api/client.js';
import { Loader2 } from './icons.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e?.preventDefault?.();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await api.login(username, password);
      setToken(token);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Giriş alınmadı');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <LogoMark size={72} />
        <h1>ABŞERON LOGİSTİKA MƏRKƏZİ</h1>
        <div className="sub">Proses xəritələri sisteminə daxil olun</div>

        <div className="field">
          <label>İstifadəçi adı</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Şifrə</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && <div className="form-error">{error}</div>}

        <button className="login-btn" type="submit" disabled={loading}>
          {loading ? <Loader2 size={16} className="spin" /> : null}
          <span>{loading ? 'Yüklənir...' : 'Daxil olun'}</span>
        </button>

        <div className="login-hint">Standart: <code>admin</code> / parol .env faylında</div>
      </form>
    </div>
  );
}
