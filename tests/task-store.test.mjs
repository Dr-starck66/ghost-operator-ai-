import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTaskStore } from '../server/task-store.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await tick(); }
  throw new Error('Timed out waiting for actual execution');
}
function db() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-store-test-'));
  return { filePath: path.join(dir, 'data.json'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('job runs on server without browser, persists result across restart', async t => {
  const { filePath, cleanup } = db(); t.after(cleanup);
  let ran = 0;
  const worker = createTaskStore({
    filePath, execute: async (task, log) => { ran++; log('Executed real callback on server'); return { result: task.goal }; }
  });
  const created = worker.add('https://example.org/page', 'extract title');
  await until(() => worker.get(created.id)?.status === 'completed');
  assert.equal(ran, 1);
  assert.deepEqual(worker.get(created.id).result, { result: 'extract title' });
  worker.close();
  const restarted = createTaskStore({ filePath, execute: async () => { throw Error('Must not rerun completed'); } });
  assert.equal(restarted.get(created.id).status, 'completed');
  assert.equal(restarted.get(created.id).result.result, 'extract title');
  restarted.close();
});

test('interrupted running task is resumed after restart', async t => {
  const { filePath, cleanup } = db(); t.after(cleanup);
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, tasks: [{
    id: 'task-interrupted', url: 'https://example.org', goal: 'resume', status: 'running',
    createdAt: 1, logs: []
  }] }));
  let runs = 0;
  const worker = createTaskStore({ filePath, execute: async () => { runs++; return { recovered: true }; } });
  await until(() => worker.get('task-interrupted')?.status === 'completed');
  assert.equal(runs, 1);
  assert.equal(worker.get('task-interrupted').result.recovered, true);
  worker.close();
});

test('failing tasks fail closed; unsafe schemes are rejected', async t => {
  const { filePath, cleanup } = db(); t.after(cleanup);
  const worker = createTaskStore({ filePath, execute: async () => { throw new Error('no real result'); } });
  assert.throws(() => worker.add('file:///etc/passwd', 'read'), /HTTP/);
  const created = worker.add('https://example.org', 'fail');
  await until(() => worker.get(created.id)?.status === 'failed');
  assert.match(worker.get(created.id).error, /no real result/);
  worker.close();
});
