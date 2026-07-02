import { useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Modal } from './ui';
import { useLang } from '../lib/i18n';
import {
  parseInventory,
  autoMap,
  toDevices,
  TARGET_FIELDS,
  EncryptedPronetaError,
  type ParsedTable,
  type TargetKey,
} from '../lib/importParse';

const FIELD_T_KEY: Record<string, string> = {
  name: 'device_name_label',
  vendor: 'device_vendor_label',
  product_family: 'device_family_label',
  article_number: 'device_article_label',
  firmware_version: 'device_firmware_label',
  cpe: 'device_cpe_label',
  notes: 'device_notes_label',
};

export default function ImportDevicesModal({
  open,
  projectId,
  onClose,
  onDone,
}: {
  open: boolean;
  projectId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, lang } = useLang();
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Record<TargetKey, string>>({} as any);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTable(null); setMapping({} as any); setError(''); setResult('');
  }

  function ingestText(filename: string, text: string) {
    setError(''); setResult('');
    try {
      const parsed = parseInventory(filename, text);
      setTable(parsed);
      setMapping(autoMap(parsed.columns));
    } catch (e: any) {
      setTable(null);
      setError(e instanceof EncryptedPronetaError ? e.message : t('import_read_error') + e.message);
    }
  }

  async function onFile(file: File) {
    const text = await file.text();
    ingestText(file.name, text);
  }

  const devices = useMemo(
    () => (table ? toDevices(table, mapping) : []),
    [table, mapping]
  );

  async function doImport() {
    if (!devices.length) return;
    setBusy(true); setResult('');
    try {
      const r = await api.post<{ imported: number; skipped: number }>(
        `/projects/${projectId}/devices/bulk`,
        { devices }
      );
      setResult(t('import_done', r.imported, r.skipped));
      setTimeout(() => { reset(); onDone(); }, 900);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title={t('import_modal_title')} width="max-w-3xl">
      {!table ? (
        <div className="space-y-4">
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg py-10 text-center transition"
            style={{ border: '1.5px dashed var(--border)' }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          >
            <div style={{ color: 'var(--text-2)' }}>{t('import_drop_label')}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--text-3)' }}>{t('import_drop_hint')}</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xml,.txt,.tsv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </div>

          <details className="text-xs" style={{ color: 'var(--text-2)' }}>
            <summary className="cursor-pointer">{t('import_proneta_faq')}</summary>
            {lang === 'fr' ? (
              <p className="mt-2 leading-relaxed">
                Le fichier de projet PRONETA (souvent en <span className="mono">.xml</span>) est <b>chiffré</b> et
                n'est pas lisible tel quel. Ouvrez votre projet dans PRONETA, allez dans l'<b>analyse réseau</b>
                (vue tableau des appareils), puis utilisez la fonction d'<b>export</b> pour générer un CSV.
                Importez ce CSV ici : les colonnes seront détectées automatiquement.
              </p>
            ) : (
              <p className="mt-2 leading-relaxed">
                The PRONETA project file (often <span className="mono">.xml</span>) is <b>encrypted</b> and
                cannot be read as-is. Open your project in PRONETA, go to <b>network analysis</b>
                (device table view), then use the <b>export</b> function to generate a CSV.
                Import that CSV here — columns will be detected automatically.
              </p>
            )}
          </details>

          {error && (
            <div className="rounded-md p-3 text-sm" style={{ border: '1px solid rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.08)', color: '#b45309' }}>
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: 'var(--text-2)' }}>
              {t('import_rows_detected', table.rows.length, table.columns.length)}
            </span>
            <button
              className="transition hover:underline"
              style={{ color: 'var(--accent)' }}
              onClick={reset}
            >
              {t('import_change_file')}
            </button>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>{t('import_col_mapping')}</div>
            <div className="grid grid-cols-2 gap-3">
              {TARGET_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="label">{t(FIELD_T_KEY[f.key] || f.key)}{'required' in f && f.required ? ' *' : ''}</label>
                  <select
                    className="input"
                    value={mapping[f.key] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                  >
                    <option value="">{t('import_col_ignore')}</option>
                    {table.columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs uppercase tracking-wide" style={{ color: 'var(--text-2)' }}>
              {t('import_preview', devices.length)}
            </div>
            <div className="max-h-56 overflow-auto rounded-md" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-xs">
                <thead className="tbl-head sticky top-0 text-left">
                  <tr>
                    <th className="px-3 py-2">{t('import_preview_col_name')}</th>
                    <th className="px-3 py-2">{t('import_preview_col_vendor')}</th>
                    <th className="px-3 py-2">{t('import_preview_col_family')}</th>
                    <th className="px-3 py-2">{t('import_preview_col_article')}</th>
                    <th className="px-3 py-2">{t('import_preview_col_firmware')}</th>
                  </tr>
                </thead>
                <tbody className="divide-theme">
                  {devices.slice(0, 50).map((d, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5" style={{ color: 'var(--text-1)' }}>{d.name}</td>
                      <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{d.vendor || '—'}</td>
                      <td className="px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{d.product_family || '—'}</td>
                      <td className="mono px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{d.article_number || '—'}</td>
                      <td className="mono px-3 py-1.5" style={{ color: 'var(--text-2)' }}>{d.firmware_version || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!mapping.name && (
            <p className="text-sm" style={{ color: 'var(--warn)' }}>{t('import_need_name')}</p>
          )}
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          {result && <p className="text-sm" style={{ color: 'var(--success)' }}>{result}</p>}

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { reset(); onClose(); }}>{t('cancel')}</button>
            <button className="btn-primary" disabled={busy || !mapping.name || !devices.length} onClick={doImport}>
              {t('import_confirm_btn', devices.length)}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
