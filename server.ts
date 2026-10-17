import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import dotenv from 'dotenv';
import { createTaskStore } from './server/task-store.mjs';
import { executeExtraction, validateTarget } from './server/executor.mjs';
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
app.use(express.json({ limit: '64kb' }));
const dataDir = path.resolve(process.env.GHOST_DATA_DIR || './data');
const store = createTaskStore({
  filePath: path.join(dataDir, 'ghost-tasks.json'),
  execute: executeExtraction
});

// Access protection is mandatory if opting into a potentially metered LLM provider.
if (process.env.GHOST_AI_MODE === 'gemini' && !process.env.GHOST_ADMIN_TOKEN) {
  throw new Error('GHOST_ADMIN_TOKEN is required when Gemini mode is enabled');
}
app.use('/api/tasks', (req, res, next) => {
  const token = process.env.GHOST_ADMIN_TOKEN;
  if (token && req.get('x-ghost-token') !== token) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

app.post('/api/tasks', (req, res) => {
  try {
    validateTarget(req.body?.url);
    const task = store.add(req.body.url, req.body.goal);
    res.status(202).json({ taskId: task.id, status: task.status });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Invalid task' });
  }
});
app.get('/api/tasks', (_req, res) => res.json(store.list()));
app.get('/api/tasks/:id', (req, res) => {
  const task = store.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    worker: 'server-side',
    tasks: store.status(),
    persistentVolumeConfigured: Boolean(process.env.GHOST_DATA_DIR),
    aiMode: process.env.GHOST_AI_MODE === 'gemini' ? 'gemini' : 'deterministic'
  });
});

async function boot() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log('Ghost Operator server worker listening on port ' + PORT);
    if (!process.env.GHOST_DATA_DIR) console.warn('GHOST_DATA_DIR not configured: mount a persistent volume for restart-safe hosting');
  });
}
boot().catch(error => { console.error(error); process.exitCode = 1; });
