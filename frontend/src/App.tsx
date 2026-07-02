import { useEffect, useState, useRef } from 'react';
import { useLang, type Lang } from './lib/i18n';
import { useAuth } from './lib/auth';
import { useTheme } from './lib/theme';
import Login from './tabs/Login';
import Dashboard from './tabs/Dashboard';
import Projects from './tabs/Projects';
import Sources from './tabs/Sources';
import Search from './tabs/Search';
import Advisories from './tabs/Advisories';
import Vulnerabilities from './tabs/Vulnerabilities';
import Users from './tabs/Users';
import AuditLogs from './tabs/AuditLogs';
import { api } from './lib/api';
import { useImportProgress } from './lib/importProgress';
import { ImportProgress } from './components/ui';

type Tab = 'dashboard' | 'projects' | 'advisories' | 'sources' | 'search' | 'vulns' | 'users' | 'auditlogs';

const NAV_BASE: { key: Tab; tKey: string }[] = [
  { key: 'dashboard',   tKey: 'nav_dashboard'   },
  { key: 'projects',    tKey: 'nav_projects'    },
  { key: 'advisories',  tKey: 'nav_advisories'  },
  { key: 'vulns',       tKey: 'nav_vulns'       },
  { key: 'sources',     tKey: 'nav_sources'     },
  { key: 'search',      tKey: 'nav_search'      },
];
const NAV_ADMIN: { key: Tab; tKey: string }[] = [
  { key: 'users',     tKey: 'nav_users'     },
  { key: 'auditlogs', tKey: 'nav_auditlogs' },
];

export default function App() {
  const { lang, setLang, t } = useLang();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const importProgress = useImportProgress();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [projectFocus, setProjectFocus] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/health').then((r) => setOnline(r.ok)).catch(() => setOnline(false));
  }, []);

  // Fermer le menu utilisateur si clic extérieur
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return <Login />;

  const navItems = user.isAdmin ? [...NAV_BASE, ...NAV_ADMIN] : NAV_BASE;

  function go(dest: string, arg?: number) {
    setTab(dest as Tab);
    if (dest === 'projects') setProjectFocus(arg ?? null);
  }

  async function handleLogout() {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    logout();
  }

  const currentLabel = t(navItems.find((n) => n.key === tab)?.tKey ?? '');

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--bg)' }}>

      {/* ── Barre de navigation principale ───────────────────────────── */}
      <header
        style={{
          background: 'var(--nav-bg)',
          borderBottom: '1px solid var(--nav-border)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        {/* Ligne rouge accent en haut */}
        <div style={{ height: 3, background: 'var(--accent)', width: '100%' }} />

        <div className="mx-auto flex max-w-screen-2xl items-center gap-0 px-6" style={{ height: 56 }}>

          {/* Logo */}
          <div className="flex shrink-0 items-center gap-3 pr-8" style={{ borderRight: '1px solid var(--border)' }}>
            <div
              className="flex h-8 w-8 items-center justify-center rounded text-sm font-bold"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              ⚡
            </div>
            <span className="text-sm font-bold tracking-tight uppercase" style={{ color: 'var(--text-1)', letterSpacing: '0.05em' }}>
              CSAF Vuln
            </span>
          </div>

          {/* Navigation items */}
          <nav className="flex flex-1 items-center px-2">
            {NAV_BASE.map((n) => (
              <NavItem
                key={n.key}
                label={t(n.tKey)}
                active={tab === n.key}
                onClick={() => { setTab(n.key); if (n.key === 'projects') setProjectFocus(null); }}
              />
            ))}

            {user.isAdmin && (
              <>
                <div className="mx-3 h-5 w-px" style={{ background: 'var(--border)' }} />
                {NAV_ADMIN.map((n) => (
                  <NavItem
                    key={n.key}
                    label={t(n.tKey)}
                    active={tab === n.key}
                    onClick={() => setTab(n.key)}
                    admin
                  />
                ))}
              </>
            )}
          </nav>

          {/* Côté droit */}
          <div className="flex shrink-0 items-center gap-1" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>

            {/* Langue */}
            <div className="flex" style={{ border: '1px solid var(--border)', borderRadius: 4 }}>
              {(['fr', 'en'] as Lang[]).map((l, i) => (
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

            {/* Thème */}
            <button
              onClick={toggle}
              className="flex h-8 w-8 items-center justify-center rounded transition text-base"
              style={{ color: 'var(--text-2)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
              title={theme === 'dark' ? t('theme_light') : t('theme_dark')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>

            {/* Statut API */}
            <div
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs"
              style={{ color: 'var(--text-3)' }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background: online == null ? 'var(--text-3)' : online ? 'var(--success)' : 'var(--danger)',
                }}
              />
              <span className="hidden sm:inline">
                {online == null ? t('api_connecting') : online ? t('api_online') : t('api_offline')}
              </span>
            </div>

            {/* Menu utilisateur */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded px-3 py-1.5 text-sm transition"
                style={{
                  background: userMenuOpen ? 'var(--bg-subtle)' : 'transparent',
                  color: 'var(--text-1)',
                  border: '1px solid var(--border)',
                }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  {user.username[0].toUpperCase()}
                </span>
                <span className="hidden sm:inline font-medium">{user.username}</span>
                {user.isAdmin && (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-semibold"
                    style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                  >
                    Admin
                  </span>
                )}
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>▾</span>
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-52 rounded-lg py-1 shadow-xl"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
                    zIndex: 200,
                  }}
                >
                  <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>
                    {user.email || user.username}
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm transition"
                    style={{ color: 'var(--danger)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--danger-muted)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                  >
                    <span>⏻</span> {t('logout')}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* ── Fil d'Ariane / titre de page ─────────────────────────────── */}
      <div
        className="mx-auto w-full max-w-screen-2xl px-6 py-3"
        style={{ borderBottom: '1px solid var(--border-muted)' }}
      >
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>CSAF</span>
          <span>›</span>
          <span style={{ color: 'var(--text-2)' }}>{currentLabel}</span>
        </div>
      </div>

      {/* ── Barre de progression globale (imports) ────────────────────── */}
      {importProgress.active && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 300,
            background: 'var(--nav-bg)',
            borderTop: '2px solid var(--accent)',
            padding: '10px 24px 12px',
          }}
        >
          <ImportProgress
            label={importProgress.label}
            done={importProgress.total > 0 ? importProgress.done : undefined}
            total={importProgress.total > 0 ? importProgress.total : undefined}
          />
        </div>
      )}

      {/* ── Contenu principal ─────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-6" style={{ paddingBottom: importProgress.active ? 72 : undefined }}>
        {tab === 'dashboard'   && <Dashboard go={go} />}
        {tab === 'projects'    && <Projects focusId={projectFocus} />}
        {tab === 'advisories'  && <Advisories />}
        {tab === 'sources'     && <Sources />}
        {tab === 'search'      && <Search />}
        {tab === 'vulns'       && <Vulnerabilities />}
        {tab === 'users'       && user.isAdmin && <Users />}
        {tab === 'auditlogs'   && user.isAdmin && <AuditLogs />}
      </main>
    </div>
  );
}

/* ── Composant NavItem ──────────────────────────────────────────────── */
function NavItem({
  label, active, onClick, admin,
}: {
  label: string; active: boolean; onClick: () => void; admin?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="relative px-4 py-1 text-sm font-medium transition-colors duration-150"
      style={{
        color: active ? 'var(--accent)' : admin ? 'var(--text-3)' : 'var(--text-2)',
        height: 56,
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'none',
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-1)';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.color = admin ? 'var(--text-3)' : 'var(--text-2)';
      }}
    >
      {label}
    </button>
  );
}
