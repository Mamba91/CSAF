import { Hono } from 'hono';
import { query } from '../db.js';
import { insertDevice, type DeviceInput } from '../lib/insertDevice.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { userCanAccessProject } from '../lib/projectAccess.js';

export const networkDiscovery = new Hono();

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

/* ---- Scans (upload par l'agent local SNMP) ---- */

networkDiscovery.post('/scans', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const list = Array.isArray(body?.devices) ? body.devices : [];
  const ipRange = (body?.ip_range || '').toString().trim();
  if (!ipRange) return c.json({ error: 'ip_range requis' }, 400);
  if (!list.length) return c.json({ error: 'aucun device détecté fourni' }, 400);

  const user = c.get('user');
  const [scan] = await query<any>(
    `INSERT INTO network_scans (label, ip_range, created_by, device_count)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [(body?.label || '').toString().trim(), ipRange, user?.userId ?? null, list.length]
  );

  for (const raw of list) {
    await query(
      `INSERT INTO discovered_devices (scan_id, ip_address, mac_address, hostname, sys_descr, sys_object_id, vendor_guess)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scan.id, (raw?.ip_address || '').toString().trim(), (raw?.mac_address || '').toString().trim(),
       (raw?.hostname || '').toString().trim(), (raw?.sys_descr || '').toString().trim(),
       (raw?.sys_object_id || '').toString().trim(), (raw?.vendor_guess || '').toString().trim()]
    );
  }

  await logAction(c, 'UPLOAD_NETWORK_SCAN', 'network_scan', String(scan.id), { ip_range: ipRange, device_count: list.length });
  return c.json(scan, 201);
});

networkDiscovery.get('/scans', requireAuth, async (c) => {
  const rows = await query(
    `SELECT s.*, u.username AS created_by_username
       FROM network_scans s
       LEFT JOIN users u ON u.id = s.created_by
       ORDER BY s.id DESC`
  );
  return c.json(rows);
});

networkDiscovery.delete('/scans/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  await query(`DELETE FROM network_scans WHERE id=$1`, [id]);
  await logAction(c, 'DELETE_NETWORK_SCAN', 'network_scan', String(id), {});
  return c.json({ ok: true });
});

/* ---- Devices découverts ---- */

networkDiscovery.get('/devices', requireAuth, async (c) => {
  const rows = await query(
    `SELECT d.*, s.label AS scan_label, s.ip_range AS scan_ip_range, s.created_at AS scan_created_at
       FROM discovered_devices d
       JOIN network_scans s ON s.id = d.scan_id
       ORDER BY d.id DESC`
  );
  return c.json(rows);
});

networkDiscovery.post('/devices/import', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  const projectId = Number(body?.project_id);
  const deviceIds: number[] = Array.isArray(body?.device_ids) ? body.device_ids.map(Number) : [];
  const overrides: Record<string, Partial<DeviceInput>> = body?.overrides && typeof body.overrides === 'object' ? body.overrides : {};
  if (!projectId || !deviceIds.length) return c.json({ error: 'project_id et device_ids requis' }, 400);

  const user = c.get('user');
  if (!(await userCanAccessProject(user, projectId))) {
    return c.json({ error: 'Accès refusé à ce projet' }, 403);
  }

  let imported = 0; let skipped = 0;
  for (const id of deviceIds) {
    const [dd] = await query<any>(`SELECT * FROM discovered_devices WHERE id=$1 AND status='new'`, [id]);
    if (!dd) { skipped++; continue; }
    const ov = overrides[String(id)] || {};
    const device = await insertDevice(projectId, {
      name: ov.name || dd.hostname || dd.ip_address,
      vendor: ov.vendor ?? dd.vendor_guess,
      product_family: ov.product_family ?? '',
      firmware_version: ov.firmware_version ?? '',
      article_number: ov.article_number ?? '',
      cpe: ov.cpe ?? '',
      notes: ov.notes ?? `IP: ${dd.ip_address}${dd.mac_address ? ` / MAC: ${dd.mac_address}` : ''}${dd.sys_descr ? ` — ${dd.sys_descr}` : ''}`,
    });
    if (!device) { skipped++; continue; }
    await query(`UPDATE discovered_devices SET status='imported', imported_device_id=$1 WHERE id=$2`, [device.id, id]);
    imported++;
  }
  await logAction(c, 'IMPORT_DISCOVERED_DEVICES', 'device', String(projectId), { imported, skipped });
  return c.json({ imported, skipped }, 201);
});

networkDiscovery.delete('/devices/:id', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  await query(`UPDATE discovered_devices SET status='ignored' WHERE id=$1`, [id]);
  await logAction(c, 'IGNORE_DISCOVERED_DEVICE', 'discovered_device', String(id), {});
  return c.json({ ok: true });
});
