import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { bootstrap } from './db.js';
import { projects } from './routes/projects.js';
import { sources } from './routes/sources.js';
import { search } from './routes/search.js';
import { advisories } from './routes/advisories.js';
import { vulnerabilities, dashboard } from './routes/vulnerabilities.js';
import { auth } from './routes/auth.js';
import { users } from './routes/users.js';
import { auditlogs } from './routes/auditlogs.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'] }));

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));

app.route('/api/auth', auth);
app.route('/api/users', users);
app.route('/api/audit-logs', auditlogs);
app.route('/api/projects', projects);
app.route('/api/sources', sources);
app.route('/api/search', search);
app.route('/api/advisories', advisories);
app.route('/api/vulnerabilities', vulnerabilities);
app.route('/api/dashboard', dashboard);

app.onError((err, c) => {
  console.error('[error]', err);
  return c.json({ error: err.message || 'erreur serveur' }, 500);
});

const port = Number(process.env.PORT) || 4000;

bootstrap()
  .then(() => {
    serve({ fetch: app.fetch, port }, (info) => {
      console.log(`[api] http://localhost:${info.port}`);
    });
  })
  .catch((e) => {
    console.error('[fatal] bootstrap impossible:', e);
    process.exit(1);
  });
