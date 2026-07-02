import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import type { Vulnerability } from '../lib/types';
import { SeverityBadge, Spinner, Empty, Modal, ConfirmDialog, formatDate } from '../components/ui';
import { useLang } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

const SEVS = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function CollapsibleSection({ label, defaultOpen = true, children }: {
  label: string; defaultOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        className="flex w-full items-center justify-between rounded py-1 transition"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="label">{label}</div>
        <span style={{ color: 'var(--text-3)', fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}

type SortDir = 'asc' | 'desc';

function SortTh({
  col, label, sortKey, sortDir, onSort,
}: {
  col: string; label: string; sortKey: string; sortDir: SortDir; onSort: (col: string) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="cursor-pointer select-none px-4 py-3 transition"
      style={{ color: 'var(--text-2)' }}
      onClick={() => onSort(col)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
    >
      <span className="flex items-center gap-1">
        {label}
        <span className="text-xs opacity-40">{active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </span>
    </th>
  );
}

export default function Vulnerabilities() {
  const { t, dateLocale } = useLang();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<Vulnerability[]>([]);

  function guardDelete(onConfirm: () => void): void {
    if (!user?.isAdmin) { showToast(t('no_delete_rights'), 'error'); return; }
    onConfirm();
  }
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState('');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; label: string } | null>(null);
  const [deletePublishersTarget, setDeletePublishersTarget] = useState<string[] | null>(null);
  const [selectedPublishers, setSelectedPublishers] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(true);
  const [sortKey, setSortKey] = useState('cvss_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (severity) params.set('severity', severity);
    if (q) params.set('q', q);
    setRows(await api.get<Vulnerability[]>(`/vulnerabilities?${params}`));
    setLoading(false);
  }
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [severity, q]);

  async function openDetail(id: number) {
    setDetail(await api.get(`/vulnerabilities/${id}`));
  }

  async function deleteVuln() {
    if (!deleteTarget) return;
    await api.del(`/vulnerabilities/${deleteTarget.id}`);
    load();
  }

  async function deleteByPublishers() {
    if (!deletePublishersTarget) return;
    for (const pub of deletePublishersTarget) {
      await api.del(`/vulnerabilities/publisher/${encodeURIComponent(pub)}`);
    }
    setSelectedPublishers(new Set());
    setDeletePublishersTarget(null);
    load();
  }

  function togglePublisher(pub: string) {
    setSelectedPublishers((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(pub)) next.delete(pub); else next.add(pub);
      return next;
    });
  }

  const publishers = useMemo<Array<[string, number]>>(() => {
    const map = new Map<string, number>();
    rows.forEach((r: Vulnerability) => {
      if (r.publisher) map.set(r.publisher, (map.get(r.publisher) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortKey] ?? '';
      const bv = (b as any)[sortKey] ?? '';
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {SEVS.map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setSeverity(s)}
              className="rounded-md px-3 py-1.5 text-sm transition"
              style={
                severity === s
                  ? { background: 'var(--accent-muted)', color: 'var(--accent)' }
                  : { color: 'var(--text-2)', background: 'transparent' }
              }
              onMouseEnter={(e) => {
                if (severity !== s) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (severity !== s) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              {s || t('vuln_filter_all')}
            </button>
          ))}
        </div>
        <input className="input ml-auto w-72" placeholder={t('vuln_search_placeholder')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {publishers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg px-4 py-3" style={{ background: 'var(--bg-subtle)' }}>
          <span className="shrink-0 text-xs" style={{ color: 'var(--text-2)' }}>{t('vuln_publishers_title')} :</span>
          {publishers.map(([pub, count]: [string, number]) => (
            <label
              key={pub}
              className="hover-subtle flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1"
            >
              <input
                type="checkbox"
                checked={selectedPublishers.has(pub)}
                onChange={() => togglePublisher(pub)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-sm" style={{ color: 'var(--text-2)' }}>{pub}</span>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>({count})</span>
            </label>
          ))}
          {selectedPublishers.size > 0 && (
            <button
              className="btn-danger ml-auto text-xs"
              style={{ opacity: user?.isAdmin ? 1 : 0.45 }}
              onClick={() => guardDelete(() => setDeletePublishersTarget([...selectedPublishers]))}
            >
              {t('vuln_delete_selected', selectedPublishers.size)}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty title={t('vuln_empty_title')} hint={t('vuln_empty_hint')} />
      ) : (
        <div className="card overflow-hidden">
          <button
            onClick={() => setOpen((o) => !o)}
            className="hover-subtle flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              {rows.length} {t('nav_vulns').toLowerCase()}
            </span>
            <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-2)' }}>▾</span>
          </button>
          {open && (
            <div className="max-h-[60vh] overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead className="tbl-head sticky top-0 z-10 text-left text-xs uppercase tracking-wide">
                  <tr>
                    <SortTh col="cve"            label={t('vuln_col_cve')}       {...thProps} />
                    <SortTh col="cvss_score"     label={t('vuln_col_severity')}  {...thProps} />
                    <SortTh col="title"          label={t('vuln_col_title')}     {...thProps} />
                    <SortTh col="tracking_id"    label={t('vuln_col_advisory')}  {...thProps} />
                    <SortTh col="affected_count" label={t('vuln_col_products')}  {...thProps} />
                    <SortTh col="match_count"    label={t('vuln_col_matches')}   {...thProps} />
                  </tr>
                </thead>
                <tbody className="divide-theme">
                  {sorted.map((v) => (
                    <tr key={v.id} className="tbl-row" onClick={() => openDetail(v.id)}>
                      <td className="mono px-4 py-3" style={{ color: 'var(--accent)' }}>{v.cve || '—'}</td>
                      <td className="px-4 py-3"><SeverityBadge severity={v.cvss_severity} score={v.cvss_score} /></td>
                      <td className="max-w-md truncate px-4 py-3" style={{ color: 'var(--text-1)' }}>{v.title}</td>
                      <td className="mono px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{v.tracking_id}</td>
                      <td className="mono px-4 py-3" style={{ color: 'var(--text-2)' }}>{v.affected_count}</td>
                      <td className="px-4 py-3">
                        {Number(v.match_count) > 0 ? (
                          <span className="rounded px-2 py-0.5 text-xs" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>{v.match_count}</span>
                        ) : (
                          <span style={{ color: 'var(--text-3)' }}>0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.cve || t('vuln_col_cve')} width="max-w-2xl">
        {detail && (
          <>
            {/* Scrollable content */}
            <div className="space-y-4 overflow-y-auto pr-1 text-sm" style={{ maxHeight: 'calc(100vh - 17rem)' }}>
              <div className="flex items-center gap-3">
                <SeverityBadge severity={detail.cvss_severity} score={detail.cvss_score} />
                {detail.cwe && <span style={{ color: 'var(--text-2)' }}>{detail.cwe}</span>}
              </div>
              <div>
                <div className="label">{t('vuln_detail_title_label')}</div>
                <p style={{ color: 'var(--text-1)' }}>{detail.title}</p>
              </div>
              {detail.description && (
                <CollapsibleSection label={t('vuln_detail_description')}>
                  <p style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>{detail.description}</p>
                </CollapsibleSection>
              )}
              {detail.cvss_vector && (
                <div>
                  <div className="label">{t('vuln_detail_cvss')}</div>
                  <p className="mono text-xs" style={{ color: 'var(--text-2)' }}>{detail.cvss_vector}</p>
                </div>
              )}
              {detail.remediation && (
                <CollapsibleSection label={t('vuln_detail_remediation')} defaultOpen={false}>
                  <p style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>{detail.remediation}</p>
                </CollapsibleSection>
              )}
              <div>
                <div className="label">{t('vuln_detail_advisory')}</div>
                <p style={{ color: 'var(--text-2)' }}>
                  <span className="mono" style={{ color: 'var(--accent)' }}>{detail.tracking_id}</span> — {detail.advisory_title} ({detail.publisher})
                  {detail.released && <span className="ml-2" style={{ color: 'var(--text-3)' }}>{formatDate(detail.released, dateLocale)}</span>}
                </p>
              </div>
              <div>
                <div className="label">{t('vuln_detail_affected', detail.affected?.length || 0)}</div>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {(detail.affected || []).map((a: any) => (
                    <div key={a.id} className="rounded px-3 py-1.5 text-xs" style={{ background: 'var(--bg-subtle)', color: 'var(--text-2)' }}>
                      {a.product_name}
                      {a.version_range && <span className="mono ml-1" style={{ color: 'var(--text-3)' }}>({a.version_range})</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Delete button always visible outside scroll area */}
            <div className="mt-4 flex justify-end pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                className="btn-danger text-sm"
                style={{ opacity: user?.isAdmin ? 1 : 0.45 }}
                onClick={() => guardDelete(() => {
                  setDeleteTarget({ id: detail.id, label: detail.cve || detail.title });
                  setDetail(null);
                })}
              >
                {t('delete')}
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('vuln_delete_title')}
        message={t('vuln_delete_msg', deleteTarget?.label ?? '')}
        onConfirm={deleteVuln}
        onClose={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deletePublishersTarget}
        title={t('vuln_delete_publisher_title')}
        message={t('vuln_delete_publisher_msg', deletePublishersTarget?.join(', ') ?? '')}
        onConfirm={deleteByPublishers}
        onClose={() => setDeletePublishersTarget(null)}
      />
    </div>
  );
}
