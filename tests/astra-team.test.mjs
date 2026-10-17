import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAstraTeam } from '../server/astra-team.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-team-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const tasks = [];
  const store = {
    add(url, goal, workflow, options = {}) {
      const task = { id: 'task_' + (tasks.length + 1), url, goal, workflow, noPaidAI: options.noPaidAI === true, status: 'pending' };
      tasks.push(task);
      return structuredClone(task);
    },
    list: () => structuredClone(tasks),
    get: id => structuredClone(tasks.find(t => t.id === id) || null),
    complete(id) {
      const task = tasks.find(t => t.id === id);
      task.status = 'completed';
      task.result = { status: 'completed', workflow: task.workflow,
        pagesVisited: 2, evidenceSha256: 'a'.repeat(64), completedAt: '2026-10-17T23:00:00Z',
        report: { potentialMatches: 0, unverified: 2, totalIssues: 1 } };
    },
    fail(id, reason = 'HTTP 503') { const task = tasks.find(t => t.id === id); task.status = 'failed'; task.error = reason; },
    tamper(id) { const task = tasks.find(t => t.id === id); task.result.pagesVisited = 100; }
  };
  const filePath = path.join(dir, 'team.json');
  return { store, filePath, make: () => createAstraTeam({ filePath, taskStore: store, autoStart: false }) };
}
const input = { project: 'wine_else', intent: 'seo', goal: 'Auditer les pages vin Occitanie', url: 'https://else.wine/' };

test('real existing Ghost workflows are delegated sequentially; auditor cross-checks durable evidence', t => {
  const f = fixture(t), team = f.make();
  const m = team.create(input);
  assert.equal(m.status, 'pending');
  assert.equal(team.create(input).deduplicated, true);
  team.tick();
  assert.equal(f.store.list().length, 1);
  assert.equal(f.store.list()[0].workflow, 'web_research');
  assert.equal(f.store.list()[0].noPaidAI, true);
  f.store.complete(f.store.list()[0].id);
  team.tick(); team.tick();
  assert.equal(f.store.list().length, 2);
  assert.equal(f.store.list()[1].workflow, 'site_audit');
  assert.equal(f.store.list()[1].noPaidAI, true);
  f.store.complete(f.store.list()[1].id);
  team.tick(); team.tick();
  const done = team.get(m.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.audit.status, 'PASS');
  assert.equal(done.audit.verifiedTasks, 2);
  assert.match(done.audit.proofSha256, /^[0-9a-f]{64}$/);
  assert.equal(team.status().outboundEnabled, false);
  assert.equal(team.status().publishingEnabled, false);
  assert.equal(f.store.list().length, 2);
  team.close();
});

test('restart resumes from persisted workflow, without duplicate child task', t => {
  const f = fixture(t), first = f.make();
  const m = first.create({ ...input, intent: 'prospection' });
  first.tick();
  const child = f.store.list()[0].id;
  first.close();
  const second = f.make();
  assert.equal(second.get(m.id).taskId, child);
  second.tick();
  assert.equal(f.store.list().length, 1);
  f.store.complete(child);
  second.tick(); second.tick();
  assert.equal(f.store.list()[1].workflow, 'lead_research');
  f.store.complete(f.store.list()[1].id);
  second.tick(); second.tick();
  assert.equal(second.get(m.id).audit.status, 'PASS');
  second.close();
});

test('negative controls reject unsafe targets, unknown skills and invalid budget-free plans', t => {
  const f = fixture(t), team = f.make();
  assert.throws(() => team.create({ ...input, url: 'http://127.0.0.1/admin' }), /Private IP/);
  assert.throws(() => team.create({ ...input, url: 'file:///etc/passwd' }), /Unsafe target/);
  assert.throws(() => team.create({ ...input, intent: 'send_emails' }), /Unsupported intent/);
  assert.throws(() => team.create({ ...input, project: '../tmp' }), /Invalid project/);
  assert.equal(f.store.list().length, 0);
  team.close();
});

test('failed underlying HTTP missions are FAIL and no subsequent agent runs', t => {
  const f = fixture(t), team = f.make();
  const m = team.create(input);
  team.tick(); f.store.fail(f.store.list()[0].id); team.tick();
  assert.equal(team.get(m.id).status, 'failed');
  assert.equal(team.get(m.id).audit.status, 'FAIL');
  team.tick();
  assert.equal(f.store.list().length, 1);
  team.close();
});

test('auditor detects evidence mutation and refuses fabricated PASS', t => {
  const f = fixture(t), team = f.make();
  const m = team.create({ ...input, intent: 'research' });
  team.tick(); const id = f.store.list()[0].id;
  f.store.complete(id);
  team.tick(); f.store.tamper(id); team.tick();
  assert.equal(team.get(m.id).status, 'failed');
  assert.equal(team.get(m.id).audit.status, 'FAIL');
  team.close();
});

test('corrupted persistent state is not silently erased', t => {
  const f = fixture(t);
  fs.writeFileSync(f.filePath, '{"version":999,"missions":[]}');
  assert.throws(() => f.make(), /refusing overwrite/);
  assert.equal(JSON.parse(fs.readFileSync(f.filePath)).version, 999);
});

test('failed mission recovers without replaying old failed task; failure stays in history', t => {
  const f = fixture(t), team = f.make();
  const m = team.create({ ...input, intent: 'research' });
  team.tick();
  const first = f.store.list()[0].id;
  f.store.fail(first); team.tick();
  assert.equal(team.get(m.id).status, 'failed');
  const repaired = team.retry(m.id);
  assert.equal(repaired.restartAttempts, 1);
  assert.equal(repaired.history[0].status, 'failed');
  team.tick();
  assert.equal(f.store.list().length, 2);
  assert.notEqual(f.store.list()[1].id, first);
  f.store.complete(f.store.list()[1].id);
  team.tick(); team.tick();
  const done = team.get(m.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.audit.status, 'PASS');
  assert.equal(done.audit.retainedFailedAttempts, 2);
  team.close();
});


test('empty public-page extraction retains failure and schedules only a bounded retry', t => {
  const f = fixture(t), team = f.make();
  const mission = team.create({ ...input, intent: 'research' });
  team.tick();
  const firstId = f.store.list()[0].id;
  f.store.fail(firstId, 'No public page could be fetched: extraction not completed');
  team.tick();
  const current = team.get(mission.id);
  assert.equal(current.status, 'running');
  assert.equal(current.retryAttempts, 1);
  assert.ok(current.failedTaskIds.includes(firstId));
  assert.ok(current.nextAttemptAt > Date.now());
  assert.equal(f.store.list().length, 1);
  assert.equal(current.audit, undefined);
  team.close();
});


test('Conway policy refuses a tampered persisted plan before creating any child task', t => {
  const f = fixture(t);
  const first = f.make();
  const m = first.create({ ...input, intent: 'research' });
  first.close();
  const stored = JSON.parse(fs.readFileSync(f.filePath, 'utf8'));
  stored.missions[0].plan = ['spawn_child'];
  fs.writeFileSync(f.filePath, JSON.stringify(stored));
  const second = f.make();
  second.tick();
  const denied = second.get(m.id);
  assert.equal(denied.status, 'failed');
  assert.equal(denied.audit.status, 'FAIL');
  assert.match(denied.audit.reason, /WORKFLOW_NOT_ALLOWED/);
  assert.equal(f.store.list().length, 0);
  second.close();
});
