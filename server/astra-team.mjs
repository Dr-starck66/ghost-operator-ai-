/**
 * ASTRA MULTI-AGENTS Ω — private, read-only, restart-resumable orchestration.
 * Composes the EXISTING Ghost task queue, mission-agent and durable /data volume.
 * It never sends messages, publishes content, charges providers or changes DNS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateTarget } from './executor.mjs';
import { evaluateAstraPolicy } from './astra-conway-policy.mjs';

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

export function createAstraTeam({ filePath, taskStore, autoStart = true, tickMs = 2500, aiAnalyze = null, aiDailyLimit = 3 }) {
  if (!filePath || !taskStore?.add || !taskStore?.get || !taskStore?.list) throw Error('ASTRA team requires durable path and Ghost task store');
  if (aiAnalyze !== null && typeof aiAnalyze !== 'function') throw Error('AI analyzer must be a function');
  if (!Number.isInteger(aiDailyLimit) || aiDailyLimit < 0 || aiDailyLimit > 10) throw Error('Invalid AI daily budget');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  let missions = [];
  if (fs.existsSync(filePath)) {
    const restored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (restored?.version !== 1 || !Array.isArray(restored.missions)) throw Error('Invalid ASTRA team database: refusing overwrite');
    missions = restored.missions;
  }
  // Read-only recovery diagnostics: report only sanitized outcome codes, never prompts or API keys.
  const previousAiOutcomes = missions.filter(m => m.ai && ['FAIL', 'UNVERIFIED'].includes(m.ai.status))
    .slice(-5).map(m => ({ missionId: m.id, status: m.ai.status,
      reason: String(m.ai.reason || 'unknown').slice(0, 100), at: m.ai.checkedAt || null }));
  if (previousAiOutcomes.length) console.log('ASTRA_TEAM_AI_PREVIOUS_OUTCOMES ' + JSON.stringify(previousAiOutcomes));
  function save() {
    const tmp = filePath + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, missions }, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, filePath);
    } finally { if (fs.existsSync(tmp)) fs.rmSync(tmp); }
  }
  // An interrupted inference must not silently retry: provider usage may already have occurred.
  // We keep the attempt evidence and explicitly report UNVERIFIED after a restart.
  for (const m of missions) {
    if (m.ai?.status === 'running') {
      m.ai.status = 'UNVERIFIED';
      m.ai.reason = 'Inference interrupted by process restart; no automatic second provider call';
      m.updatedAt = new Date().toISOString();
      save();
    }
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
  // Explicit retry preserves the failed attempt for audit; max two retries, never unbounded.
  function retry(id) {
    const m = missions.find(x => x.id === id);
    if (!m || m.status !== 'failed') throw Error('Mission not failed or missing');
    if ((m.restartAttempts || 0) >= 2) throw Error('Retry limit reached');
    m.history ||= [];
    m.history.push({ status: m.status, audit: m.audit, steps: m.steps, at: new Date().toISOString() });
    m.restartAttempts = (m.restartAttempts || 0) + 1;
    m.status = 'pending'; m.cursor = 0; m.taskId = null; m.steps = []; m.audit = null;
    // Exclude all tasks of prior runs, otherwise idempotency recovery would reattach a FAILED task.
    m.failedTaskIds = taskStore.list().filter(t =>
      typeof t.goal === 'string' && t.goal.includes('[ASTRA_TEAM:' + m.id + ':')).map(t => t.id);
    m.retryAttempts = 0; m.nextAttemptAt = 0;
    append(m, 'Retry approved after recorded failure; previous proof preserved');
    return view(m);
  }
  function startAiAnalysis(m) {
    if (!aiAnalyze || m.ai?.status !== 'pending') return;
    const today = new Date().toISOString().slice(0, 10);
    const used = missions.filter(item => item.ai?.attemptedAt?.startsWith(today)).length;
    if (used >= aiDailyLimit) {
      m.ai = { status: 'SKIPPED', reason: 'ASTRA_AI_DAILY_LIMIT', quotaDate: today };
      append(m, 'AI SKIPPED: server-side daily quota reached; HTTP audit unaffected');
      return;
    }
    // Re-verify every source against the deterministic auditor before a model sees it.
    const evidence = m.steps.map(s => {
      const task = taskStore.get(s.taskId);
      if (!task || sha(task.result) !== s.resultSha256 || task.result?.evidenceSha256 !== s.evidenceSha256)
        return null;
      return {
        role: s.role, source: task.url, evidenceSha256: s.evidenceSha256,
        observedReport: JSON.stringify(task.result.report || {}).slice(0, 1900)
      };
    });
    if (evidence.includes(null)) {
      m.ai = { status: 'FAIL', reason: 'Evidence integrity changed before AI inference' };
      append(m, 'AI FAIL: referenced source evidence is no longer reproducible');
      return;
    }
    m.ai = { status: 'running', attemptedAt: new Date().toISOString(),
      provider: 'NVIDIA', model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
      evidenceProofSha256: m.audit.proofSha256 };
    append(m, 'AI running: one bounded private NVIDIA synthesis using verified HTTP findings');
    Promise.resolve().then(() => aiAnalyze({
      mission: { id: m.id, project: m.project, intent: m.intent, goal: m.goal },
      evidence, evidenceProofSha256: m.audit.proofSha256
    })).then(result => {
      if (m.ai?.status !== 'running') return;
      if (result?.status !== 'PASS' || typeof result.answer !== 'string' || !result.answer.trim())
        throw Error('INVALID_MODEL_OUTPUT');
      const answer = result.answer.slice(0, 5000);
      m.ai = { ...m.ai, status: 'PASS', answer,
        answerSha256: sha(answer), responseId: String(result.responseId || '').slice(0, 100),
        usage: result.usage || null, checkedAt: new Date().toISOString(),
        qualification: 'Model synthesis only; original HTTP observations are separately audited' };
      append(m, 'AI PASS: model response saved with a separate digest; evidence audit unchanged');
    }).catch(error => {
      if (m.ai?.status !== 'running') return;
      m.ai = { ...m.ai, status: 'FAIL',
        reason: (String(error?.code || (error?.message === 'INVALID_MODEL_OUTPUT' ? 'INVALID_MODEL_OUTPUT' : 'NVIDIA_INFERENCE_FAILED')) + (Number.isInteger(error?.httpStatus) ? '_' + error.httpStatus : '')).slice(0, 80),
        checkedAt: new Date().toISOString() };
      console.error('ASTRA_TEAM_AI_DIAG ' + JSON.stringify({ missionId: m.id, code: m.ai.reason }));
      append(m, 'AI FAIL: upstream or persistence error; deterministic evidence preserved');
    });
  }

  let ticking = false;
  function tick() {
    if (ticking) return;
    ticking = true;
    try {
      for (const m of missions.filter(x => x.status === 'pending' || x.status === 'running')) {
        if (m.nextAttemptAt && Date.now() < m.nextAttemptAt) continue;
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
              retainedFailedAttempts: (m.failedTaskIds || []).length + (m.history || []).length,
              proofSha256: sha(m.steps.map(s => [s.taskId, s.resultSha256, s.evidenceSha256])),
              qualification: 'Validated stored HTTP-extraction evidence, not business outcomes or search rankings' };
            m.status = 'completed';
            m.ai = { status: aiAnalyze ? 'pending' : 'disabled' };
            append(m, 'AUDITOR PASS: all underlying execution records cross-checked');
          }
          continue;
        }
        const policy = evaluateAstraPolicy({ workflow: WORKFLOW[role], estimatedCostUSD: 0, sideEffects: false });
        if (policy.action !== 'allow') {
          m.status = 'failed';
          m.audit = { status: 'FAIL', reason: 'ASTRA_POLICY_' + policy.reason };
          append(m, 'FAIL: rejected forbidden action ' + String(role));
          continue;
        }
        const taggedGoal = m.goal + ' [ASTRA_TEAM:' + m.id + ':' + m.cursor + ']';
        if (!m.taskId) {
          // Recover a task persisted just before an interrupted coordinator write.
          const existing = taskStore.list().find(t => t.goal === taggedGoal &&
            t.workflow === WORKFLOW[role] && !(m.failedTaskIds || []).includes(t.id));
          const task = existing || taskStore.add(m.url, taggedGoal, WORKFLOW[role], { maxCandidates: 5, noPaidAI: true });
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
          const error = String(task.error || 'Task failed').slice(0, 300);
          const transient = /No verified HTTP evidence|No public page could be fetched|timed?out|ECONN|network|ENOTFOUND|EAI_AGAIN/i.test(error);
          if (transient && (m.retryAttempts || 0) < 2) {
            m.failedTaskIds ||= [];
            m.failedTaskIds.push(m.taskId);
            m.retryAttempts = (m.retryAttempts || 0) + 1;
            m.nextAttemptAt = Date.now() + m.retryAttempts * 15000;
            m.taskId = null;
            append(m, 'PARTIAL: ' + role + ' transient HTTP failure; bounded retry ' + m.retryAttempts + '/2: ' + error);
            continue;
          }
          m.status = 'failed'; m.audit = { status: 'FAIL', reason: error };
          append(m, 'FAIL: ' + role + ' task failed: ' + error); continue;
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
        m.cursor++; m.taskId = null; m.nextAttemptAt = 0;
        append(m, 'PASS: ' + role + ' HTTP extraction recorded; next step queued');
      }
      // Synthesized model text never changes the deterministic evidence audit.
      for (const m of missions.filter(x => x.status === 'completed' && x.ai?.status === 'pending')) startAiAnalysis(m);
    } finally { ticking = false; }
  }
  const timer = autoStart ? setInterval(() => {
    try { tick(); } catch (e) { console.error('ASTRA_TEAM_TICK_FAILED', String(e?.message || e)); }
  }, tickMs) : null;
  if (timer) timer.unref();
  return {
    create, retry, list, get, tick, close: () => { if (timer) clearInterval(timer); },
    status: () => ({ mode: 'internal_read_only', outboundEnabled: false, publishingEnabled: false,
      liveLLMAgents: Boolean(aiAnalyze), provider: aiAnalyze ? 'NVIDIA_NEMOTRON' : null,
      aiSuccessfulMissions: missions.filter(m => m.ai?.status === 'PASS').length,
      missions: missions.length,
      completed: missions.filter(m => m.status === 'completed').length,
      failed: missions.filter(m => m.status === 'failed').length,
      running: missions.filter(m => ['running', 'pending'].includes(m.status)).length,
      storage: filePath, agents: aiAnalyze
        ? [...ASTRA_TEAM, { id: 'analyst', role: 'ASTRA NEMOTRON ANALYST', capability: 'nvidia_llm_synthesis', enabled: true }]
        : ASTRA_TEAM })
  };
}
