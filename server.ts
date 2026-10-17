import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import dotenv from 'dotenv';
import { createTaskStore } from './server/task-store.mjs';
import { createProspectBridge } from './server/prospect-bridge.mjs';
import { validateTarget } from './server/executor.mjs';
import { executeMission, selectWorkflow } from './server/mission-agent.mjs';
import { recordMission } from './astra/mission-ledger.mjs';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
app.use(express.json({ limit: '64kb' }));
const dataDir = path.resolve(process.env.GHOST_DATA_DIR || './data');
const store = createTaskStore({
  filePath: path.join(dataDir, 'ghost-tasks.json'),
  execute: executeMission
});
const prospectBridge = createProspectBridge({filePath:path.join(dataDir,'astra-prospect-campaigns.json'),taskStore:store});

// Access protection is mandatory if opting into a potentially metered LLM provider.
if (process.env.GHOST_AI_MODE === 'gemini' && !process.env.GHOST_ADMIN_TOKEN) {
  throw new Error('GHOST_ADMIN_TOKEN is required when Gemini mode is enabled');
}
app.use('/api/tasks', (req, res, next) => {
  const token = process.env.GHOST_ADMIN_TOKEN;
  if (!token || req.get('x-ghost-token') !== token) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

app.use('/api/prospect', (req, res, next) => {
  const token = process.env.GHOST_ADMIN_TOKEN;
  if (!token || req.get('x-ghost-token') !== token) return res.status(401).json({error:'Unauthorized'});
  res.set('Cache-Control','no-store');
  next();
});
const sales = (fn) => (req, res) => {
  try { const result=fn(req);res.json(result); }
  catch(error) {const message=String(error?.message||error);res.status(/not completed|no reviewable|duplicate_email/.test(message)?409:/not found/i.test(message)?404:400).json({error:message.slice(0,200)});}
};
app.get('/api/prospect/campaigns',sales(()=>prospectBridge.snapshot()));
app.post('/api/prospect/campaigns',sales(req=>prospectBridge.create(req.body)));
app.post('/api/prospect/campaigns/:id/sync',sales(req=>prospectBridge.syncDiscovery(req.params.id)));
app.post('/api/prospect/campaigns/:id/contacts',sales(req=>prospectBridge.importContacts(req.params.id,req.body)));
app.post('/api/prospect/campaigns/:id/prepare',sales(req=>prospectBridge.prepare(req.params.id)));
app.post('/api/prospect/campaigns/:id/approve',sales(req=>prospectBridge.approve(req.params.id,req.body?.confirmation)));
app.post('/api/prospect/campaigns/:id/suppress',sales(req=>prospectBridge.suppress(req.params.id,req.body?.email)));
app.post('/api/prospect/campaigns/:id/events',sales(req=>prospectBridge.event(req.params.id,req.body)));
app.get('/api/prospect/campaigns/:id/drafts',sales(req=>({drafts:prospectBridge.draftPreview(req.params.id)})));

app.post('/api/tasks', (req, res) => {
  try {
    validateTarget(req.body?.url);
    const workflow = selectWorkflow(req.body?.workflow);
    const task = store.add(req.body.url, req.body.goal, workflow);
    res.status(202).json({ taskId: task.id, status: task.status, workflow: task.workflow });
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
// Explicitly authenticated mission evidence endpoint; no unauthenticated writes.
app.post('/api/astra/missions', async (req, res) => {
  if (!process.env.GHOST_ADMIN_TOKEN || req.get('x-ghost-token') !== process.env.GHOST_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const mission = req.body;
  if (!mission || typeof mission.idea !== 'string' || !mission.idea.trim() ||
      typeof mission.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(mission.id) ||
      !mission.result || typeof mission.result !== 'object' || Array.isArray(mission.result)) {
    return res.status(400).json({ error: 'Invalid mission' });
  }
  try {
    const entry = await recordMission(path.join(dataDir, 'astra-missions.json'), mission);
    return res.status(201).json(entry);
  } catch (error: any) {
    return res.status(/duplicate/.test(error?.message || '') ? 409 : 500).json({ error: error?.message || 'Mission storage failed' });
  }
});
app.get('/api/astra/missions', async (req, res) => {
  if (!process.env.GHOST_ADMIN_TOKEN || req.get('x-ghost-token') !== process.env.GHOST_ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { readFile } = await import('node:fs/promises');
    const data = await readFile(path.join(dataDir, 'astra-missions.json'), 'utf8').then(JSON.parse).catch((e: any) => {
      if (e.code === 'ENOENT') return { schema: 1, missions: [] };
      throw e;
    });
    return res.json(data);
  } catch (error: any) { return res.status(500).json({ error: error?.message || 'Read failed' }); }
});
// Durable, restart-aware boot proof. Each boot creates a real mission using the same ledger as the API.
const selftest: any = { status: 'pending', bootId: randomUUID(), volume: dataDir };
async function runSelftest() {
  const file = path.join(dataDir, 'astra-selftest-missions.json');
  try {
    let previous: any = null;
    try {
      const history = JSON.parse(await readFile(file, 'utf8'));
      previous = history.missions?.at(-1) || null;
      if (previous) {
        const actual = createHash('sha256').update(JSON.stringify(previous.result)).digest('hex');
        if (actual !== previous.proofSha256) throw new Error('Previous mission SHA256 mismatch');
      }
    } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    const mission = { id: 'boot_' + selftest.bootId.replaceAll('-', ''), idea: 'Railway persistent mission boot proof', result: { bootId: selftest.bootId, marker: 'ASTRA_PERSISTENCE_PROOF_V1' } };
    const saved = await recordMission(file, mission);
    const history = JSON.parse(await readFile(file, 'utf8'));
    const recovered = history.missions.find((x: any) => x.id === saved.id);
    if (!recovered || recovered.proofSha256 !== saved.proofSha256) throw new Error('Mission write/read mismatch');
    Object.assign(selftest, { status: 'pass', currentMissionId: saved.id, currentSha256: saved.proofSha256, previousMissionId: previous?.id || null, previousSha256Verified: Boolean(previous), restartPersistenceVerified: Boolean(previous), missionCount: history.missions.length });
    console.log('ASTRA_SELFTEST ' + JSON.stringify(selftest));
  } catch (e: any) {
    Object.assign(selftest, { status: 'fail', error: e?.message || String(e) });
    console.error('ASTRA_SELFTEST ' + JSON.stringify(selftest));
  }
}
app.get('/api/astra/selftest', (_req, res) => res.status(selftest.status === 'fail' ? 503 : 200).json({ status: selftest.status, bootId: selftest.bootId, currentMissionId: selftest.currentMissionId, currentSha256: selftest.currentSha256, previousMissionId: selftest.previousMissionId, previousSha256Verified: selftest.previousSha256Verified, restartPersistenceVerified: selftest.restartPersistenceVerified, missionCount: selftest.missionCount, error: selftest.error }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    worker: 'server-side',
    agentWorkflows: ['site_audit', 'lead_research', 'web_research'],
    b2bCampaigns: 'review_only',
    b2bOutboundEnabled: false,
    tasks: store.status(),
    persistentVolumeConfigured: Boolean(process.env.GHOST_DATA_DIR),
    aiMode: process.env.GHOST_AI_MODE === 'gemini' ? 'gemini' : 'deterministic'
  });
});

async function boot() {
  await runSelftest();
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
