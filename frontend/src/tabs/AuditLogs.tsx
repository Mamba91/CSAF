import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { Spinner } from '../components/ui';

interface LogEntry {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  resource: string;
  resource_id: string;
  details: Record<string, any>;
  ip: string;
  created_at: string;
}

const ACTION_STYLE: Record<string, { bg: string; color: string }> = {
  LOGIN:                { bg: 'var(--accent-muted)',  color: 'var(--accent-h)'  },
  LOGOUT:               { bg: 'var(--bg-subtle)',      color: 'var(--text-2)'    },
  CREATE_PROJECT:       { bg: 'rgba(76,175,125,0.12)', color: 'var(--success)'   },
  UPDATE_PROJECT:       { bg: 'rgba(224,165,80,0.12)', color: 'var(--warn)'      },
  DELETE_PROJECT:       { bg: 'var(--danger-muted)',   color: 'var(--danger)'    },
  ADD_DEVICE:           { bg: 'rgba(76,175,125,0.12)', color: 'var(--success)'   },
  UPDATE_DEVICE:        { bg: 'rgba(224,165,80,0.12)', color: 'var(--warn)'      },
  DELETE_DEVICE:        { bg: 'var(--danger-muted)',   color: 'var(--danger)'    },
  BULK_IMPORT_DEVICES:  { bg: 'rgba(76,175,125,0.12)', color: 'var(--success)'   },
  EXPORT_REPORT_HTML:   { bg: 'var(--accent-muted)',  color: 'var(--accent-h)'  },
  EXPORT_REPORT_CSV:    { bg: 'var(--accent-muted)',  color: 'var(--accent-h)'  },
  CREATE_USER:          { bg: 'rgba(76,175,125,0.12)', color: 'var(--success)'   },
  UPDATE_USER:          { bg: 'rgba(224,165,80,0.12)', color: 'var(--warn)'      },
  DELETE_USER:          { bg: 'var(--danger-muted)',   color: 'var(--danger)'    },
  UPDATE_VULN_STATUS:   { bg: 'rgba(224,165,80,0.12)', color: 'var(--warn)'      },
};

export default function AuditLogs() {
  const { t, dateLocale } = useLang();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '300' });
      if (actionFilter) params.set('action', actionFilter);
      setLogs(await api.get<LogEntry[]>(`/audit-logs?${params}`));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [actionFilter]);

  const filtered = filter
    ? logs.filter((l) =>
        l.username.toLowerCase().includes(filter.toLowerCase()) ||
        l.action.toLowerCase().includes(filter.toLowerCase()) ||
        l.ip.includes(filter) ||
        l.resource_id.includes(filter)
      )
    : logs;

  const actions = [...new Set(logs.map((l) => l.action))].sort();

  function fmtDate(d: string) {
    try {
      return new Date(d).toLocaleString(dateLocale === 'fr-FR' ? 'fr-FR' : 'en-US', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return d; }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input !w-56"
          placeholder={t('audit_search_placeholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="input !w-48"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="">{t('audit_all_actions')}</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn-ghost" onClick={load}>{t('audit_refresh')}</button>
        <span className="text-xs" style={{ color: 'var(--text-2)' }}>
          {t('audit_count', filtered.length)}
        </span>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="tbl-head sticky top-0 z-10 text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">{t('audit_col_date')}</th>
                  <th className="px-4 py-3">{t('audit_col_user')}</th>
                  <th className="px-4 py-3">{t('audit_col_action')}</th>
                  <th className="px-4 py-3">{t('audit_col_resource')}</th>
                  <th className="px-4 py-3">{t('audit_col_details')}</th>
                  <th className="px-4 py-3">{t('audit_col_ip')}</th>
                </tr>
              </thead>
              <tbody className="divide-y tbl-divider">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>
                      {t('audit_empty')}
                    </td>
                  </tr>
                )}
                {filtered.map((log) => {
                  const style = ACTION_STYLE[log.action] || { bg: 'var(--bg-subtle)', color: 'var(--text-2)' };
                  return (
                    <tr key={log.id} className="tbl-row">
                      <td className="mono px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--text-2)' }}>
                        {fmtDate(log.created_at)}
                      </td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-1)' }}>
                        {log.username || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="rounded px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
                          style={{ background: style.bg, color: style.color }}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-2)' }}>
                        {log.resource}{log.resource_id ? ` #${log.resource_id}` : ''}
                      </td>
                      <td className="px-4 py-2.5 text-xs max-w-xs truncate" style={{ color: 'var(--text-2)' }}
                        title={JSON.stringify(log.details)}>
                        {Object.keys(log.details).length > 0
                          ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(' · ')
                          : '—'}
                      </td>
                      <td className="mono px-4 py-2.5 text-xs" style={{ color: 'var(--text-3)' }}>
                        {log.ip}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
