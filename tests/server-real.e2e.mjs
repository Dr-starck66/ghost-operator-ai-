import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const APP = resolve('dist/server.cjs');
const delay = ms => new Promise(r => setTimeout(r, ms));

async function vacantPort() {
  const socket = createServer();
  await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port;
  await new Promise(r => socket.close(r));
  return port;
}

test('actual compiled Express: authenticated real extraction and durable restart', { timeout: 90_000 }, async () => {
  const port = await vacantPort();
  const dir = mkdtempSync(join(tmpdir(), 'ghost-server-e2e-'));
  const username = 'ghost-test';
  const password = randomBytes(24).toString('hex');
  const headers = { Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64') };
  const endpoint = 'http://127.0.0.1:' + port;
  let worker;
  let stderr = '';

  async function launch() {
    worker = spawn(process.execPath, [APP], {
      cwd: process.cwd(),
      env: {
        ...process.env, NODE_ENV: 'production', PORT: String(port),
        HOST: '127.0.0.1', GHOST_OPERATOR_USER: username,
        GHOST_OPERATOR_PASSWORD: password, GHOST_OPERATOR_DATA_DIR: dir
      }, stdio: ['ignore', 'pipe', 'pipe']
    });
    worker.stderr.on('data', part => { stderr += part.toString(); });
    for (let i = 0; i < 80; i++) {
      await delay(100);
      if (worker.exitCode !== null) throw new Error('Server exited: ' + stderr);
      try {
        if ((await fetch(endpoint + '/api/health', { headers })).status === 200) return;
      } catch { /* startup not complete */ }
    }
    throw new Error('Server did not start: ' + stderr);
  }
  async function stop() {
    if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
    const ended = new Promise(r => worker.once('exit', r));
    worker.kill('SIGKILL');
    await ended;
  }

  try {
    await launch();
    assert.equal((await fetch(endpoint + '/api/tasks')).status, 401);
    assert.equal((await fetch(endpoint + '/api/tasks', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://127.0.0.1/', goal: 'Reject private IP' })
    })).status, 400);
    const created = await fetch(endpoint + '/api/tasks', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/', goal: 'Extract external links' })
    });
    assert.equal(created.status, 202);
    const { taskId } = await created.json();
    assert.ok(taskId);
    let before = null;
    for (let i = 0; i < 150; i++) {
      before = await (await fetch(endpoint + '/api/tasks/' + taskId, { headers })).json();
      if (before.status === 'completed' || before.status === 'failed') break;
      await delay(200);
    }
    assert.equal(before?.status, 'completed', JSON.stringify(before?.logs?.slice(-3)));
    assert.ok(before.result.pages_fetched >= 1);
    assert.match(before.result.pages[0].title, /Example Domain/);
    await stop(); // Forcefully terminate the *actual compiled Express service*.
    await launch();
    const after = await (await fetch(endpoint + '/api/tasks/' + taskId, { headers })).json();
    assert.equal(after.id, before.id);
    assert.equal(after.status, 'completed');
    assert.deepEqual(after.result, before.result);
    assert.ok(after.logs.length >= before.logs.length);
  } finally {
    await stop();
  }
});
