import { Hono } from 'hono';
import { query } from '../db.js';
import { parseCsafAdvisory, isSingleAdvisory } from '../csaf/parser.js';
import { resolveFeedEntries } from '../csaf/feeds.js';
import { ingestAdvisory } from '../lib/ingest.js';
import { rematchAll } from '../lib/match.js';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';

export const sources = new Hono();

sources.get('/', requireAuth, async (c) => {
  const rows = await query(`SELECT * FROM sources ORDER BY id DESC`);
  return c.json(rows);
});

/** Liste des advisories rattachés à une source. */
sources.get('/:id/advisories', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await query(
    `SELECT a.*,
            (SELECT COUNT(*) FROM vulnerabilities v WHERE v.advisory_id=a.id) AS vuln_count
       FROM advisories a WHERE a.source_id=$1 ORDER BY a.released DESC NULLS LAST`,
    [id]
  );
  return c.json(rows);
});

/**
 * Import direct d'un fichier CSAF (collé en JSON dans le body).
 * body: { name, csaf: <objet CSAF> }  — advisory unique OU feed.
 */
sources.post('/upload', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.csaf) return c.json({ error: 'champ "csaf" requis' }, 400);

  const [src] = await query<any>(
    `INSERT INTO sources (name, source_type, last_status)
     VALUES ($1,'file','en cours') RETURNING *`,
    [body.name || 'Import manuel']
  );

  const result = await ingestPayload(body.csaf, src.id);
  await query(
    `UPDATE sources SET advisory_count=$1, last_synced=now(), last_status=$2 WHERE id=$3`,
    [result.count, result.message, src.id]
  );
  await rematchAll();
  return c.json({ source: src, ...result }, 201);
});

/**
 * Ajout d'une source par URL (feed ROLIE / advisory unique) + synchro.
 * body: { name, url }
 */
sources.post('/fetch', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.url) return c.json({ error: 'url requise' }, 400);

  const [src] = await query<any>(
    `INSERT INTO sources (name, url, source_type, last_status)
     VALUES ($1,$2,'feed','en cours') RETURNING *`,
    [body.name || body.url, body.url]
  );

  try {
    const json = await fetchJson(body.url);
    const result = await ingestPayload(json, src.id);
    await query(
      `UPDATE sources SET advisory_count=$1, last_synced=now(), last_status=$2 WHERE id=$3`,
      [result.count, result.message, src.id]
    );
    await rematchAll();
    return c.json({ source: src, ...result }, 201);
  } catch (e: any) {
    await query(`UPDATE sources SET last_status=$1 WHERE id=$2`, [
      `erreur: ${e.message}`,
      src.id,
    ]);
    return c.json({ error: e.message, source: src }, 502);
  }
});

/** Re-synchronise une source existante. */
sources.post('/:id/sync', requireAuth, async (c) => {
  const id = Number(c.req.param('id'));
  const [src] = await query<any>(`SELECT * FROM sources WHERE id=$1`, [id]);
  if (!src) return c.json({ error: 'introuvable' }, 404);
  if (!src.url) return c.json({ error: 'source sans URL' }, 400);
  try {
    const json = await fetchJson(src.url);
    const result = await ingestPayload(json, id);
    await query(
      `UPDATE sources SET advisory_count=$1, last_synced=now(), last_status=$2 WHERE id=$3`,
      [result.count, result.message, id]
    );
    await rematchAll();
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

sources.delete('/:id', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('user');
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  await query(`DELETE FROM sources WHERE id=$1`, [id]);
  await query(
    `INSERT INTO audit_logs(user_id, username, action, resource, resource_id, ip)
     VALUES($1,$2,'DELETE_SOURCE','source',$3,$4)`,
    [me.userId, me.username, String(id), ip]
  );
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */

export async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

/** Ingestion d'un payload : advisory unique ou feed (téléchargements multiples). */
export async function ingestPayload(
  json: any,
  sourceId: number
): Promise<{ count: number; message: string }> {
  if (isSingleAdvisory(json)) {
    const adv = parseCsafAdvisory(json);
    if (!adv) return { count: 0, message: 'document CSAF non reconnu' };
    await ingestAdvisory(adv, sourceId);
    return { count: 1, message: `advisory ${adv.tracking_id} importé` };
  }

  // Sinon : feed / agrégateur -> on résout les URLs puis on télécharge
  const entries = resolveFeedEntries(json);
  if (!entries.length) return { count: 0, message: 'aucune entrée détectée' };

  let count = 0;
  for (const e of entries) {
    try {
      const doc = await fetchJson(e.url);
      if (isSingleAdvisory(doc)) {
        const adv = parseCsafAdvisory(doc);
        if (adv) {
          await ingestAdvisory(adv, sourceId);
          count++;
        }
      }
    } catch {
      /* on saute les entrées en erreur */
    }
  }
  return { count, message: `${count} advisories importés` };
}
