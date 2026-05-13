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

    e.preventDefault();

    setLoading(true);

    setError('');

    try {

      const data = await api.login(
        username,
        password
      );

      setToken(data.token);

      localStorage.setItem(
        'role',
        data.role
      );

      localStorage.setItem(
        'username',
        data.username
      );

      onLogin(data);

    } catch (err) {

      setError(
        err.message || 'Giriş alınmadı'
      );

    } finally {

      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">

      <form
        className="login-card"
        onSubmit={submit}
      >

        <LogoMark size={72} />

        <h1>
          ABŞERON LOGİSTİKA MƏRKƏZİ
        </h1>

        <div className="sub">
          Proses xəritələri sisteminə daxil olun
        </div>

        <div className="field">

          <label>
            İstifadəçi adı
          </label>

          <input
            type="text"
            value={username}
            onChange={e =>
              setUsername(e.target.value)
            }
          />

        </div>

        <div className="field">

          <label>
            Şifrə
          </label>

          <input
            type="password"
            value={password}
            onChange={e =>
              setPassword(e.target.value)
            }
          />

        </div>

        {error && (
          <div className="form-error">
            {error}
          </div>
        )}

        <button
          className="login-btn"
          type="submit"
          disabled={loading}
        >

          {loading && (
            <Loader2
              size={16}
              className="spin"
            />
          )}

          <span>
            {loading
              ? 'Yüklənir...'
              : 'Daxil olun'}
          </span>

        </button>

        <div className="login-hint">
          admin / admin123
          <br />
          user / user123
        </div>

      </form>

    </div>
  );
}