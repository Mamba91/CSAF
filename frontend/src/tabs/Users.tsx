import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { Modal, ConfirmDialog, Spinner, formatDate } from '../components/ui';

interface UserRow {
  id: number;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  lastLogin: string | null;
}

export default function Users() {
  const { t, dateLocale } = useLang();
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [toDelete, setToDelete] = useState<UserRow | null>(null);
  const [toEdit, setToEdit] = useState<UserRow | null>(null);

  async function load() {
    setLoading(true);
    try { setUsers(await api.get<UserRow[]>('/users')); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
          {t('users_count', users.length)}
        </p>
        <button className="btn-primary" onClick={() => setShowNew(true)}>{t('users_new')}</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="tbl-head text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">{t('users_col_name')}</th>
                <th className="px-4 py-3">{t('users_col_email')}</th>
                <th className="px-4 py-3">{t('users_col_role')}</th>
                <th className="px-4 py-3">{t('users_col_created')}</th>
                <th className="px-4 py-3">{t('users_col_last_login')}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y tbl-divider">
              {users.map((u) => (
                <tr key={u.id} className="tbl-row">
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-1)' }}>
                    {u.username}
                    {u.id === me?.id && (
                      <span className="ml-2 rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--accent-muted)', color: 'var(--accent-h)' }}>
                        {t('users_me')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded px-2 py-0.5 text-xs font-semibold"
                      style={u.isAdmin
                        ? { background: 'var(--accent-muted)', color: 'var(--accent-h)' }
                        : { background: 'var(--bg-subtle)', color: 'var(--text-2)' }}>
                      {u.isAdmin ? t('users_role_admin') : t('users_role_user')}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{formatDate(u.createdAt, dateLocale)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--text-2)' }}>{u.lastLogin ? formatDate(u.lastLogin, dateLocale) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button className="text-sm transition" style={{ color: 'var(--text-2)' }}
                        onClick={() => setToEdit(u)}>{t('project_edit')}</button>
                      {u.id !== me?.id && (
                        <button className="text-sm transition" style={{ color: 'var(--danger)' }}
                          onClick={() => setToDelete(u)}>{t('delete')}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewUserModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />
      {toEdit && (
        <EditUserModal user={toEdit} open={!!toEdit} onClose={() => setToEdit(null)} onSaved={() => { setToEdit(null); load(); }} />
      )}
      <ConfirmDialog
        open={!!toDelete}
        title={t('users_delete_title')}
        message={t('users_delete_msg', toDelete?.username)}
        onConfirm={async () => { if (toDelete) { await api.del(`/users/${toDelete.id}`); load(); } }}
        onClose={() => setToDelete(null)}
      />
    </div>
  );
}

function NewUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({ username: '', email: '', password: '', isAdmin: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function set(k: keyof typeof form, v: string | boolean) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.username.trim() || !form.password) return;
    setBusy(true); setErr('');
    try {
      await api.post('/users', form);
      setForm({ username: '', email: '', password: '', isAdmin: false });
      onCreated();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('users_new')}>
      <div className="space-y-3">
        <div><label className="label">{t('users_col_name')}</label>
          <input className="input" value={form.username} onChange={(e) => set('username', e.target.value)} /></div>
        <div><label className="label">{t('users_col_email')}</label>
          <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label className="label">{t('login_password')}</label>
          <input className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-1)' }}>
          <input type="checkbox" checked={form.isAdmin} onChange={(e) => set('isAdmin', e.target.checked)} />
          {t('users_is_admin')}
        </label>
        {err && <div className="text-sm rounded px-3 py-2" style={{ background: 'var(--danger-muted)', color: 'var(--danger)' }}>{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy || !form.username.trim() || !form.password} onClick={submit}>{t('new_project_create')}</button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({ user, open, onClose, onSaved }: { user: UserRow; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const [form, setForm] = useState({ email: user.email, password: '', isAdmin: user.isAdmin });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function set(k: keyof typeof form, v: string | boolean) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    setBusy(true); setErr('');
    try {
      const body: any = { email: form.email, isAdmin: form.isAdmin };
      if (form.password) body.password = form.password;
      await api.put(`/users/${user.id}`, body);
      onSaved();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={`${t('project_edit')} — ${user.username}`}>
      <div className="space-y-3">
        <div><label className="label">{t('users_col_email')}</label>
          <input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div><label className="label">{t('users_new_password')}</label>
          <input className="input" type="password" value={form.password} placeholder="(inchangé)" onChange={(e) => set('password', e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-1)' }}>
          <input type="checkbox" checked={form.isAdmin} onChange={(e) => set('isAdmin', e.target.checked)} />
          {t('users_is_admin')}
        </label>
        {err && <div className="text-sm rounded px-3 py-2" style={{ background: 'var(--danger-muted)', color: 'var(--danger)' }}>{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary" disabled={busy} onClick={submit}>{t('save')}</button>
        </div>
      </div>
    </Modal>
  );
}
