import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Advisory } from '../lib/types';
import { Spinner, Empty, Modal, ConfirmDialog, SeverityBadge, formatDate } from '../components/ui';
import { useLang } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

const SEVS = ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

interface AdvisoryRow extends Advisory {
  id: number;
  source_name: string | null;
  critical_count: number;
  high_count: number;
}

interface AdvisoryDetail extends AdvisoryRow {
  category: string;
  tlp: string;
  csaf_version: string;
  revision: string;
  vulnerabilities: {
    id: number; cve: string; title: string;
    cvss_score: number | null; cvss_severity: string; cwe: string;
    affected_count: number;
  }[];
}

export default function Advisories() {
  const { t, dateLocale } = useLang();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<AdvisoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState('');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<AdvisoryDetail | null>(null);
  const [toDelete, setToDelete] = useState<AdvisoryRow | null>(null);
  const [selectedPublishers, setSelectedPublishers] = useState<Set<string>>(new Set());
  const [deletePublishersTarget, setDeletePublishersTarget] = useState<string[] | null>(null);
  const [open, setOpen] = useState(true);

  function guardDelete(onConfirm: () => void): void {
    if (!user?.isAdmin) { showToast(t('no_delete_rights'), 'error'); return; }
    onConfirm();
  }

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (severity) params.set('severity', severity);
    setRows(await api.get<AdvisoryRow[]>(`/advisories?${params}`));
    setLoading(false);
  }
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [q, severity]);

  async function openDetail(id: number) {
    setDetail(await api.get<AdvisoryDetail>(`/advisories/${id}`));
  }

  async function confirmDelete() {
    if (!toDelete) return;
    await api.del(`/advisories/${toDelete.id}`);
    setToDelete(null);
    load();
  }

  function togglePublisher(pub: string) {
    setSelectedPublishers((prev) => {
      const next = new Set(prev);
      if (next.has(pub)) next.delete(pub); else next.add(pub);
      return next;
    });
  }

  async function deleteByPublishers() {
    if (!deletePublishersTarget) return;
    for (const pub of deletePublishersTarget) {
      await api.del(`/advisories/publisher/${encodeURIComponent(pub)}`);
    }
    setSelectedPublishers(new Set());
    setDeletePublishersTarget(null);
    load();
  }

  const publishers = useMemo<Array<[string, number]>>(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      if (r.publisher) map.set(r.publisher, (map.get(r.publisher) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  return (
    <div className="space-y-4">
      {/* Severity filter + search */}
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
        <input
          className="input ml-auto w-72"
          placeholder={t('advisories_search_placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Publishers filter */}
      {publishers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg px-4 py-3" style={{ background: 'var(--bg-subtle)' }}>
          <span className="shrink-0 text-xs" style={{ color: 'var(--text-2)' }}>{t('vuln_publishers_title')} :</span>
          {publishers.map(([pub, count]) => (
            <label key={pub} className="hover-subtle flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1">
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
              {t('advisories_delete_selected', selectedPublishers.size)}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty title={t('advisories_empty_title')} hint={t('advisories_empty_hint')} />
      ) : (
        <div className="card overflow-hidden">
          <button
            onClick={() => setOpen((o) => !o)}
            className="hover-subtle flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              {t('advisories_count', rows.length)}
            </span>
            <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-2)' }}>▾</span>
          </button>
          {open && (
            <div className="max-h-[60vh] overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead className="tbl-head sticky top-0 z-10 text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">{t('advisories_col_tracking')}</th>
                    <th className="px-4 py-3">{t('advisories_col_title')}</th>
                    <th className="px-4 py-3">{t('advisories_col_publisher')}</th>
                    <th className="px-4 py-3">{t('advisories_col_source')}</th>
                    <th className="px-4 py-3">{t('advisories_col_released')}</th>
                    <th className="px-4 py-3">{t('advisories_col_vulns')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-theme">
                  {rows.map((a) => (
                    <tr key={a.id} className="tbl-row" onClick={() => openDetail(a.id)}>
                      <td className="mono px-4 py-3" style={{ color: 'var(--accent)' }}>{a.tracking_id}</td>
                      <td className="max-w-md truncate px-4 py-3" style={{ color: 'var(--text-1)' }}>{a.title}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{a.publisher || '—'}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{a.source_name || '—'}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{formatDate(a.released, dateLocale)}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          {Number(a.critical_count) > 0 && (
                            <span className="rounded px-2 py-0.5 text-xs" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>{a.critical_count} crit.</span>
                          )}
                          {Number(a.high_count) > 0 && (
                            <span className="rounded px-2 py-0.5 text-xs" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>{a.high_count} high</span>
                          )}
                          <span className="mono" style={{ color: 'var(--text-2)' }}>{a.vuln_count ?? 0}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="text-sm transition"
                          style={{ color: 'var(--danger)', opacity: user?.isAdmin ? 1 : 0.4 }}
                          onClick={() => guardDelete(() => setToDelete(a))}
                        >
                          {t('advisories_del')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.tracking_id || t('advisories_detail_title')} width="max-w-2xl">
        {detail && (
          <div className="space-y-4 text-sm">
            <div>
              <div className="label">{t('advisories_col_title')}</div>
              <p style={{ color: 'var(--text-1)' }}>{detail.title}</p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-3)' }}>
              <span>{t('advisories_col_publisher')}: {detail.publisher || '—'}</span>
              {detail.source_name && <span>{t('advisories_col_source')}: {detail.source_name}</span>}
              {detail.released && <span>{t('advisories_col_released')}: {formatDate(detail.released, dateLocale)}</span>}
              {detail.tlp && <span>TLP: {detail.tlp}</span>}
              {detail.csaf_version && <span>CSAF v{detail.csaf_version}</span>}
            </div>
            <div>
              <div className="label">{t('advisories_detail_vulns', detail.vulnerabilities.length)}</div>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {detail.vulnerabilities.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded px-3 py-2" style={{ background: 'var(--bg-subtle)' }}>
                    <SeverityBadge severity={v.cvss_severity} score={v.cvss_score} />
                    <span className="mono text-xs" style={{ color: 'var(--accent)' }}>{v.cve || '—'}</span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text-2)' }}>{v.title}</span>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>{v.affected_count} prod.</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                className="btn-danger text-sm"
                style={{ opacity: user?.isAdmin ? 1 : 0.45 }}
                onClick={() => guardDelete(() => {
                  setToDelete(detail);
                  setDetail(null);
                })}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={t('advisories_delete_title')}
        message={t('advisories_delete_msg', toDelete?.tracking_id ?? '')}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />

      <ConfirmDialog
        open={!!deletePublishersTarget}
        title={t('advisories_delete_publisher_title')}
        message={t('advisories_delete_publisher_msg', deletePublishersTarget?.join(', ') ?? '')}
        onConfirm={deleteByPublishers}
        onClose={() => setDeletePublishersTarget(null)}
      />
    </div>
  );
}
