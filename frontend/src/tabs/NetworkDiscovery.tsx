import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { DiscoveredDevice, NetworkScan, Project } from '../lib/types';
import { Empty, Spinner, Pill, ConfirmDialog, ImportProgress, formatDate } from '../components/ui';
import { useLang } from '../lib/i18n';
import { useToast } from '../lib/toast';
import { parseSysDescr } from '../lib/snmpParse';

interface ScanJobState {
  status: 'running' | 'done' | 'error' | 'cancelled';
  scanned: number;
  total: number;
  found: number;
  error?: string;
}

function LaunchScanPanel({ onScanDone }: { onScanDone: () => void }) {
  const { t } = useLang();
  const { showToast } = useToast();
  const [agentUrl, setAgentUrl] = useState(() => localStorage.getItem('netdiscovery_agent_url') || 'http://localhost:5175');
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem('netdiscovery_api_url') || `${window.location.origin}/api`);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [range, setRange] = useState('192.168.1.0/24');
  const [community, setCommunity] = useState('public');
  const [label, setLabel] = useState('');
  const [launching, setLaunching] = useState(false);
  const [stoppingAgent, setStoppingAgent] = useState(false);
  const [job, setJob] = useState<ScanJobState | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  function base() { return agentUrl.replace(/\/+$/, ''); }

  useEffect(() => { localStorage.setItem('netdiscovery_agent_url', agentUrl); }, [agentUrl]);
  useEffect(() => { localStorage.setItem('netdiscovery_api_url', apiUrl); }, [apiUrl]);

  async function checkAgent() {
    setAgentOnline(null);
    try {
      const res = await fetch(`${base()}/status`);
      setAgentOnline(res.ok);
    } catch {
      setAgentOnline(false);
    }
  }
  useEffect(() => { checkAgent(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [agentUrl]);
  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  function stopPolling() {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function launchScan() {
    if (!range.trim()) return;
    setLaunching(true);
    setJob({ status: 'running', scanned: 0, total: 0, found: 0 });
    setJobId(null);
    try {
      const token = localStorage.getItem('auth_token') || '';
      const res = await fetch(`${base()}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: range.trim(), community: community.trim() || 'public', label: label.trim(), apiUrl, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const id = data.jobId as string;
      setJobId(id);

      pollRef.current = window.setInterval(async () => {
        try {
          const jr = await fetch(`${base()}/scan/${id}`);
          const jd: ScanJobState = await jr.json();
          setJob(jd);
          if (jd.status !== 'running') {
            stopPolling();
            setLaunching(false);
            if (jd.status === 'done') {
              showToast(t('netdiscovery_scan_done', jd.found), 'success');
              onScanDone();
            } else if (jd.status === 'error') {
              showToast(t('netdiscovery_scan_error') + (jd.error || ''), 'error');
            } else if (jd.status === 'cancelled') {
              showToast(t('netdiscovery_scan_cancelled'), 'info');
              if (jd.found) onScanDone();
            }
          }
        } catch {
          // erreur de polling transitoire, on retentera au prochain intervalle
        }
      }, 1200);
    } catch (e: any) {
      showToast(e.message, 'error');
      setLaunching(false);
      setJob(null);
    }
  }

  async function stopScan() {
    if (!jobId) return;
    try {
      await fetch(`${base()}/scan/${jobId}/cancel`, { method: 'POST' });
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  }

  async function stopAgent() {
    stopPolling();
    setStoppingAgent(true);
    try {
      await fetch(`${base()}/shutdown`, { method: 'POST' });
    } catch {
      // l'agent coupe la connexion en s'arrêtant, une erreur réseau ici est attendue
    } finally {
      setLaunching(false);
      setJob(null);
      setJobId(null);
      setAgentOnline(false);
      setStoppingAgent(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{t('netdiscovery_launch_title')}</span>
        <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-3)' }}>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: agentOnline == null ? 'var(--text-3)' : agentOnline ? 'var(--success)' : 'var(--danger)' }}
          />
          {agentOnline == null ? t('netdiscovery_agent_checking') : agentOnline ? t('netdiscovery_agent_online') : t('netdiscovery_agent_offline')}
          <button className="underline" onClick={checkAgent}>{t('netdiscovery_agent_retry')}</button>
          {agentOnline && (
            <button className="underline" style={{ color: 'var(--danger)' }} disabled={stoppingAgent} onClick={stopAgent}>
              {t('netdiscovery_agent_stop')}
            </button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <label className="label">{t('netdiscovery_agent_url_label')}</label>
          <input className="input mono text-xs" value={agentUrl} onChange={(e) => setAgentUrl(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('netdiscovery_api_url_label')}</label>
          <input className="input mono text-xs" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('netdiscovery_range_label')}</label>
          <input className="input mono" value={range} onChange={(e) => setRange(e.target.value)} placeholder="192.168.1.0/24" />
        </div>
        <div>
          <label className="label">{t('netdiscovery_community_label')}</label>
          <input className="input mono" value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="public" />
        </div>
        <div className="col-span-2 md:col-span-4">
          <label className="label">{t('netdiscovery_scan_label_label')}</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Site A - Atelier 3" />
        </div>
      </div>

      {job ? (
        <ImportProgress
          label={
            job.status === 'error' ? t('netdiscovery_scan_error') + (job.error || '')
              : job.status === 'cancelled' ? t('netdiscovery_scan_cancelled')
              : t('netdiscovery_scanning', job.found)
          }
          done={job.total > 0 ? job.scanned : undefined}
          total={job.total > 0 ? job.total : undefined}
        />
      ) : agentOnline === false ? (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{t('netdiscovery_agent_offline_hint')}</p>
      ) : null}

      <div className="flex justify-end gap-2">
        {launching && job?.status === 'running' && (
          <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={stopScan}>
            {t('netdiscovery_stop_scan_btn')}
          </button>
        )}
        <button className="btn-primary" disabled={launching || !agentOnline || !range.trim()} onClick={launchScan}>
          {t('netdiscovery_launch_btn')}
        </button>
      </div>
    </div>
  );
}

interface EditState {
  name: string;
  vendor: string;
  product_family: string;
  firmware_version: string;
  article_number: string;
}

function defaultEdit(d: DiscoveredDevice): EditState {
  const parsed = parseSysDescr(d.sys_descr);
  return {
    name: d.hostname || parsed.model || d.ip_address,
    vendor: d.vendor_guess || '',
    product_family: parsed.productFamily,
    firmware_version: parsed.firmwareVersion,
    article_number: parsed.articleNumber,
  };
}

export default function NetworkDiscovery() {
  const { t, dateLocale } = useLang();
  const { showToast } = useToast();
  const [scans, setScans] = useState<NetworkScan[]>([]);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [targetProject, setTargetProject] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [scanToDelete, setScanToDelete] = useState<NetworkScan | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [s, d, p] = await Promise.all([
        api.get<NetworkScan[]>('/network-discovery/scans'),
        api.get<DiscoveredDevice[]>('/network-discovery/devices'),
        api.get<Project[]>('/projects'),
      ]);
      setScans(s);
      setDevices(d);
      setProjects(p);
      setEdits((prev) => {
        const next = { ...prev };
        for (const dd of d) if (!next[dd.id]) next[dd.id] = defaultEdit(dd);
        return next;
      });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const visible = useMemo(
    () => devices.filter((d) => showAll || d.status === 'new'),
    [devices, showAll]
  );
  const selectableIds = useMemo(
    () => visible.filter((d) => d.status === 'new').map((d) => d.id),
    [visible]
  );
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setEdit(id: number, key: keyof EditState, value: string) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] as EditState), [key]: value } }));
  }

  async function importSelected() {
    if (!targetProject) { showToast(t('netdiscovery_select_project_first'), 'error'); return; }
    if (!selected.size) return;
    setBusy(true);
    try {
      const overrides: Record<number, EditState> = {};
      for (const id of selected) {
        const dd = devices.find((d) => d.id === id);
        overrides[id] = edits[id] || (dd ? defaultEdit(dd) : { name: '', vendor: '', product_family: '', firmware_version: '', article_number: '' });
      }
      const r = await api.post<{ imported: number; skipped: number }>('/network-discovery/devices/import', {
        project_id: targetProject,
        device_ids: [...selected],
        overrides,
      });
      showToast(t('netdiscovery_import_done', r.imported, r.skipped), 'success');
      setSelected(new Set());
      await load();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function ignoreDevice(id: number) {
    await api.del(`/network-discovery/devices/${id}`);
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    await load();
  }

  async function deleteScan(scan: NetworkScan) {
    await api.del(`/network-discovery/scans/${scan.id}`);
    await load();
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <details className="card p-4 text-sm" style={{ color: 'var(--text-2)' }}>
        <summary className="cursor-pointer font-medium" style={{ color: 'var(--text-1)' }}>
          {t('netdiscovery_intro_title')}
        </summary>
        <p className="mt-2 leading-relaxed">{t('netdiscovery_intro_body')}</p>
        <pre className="mono mt-2 overflow-x-auto rounded-md p-3 text-xs" style={{ background: 'var(--bg-subtle)' }}>
          {t('netdiscovery_intro_cmd')}
        </pre>
        <p className="mt-2 leading-relaxed">{t('netdiscovery_intro_cli_note')}</p>
      </details>

      <LaunchScanPanel onScanDone={load} />

      <div className="card overflow-hidden">
        <div className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }}>
          {t('netdiscovery_scans_title')}
        </div>
        {scans.length === 0 ? (
          <div className="p-4"><Empty title={t('netdiscovery_scans_empty')} /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="tbl-head text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">{t('netdiscovery_scans_col_label')}</th>
                <th className="px-4 py-3">{t('netdiscovery_scans_col_range')}</th>
                <th className="px-4 py-3">{t('netdiscovery_scans_col_count')}</th>
                <th className="px-4 py-3">{t('netdiscovery_scans_col_by')}</th>
                <th className="px-4 py-3">{t('netdiscovery_scans_col_date')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-theme">
              {scans.map((s) => (
                <tr key={s.id} className="tbl-row">
                  <td className="px-4 py-3" style={{ color: 'var(--text-1)' }}>{s.label || `#${s.id}`}</td>
                  <td className="mono px-4 py-3" style={{ color: 'var(--text-2)' }}>{s.ip_range}</td>
                  <td className="mono px-4 py-3" style={{ color: 'var(--text-2)' }}>{s.device_count}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-3)' }}>{s.created_by_username || '—'}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-3)' }}>{formatDate(s.created_at, dateLocale)}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-sm transition" style={{ color: 'var(--danger)' }} onClick={() => setScanToDelete(s)}>
                      {t('delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{t('netdiscovery_devices_title')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-2)' }}>
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              {t('netdiscovery_show_all')}
            </label>
            <select
              className="input !w-auto"
              value={targetProject}
              onChange={(e) => setTargetProject(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">{t('netdiscovery_project_placeholder')}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="btn-primary" disabled={busy || !selected.size} onClick={importSelected}>
              {t('netdiscovery_import_btn', selected.size)}
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="p-4"><Empty title={t('netdiscovery_devices_empty')} /></div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="tbl-head sticky top-0 z-10 text-left text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th className="px-3 py-3">{t('netdiscovery_col_ip')}</th>
                  <th className="px-3 py-3">{t('netdiscovery_col_mac')}</th>
                  <th className="px-3 py-3">{t('device_name_label')}</th>
                  <th className="px-3 py-3">{t('device_vendor_label')}</th>
                  <th className="px-3 py-3">{t('device_family_label')}</th>
                  <th className="px-3 py-3">{t('device_firmware_label')}</th>
                  <th className="px-3 py-3">{t('device_article_label')}</th>
                  <th className="px-3 py-3">{t('netdiscovery_col_descr')}</th>
                  <th className="px-3 py-3">{t('netdiscovery_col_status')}</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-theme">
                {visible.map((d) => {
                  const e = edits[d.id] || defaultEdit(d);
                  const editable = d.status === 'new';
                  return (
                    <tr key={d.id}>
                      <td className="px-3 py-2">
                        {editable && <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />}
                      </td>
                      <td className="mono px-3 py-2" style={{ color: 'var(--text-2)' }}>{d.ip_address}</td>
                      <td className="mono px-3 py-2" style={{ color: 'var(--text-2)' }}>{d.mac_address || '—'}</td>
                      <td className="px-3 py-2">
                        <input
                          className="input !py-1 text-xs"
                          disabled={!editable}
                          value={e.name}
                          onChange={(ev) => setEdit(d.id, 'name', ev.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input !py-1 text-xs"
                          disabled={!editable}
                          value={e.vendor}
                          onChange={(ev) => setEdit(d.id, 'vendor', ev.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input !py-1 text-xs"
                          disabled={!editable}
                          value={e.product_family}
                          onChange={(ev) => setEdit(d.id, 'product_family', ev.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input mono !py-1 text-xs"
                          disabled={!editable}
                          value={e.firmware_version}
                          onChange={(ev) => setEdit(d.id, 'firmware_version', ev.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="input mono !py-1 text-xs"
                          disabled={!editable}
                          value={e.article_number}
                          onChange={(ev) => setEdit(d.id, 'article_number', ev.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)', maxWidth: 220 }} title={d.sys_descr}>
                        <div className="truncate">{d.sys_descr || '—'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <Pill tone={d.status === 'imported' ? 'green' : d.status === 'ignored' ? 'slate' : 'accent'}>
                          {t('netdiscovery_status_' + d.status)}
                        </Pill>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editable && (
                          <button className="text-sm transition" style={{ color: 'var(--text-2)' }} onClick={() => ignoreDevice(d.id)}>
                            {t('netdiscovery_ignore_btn')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!scanToDelete}
        title={t('netdiscovery_scan_delete_title')}
        message={t('netdiscovery_scan_delete_msg', scanToDelete?.label || `#${scanToDelete?.id}`)}
        onConfirm={() => { if (scanToDelete) deleteScan(scanToDelete); }}
        onClose={() => setScanToDelete(null)}
      />
    </div>
  );
}
