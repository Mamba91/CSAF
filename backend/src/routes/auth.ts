import { Hono } from 'hono';
import { query } from '../db.js';
import { verifyPassword, signToken } from '../lib/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const auth = new Hono();

auth.post('/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>();
  if (!username || !password) return c.json({ error: 'Identifiants manquants' }, 400);

  const [user] = await query<any>(
    'SELECT id, username, email, password_hash, is_admin FROM users WHERE username=$1',
    [username.trim()]
  );
  if (!user) return c.json({ error: 'Identifiants invalides' }, 401);

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return c.json({ error: 'Identifiants invalides' }, 401);

  await query('UPDATE users SET last_login=now() WHERE id=$1', [user.id]);

  const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, ip)
     VALUES($1,$2,'LOGIN','auth',$3)`,
    [user.id, user.username, ip]
  );

  const token = signToken({ userId: user.id, username: user.username, isAdmin: user.is_admin });
  return c.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin },
  });
});

auth.post('/logout', requireAuth, async (c) => {
  const me = c.get('user');
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, ip)
     VALUES($1,$2,'LOGOUT','auth',$3)`,
    [me.userId, me.username, ip]
  );
  return c.json({ ok: true });
});

auth.get('/me', requireAuth, async (c) => {
  const me = c.get('user');
  const [user] = await query<any>(
    'SELECT id, username, email, is_admin, created_at, last_login FROM users WHERE id=$1',
    [me.userId]
  );
  if (!user) return c.json({ error: 'Utilisateur introuvable' }, 404);
  return c.json({ id: user.id, username: user.username, email: user.email, isAdmin: user.is_admin, createdAt: user.created_at, lastLogin: user.last_login });
});

auth.put('/me/password', requireAuth, async (c) => {
  const me = c.get('user');
  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (!currentPassword || !newPassword) return c.json({ error: 'Champs manquants' }, 400);
  if (newPassword.length < 6) return c.json({ error: 'Mot de passe trop court (min 6 caractères)' }, 400);

  const [user] = await query<any>('SELECT password_hash FROM users WHERE id=$1', [me.userId]);
  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return c.json({ error: 'Mot de passe actuel incorrect' }, 401);

  const { hashPassword } = await import('../lib/auth.js');
  const newHash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, me.userId]);
  return c.json({ ok: true });
});
