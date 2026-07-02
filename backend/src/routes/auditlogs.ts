import { Hono } from 'hono';
import { query } from '../db.js';
import { requireAdmin } from '../middleware/requireAuth.js';

export const auditlogs = new Hono();

auditlogs.get('/', requireAdmin, async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || 200), 500);
  const userId = c.req.query('userId');
  const action = c.req.query('action');

  const conditions: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (userId) { conditions.push(`user_id=$${i++}`); vals.push(Number(userId)); }
  if (action) { conditions.push(`action=$${i++}`); vals.push(action); }
  vals.push(limit);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query<any>(
    `SELECT id, user_id, username, action, resource, resource_id, details, ip, created_at
       FROM audit_logs ${where}
      ORDER BY created_at DESC LIMIT $${i}`,
    vals
  );
  return c.json(rows);
});
