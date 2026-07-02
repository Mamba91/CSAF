import type { Context, Next } from 'hono';
import { query } from '../db.js';
import type { JwtPayload } from './auth.js';

/** true si admin, ou si l'utilisateur est membre du projet. */
export async function userCanAccessProject(user: JwtPayload, projectId: number): Promise<boolean> {
  if (user.isAdmin) return true;
  if (!Number.isFinite(projectId)) return false;
  const rows = await query('SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2', [projectId, user.userId]);
  return rows.length > 0;
}

/** Middleware Hono : à chaîner APRÈS requireAuth/requireAdmin. Lit :id dans le path. */
export async function requireProjectAccess(c: Context, next: Next) {
  const user = c.get('user');
  const projectId = Number(c.req.param('id'));
  if (!Number.isFinite(projectId)) return c.json({ error: 'projet invalide' }, 400);
  const ok = await userCanAccessProject(user, projectId);
  if (!ok) return c.json({ error: 'Accès refusé à ce projet' }, 403);
  await next();
}
