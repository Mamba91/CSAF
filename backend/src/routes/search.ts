import { Hono } from 'hono';
import { query } from '../db.js';
import { VENDOR_REGISTRY, resolveFeedEntries } from '../csaf/feeds.js';
import { fetchJson, ingestPayload } from './sources.js';
import { rematchAll } from '../lib/match.js';

export const search = new Hono();

/** Liste des constructeurs préconfigurés. */
search.get('/vendors', (c) => c.json(VENDOR_REGISTRY));

/**
 * Explore un constructeur ou une URL : renvoie la liste des advisories
 * disponibles (titre + url) sans rien importer.
 * query: ?vendor=siemens  OU  ?url=https://...
 */
search.get('/browse', async (c) => {
  const vendorKey = c.req.query('vendor');
  let url = c.req.query('url');

  if (vendorKey) {
    const v = VENDOR_REGISTRY.find((x) => x.key === vendorKey);
    if (!v) return c.json({ error: 'constructeur inconnu' }, 404);
    url = v.url;
  }
  if (!url) return c.json({ error: 'vendor ou url requis' }, 400);

  try {
    const json = await fetchJson(url);
    let entries = resolveFeedEntries(json);

    // provider-metadata -> on suit le 1er feed pour lister les advisories
    const looksLikeProvider =
      Array.isArray(json?.distributions) && entries.length;
    if (looksLikeProvider) {
      const feedUrl = entries[0].url;
      try {
        const feed = await fetchJson(feedUrl);
        const feedEntries = resolveFeedEntries(feed);
        if (feedEntries.length) entries = feedEntries;
      } catch {
        /* on garde les entrées provider */
      }
    }
    return c.json({ url, total: entries.length, entries });
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

/** Recherche plein-texte locale dans les advisories déjà importés. */
search.get('/local', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json([]);
  const like = `%${q}%`;
  const rows = await query(
    `SELECT DISTINCT a.id, a.tracking_id, a.title, a.publisher, a.released
       FROM advisories a
       LEFT JOIN vulnerabilities v ON v.advisory_id = a.id
      WHERE a.title ILIKE $1 OR a.tracking_id ILIKE $1
         OR a.publisher ILIKE $1 OR v.cve ILIKE $1
      ORDER BY a.released DESC NULLS LAST
      LIMIT 100`,
    [like]
  );
  return c.json(rows);
});

/**
 * Importe une sélection d'advisories trouvés via /browse.
 * body: { name, urls: string[] }
 */
search.post('/import', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!Array.isArray(body?.urls) || !body.urls.length)
    return c.json({ error: 'urls requis' }, 400);

  const [src] = await query<any>(
    `INSERT INTO sources (name, url, source_type, vendor, last_status)
     VALUES ($1,$2,'vendor',$3,'en cours') RETURNING *`,
    [body.name || 'Import recherche', body.urls[0], body.vendor || '']
  );

  let count = 0;
  for (const u of body.urls) {
    try {
      const doc = await fetchJson(u);
      const r = await ingestPayload(doc, src.id);
      count += r.count;
    } catch {
      /* skip */
    }
  }
  await query(
    `UPDATE sources SET advisory_count=$1, last_synced=now(), last_status=$2 WHERE id=$3`,
    [count, `${count} importés`, src.id]
  );
  await rematchAll();
  return c.json({ source: src, count }, 201);
});

/** Étape 1 de l'import séquentiel : crée la source. */
search.post('/create-source', async (c) => {
  const body = await c.req.json().catch(() => null);
  const [src] = await query<any>(
    `INSERT INTO sources (name, url, source_type, vendor, last_status)
     VALUES ($1,$2,'vendor',$3,'en cours') RETURNING id`,
    [body?.name || 'Import recherche', body?.url || '', body?.vendor || '']
  );
  return c.json({ source_id: src.id });
});

/** Étape 2 : importe un advisory par URL dans la source donnée. */
search.post('/import-url', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.url || !body?.source_id) return c.json({ ok: false, count: 0 });
  try {
    const doc = await fetchJson(body.url);
    const r = await ingestPayload(doc, Number(body.source_id));
    return c.json({ ok: true, count: r.count });
  } catch {
    return c.json({ ok: false, count: 0 });
  }
});

/** Étape 3 : finalise l'import (update source + recorrélation). */
search.post('/finalize-source', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.source_id) return c.json({ error: 'source_id requis' }, 400);
  const count = Number(body.count) || 0;
  await query(
    `UPDATE sources SET advisory_count=$1, last_synced=now(), last_status=$2 WHERE id=$3`,
    [count, `${count} importés`, body.source_id]
  );
  await rematchAll();
  return c.json({ ok: true });
});
