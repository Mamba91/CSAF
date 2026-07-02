import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useImportProgress } from '../lib/importProgress';
import type { Source } from '../lib/types';
import { Modal, Empty, Spinner, Pill, formatDate, ConfirmDialog, ImportProgress } from '../components/ui';
import { useLang } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

export default function Sources() {
  const { t, dateLocale } = useLang();
  const { user } = useAuth();
  const { showToast } = useToast();
  const importProgress = useImportProgress();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<null | 'url' | 'paste'>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Source | null>(null);
  const [open, setOpen] = useState(true);

  function guardDelete(onConfirm: () => void): void {
    if (!user?.isAdmin) { showToast(t('no_delete_rights'), 'error'); return; }
    onConfirm();
  }

  async function load() {
    setLoading(true);
    setSources(await api.get<Source[]>('/sources'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function sync(id: number) {
    setSyncing(id);
    importProgress.startImport(0, t('add_url_loading'));
    try {
      await api.post(`/sources/${id}/sync`);
      await load();
    } catch (e: any) {
      alert(t('sources_sync_err') + e.message);
    } finally {
      setSyncing(null);
      importProgress.endImport();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{t('sources_count', sources.length)}</p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setMode('paste')}>{t('sources_paste_btn')}</button>
          <button className="btn-primary" onClick={() => setMode('url')}>{t('sources_add_btn')}</button>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : sources.length === 0 ? (
        <Empty title={t('sources_empty_title')} hint={t('sources_empty_hint')} />
      ) : (
        <div className="card overflow-hidden">
          <button
            onClick={() => setOpen((o) => !o)}
            className="hover-subtle flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
              {t('sources_count', sources.length)}
            </span>
            <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} style={{ color: 'var(--text-2)' }}>▾</span>
          </button>
          {open && (
            <div className="max-h-[60vh] overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
              <table className="w-full text-sm">
                <thead className="tbl-head sticky top-0 z-10 text-left text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">{t('sources_col_name')}</th>
                    <th className="px-4 py-3">{t('sources_col_type')}</th>
                    <th className="px-4 py-3">{t('sources_col_advisories')}</th>
                    <th className="px-4 py-3">{t('sources_col_status')}</th>
                    <th className="px-4 py-3">{t('sources_col_sync')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-theme">
                  {sources.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: 'var(--text-1)' }}>{s.name}</div>
                        {s.url && <div className="mono truncate text-xs" style={{ maxWidth: 360, color: 'var(--text-3)' }}>{s.url}</div>}
                      </td>
                      <td className="px-4 py-3"><Pill tone={s.source_type === 'file' ? 'slate' : 'sky'}>{s.source_type}</Pill></td>
                      <td className="mono px-4 py-3" style={{ color: 'var(--text-2)' }}>{s.advisory_count}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-2)' }}>{s.last_status || '—'}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-3)' }}>{formatDate(s.last_synced, dateLocale)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          {s.url && (
                            <button
                              className="text-sm disabled:opacity-50 transition"
                              style={{ color: 'var(--accent)' }}
                              disabled={syncing === s.id}
                              onClick={() => sync(s.id)}
                            >
                              {syncing === s.id ? '…' : t('sources_resync')}
                            </button>
                          )}
                          <button
                            className="text-sm transition"
                            style={{ color: 'var(--danger)', opacity: user?.isAdmin ? 1 : 0.45 }}
                            onClick={() => guardDelete(() => setToDelete(s))}
                          >
                            {t('sources_del')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <AddUrlModal open={mode === 'url'} onClose={() => setMode(null)} onDone={() => { setMode(null); load(); }} />
      <PasteModal open={mode === 'paste'} onClose={() => setMode(null)} onDone={() => { setMode(null); load(); }} />
      <ConfirmDialog
        open={!!toDelete}
        title={t('sources_delete_title')}
        message={t('sources_delete_msg', toDelete?.name)}
        onConfirm={async () => { if (toDelete) { await api.del(`/sources/${toDelete.id}`); load(); } }}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function AddUrlModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const importProgress = useImportProgress();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit() {
    if (!url.trim()) return;
    setBusy(true); setMsg(t('add_url_loading'));
    importProgress.startImport(0, t('add_url_loading'));
    try {
      const r = await api.post<{ message: string; count: number }>('/sources/fetch', { name, url });
      setMsg(`✓ ${r.message}`);
      importProgress.endImport();
      setTimeout(onDone, 800);
    } catch (e: any) {
      setMsg('✗ ' + e.message);
      importProgress.endImport();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('add_url_title')}>
      <div className="space-y-3">
        <div>
          <label className="label">{t('add_url_name_label')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Feed CISA OT" />
        </div>
        <div>
          <label className="label">{t('add_url_url_label')}</label>
          <input className="input mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://.../cisa-csaf-ot-feed-tlp-white.json" />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{t('add_url_hint')}</p>
        {busy && <ImportProgress label={t('add_url_loading')} />}
        {!busy && msg && <p className="text-sm" style={{ color: 'var(--text-2)' }}>{msg}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>{t('close')}</button>
          <button className="btn-primary" disabled={busy || !url.trim()} onClick={submit}>{t('import')}</button>
        </div>
      </div>
    </Modal>
  );
}

function PasteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit() {
    setBusy(true); setMsg('');
    let csaf: unknown;
    try {
      csaf = JSON.parse(raw);
    } catch {
      setMsg(t('paste_invalid_json')); setBusy(false); return;
    }
    try {
      const r = await api.post<{ message: string }>('/sources/upload', { name, csaf });
      setMsg(`✓ ${r.message}`);
      setTimeout(onDone, 800);
    } catch (e: any) {
      setMsg('✗ ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('paste_title')} width="max-w-2xl">
      <div className="space-y-3">
        <div>
          <label className="label">{t('paste_name_label')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="SSA-882673 (import manuel)" />
        </div>
        <div>
          <label className="label">{t('paste_content_label')}</label>
          <textarea
            className="input mono h-64 resize-none text-xs"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='{ "document": { "tracking": { "id": "SSA-..." }, ... }, "vulnerabilities": [ ... ] }'
          />
        </div>
        {busy && <ImportProgress />}
        {!busy && msg && <p className="text-sm" style={{ color: 'var(--text-2)' }}>{msg}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>{t('close')}</button>
          <button className="btn-primary" disabled={busy || !raw.trim()} onClick={submit}>{t('import')}</button>
        </div>
      </div>
    </Modal>
  );
}
