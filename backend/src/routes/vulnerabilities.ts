import { Hono } from 'hono';
import { query } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';

export const vulnerabilities = new Hono();

/** Liste filtrable des vulnérabilités. ?severity=&q= */
vulnerabilities.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const severity = c.req.query('severity');
  const q = (c.req.query('q') || '').trim();

  const where: string[] = [];
  const params: unknown[] = [];
  if (severity) {
    params.push(severity.toUpperCase());
    where.push(`v.cvss_severity = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(
      `(v.cve ILIKE $${params.length} OR v.title ILIKE $${params.length} OR a.title ILIKE $${params.length})`
    );
  }
  if (!user.isAdmin) {
    params.push(user.userId);
    where.push(`EXISTS (
      SELECT 1 FROM matches m
      JOIN devices d ON d.id = m.device_id
      WHERE m.vulnerability_id = v.id
        AND d.project_id IN (SELECT project_id FROM project_members WHERE user_id=$${params.length})
    )`);
  }

  const rows = await query(
    `SELECT v.id, v.cve, v.title, v.cvss_score, v.cvss_severity, v.cwe,
            v.description, v.remediation,
            a.tracking_id, a.title AS advisory_title, a.publisher, a.released,
            (SELECT COUNT(*) FROM affected_products ap WHERE ap.vulnerability_id=v.id) AS affected_count,
            (SELECT COUNT(*) FROM matches m WHERE m.vulnerability_id=v.id) AS match_count,
            (SELECT STRING_AGG(DISTINCT d.article_number, ', ')
               FROM matches m
               JOIN devices d ON d.id = m.device_id
              WHERE m.vulnerability_id = v.id
                AND d.article_number IS NOT NULL
                AND d.article_number <> '') AS article_numbers
       FROM vulnerabilities v
       JOIN advisories a ON a.id = v.advisory_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY v.cvss_score DESC NULLS LAST`,
    params
  );
  return c.json(rows);
});

vulnerabilities.get('/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const [v] = await query(
    `SELECT v.*, a.tracking_id, a.title AS advisory_title, a.publisher
       FROM vulnerabilities v JOIN advisories a ON a.id=v.advisory_id
      WHERE v.id=$1`,
    [id]
  );
  if (!v) return c.json({ error: 'introuvable' }, 404);
  const affected = await query(
    `SELECT * FROM affected_products WHERE vulnerability_id=$1`,
    [id]
  );
  return c.json({ ...v, affected });
});

vulnerabilities.delete('/publisher/:publisher', requireAdmin, async (c) => {
  const publisher = c.req.param('publisher');
  const me = c.get('user');
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  await query(
    `DELETE FROM vulnerabilities WHERE advisory_id IN (SELECT id FROM advisories WHERE publisher=$1)`,
    [publisher]
  );
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, resource_id, ip)
     VALUES($1,$2,'DELETE_VULNS_BY_PUBLISHER','vulnerability',$3,$4)`,
    [me.userId, me.username, publisher, ip]
  );
  return c.json({ ok: true });
});

vulnerabilities.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  await query(`DELETE FROM vulnerabilities WHERE id=$1`, [id]);
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, resource_id, ip)
     VALUES($1,$2,'DELETE_VULNERABILITY','vulnerability',$3,$4)`,
    [me.userId, me.username, String(id), ip]
  );
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ */

export const dashboard = new Hono();

dashboard.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const scoped = !user.isAdmin;
  const memberSubquery = `(SELECT project_id FROM project_members WHERE user_id=$1)`;
  const params = scoped ? [user.userId] : [];

  const [counts] = await query<any>(
    `SELECT
       (SELECT COUNT(*) FROM projects ${scoped ? `WHERE id IN ${memberSubquery}` : ''})        AS projects,
       (SELECT COUNT(*) FROM devices ${scoped ? `WHERE project_id IN ${memberSubquery}` : ''})  AS devices,
       (SELECT COUNT(*) FROM sources)         AS sources,
       (SELECT COUNT(*) FROM advisories)      AS advisories,
       (SELECT COUNT(*) FROM vulnerabilities) AS vulnerabilities,
       (SELECT COUNT(*) FROM matches ${scoped ? `WHERE device_id IN (SELECT id FROM devices WHERE project_id IN ${memberSubquery})` : ''}) AS matches`,
    params
  );

  const bySeverity = await query(
    `SELECT cvss_severity AS severity, COUNT(*) AS count
       FROM vulnerabilities
      WHERE cvss_severity <> ''
      GROUP BY cvss_severity`
  );

  const topProjects = await query(
    `SELECT * FROM v_project_risk ${scoped ? `WHERE project_id IN ${memberSubquery}` : ''}
      ORDER BY critical_count DESC, vuln_count DESC LIMIT 8`,
    params
  );

  const recentAdvisories = await query(
    `SELECT id, tracking_id, title, publisher, released
       FROM advisories ORDER BY released DESC NULLS LAST LIMIT 8`
  );

  return c.json({ counts, bySeverity, topProjects, recentAdvisories });
});
