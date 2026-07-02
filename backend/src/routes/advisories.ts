import { Hono } from 'hono';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';

export const advisories = new Hono();

/** Liste filtrable des advisories. ?q=&severity= */
advisories.get('/', requireAuth, async (c) => {
  const q = (c.req.query('q') || '').trim();
  const severity = c.req.query('severity');

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    where.push(`(a.tracking_id ILIKE $${params.length} OR a.title ILIKE $${params.length} OR a.publisher ILIKE $${params.length})`);
  }
  if (severity) {
    params.push(severity.toUpperCase());
    where.push(`EXISTS (SELECT 1 FROM vulnerabilities v2 WHERE v2.advisory_id = a.id AND v2.cvss_severity = $${params.length})`);
  }

  const rows = await query(
    `SELECT a.id, a.tracking_id, a.title, a.publisher, a.tlp, a.category,
            a.csaf_version, a.released, a.revision, a.source_id, a.created_at,
            s.name AS source_name,
            (SELECT COUNT(*) FROM vulnerabilities v WHERE v.advisory_id = a.id) AS vuln_count,
            (SELECT COUNT(*) FROM vulnerabilities v
              WHERE v.advisory_id = a.id AND v.cvss_severity = 'CRITICAL') AS critical_count,
            (SELECT COUNT(*) FROM vulnerabilities v
              WHERE v.advisory_id = a.id AND v.cvss_severity = 'HIGH') AS high_count
       FROM advisories a
       LEFT JOIN sources s ON s.id = a.source_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.released DESC NULLS LAST`,
    params
  );
  return c.json(rows);
});

advisories.delete('/publisher/:publisher', requireAdmin, async (c) => {
  const publisher = c.req.param('publisher');
  const me = c.get('user');
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  await query(`DELETE FROM advisories WHERE publisher=$1`, [publisher]);
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, resource_id, ip)
     VALUES($1,$2,'DELETE_ADVISORIES_BY_PUBLISHER','advisory',$3,$4)`,
    [me.userId, me.username, publisher, ip]
  );
  return c.json({ ok: true });
});

advisories.get('/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const [a] = await query(
    `SELECT a.*, s.name AS source_name
       FROM advisories a LEFT JOIN sources s ON s.id = a.source_id
      WHERE a.id=$1`,
    [id]
  );
  if (!a) return c.json({ error: 'introuvable' }, 404);
  const vulnerabilities = await query(
    `SELECT v.id, v.cve, v.title, v.cvss_score, v.cvss_severity, v.cwe,
            (SELECT COUNT(*) FROM affected_products ap WHERE ap.vulnerability_id=v.id) AS affected_count
       FROM vulnerabilities v WHERE v.advisory_id=$1
       ORDER BY v.cvss_score DESC NULLS LAST`,
    [id]
  );
  return c.json({ ...a, vulnerabilities });
});

advisories.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  await query(`DELETE FROM advisories WHERE id=$1`, [id]);
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, resource_id, ip)
     VALUES($1,$2,'DELETE_ADVISORY','advisory',$3,$4)`,
    [me.userId, me.username, String(id), ip]
  );
  return c.json({ ok: true });
});
