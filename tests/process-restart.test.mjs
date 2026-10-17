import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const storeModule = fileURLToPath(new URL('../server/task-store.mjs', import.meta.url));
const subprocess = String.raw`
import assert from 'node:assert/strict';
const { createTaskStore } = await import(process.argv[1]);
const filePath = process.argv[2];
const mode = process.argv[3];
const wait = async check => {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Worker did not reach desired state');
};
if (mode === 'write') {
  const store = createTaskStore({ filePath, execute: async t => ({ observedGoal: t.goal, proof: 'executed in process one' }) });
  const task = store.add('https://example.org', 'durable across real process restart');
  await wait(() => store.get(task.id)?.status === 'completed');
  console.log(JSON.stringify({ id: task.id, status: store.get(task.id).status }));
} else if (mode === 'read') {
  const store = createTaskStore({ filePath, execute: async () => { throw Error('Should not rerun completed job'); } });
  const tasks = store.list();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].status, 'completed');
  assert.equal(tasks[0].result.proof, 'executed in process one');
  console.log(JSON.stringify({ id: tasks[0].id, persisted: true }));
} else if (mode === 'interrupt') {
  const store = createTaskStore({ filePath, execute: async () => new Promise(() => {}) });
  const task = store.add('https://example.org', 'survive interrupted worker');
  await wait(() => store.get(task.id)?.status === 'running');
  console.log(JSON.stringify({ id: task.id, status: 'running' }));
} else if (mode === 'recover') {
  const store = createTaskStore({ filePath, execute: async () => ({ recovered: true }) });
  await wait(() => store.list()[0]?.status === 'completed');
  assert.equal(store.list()[0].result.recovered, true);
  assert.match(store.list()[0].logs.join(' '), /Recovered interrupted task/);
  console.log(JSON.stringify({ id: store.list()[0].id, recovered: true }));
} else throw Error('Unknown mode');
`;

function run(filePath, mode) {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', subprocess, storeModule, filePath, mode], {
    encoding: 'utf8', timeout: 10000
  }).trim().split('\n').at(-1));
}

test('actual separate OS processes preserve completed job without replay', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-real-restart-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'tasks.json');
  const first = run(file, 'write');
  const second = run(file, 'read');
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'completed');
  assert.equal(second.persisted, true);
});

test('new OS process resumes interrupted running task after worker exits', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-real-recovery-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'tasks.json');
  const first = run(file, 'interrupt');
  const second = run(file, 'recover');
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'running');
  assert.equal(second.recovered, true);
});
