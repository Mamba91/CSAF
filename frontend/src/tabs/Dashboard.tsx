import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { DashboardData } from '../lib/types';
import { Spinner, formatDate } from '../components/ui';
import { useLang } from '../lib/i18n';

const SEV_COLOR: Record<string, string> = {
  CRITICAL: '#fb7185',
  HIGH:     '#fb923c',
  MEDIUM:   '#fbbf24',
  LOW:      '#60a5fa',
  NONE:     '#94a3b8',
};

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{label}</div>
      <div className="mt-2 text-3xl font-semibold" style={{ color: accent || 'var(--text-1)' }}>
        {value}
      </div>
    </div>
  );
}

export default function Dashboard({ go }: { go: (tab: string, arg?: any) => void }) {
  const { t, dateLocale } = useLang();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardData>('/dashboard').then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!data) return null;

  const c = data.counts;
  const sevTotal = data.bySeverity.reduce((s, x) => s + Number(x.count), 0) || 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label={t('dash_stat_projects')}   value={c.projects} />
        <Stat label={t('dash_stat_devices')}    value={c.devices} />
        <Stat label={t('dash_stat_sources')}    value={c.sources} />
        <Stat label={t('dash_stat_advisories')} value={c.advisories} accent="#f87171" />
        <Stat label={t('dash_stat_vulns')}      value={c.vulnerabilities} accent="#fbbf24" />
        <Stat label={t('dash_stat_matches')}    value={c.matches} accent="#fb7185" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-4 font-semibold" style={{ color: 'var(--text-1)' }}>{t('dash_severity_title')}</h3>
          {data.bySeverity.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('dash_severity_empty')}</p>
          ) : (
            <div className="space-y-3">
              {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE'].map((sev) => {
                const item = data.bySeverity.find((x) => x.severity === sev);
                const n = item ? Number(item.count) : 0;
                return (
                  <div key={sev} className="flex items-center gap-3">
                    <span className="w-20 text-xs" style={{ color: 'var(--text-2)' }}>{sev}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--bg-hover)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(n / sevTotal) * 100}%`, background: SEV_COLOR[sev] }}
                      />
                    </div>
                    <span className="mono w-10 text-right text-sm" style={{ color: 'var(--text-2)' }}>{n}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-4 font-semibold" style={{ color: 'var(--text-1)' }}>{t('dash_top_projects_title')}</h3>
          {data.topProjects.filter((p) => Number(p.vuln_count) > 0).length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('dash_top_projects_empty')}</p>
          ) : (
            <div className="divide-theme">
              {data.topProjects.map((p) => (
                <button
                  key={p.project_id}
                  onClick={() => go('projects', p.project_id)}
                  className="flex w-full items-center justify-between py-2.5 text-left hover:opacity-80"
                >
                  <span className="text-sm" style={{ color: 'var(--text-1)' }}>{p.project_name}</span>
                  <span className="flex items-center gap-2 text-xs">
                    {Number(p.critical_count) > 0 && (
                      <span className="rounded px-2 py-0.5" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                        {p.critical_count} crit.
                      </span>
                    )}
                    {Number(p.high_count) > 0 && (
                      <span className="rounded px-2 py-0.5" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>
                        {p.high_count} high
                      </span>
                    )}
                    <span className="mono" style={{ color: 'var(--text-3)' }}>{p.vuln_count} vulns</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="mb-4 font-semibold" style={{ color: 'var(--text-1)' }}>{t('dash_recent_title')}</h3>
        {data.recentAdvisories.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>{t('dash_recent_empty')}</p>
        ) : (
          <div className="divide-theme">
            {data.recentAdvisories.map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="mono text-xs" style={{ color: 'var(--accent)' }}>{a.tracking_id}</span>
                  <span className="ml-3 text-sm" style={{ color: 'var(--text-2)' }}>{a.title}</span>
                </div>
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>{formatDate(a.released, dateLocale)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
