/**
 * ASTRA MULTI-AGENTS Ω — private, read-only, restart-resumable orchestration.
 * Composes the EXISTING Ghost task queue, mission-agent and durable /data volume.
 * It never sends messages, publishes content, charges providers or changes DNS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateTarget } from './executor.mjs';

export const ASTRA_TEAM = Object.freeze([
  { id: 'commander', role: 'ASTRA COMMANDER', capability: 'coordination', enabled: true },
  { id: 'research', role: 'ASTRA RESEARCH', capability: 'web_research', enabled: true },
  { id: 'seo', role: 'ASTRA SEO', capability: 'site_audit', enabled: true },
  { id: 'prospect', role: 'ASTRA PROSPECT', capability: 'lead_research', enabled: true },
  { id: 'auditor', role: 'ASTRA AUDITOR', capability: 'evidence_verification', enabled: true },
  { id: 'builder', role: 'ASTRA BUILDER', capability: 'not_connected', enabled: false },
  { id: 'robotics', role: 'ASTRA ROBOTICS', capability: 'not_connected', enabled: false },
  { id: 'watchdog', role: 'ASTRA WATCHDOG', capability: 'not_connected', enabled: false }
]);
const PLANS = Object.freeze({
  seo: ['research', 'seo'],
  prospection: ['research', 'prospect'],
  research: ['research']
});
const WORKFLOW = Object.freeze({ research: 'web_research', seo: 'site_audit', prospect: 'lead_research' });
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function createAstraTeam({ filePath, taskStore, autoStart = true, tickMs = 2500 }) {
  if (!filePath || !taskStore?.add || !taskStore?.get || !taskStore?.list) throw Error('ASTRA team requires durable path and Ghost task store');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let missions = [];
  if (fs.existsSync(filePath)) {
    const restored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (restored?.version !== 1 || !Array.isArray(restored.missions)) throw Error('Invalid ASTRA team database: refusing overwrite');
    missions = restored.missions;
  }
  function save() {
    const tmp = filePath + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, missions }, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, filePath);
    } finally { if (fs.existsSync(tmp)) fs.rmSync(tmp); }
  }
  function view(m) { return structuredClone(m); }
  function list() { return missions.map(view).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  function get(id) { const m = missions.find(x => x.id === id); return m ? view(m) : null; }
  function append(m, event) {
    m.events.push({ at: new Date().toISOString(), event });
    if (m.events.length > 100) m.events.splice(0, m.events.length - 100);
    m.updatedAt = new Date().toISOString();
    save();
    console.log('ASTRA_TEAM_EVENT ' + JSON.stringify({missionId:m.id,project:m.project,status:m.status,event}));
  }
  function create(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid team mission');
    const { project, intent, goal } = input;
    if (typeof project !== 'string' || !/^[a-z0-9][a-z0-9_-]{1,60}$/.test(project)) throw Error('Invalid project slug');
    if (!Object.hasOwn(PLANS, intent)) throw Error('Unsupported intent');
    if (typeof goal !== 'string' || !goal.trim() || goal.length > 1600) throw Error('Invalid goal');
    const url = validateTarget(input.url).href;
    const key = sha({ project, intent, goal: goal.trim(), url });
    const duplicate = missions.find(m => m.idempotencyKey === key);
    if (duplicate) return { ...view(duplicate), deduplicated: true };
    if (missions.length >= 100) throw Error('ASTRA team capacity reached');
    const now = new Date().toISOString();
    const mission = { id: 'team_' + randomUUID(), project, intent, goal: goal.trim(), url, idempotencyKey: key,
      status: 'pending', scope: 'internal_read_only', plan: [...PLANS[intent]], cursor: 0,
      taskId: null, steps: [], events: [], createdAt: now, updatedAt: now };
    missions.push(mission);
    try { append(mission, 'Mission persisted; outbound/publishing disabled'); }
    catch (e) { missions = missions.filter(m => m !== mission); throw e; }
    return view(mission);
  }
  let ticking = false;
  function tick() {
    if (ticking) return;
    ticking = true;
    try {
      for (const m of missions.filter(x => x.status === 'pending' || x.status === 'running')) {
        const role = m.plan[m.cursor];
        if (!role) {
          const verified = m.steps.length === m.plan.length && m.steps.every(s => {
            const task = taskStore.get(s.taskId);
            return task?.status === 'completed' && task.result?.status === 'completed' &&
              sha(task.result) === s.resultSha256 && task.result.evidenceSha256 === s.evidenceSha256;
          });
          if (!verified) {
            m.status = 'failed';
            m.audit = { status: 'FAIL', reason: 'Underlying task evidence missing or changed' };
            append(m, 'AUDITOR FAIL: evidence not reproducible from stored task');
          } else {
            m.audit = { status: 'PASS', verifiedTasks: m.steps.length,
              proofSha256: sha(m.steps.map(s => [s.taskId, s.resultSha256, s.evidenceSha256])),
              qualification: 'Validated stored HTTP-extraction evidence, not business outcomes or search rankings' };
            m.status = 'completed';
            append(m, 'AUDITOR PASS: all underlying execution records cross-checked');
          }
          continue;
        }
        const taggedGoal = m.goal + ' [ASTRA_TEAM:' + m.id + ':' + m.cursor + ']';
        if (!m.taskId) {
          // Recover a task persisted just before an interrupted coordinator write.
          const existing = taskStore.list().find(t => t.goal === taggedGoal && t.workflow === WORKFLOW[role]);
          const task = existing || taskStore.add(m.url, taggedGoal, WORKFLOW[role], { maxCandidates: 5 });
          m.taskId = task.id;
          m.status = 'running';
          append(m, (existing ? 'Recovered' : 'Scheduled') + ' ' + role + ' task ' + task.id);
          continue;
        }
        const task = taskStore.get(m.taskId);
        if (!task) {
          m.status = 'failed'; m.audit = { status: 'FAIL', reason: 'Task record missing' };
          append(m, 'FAIL: missing child task ' + m.taskId); continue;
        }
        if (task.status === 'failed') {
          m.status = 'failed'; m.audit = { status: 'FAIL', reason: String(task.error || 'Task failed').slice(0, 300) };
          append(m, 'FAIL: ' + role + ' task failed'); continue;
        }
        if (task.status !== 'completed') continue;
        const result = task.result;
        if (result?.status !== 'completed' || result.workflow !== WORKFLOW[role] ||
            !/^[a-f0-9]{64}$/.test(result.evidenceSha256 || '') ||
            !(result.pagesVisited > 0)) {
          m.status = 'failed'; m.audit = { status: 'FAIL', reason: 'Missing verified HTTP extraction evidence' };
          append(m, 'FAIL: malformed ' + role + ' task result'); continue;
        }
        m.steps.push({ role, workflow: WORKFLOW[role], taskId: task.id, status: 'PASS',
          evidenceSha256: result.evidenceSha256, resultSha256: sha(result),
          pagesVisited: result.pagesVisited, completedAt: result.completedAt,
          potentialMatches: result.report?.potentialMatches ?? null,
          unverified: result.report?.unverified ?? null,
          totalIssues: result.report?.totalIssues ?? null });
        m.cursor++; m.taskId = null;
        append(m, 'PASS: ' + role + ' HTTP extraction recorded; next step queued');
      }
    } finally { ticking = false; }
  }
  const timer = autoStart ? setInterval(() => {
    try { tick(); } catch (e) { console.error('ASTRA_TEAM_TICK_FAILED', String(e?.message || e)); }
  }, tickMs) : null;
  if (timer) timer.unref();
  return {
    create, list, get, tick, close: () => { if (timer) clearInterval(timer); },
    status: () => ({ mode: 'internal_read_only', outboundEnabled: false, publishingEnabled: false,
      liveLLMAgents: false, missions: missions.length,
      completed: missions.filter(m => m.status === 'completed').length,
      failed: missions.filter(m => m.status === 'failed').length,
      running: missions.filter(m => ['running', 'pending'].includes(m.status)).length,
      storage: filePath, agents: ASTRA_TEAM })
  };
}
