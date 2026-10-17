import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAstraTeam } from '../server/astra-team.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-nemotron-team-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const records = [];
  const store = {
    add(url, goal, workflow) {
      const item = { id: 'task_' + (records.length + 1), url, goal, workflow, status: 'pending' };
      records.push(item); return structuredClone(item);
    },
    list: () => structuredClone(records),
    get: id => structuredClone(records.find(x => x.id === id) || null),
    complete() {
      const record = records.at(-1);
      record.status = 'completed';
      record.result = { status:'completed',workflow:record.workflow, pagesVisited:1,
        evidenceSha256:'a'.repeat(64), completedAt:new Date().toISOString(),
        report:{sources:[{url:record.url,title:'Verified HTML title',description:'Not ranked'}]} };
    }
  };
  const filePath = path.join(dir, 'team.json');
  const input = { project:'ghost_operator', intent:'research',
    goal:'Synthèse strictement fondée sur les faits HTML', url:'https://ghost-operator.example.org/' };
  return { store, filePath, input, make: options => createAstraTeam({filePath,taskStore:store,autoStart:false,...options}) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function completeDeterministic(team, fixture, id) {
  team.tick(); // create task
  fixture.store.complete();
  team.tick(); // record task
  team.tick(); // deterministic audit then optional AI
  assert.equal(team.get(id).status, 'completed');
  assert.equal(team.get(id).audit.status, 'PASS');
}

test('NVIDIA contribution is separate from evidence audit, persistent, and single-call', async t => {
  const f=fixture(t); let calls=0, lastContext;
  const analyze = async context => { calls++;lastContext=context;return {
    status:'PASS',answer:'Synthèse vérifiée à partir du rapport.',responseId:'nvidia-response',
    usage:{promptTokens:60,completionTokens:20} }; };
  const team=f.make({aiAnalyze:analyze});
  const mission=team.create(f.input);
  completeDeterministic(team,f,mission.id);
  await flush();
  const done=team.get(mission.id);
  assert.equal(done.ai.status,'PASS');
  assert.equal(done.audit.status,'PASS');
  assert.match(done.ai.answerSha256,/^[a-f0-9]{64}$/);
  assert.equal(lastContext.evidence[0].source,f.input.url);
  assert.equal(lastContext.evidenceProofSha256,done.audit.proofSha256);
  assert.equal(calls,1);
  team.tick();team.close();
  const reopened=f.make({aiAnalyze:analyze});
  assert.equal(reopened.get(mission.id).ai.status,'PASS');
  reopened.tick();await flush();
  assert.equal(calls,1);
  reopened.close();
});

test('provider failure retains independent HTTP PASS and never invents AI success', async t => {
  const f=fixture(t);
  const team=f.make({aiAnalyze:async () => {throw Object.assign(Error('private provider response'),{code:'PROVIDER_HTTP'});}});
  const mission=team.create(f.input);
  completeDeterministic(team,f,mission.id);
  await flush();
  const done=team.get(mission.id);
  assert.equal(done.audit.status,'PASS');
  assert.equal(done.ai.status,'FAIL');
  assert.equal(done.ai.reason,'PROVIDER_HTTP');
  assert.equal(done.ai.answer,undefined);
  assert.ok(!JSON.stringify(done).includes('private provider response'));
  team.close();
});

test('daily zero quota prevents any provider invocation', t => {
  const f=fixture(t);
  let called=false;
  const team=f.make({aiAnalyze:async () => {called=true;return {status:'PASS',answer:'not allowed'};},aiDailyLimit:0});
  const mission=team.create(f.input);
  completeDeterministic(team,f,mission.id);
  assert.equal(team.get(mission.id).ai.status,'SKIPPED');
  assert.equal(called,false);
  team.close();
});

test('interrupted provider call becomes UNVERIFIED on restart and is not repeated', async t => {
  const f=fixture(t);
  let calls=0;
  const team=f.make({aiAnalyze:() => { calls++;return new Promise(() => {}); }});
  const mission=team.create(f.input);
  completeDeterministic(team,f,mission.id);
  await flush();
  assert.equal(team.get(mission.id).ai.status,'running');
  team.close();
  const recovered=f.make({aiAnalyze:async () => {calls++;return {status:'PASS',answer:'not called'};}});
  assert.equal(recovered.get(mission.id).ai.status,'UNVERIFIED');
  recovered.tick();await flush();
  assert.equal(calls,1);
  assert.equal(recovered.get(mission.id).audit.status,'PASS');
  recovered.close();
});
