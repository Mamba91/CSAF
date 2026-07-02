import { Hono } from 'hono';
import { query } from '../db.js';
import { hashPassword } from '../lib/auth.js';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';

export const users = new Hono();

users.get('/', requireAdmin, async (c) => {
  const rows = await query<any>(
    'SELECT id, username, email, is_admin, created_at, last_login FROM users ORDER BY created_at'
  );
  return c.json(rows.map((u) => ({
    id: u.id, username: u.username, email: u.email,
    isAdmin: u.is_admin, createdAt: u.created_at, lastLogin: u.last_login,
  })));
});

users.post('/', requireAdmin, async (c) => {
  const { username, email, password, isAdmin } = await c.req.json<{
    username: string; email?: string; password: string; isAdmin?: boolean;
  }>();
  if (!username || !password) return c.json({ error: 'username et password requis' }, 400);
  if (password.length < 6) return c.json({ error: 'Mot de passe trop court (min 6 caractères)' }, 400);

  const exists = await query('SELECT id FROM users WHERE username=$1', [username.trim()]);
  if (exists.length > 0) return c.json({ error: "Nom d'utilisateur déjà pris" }, 409);

  const hash = await hashPassword(password);
  const [user] = await query<any>(
    `INSERT INTO users(username, email, password_hash, is_admin)
     VALUES($1,$2,$3,$4) RETURNING id, username, email, is_admin, created_at`,
    [username.trim(), email || '', hash, isAdmin ?? false]
  );

  const me = c.get('user');
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, resource_id, details)
     VALUES($1,$2,'CREATE_USER','user',$3,$4)`,
    [me.userId, me.username, String(user.id), JSON.stringify({ username: user.username })]
  );

  return c.json({ id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin, createdAt: user.created_at }, 201);
});

users.put('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const { email, isAdmin, password } = await c.req.json<{ email?: string; isAdmin?: boolean; password?: string }>();

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (email !== undefined) { sets.push(`email=$${i++}`); vals.push(email); }
  if (isAdmin !== undefined) { sets.push(`is_admin=$${i++}`); vals.push(isAdmin); }
  if (password) {
    if (password.length < 6) return c.json({ error: 'Mot de passe trop court' }, 400);
    sets.push(`password_hash=$${i++}`);
    vals.push(await hashPassword(password));
  }
  if (sets.length === 0) return c.json({ error: 'Rien à mettre à jour' }, 400);
  vals.push(id);

  const [user] = await query<any>(
    `UPDATE users SET ${sets.join(',')} WHERE id=$${i} RETURNING id, username, email, is_admin`,
    vals
  );
  if (!user) return c.json({ error: 'Utilisateur introuvable' }, 404);

  const me = c.get('user');
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, resource_id)
     VALUES($1,$2,'UPDATE_USER','user',$3)`,
    [me.userId, me.username, String(id)]
  );

  return c.json({ id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin });
});

users.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');
  if (id === me.userId) return c.json({ error: 'Impossible de supprimer son propre compte' }, 400);

  const [u] = await query<any>('SELECT username FROM users WHERE id=$1', [id]);
  if (!u) return c.json({ error: 'Utilisateur introuvable' }, 404);

  await query('DELETE FROM users WHERE id=$1', [id]);
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, resource_id, details)
     VALUES($1,$2,'DELETE_USER','user',$3,$4)`,
    [me.userId, me.username, String(id), JSON.stringify({ username: u.username })]
  );
  return c.json({ ok: true });
});
