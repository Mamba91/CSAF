import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Project, ProjectDetail, Match, Device, ProjectMember } from '../lib/types';
import {
  Modal, Empty, Spinner, SeverityBadge, formatDate,
  ConfirmDialog, VULN_STATUS, TREATED_STATUSES, ProjectStatusBadge,
} from '../components/ui';
import ImportDevicesModal from '../components/ImportDevicesModal';
import { useLang } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

/* ================================================================== *
 *  Liste des projets
 * ================================================================== */

export default function Projects({ focusId }: { focusId?: number | null }) {
  const { t, dateLocale } = useLang();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [toDelete, setToDelete] = useState<Project | null>(null);

  function guardDelete(onConfirm: () => void): void {
    if (!user?.isAdmin) { showToast(t('no_delete_rights'), 'error'); return; }
    onConfirm();
  }

  async function load() {
    setLoading(true);
    setProjects(await api.get<Project[]>('/projects'));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (focusId) setSelected(focusId); }, [focusId]);

  if (selected != null)
    return <ProjectView id={selected} onBack={() => { setSelected(null); load(); }} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>{t('projects_count', projects.length)}</p>
        <button className="btn-primary" onClick={() => setShowNew(true)}>{t('projects_new')}</button>
      </div>

      {loading ? (
        <Spinner />
      ) : projects.length === 0 ? (
        <Empty title={t('projects_empty_title')} hint={t('projects_empty_hint')} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="tbl-head text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">{t('projects_col_id')}</th>
                <th className="px-4 py-3">{t('projects_col_name')}</th>
                <th className="px-4 py-3">{t('projects_col_status')}</th>
                <th className="px-4 py-3">{t('projects_col_devices')}</th>
                <th className="px-4 py-3">{t('projects_col_vulns')}</th>
                <th className="px-4 py-3">{t('projects_col_created')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-theme">
              {projects.map((p) => (
                <tr key={p.id} className="tbl-row" onClick={() => setSelected(p.id)}>
                  <td className="mono px-4 py-3" style={{ color: 'var(--text-3)' }}>{p.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: 'var(--text-1)' }}>{p.name}</div>
                    {p.description && <div className="text-xs" style={{ color: 'var(--text-3)' }}>{p.description}</div>}
                  </td>
                  <td className="px-4 py-3"><ProjectStatusBadge status={p.project_status} /></td>
                  <td className="mono px-4 py-3" style={{ color: 'var(--text-2)' }}>{p.device_count}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      {Number(p.critical_count) > 0 && (
                        <span className="rounded px-2 py-0.5 text-xs" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>{p.critical_count} crit.</span>
                      )}
                      {Number(p.high_count) > 0 && (
                        <span className="rounded px-2 py-0.5 text-xs" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}>{p.high_count} high</span>
                      )}
                      <span className="mono" style={{ color: 'var(--text-2)' }}>
                        {p.treated_count}/{p.vuln_count} {t('projects_treated')}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-3)' }}>{formatDate(p.created_at, dateLocale)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-sm transition"
                      style={{ color: 'var(--danger)', opacity: user?.isAdmin ? 1 : 0.4 }}
                      onClick={(e) => { e.stopPropagation(); guardDelete(() => setToDelete(p)); }}
                    >
                      {t('delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewProjectModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
      <ConfirmDialog
        open={!!toDelete}
        title={t('project_delete_title')}
        message={t('project_delete_msg', toDelete?.name)}
        onConfirm={async () => { if (toDelete) { await api.del(`/projects/${toDelete.id}`); load(); } }}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

/* ================================================================== */

function NewProjectModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.post('/projects', { name, description, owner });
      setName(''); setDescription(''); setOwner('');
      onCreated();
    } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('new_project_title')}>
      <div className="space-y-3">
        <div><label className="label">{t('new_project_name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('new_project_placeholder')} /></div>
        <div><label className="label">{t('new_project_desc')}</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div><label className="label">{t('new_project_owner')}</label>
          <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy || !name.trim()} onClick={submit}>{t('new_project_create')}</button>
        </div>
      </div>
    </Modal>
  );
}

function EditProjectModal({ open, project, onClose, onSaved }: {
  open: boolean;
  project: ProjectDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [owner, setOwner] = useState(project.owner ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setName(project.name); setDescription(project.description ?? ''); setOwner(project.owner ?? ''); }
  }, [open, project]);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try { await api.put(`/projects/${project.id}`, { name, description, owner }); onSaved(); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('edit_project_title')}>
      <div className="space-y-3">
        <div><label className="label">{t('new_project_name')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">{t('new_project_desc')}</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div><label className="label">{t('new_project_owner')}</label>
          <input className="input" value={owner} onChange={(e) => setOwner(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy || !name.trim()} onClick={submit}>{t('save')}</button>
        </div>
      </div>
    </Modal>
  );
}

interface UserOption { id: number; username: string; }

function MembersModal({ open, projectId, onClose }: { open: boolean; projectId: number; onClose: () => void }) {
  const { t } = useLang();
  const { user: me } = useAuth();
  const { showToast } = useToast();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [m, u] = await Promise.all([
        api.get<ProjectMember[]>(`/projects/${projectId}/members`),
        me?.isAdmin ? api.get<UserOption[]>('/users') : Promise.resolve([]),
      ]);
      setMembers(m);
      setAllUsers(u);
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  }
  useEffect(() => { if (open) load(); }, [open, projectId]);

  async function add() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/projects/${projectId}/members`, { userId: Number(selected) });
      setSelected('');
      await load();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: number) {
    try {
      await api.del(`/projects/${projectId}/members/${userId}`);
      await load();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  }

  const candidates = allUsers.filter((u) => !members.some((m) => m.userId === u.id));

  return (
    <Modal open={open} onClose={onClose} title={t('members_title')}>
      <div className="space-y-3">
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="tbl-head text-left text-xs uppercase tracking-wide">
              <tr><th className="px-3 py-2">{t('users_col_name')}</th><th className="px-3 py-2"></th></tr>
            </thead>
            <tbody className="divide-theme">
              {members.map((m) => (
                <tr key={m.userId} className="tbl-row">
                  <td className="px-3 py-2" style={{ color: 'var(--text-1)' }}>{m.username}</td>
                  <td className="px-3 py-2 text-right">
                    {me?.isAdmin && (
                      <button className="text-sm transition" style={{ color: 'var(--danger)' }} onClick={() => remove(m.userId)}>
                        {t('delete')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {me?.isAdmin && (
          <div className="flex gap-2">
            <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">{t('members_add_placeholder')}</option>
              {candidates.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <button className="btn-primary" disabled={busy || !selected} onClick={add}>{t('members_add_btn')}</button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ================================================================== *
 *  Détail d'un projet
 * ================================================================== */

interface VulnGroup {
  vuln_key: string;
  cve: string;
  title: string;
  cwe: string;
  cvss_score: number | null;
  cvss_severity: string;
  cvss_vector: string;
  description: string;
  remediation: string;
  tracking_id: string;
  advisory_title: string;
  publisher: string;
  released: string | null;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  devices: {
    device_name: string; firmware_version: string; article_number: string;
    product_name: string; version_range: string; confidence: number; reason: string;
  }[];
}

function groupMatches(matches: Match[]): VulnGroup[] {
  const map = new Map<string, VulnGroup>();
  const seen = new Set<string>();
  for (const m of matches) {
    let g = map.get(m.vuln_key);
    if (!g) {
      g = {
        vuln_key: m.vuln_key, cve: m.cve, title: m.title, cwe: m.cwe,
        cvss_score: m.cvss_score, cvss_severity: m.cvss_severity, cvss_vector: m.cvss_vector,
        description: m.description, remediation: m.remediation, tracking_id: m.tracking_id,
        advisory_title: m.advisory_title, publisher: m.publisher, released: m.released,
        status: m.status, resolved_by: m.resolved_by, resolved_at: m.resolved_at, devices: [],
      };
      map.set(m.vuln_key, g);
    }
    const dk = `${m.vuln_key}|${m.device_name}|${m.product_name}`;
    if (!seen.has(dk)) {
      seen.add(dk);
      g.devices.push({
        device_name: m.device_name, firmware_version: m.firmware_version, article_number: m.article_number,
        product_name: m.product_name, version_range: m.version_range, confidence: m.confidence, reason: m.reason,
      });
    }
  }
  return [...map.values()];
}

function deriveStatus(groups: VulnGroup[]): string {
  const total = groups.length;
  if (total === 0) return 'sain';
  const treated = groups.filter((g) => TREATED_STATUSES.includes(g.status)).length;
  const inProgress = groups.filter((g) => g.status === 'in_progress').length;
  if (treated >= total) return 'traite';
  if (treated > 0 || inProgress > 0) return 'en_cours';
  return 'a_traiter';
}

function ProjectView({ id, onBack }: { id: number; onBack: () => void }) {
  const { t, dateLocale, lang } = useLang();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [project, setProject] = useState<ProjectDetail | null>(null);

  function guardDelete(onConfirm: () => void): void {
    if (!user?.isAdmin) { showToast(t('no_delete_rights'), 'error'); return; }
    onConfirm();
  }
  const [matches, setMatches] = useState<Match[]>([]);
  const [tab, setTab] = useState<'devices' | 'active' | 'treated'>('devices');
  const [showDevice, setShowDevice] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deviceToDelete, setDeviceToDelete] = useState<{ id: number; name: string } | null>(null);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const [confirmProjectDelete, setConfirmProjectDelete] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(true);
  const [showMembers, setShowMembers] = useState(false);

  async function load() {
    try {
      const [p, m] = await Promise.all([
        api.get<ProjectDetail>(`/projects/${id}`),
        api.get<Match[]>(`/projects/${id}/matches`),
      ]);
      setProject(p);
      setMatches(m);
    } catch (e: any) {
      showToast(t('project_access_denied'), 'error');
      onBack();
    }
  }
  useEffect(() => { load(); }, [id]);

  const groups = useMemo(() => groupMatches(matches), [matches]);
  const active = groups.filter((g) => !TREATED_STATUSES.includes(g.status));
  const treated = groups.filter((g) => TREATED_STATUSES.includes(g.status));
  const projectStatus = deriveStatus(groups);

  async function setStatus(vuln_key: string, status: string) {
    await api.post(`/projects/${id}/vuln-status`, { vuln_key, status });
    await load();
  }

  if (!project) return <Spinner />;

  return (
    <div className="space-y-5">
      <button
        onClick={onBack}
        className="text-sm transition hover:underline"
        style={{ color: 'var(--accent)' }}
      >
        {t('project_back')}
      </button>

      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-1)' }}>{project.name}</h2>
              <ProjectStatusBadge status={projectStatus} />
            </div>
            {project.description && <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>{project.description}</p>}
            <div className="mt-2 flex gap-4 text-xs" style={{ color: 'var(--text-3)' }}>
              <span>{t('project_id_label')}{project.id}</span>
              {project.owner && <span>{t('project_owner_label')} {project.owner}</span>}
              <span>{t('project_devices_label', project.devices.length)}</span>
              <span>{t('project_vulns_label', treated.length, groups.length)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold" style={{ color: 'var(--danger)' }}>{active.length}</div>
            <div className="text-xs" style={{ color: 'var(--text-3)' }}>{t('project_to_treat')}</div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => window.open(`/api/projects/${id}/report.html?lang=${lang}`, '_blank', 'noopener')}>{t('project_report')}</button>
              <a className="btn-ghost" href={`/api/projects/${id}/report.csv?lang=${lang}`}>{t('project_export_csv')}</a>
              <button className="btn-ghost" onClick={() => setShowMembers(true)}>{t('members_btn')}</button>
              <button className="btn-ghost" onClick={() => setShowEdit(true)}>{t('project_edit')}</button>
              <button
                className="btn-danger"
                style={{ opacity: user?.isAdmin ? 1 : 0.45 }}
                onClick={() => guardDelete(() => setConfirmProjectDelete(true))}
              >{t('delete')}</button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {([
          ['devices', t('tab_devices', project.devices.length)],
          ['active', t('tab_active', active.length)],
          ['treated', t('tab_treated', treated.length)],
        ] as const).map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="px-4 py-2 text-sm transition"
            style={
              tab === k
                ? { borderBottom: '2px solid var(--accent)', color: 'var(--text-1)', marginBottom: -1 }
                : { color: 'var(--text-2)' }
            }
          >
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'devices' && (
        <div className="space-y-3">
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setShowImport(true)}>{t('device_import_btn')}</button>
            <button className="btn-primary" onClick={() => setShowDevice(true)}>{t('device_add_btn')}</button>
          </div>
          {project.devices.length === 0 ? (
            <Empty title={t('device_empty_title')} hint={t('device_empty_hint')} />
          ) : (
            <div className="card overflow-hidden">
              <button
                onClick={() => setDevicesOpen((o) => !o)}
                className="hover-subtle flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                  {t('project_devices_label', project.devices.length)}
                </span>
                <span className={`transition-transform duration-200 ${devicesOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-2)' }}>▾</span>
              </button>
              {devicesOpen && (
                <div className="max-h-[60vh] overflow-y-auto" style={{ borderTop: '1px solid var(--border)' }}>
                  <table className="w-full text-sm">
                    <thead className="tbl-head sticky top-0 z-10 text-left text-xs uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3">{t('device_col_device')}</th>
                        <th className="px-4 py-3">{t('device_col_vendor')}</th>
                        <th className="px-4 py-3">{t('device_col_family')}</th>
                        <th className="px-4 py-3">{t('device_col_article')}</th>
                        <th className="px-4 py-3">{t('device_col_firmware')}</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-theme">
                      {project.devices.map((d) => (
                        <tr key={d.id}>
                          <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>{d.name}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{d.vendor || '—'}</td>
                          <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{d.product_family || '—'}</td>
                          <td className="mono px-4 py-3" style={{ color: 'var(--text-2)' }}>{d.article_number || '—'}</td>
                          <td className="mono px-4 py-3" style={{ color: 'var(--text-2)' }}>{d.firmware_version || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-3">
                              <button
                                className="text-sm transition"
                                style={{ color: 'var(--text-2)' }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
                                onClick={() => setEditDevice(d)}
                              >
                                {t('project_edit')}
                              </button>
                              <button
                                className="text-sm transition"
                                style={{ color: 'var(--danger)', opacity: user?.isAdmin ? 1 : 0.4 }}
                                onClick={() => guardDelete(() => setDeviceToDelete({ id: d.id, name: d.name }))}
                              >
                                {t('delete')}
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
        </div>
      )}

      {tab === 'active' && (
        <VulnGroupList
          groups={active}
          onStatus={setStatus}
          empty={<Empty title={t('vuln_active_empty_title')} hint={t('vuln_active_empty_hint')} />}
        />
      )}
      {tab === 'treated' && (
        <VulnGroupList
          groups={treated}
          onStatus={setStatus}
          empty={<Empty title={t('vuln_treated_empty_title')} hint={t('vuln_treated_empty_hint')} />}
        />
      )}

      <EditProjectModal open={showEdit} project={project} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); load(); }} />
      <AddDeviceModal open={showDevice} projectId={id} onClose={() => setShowDevice(false)} onAdded={() => { setShowDevice(false); load(); }} />
      {editDevice && (
        <EditDeviceModal
          open={!!editDevice}
          device={editDevice}
          projectId={id}
          onClose={() => setEditDevice(null)}
          onSaved={() => { setEditDevice(null); load(); }}
        />
      )}
      <ImportDevicesModal open={showImport} projectId={id} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} />
      <MembersModal open={showMembers} projectId={id} onClose={() => setShowMembers(false)} />
      <ConfirmDialog
        open={!!deviceToDelete}
        title={t('device_delete_title')}
        message={t('device_delete_msg', deviceToDelete?.name)}
        onConfirm={async () => { if (deviceToDelete) { await api.del(`/projects/${id}/devices/${deviceToDelete.id}`); load(); } }}
        onClose={() => setDeviceToDelete(null)}
      />
      <ConfirmDialog
        open={confirmProjectDelete}
        title={t('project_delete_title')}
        message={t('project_delete_msg', project.name)}
        onConfirm={async () => { await api.del(`/projects/${id}`); onBack(); }}
        onClose={() => setConfirmProjectDelete(false)}
      />
    </div>
  );
}

/* ================================================================== *
 *  Liste de vulnérabilités groupées + dépliables + statut
 * ================================================================== */

function VulnGroupList({
  groups, onStatus, empty,
}: {
  groups: VulnGroup[];
  onStatus: (vulnKey: string, status: string) => void;
  empty: React.ReactNode;
}) {
  const { t, dateLocale } = useLang();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [listOpen, setListOpen] = useState(true);
  if (groups.length === 0) return <>{empty}</>;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setListOpen((o) => !o)}
        className="hover-subtle flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
          {groups.length} {t('nav_vulns').toLowerCase()}
        </span>
        <span className={`transition-transform duration-200 ${listOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-2)' }}>▾</span>
      </button>
      {listOpen && (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-2" style={{ borderTop: '1px solid var(--border)' }}>
          {groups.map((g) => {
            const isOpen = !!open[g.vuln_key];
            return (
              <div key={g.vuln_key} className="overflow-hidden rounded-md" style={{ border: '1px solid var(--border)' }}>
                <div
                  className="hover-subtle flex cursor-pointer items-center gap-3 px-4 py-3"
                  onClick={() => setOpen((o) => ({ ...o, [g.vuln_key]: !isOpen }))}
                >
                  <span style={{ color: 'var(--text-3)' }}>{isOpen ? '▾' : '▸'}</span>
                  <SeverityBadge severity={g.cvss_severity} score={g.cvss_score} />
                  <span className="mono" style={{ color: 'var(--accent)' }}>{g.cve || t('vuln_no_cve')}</span>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-1)' }}>{g.title}</span>
                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>{g.devices.length} device(s)</span>
                  <select
                    className="input !w-auto !py-1 text-xs"
                    value={g.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); onStatus(g.vuln_key, e.target.value); }}
                  >
                    {Object.keys(VULN_STATUS).map((k) => (
                      <option key={k} value={k}>{t('status_' + k)}</option>
                    ))}
                  </select>
                </div>

                {isOpen && (
                  <div className="px-5 py-4 text-sm" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        {g.cwe && <Field label={t('vuln_detail_cwe')} value={g.cwe} />}
                        {g.cvss_vector && <Field label={t('vuln_detail_cvss')} value={g.cvss_vector} mono />}
                        <Field label={t('vuln_detail_advisory')} value={`${g.tracking_id} — ${g.advisory_title}`} />
                        <Field label={t('vuln_detail_publisher')} value={`${g.publisher || '—'}${g.released ? ` · ${formatDate(g.released, dateLocale)}` : ''}`} />
                        {g.resolved_by && (
                          <Field
                            label={t('vuln_detail_resolved_by')}
                            value={`${g.resolved_by}${g.resolved_at ? ` · ${formatDate(g.resolved_at, dateLocale)}` : ''}`}
                          />
                        )}
                      </div>
                      <div className="space-y-2">
                        {g.description && <Field label={t('vuln_detail_description')} value={g.description} />}
                        {g.remediation && <Field label={t('vuln_detail_remediation')} value={g.remediation} />}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="label">{t('vuln_detail_devices')}</div>
                      <div className="overflow-hidden rounded-md" style={{ border: '1px solid var(--border)' }}>
                        <table className="w-full text-xs">
                          <thead className="tbl-head text-left">
                            <tr>
                              <th className="px-3 py-2">{t('vuln_detail_col_device')}</th>
                              <th className="px-3 py-2">{t('vuln_detail_col_firmware')}</th>
                              <th className="px-3 py-2">{t('vuln_detail_col_product')}</th>
                              <th className="px-3 py-2">{t('vuln_detail_col_confidence')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-theme">
                            {g.devices.map((d, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2" style={{ color: 'var(--text-1)' }}>
                                  {d.device_name}
                                  {d.article_number && <span className="mono ml-1 text-[11px]" style={{ color: 'var(--text-3)' }}>{d.article_number}</span>}
                                </td>
                                <td className="mono px-3 py-2" style={{ color: 'var(--text-2)' }}>{d.firmware_version || '—'}</td>
                                <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>
                                  {d.product_name}{d.version_range && <span className="mono ml-1" style={{ color: 'var(--text-3)' }}>({d.version_range})</span>}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="mono" style={{ color: 'var(--text-2)' }}>{Math.round(d.confidence * 100)}%</span>
                                  <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>{d.reason}</div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div
        className={mono ? 'mono text-xs break-all' : ''}
        style={{ color: 'var(--text-2)' }}
      >
        {value}
      </div>
    </div>
  );
}

/* ================================================================== */

function EditDeviceModal({ open, device, projectId, onClose, onSaved }: {
  open: boolean; device: Device; projectId: number; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useLang();
  const [d, setD] = useState({ ...device });
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setD({ ...device }); }, [open, device]);

  function set<K extends keyof typeof d>(k: K, v: string) { setD((p) => ({ ...p, [k]: v })); }

  async function submit() {
    if (!d.name.trim()) return;
    setBusy(true);
    try { await api.put(`/projects/${projectId}/devices/${device.id}`, d); onSaved(); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('edit_device_title')}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">{t('device_name_label')}</label>
          <input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div><label className="label">{t('device_vendor_label')}</label>
          <input className="input" value={d.vendor} onChange={(e) => set('vendor', e.target.value)} /></div>
        <div><label className="label">{t('device_family_label')}</label>
          <input className="input" value={d.product_family} onChange={(e) => set('product_family', e.target.value)} /></div>
        <div><label className="label">{t('device_article_label')}</label>
          <input className="input mono" value={d.article_number} onChange={(e) => set('article_number', e.target.value)} /></div>
        <div><label className="label">{t('device_firmware_label')}</label>
          <input className="input mono" value={d.firmware_version} onChange={(e) => set('firmware_version', e.target.value)} /></div>
        <div className="col-span-2"><label className="label">{t('device_cpe_label')}</label>
          <input className="input mono" value={d.cpe} onChange={(e) => set('cpe', e.target.value)} /></div>
        <div className="col-span-2"><label className="label">{t('device_notes_label')}</label>
          <input className="input" value={d.notes} onChange={(e) => set('notes', e.target.value)} /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-primary" disabled={busy || !d.name.trim()} onClick={submit}>{t('save')}</button>
      </div>
    </Modal>
  );
}

function AddDeviceModal({ open, projectId, onClose, onAdded }: { open: boolean; projectId: number; onClose: () => void; onAdded: () => void }) {
  const { t } = useLang();
  const empty = { name: '', vendor: '', product_family: '', article_number: '', firmware_version: '', cpe: '', notes: '' };
  const [d, setD] = useState(empty);
  const [busy, setBusy] = useState(false);
  function set<K extends keyof typeof d>(k: K, v: string) { setD((p) => ({ ...p, [k]: v })); }

  async function submit() {
    if (!d.name.trim()) return;
    setBusy(true);
    try { await api.post(`/projects/${projectId}/devices`, d); setD(empty); onAdded(); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('add_device_title')}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">{t('device_name_label')}</label>
          <input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder={t('device_name_placeholder')} /></div>
        <div><label className="label">{t('device_vendor_label')}</label>
          <input className="input" value={d.vendor} onChange={(e) => set('vendor', e.target.value)} placeholder="Siemens" /></div>
        <div><label className="label">{t('device_family_label')}</label>
          <input className="input" value={d.product_family} onChange={(e) => set('product_family', e.target.value)} placeholder="SIMATIC S7-1200" /></div>
        <div><label className="label">{t('device_article_label')}</label>
          <input className="input mono" value={d.article_number} onChange={(e) => set('article_number', e.target.value)} placeholder="6ES7 512-1SM03-0AB0" /></div>
        <div><label className="label">{t('device_firmware_label')}</label>
          <input className="input mono" value={d.firmware_version} onChange={(e) => set('firmware_version', e.target.value)} placeholder="V4.5.1" /></div>
        <div className="col-span-2"><label className="label">{t('device_cpe_label')}</label>
          <input className="input mono" value={d.cpe} onChange={(e) => set('cpe', e.target.value)} /></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-primary" disabled={busy || !d.name.trim()} onClick={submit}>{t('device_add_confirm')}</button>
      </div>
    </Modal>
  );
}
