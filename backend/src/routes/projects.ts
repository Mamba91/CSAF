import { Hono } from 'hono';
import { query } from '../db.js';
import { matchDevice } from '../lib/match.js';
import { insertDevice } from '../lib/insertDevice.js';
import { buildReport, renderReportHtml, renderReportCsv } from '../lib/report.js';
import { deriveProjectStatus } from '../lib/projectStatus.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/requireAuth.js';
import { requireProjectAccess } from '../lib/projectAccess.js';

export const projects = new Hono();

const VULN_KEY = `COALESCE(NULLIF(v.cve,''), a.tracking_id || '::' || v.title)`;

async function projectStatusMap(): Promise<Record<number, any>> {
  const rows = await query<any>(
    `WITH pv AS (
       SELECT DISTINCT d.project_id,
              ${VULN_KEY} AS vuln_key,
              COALESCE(vs.status,'open') AS status
         FROM matches m
         JOIN devices d ON d.id = m.device_id
         JOIN vulnerabilities v ON v.id = m.vulnerability_id
         JOIN advisories a ON a.id = v.advisory_id
         LEFT JOIN vuln_status vs
                ON vs.project_id = d.project_id AND vs.vuln_key = ${VULN_KEY}
     )
     SELECT project_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status IN ('resolved','accepted','false_positive')) AS treated,
            COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress
       FROM pv GROUP BY project_id`
  );
  const map: Record<number, any> = {};
  for (const r of rows) {
    const total = Number(r.total), treated = Number(r.treated), inProgress = Number(r.in_progress);
    map[r.project_id] = { total, treated, in_progress: inProgress, status: deriveProjectStatus(total, treated, inProgress) };
  }
  return map;
}

async function logAction(c: any, action: string, resource: string, resourceId: string, details?: object) {
  try {
    const user = c.get('user');
    if (!user) return;
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
    await query(
      `INSERT INTO audit_logs(user_id, username, action, resource, resource_id, details, ip)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [user.userId, user.username, action, resource, resourceId, JSON.stringify(details ?? {}), ip]
    );
  } catch { /* non-bloquant */ }
}

/* ---- Projets ---- */

projects.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const params: unknown[] = [];
  let scope = '';
  if (!user.isAdmin) {
    params.push(user.userId);
    scope = `WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id=$${params.length})`;
  }
  const rows = await query<any>(
    `SELECT p.*,
            (SELECT COUNT(*) FROM devices d WHERE d.project_id = p.id) AS device_count,
            COALESCE((SELECT vuln_count FROM v_project_risk r WHERE r.project_id = p.id),0) AS vuln_count,
            COALESCE((SELECT critical_count FROM v_project_risk r WHERE r.project_id = p.id),0) AS critical_count,
            COALESCE((SELECT high_count FROM v_project_risk r WHERE r.project_id = p.id),0) AS high_count
       FROM projects p
       ${scope}
       ORDER BY p.id DESC`,
    params
  );
  const sm = await projectStatusMap();
  for (const p of rows) {
    const s = sm[p.id] || { total: 0, treated: 0, in_progress: 0, status: 'sain' };
    p.treated_count = s.treated;
    p.project_status = s.status;
  }
  return c.json(rows);
});

projects.get('/:id', requireAuth, requireProjectAccess, async (c) => {
  const id = Number(c.req.param('id'));
  const [project] = await query(`SELECT * FROM projects WHERE id=$1`, [id]);
  if (!project) return c.json({ error: 'introuvable' }, 404);
  const devices = await query(`SELECT * FROM devices WHERE project_id=$1 ORDER BY id`, [id]);
  return c.json({ ...project, devices });
});

projects.post('/', requireAuth, async (c) => {
  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'nom requis' }, 400);
  const [row] = await query(
    `INSERT INTO projects (name, description, owner) VALUES ($1,$2,$3) RETURNING *`,
    [body.name, body.description || '', body.owner || '']
  );
  const user = c.get('user');
  await query(
    `INSERT INTO project_members (project_id, user_id, added_by) VALUES ($1,$2,$2) ON CONFLICT DO NOTHING`,
    [row.id, user.userId]
  );
  await logAction(c, 'CREATE_PROJECT', 'project', String(row.id), { name: row.name });
  return c.json(row, 201);
});

projects.put('/:id', requireAuth, requireProjectAccess, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json();
  const [row] = await query(
    `UPDATE projects SET name=$1, description=$2, owner=$3, updated_at=now() WHERE id=$4 RETURNING *`,
    [body.name, body.description || '', body.owner || '', id]
  );
  await logAction(c, 'UPDATE_PROJECT', 'project', String(id), { name: body.name });
  return c.json(row);
});

/* Suppression de projet — admins uniquement */
projects.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const [p] = await query<any>('SELECT name FROM projects WHERE id=$1', [id]);
  await query(`DELETE FROM projects WHERE id=$1`, [id]);
  await logAction(c, 'DELETE_PROJECT', 'project', String(id), { name: p?.name });
  return c.json({ ok: true });
});

/* ---- Devices ---- */

projects.post('/:id/devices', requireAuth, requireProjectAccess, async (c) => {
  const projectId = Number(c.req.param('id'));
  const body = await c.req.json();
  const device = await insertDevice(projectId, body);
  if (!device) return c.json({ error: 'nom du device requis' }, 400);
  await logAction(c, 'ADD_DEVICE', 'device', String(device.id), { name: device.name, projectId });
  return c.json(device, 201);
});

projects.put('/:id/devices/:deviceId', requireAuth, requireProjectAccess, async (c) => {
  const projectId = Number(c.req.param('id'));
  const deviceId = Number(c.req.param('deviceId'));
  const body = await c.req.json();
  const [device] = await query<any>(
    `UPDATE devices SET name=$1, vendor=$2, product_family=$3,
            firmware_version=$4, article_number=$5, cpe=$6, notes=$7
     WHERE id=$8 AND project_id=$9 RETURNING *`,
    [body.name, body.vendor || '', body.product_family || '',
     body.firmware_version || '', body.article_number || '', body.cpe || '', body.notes || '', deviceId, projectId]
  );
  if (!device) return c.json({ error: 'device introuvable pour ce projet' }, 404);
  await matchDevice(device);
  await logAction(c, 'UPDATE_DEVICE', 'device', String(deviceId), { name: body.name });
  return c.json(device);
});

projects.delete('/:id/devices/:deviceId', requireAdmin, requireProjectAccess, async (c) => {
  const projectId = Number(c.req.param('id'));
  const deviceId = Number(c.req.param('deviceId'));
  const deleted = await query<any>(`DELETE FROM devices WHERE id=$1 AND project_id=$2 RETURNING id`, [deviceId, projectId]);
  if (!deleted.length) return c.json({ error: 'device introuvable pour ce projet' }, 404);
  await logAction(c, 'DELETE_DEVICE', 'device', String(deviceId), {});
  return c.json({ ok: true });
});

projects.post('/:id/devices/bulk', requireAuth, requireProjectAccess, async (c) => {
  const projectId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const list = Array.isArray(body?.devices) ? body.devices : [];
  if (!list.length) return c.json({ error: 'aucun device fourni' }, 400);

  let imported = 0; let skipped = 0;
  for (const raw of list) {
    const device = await insertDevice(projectId, raw);
    if (!device) { skipped++; continue; }
    imported++;
  }
  await logAction(c, 'BULK_IMPORT_DEVICES', 'device', String(projectId), { imported, skipped });
  return c.json({ imported, skipped }, 201);
});

/* ---- Vulnérabilités corrélées ---- */

projects.get('/:id/matches', requireAuth, requireProjectAccess, async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await query(
    `SELECT m.id AS match_id, m.confidence, m.reason,
            d.id AS device_id, d.name AS device_name, d.firmware_version, d.article_number,
            v.id AS vuln_id, v.cve, v.title, v.cwe, v.cvss_score, v.cvss_severity,
            v.cvss_vector, v.description, v.remediation,
            ap.product_name, ap.version_range,
            a.tracking_id, a.title AS advisory_title, a.publisher, a.released,
            ${VULN_KEY} AS vuln_key,
            COALESCE(vs.status,'open') AS status, COALESCE(vs.note,'') AS status_note,
            vs.resolved_by, vs.resolved_at
       FROM matches m
       JOIN devices d ON d.id = m.device_id
       JOIN vulnerabilities v ON v.id = m.vulnerability_id
       JOIN affected_products ap ON ap.id = m.affected_product_id
       JOIN advisories a ON a.id = v.advisory_id
       LEFT JOIN vuln_status vs
              ON vs.project_id = d.project_id AND vs.vuln_key = ${VULN_KEY}
      WHERE d.project_id = $1
      ORDER BY v.cvss_score DESC NULLS LAST, m.confidence DESC`,
    [id]
  );
  return c.json(rows);
});

projects.post('/:id/vuln-status', requireAuth, requireProjectAccess, async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => null);
  const vulnKey = (body?.vuln_key || '').toString();
  const status = (body?.status || '').toString();
  const valid = ['open', 'in_progress', 'resolved', 'accepted', 'false_positive'];
  if (!vulnKey || !valid.includes(status))
    return c.json({ error: 'vuln_key et status valides requis' }, 400);

  // Trace qui a effectué le changement de statut, quel que soit le statut choisi
  const user = c.get('user');
  const resolvedById = user?.userId ?? null;
  const resolvedBy = user?.username ?? '';
  const resolvedAt = new Date();

  const [row] = await query(
    `INSERT INTO vuln_status (project_id, vuln_key, status, note, resolved_by_id, resolved_by, resolved_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (project_id, vuln_key)
     DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note,
                   resolved_by_id=EXCLUDED.resolved_by_id, resolved_by=EXCLUDED.resolved_by, resolved_at=EXCLUDED.resolved_at,
                   updated_at=now()
     RETURNING *`,
    [id, vulnKey, status, (body?.note || '').toString(), resolvedById, resolvedBy, resolvedAt]
  );
  await logAction(c, 'UPDATE_VULN_STATUS', 'vuln_status', String(id), { vuln_key: vulnKey, status, resolved_by: resolvedBy || undefined });
  return c.json(row);
});

/* ---- Membres du projet ---- */

projects.get('/:id/members', requireAuth, requireProjectAccess, async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await query<any>(
    `SELECT u.id AS user_id, u.username, u.email, u.is_admin, pm.added_at
       FROM project_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id=$1
      ORDER BY u.username`,
    [id]
  );
  return c.json(rows.map((r) => ({
    userId: r.user_id, username: r.username, email: r.email, isAdmin: r.is_admin, addedAt: r.added_at,
  })));
});

// Ajout/suppression réservés aux admins (évite qu'un membre s'auto-octroie des droits).
projects.post('/:id/members', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const { userId } = await c.req.json<{ userId?: number }>();
  if (!userId) return c.json({ error: 'userId requis' }, 400);
  const [u] = await query<any>('SELECT id, username FROM users WHERE id=$1', [userId]);
  if (!u) return c.json({ error: 'utilisateur introuvable' }, 404);
  await query(
    `INSERT INTO project_members (project_id, user_id, added_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [id, userId, c.get('user').userId]
  );
  await logAction(c, 'ADD_PROJECT_MEMBER', 'project_member', String(id), { userId, username: u.username });
  return c.json({ ok: true }, 201);
});

projects.delete('/:id/members/:userId', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const userId = Number(c.req.param('userId'));
  await query(`DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, [id, userId]);
  await logAction(c, 'REMOVE_PROJECT_MEMBER', 'project_member', String(id), { userId });
  return c.json({ ok: true });
});

/* ---- Rapports (lang = fr | en) ---- */

projects.get('/:id/report', requireAuth, requireProjectAccess, async (c) => {
  const id = Number(c.req.param('id'));
  const data = await buildReport(id);
  if (!data) return c.json({ error: 'projet introuvable' }, 404);
  return c.json(data);
});

projects.get('/:id/report.html', optionalAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const lang = (c.req.query('lang') === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const data = await buildReport(id);
  if (!data) return c.text('Projet introuvable', 404);
  await logAction(c, 'EXPORT_REPORT_HTML', 'project', String(id), { lang });
  return c.html(renderReportHtml(data, lang));
});

projects.get('/:id/report.csv', optionalAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const lang = (c.req.query('lang') === 'en' ? 'en' : 'fr') as 'fr' | 'en';
  const data = await buildReport(id);
  if (!data) return c.text('Projet introuvable', 404);
  const safe = (data.project.name || 'projet').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40);
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="rapport_${safe}_${id}.csv"`);
  await logAction(c, 'EXPORT_REPORT_CSV', 'project', String(id), { lang });
  return c.body(renderReportCsv(data, lang));
});
