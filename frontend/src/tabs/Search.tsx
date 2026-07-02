import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { FeedEntry } from '../lib/types';
import { Spinner, Empty } from '../components/ui';
import { useLang } from '../lib/i18n';
import { useImportProgress } from '../lib/importProgress';

export default function Search() {
  const { t } = useLang();
  const importProgress = useImportProgress();
  const [customUrl, setCustomUrl] = useState('');
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [importMsg, setImportMsg] = useState('');

  async function browse(params: { url?: string }) {
    setLoading(true); setErr(''); setEntries([]); setSelected({}); setImportMsg('');
    const qs = `url=${encodeURIComponent(params.url || '')}`;
    try {
      const r = await api.get<{ total: number; entries: FeedEntry[] }>(`/search/browse?${qs}`);
      setEntries(r.entries);
      setTotal(r.total);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(
    () => entries.filter((e) => e.title.toLowerCase().includes(filter.toLowerCase()) || e.url.toLowerCase().includes(filter.toLowerCase())),
    [entries, filter]
  );

  const selectedUrls = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);

  async function importSelection() {
    if (!selectedUrls.length) return;
    setImportMsg('');

    const name = t('search_name_prefix') + (customUrl || 'CSAF');

    // Step 1: create source record
    const { source_id } = await api.post<{ source_id: number }>('/search/create-source', {
      name, vendor: '', url: selectedUrls[0],
    });

    // Step 2: import each URL one-by-one, updating global progress
    importProgress.startImport(selectedUrls.length, t('search_importing'));
    let count = 0;
    for (const url of selectedUrls) {
      try {
        const r = await api.post<{ count: number }>('/search/import-url', { url, source_id });
        count += r.count ?? 0;
      } catch { /* skip */ }
      importProgress.tick();
    }

    // Step 3: finalize (update source stats + rematchAll)
    await api.post('/search/finalize-source', { source_id, count });
    importProgress.endImport();

    setImportMsg(t('search_imported', count));
    setSelected({});
  }

  const isImporting = importProgress.active;

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex gap-2">
          <input
            className="input mono text-xs"
            placeholder={t('search_url_placeholder')}
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
          />
          <button className="btn-ghost shrink-0" disabled={!customUrl.trim()} onClick={() => browse({ url: customUrl })}>
            {t('search_explore_btn')}
          </button>
        </div>
      </div>

      {loading && <Spinner label={t('search_feed_loading')} />}
      {err && (
        <div
          className="card p-4 text-sm"
          style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'var(--danger-muted)' }}
        >
          ✗ {err}
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm" style={{ color: 'var(--text-2)' }}>
              {t('search_available', total, entries.length, total <= entries.length)}
            </div>
            <div className="flex items-center gap-2">
              <input className="input w-64" placeholder={t('search_filter_placeholder')} value={filter} onChange={(e) => setFilter(e.target.value)} />
              <button
                className="btn-primary shrink-0"
                disabled={!selectedUrls.length || isImporting}
                onClick={importSelection}
              >
                {t('search_import_btn', selectedUrls.length)}
              </button>
            </div>
          </div>
          {!isImporting && importMsg && (
            <p className="mb-3 text-sm" style={{ color: 'var(--text-2)' }}>{importMsg}</p>
          )}

          <div className="max-h-[55vh] overflow-y-auto rounded-md" style={{ border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead className="tbl-head sticky top-0 text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((e) => selected[e.url])}
                      onChange={(ev) => {
                        const next = { ...selected };
                        filtered.forEach((e) => (next[e.url] = ev.target.checked));
                        setSelected(next);
                      }}
                    />
                  </th>
                  <th className="px-3 py-2">{t('search_col_title')}</th>
                  <th className="px-3 py-2">{t('search_col_file')}</th>
                </tr>
              </thead>
              <tbody className="divide-theme">
                {filtered.map((e) => (
                  <tr key={e.url} className="hover-subtle">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={!!selected[e.url]}
                        onChange={(ev) => setSelected((p) => ({ ...p, [e.url]: ev.target.checked }))}
                      />
                    </td>
                    <td className="px-3 py-2" style={{ color: 'var(--text-1)' }}>{e.title}</td>
                    <td className="mono px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>{e.url.split('/').slice(-1)[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && entries.length === 0 && !err && (
        <Empty title={t('search_empty_title')} hint={t('search_empty_hint')} />
      )}
    </div>
  );
}
