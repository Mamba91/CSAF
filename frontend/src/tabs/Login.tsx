import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useLang } from '../lib/i18n';

export default function Login() {
  const { login } = useAuth();
  const { theme, toggle } = useTheme();
  const { lang, setLang, t } = useLang();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('login_error')); return; }
      login(data.user, data.token);
    } catch {
      setError(t('login_error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--bg)' }}>
      {/* Barre rouge en haut */}
      <div style={{ height: 4, background: 'var(--accent)' }} />

      {/* Header minimal */}
      <header
        className="flex items-center justify-between px-8 py-4"
        style={{ background: 'var(--nav-bg)', borderBottom: '1px solid var(--nav-border)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded text-sm font-bold"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            ⚡
          </div>
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-1)' }}>
            CSAF Vuln Manager
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Sélecteur langue style image */}
          <div className="flex" style={{ border: '1px solid var(--border)', borderRadius: 4 }}>
            {(['fr', 'en'] as const).map((l, i) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className="px-2.5 py-1 text-xs font-semibold uppercase transition"
                style={{
                  background: lang === l ? 'var(--accent)' : 'transparent',
                  color: lang === l ? '#fff' : 'var(--text-2)',
                  borderRight: i === 0 ? '1px solid var(--border)' : 'none',
                  borderRadius: i === 0 ? '3px 0 0 3px' : '0 3px 3px 0',
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={toggle}
            className="flex h-8 w-8 items-center justify-center rounded text-base transition"
            style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      {/* Formulaire centré */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
              {t('login_submit')}
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>
              {t('app_subtitle')}
            </p>
          </div>

          <form onSubmit={submit} className="card p-6 space-y-4">
            <div>
              <label className="label">{t('login_username')}</label>
              <input
                className="input"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div>
              <label className="label">{t('login_password')}</label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                className="rounded-md px-3 py-2 text-sm"
                style={{ background: 'var(--danger-muted)', color: 'var(--danger)', border: '1px solid rgba(200,16,46,0.2)' }}
              >
                {error}
              </div>
            )}

            <button
              className="btn-primary w-full"
              disabled={busy || !username.trim() || !password}
              type="submit"
            >
              {busy ? t('login_connecting') : t('login_submit')}
            </button>
          </form>

          <p className="mt-6 text-center text-xs" style={{ color: 'var(--text-3)' }}>
            CSAF Vulnerability Manager — OT Security
          </p>
        </div>
      </div>
    </div>
  );
}
