import express from 'express';
import path from 'node:path';
import https from 'node:https';
import dns from 'node:dns';
import { timingSafeEqual } from 'node:crypto';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { createStore, extractSite, publicIPv4, validateTarget } from './operator-core.mjs';

dotenv.config();

const production = process.env.NODE_ENV === 'production';
const username = process.env.GHOST_OPERATOR_USER || '';
const password = process.env.GHOST_OPERATOR_PASSWORD || '';
if (production && (!username || !password)) {
  throw new Error('Production requires GHOST_OPERATOR_USER and GHOST_OPERATOR_PASSWORD. Refusing unauthenticated public access.');
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12kb' }));
app.use((req, res, next) => {
  if (!username || !password) return next(); // For local development only.
  const header = req.headers.authorization || '';
  const expected = Buffer.from(username + ':' + password).toString('base64');
  const supplied = header.startsWith('Basic ') ? header.slice(6) : '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length === right.length && timingSafeEqual(left, right)) return next();
  res.setHeader('WWW-Authenticate', 'Basic realm="Ghost Operator"');
  return res.status(401).json({ error: 'Authentication required.' });
});

const store = createStore(path.join(process.env.GHOST_OPERATOR_DATA_DIR || path.join(process.cwd(), 'data'), 'tasks.json'));
store.recover();

// Validate actual DNS addresses at socket connection time. IPv4-only until IPv6 is safely handled.
const safeAgent = new https.Agent({
  keepAlive: false,
  lookup(hostname, options, callback) {
    dns.lookup(hostname, { family: 4, all: true }, (err, addresses) => {
      if (err) return callback(err, '', 4);
      if (!addresses.length || addresses.some(entry => !publicIPv4(entry.address))) {
        return callback(new Error('Target resolved to a non-public address.'), '', 4);
      }
      callback(null, addresses[0].address, 4);
    });
  },
});

async function fetchPublicPage(input: string) {
  const url = validateTarget(input);
  const response = await axios.get<string>(url, {
    httpsAgent: safeAgent,
    proxy: false,
    maxRedirects: 0,
    timeout: 12000,
    maxContentLength: 1_000_000,
    responseType: 'text',
    headers: { 'User-Agent': 'GhostOperator/1.0 (bounded public HTML extraction)', Accept: 'text/html' },
  });
  const type = String(response.headers['content-type'] || '').toLowerCase();
  if (!type.includes('text/html')) throw new Error('Only HTML documents are supported.');
  const $ = cheerio.load(response.data);
  const links: string[] = [];
  $('a[href]').slice(0, 500).each((_, element) => {
    const href = $(element).attr('href');
    if (href) links.push(href);
  });
  const title = $('title').first().text().trim();
  $('script,style,svg,iframe,noscript').remove();
  const textContent = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 10_000);
  return { title, textContent, links };
}

let busy = false;
async function processQueue() {
  if (busy) return;
  busy = true;
  try {
    while (true) {
      const task = store.list().reverse().find(item => item.status === 'pending');
      if (!task) break;
      try {
        store.patch(task.id, { status: 'running' }, '[START] Server-side extraction started.');
        const result = await extractSite(task, fetchPublicPage, message => store.patch(task.id, {}, message));
        store.patch(task.id, { status: 'completed', result }, '[COMPLETE] Evidence saved; goal coverage recorded separately.');
      } catch (error: any) {
        store.patch(task.id, { status: 'failed' }, '[ERROR] ' + String(error.message || error).slice(0, 250));
      }
    }
  } finally {
    busy = false;
  }
}

app.post('/api/tasks', (req, res) => {
  const { url, goal } = req.body || {};
  if (typeof goal !== 'string' || !goal.trim() || goal.length > 1000) {
    return res.status(400).json({ error: 'A goal of up to 1000 characters is required.' });
  }
  try {
    const task = store.add(url, goal.trim());
    void processQueue(); // No browser tab or paid scheduler required.
    return res.status(202).json({ taskId: task.id, status: 'pending' });
  } catch (error: any) {
    return res.status(400).json({ error: String(error.message || error) });
  }
});

app.get('/api/tasks', (_req, res) => res.json(store.list()));
app.get('/api/tasks/:id', (req, res) => {
  const task = store.get(req.params.id);
  return task ? res.json(task) : res.status(404).json({ error: 'Task not found.' });
});
// Intentionally no arbitrary-URL /api/scrape or client-controlled status override.
app.get('/api/health', (_req, res) => res.json({ service: 'ghost-operator', status: 'ready', autonomous_queue: true, paid_ai_calls: false }));

async function startServerInner() {
  if (!production) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1');
  app.listen(port, host, () => {
    console.log('Ghost Operator listening on ' + host + ':' + port + ' (durable server queue).');
    void processQueue(); // Recovery of tasks interrupted by a restart.
  });
}

startServerInner().catch(error => { console.error(error); process.exitCode = 1; });
