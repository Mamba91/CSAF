import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { runScan } from './scan.js';
import { uploadScan } from './upload.js';
import { createJob, getJob, updateJob, cancelJob, isCancelRequested } from './jobs.js';

const app = new Hono();

app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'] }));

app.get('/status', (c) => c.json({ ok: true, name: 'csaf-vuln-manager-agent' }));

app.post('/scan', async (c) => {
  const body = await c.req.json().catch(() => null);
  const range = (body?.range || '').toString().trim();
  const apiUrl = (body?.apiUrl || '').toString().trim();
  const token = (body?.token || '').toString().trim();
  if (!range || !apiUrl || !token) return c.json({ error: 'range, apiUrl et token requis' }, 400);

  const community = (body?.community || 'public').toString().trim();
  const concurrency = Number(body?.concurrency) || 20;
  const timeout = Number(body?.timeout) || 1500;
  const label = (body?.label || `Scan ${new Date().toISOString()}`).toString().trim();

  const job = createJob(range);

  (async () => {
    try {
      const found = await runScan(
        { range, community, concurrency, timeout },
        ({ total, scanned, found: foundCount }) => updateJob(job.id, { total, scanned, found: foundCount }),
        () => isCancelRequested(job.id)
      );
      if (isCancelRequested(job.id)) {
        updateJob(job.id, { status: 'cancelled' });
        return;
      }
      if (!found.length) {
        updateJob(job.id, { status: 'done' });
        return;
      }
      const scan = await uploadScan(apiUrl, token, range, label, found);
      updateJob(job.id, { status: 'done', scanId: scan.id });
    } catch (err: any) {
      updateJob(job.id, { status: 'error', error: err?.message || String(err) });
    }
  })();

  return c.json({ jobId: job.id }, 201);
});

app.get('/scan/:id', (c) => {
  const job = getJob(c.req.param('id'));
  if (!job) return c.json({ error: 'job introuvable' }, 404);
  return c.json(job);
});

app.post('/scan/:id/cancel', (c) => {
  const job = getJob(c.req.param('id'));
  if (!job) return c.json({ error: 'job introuvable' }, 404);
  cancelJob(job.id);
  return c.json({ ok: true });
});

// Permet à l'interface web d'arrêter l'agent à distance (bouton "Arrêter l'agent").
app.post('/shutdown', (c) => {
  setTimeout(() => process.exit(0), 200);
  return c.json({ ok: true });
});

const port = Number(process.env.PORT) || 5175;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[agent] serveur local prêt sur http://localhost:${info.port}`);
  console.log(`[agent] pilotez les scans depuis l'onglet "Découverte réseau" de l'application (renseignez cette URL comme adresse de l'agent).`);
});
