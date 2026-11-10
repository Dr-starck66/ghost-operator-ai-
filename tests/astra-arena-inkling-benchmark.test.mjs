import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TASKS,MODELS,promptFor,taskFingerprint,scoreTranscript,runPairedArena,makeExistingNemotronRunner} from '../server/astra-arena-inkling-benchmark.mjs';
const exact=(task,output=JSON.stringify(task.expected))=>({taskId:task.id,promptSha256:taskFingerprint(task),output});

test('suite: unique IDs, deterministic fingerprints, three domains',()=>{
  assert.equal(TASKS.length,8);
  assert.equal(new Set(TASKS.map(x=>x.id)).size,TASKS.length);
  assert.equal(new Set(TASKS.map(x=>x.domain)).size,4);
  for (const t of TASKS) {assert.equal(taskFingerprint(t).length,64);assert.match(promptFor(t),new RegExp(t.id))}
  assert.match(MODELS.inkling,/Inkling 2 Small/);
});
test('complete exact JSON answers score 8/8 only in local TEST DOUBLE',()=>{
  const result=scoreTranscript(TASKS.map(t=>exact(t)));
  assert.equal(result.correct,8);assert.equal(result.total,8);assert.equal(result.accuracyPct,100);
});
test('wrong, invalid JSON, missing, and extra keys never score',()=>{
  const result=scoreTranscript([exact(TASKS[0],'{"submit":["/fr/paris"],"extra":true}'),exact(TASKS[1],'```json\n{}\n```'),exact(TASKS[2],'{"build_passed":true,"proof":"PASS"}')]);
  assert.equal(result.correct,0);assert.equal(result.total,8);
  assert.equal(result.rows[0].status,'INCORRECT');assert.equal(result.rows[1].status,'INVALID_JSON');assert.equal(result.rows[3].status,'MISSING');
});
test('prompt fingerprint mismatch invalidates captured answer',()=>{
  const a=exact(TASKS[0]);a.promptSha256='wrong';
  assert.equal(scoreTranscript([a]).rows[0].status,'PROMPT_MISMATCH');
});
test('duplicate attempts and unknown tasks fail closed',()=>{
  assert.throws(()=>scoreTranscript([exact(TASKS[0]),exact(TASKS[0])]),/DUPLICATE_ATTEMPT/);
  assert.throws(()=>scoreTranscript([{taskId:'missing'}]),/UNKNOWN_TASK_ID/);
});
test('zero-cost gate blocks every provider call if even one model lacks free entitlement',async()=>{
  let calls=0; const runner=async()=>{calls++;return {answer:'{}'}};
  const a=await runPairedArena({liveEnabled:true,freeEntitlements:{nemotron:true,inkling:false},runners:{nemotron:runner,inkling:runner}});
  assert.equal(a.status,'UNVERIFIED');assert.equal(a.liveCalls,0);assert.equal(calls,0);
  const b=await runPairedArena({liveEnabled:false,freeEntitlements:{nemotron:true,inkling:true},runners:{nemotron:runner,inkling:runner}});
  assert.equal(b.liveCalls,0);assert.equal(calls,0);
});
test('paired runtime gives same task and prompt to both test double runners',async()=>{
  let calls=0; const prompts=[];
  const mk=name=>async args=>{calls++;prompts.push([name,args.taskId,args.promptSha256,args.prompt]);return {answer:JSON.stringify(TASKS.find(x=>x.id===args.taskId).expected),responseId:`mock-${name}-${args.taskId}`}};
  const result=await runPairedArena({liveEnabled:true,freeEntitlements:{nemotron:true,inkling:true},runners:{nemotron:mk('nemotron'),inkling:mk('inkling')}});
  assert.equal(result.status,'PARTIAL');assert.equal(result.liveCalls,16);assert.equal(calls,16);
  assert.equal(result.models[0].score.correct,8);assert.equal(result.models[1].score.correct,8);
  for(let i=0;i<prompts.length;i+=2) assert.deepEqual(prompts[i].slice(1),prompts[i+1].slice(1));
  assert.match(result.reason,/INDEPENDENT/);
});
test('a failing runner never turns missing output into success',async()=>{
  const good=async({taskId})=>({answer:JSON.stringify(TASKS.find(t=>t.id===taskId).expected)});
  const result=await runPairedArena({tasks:TASKS.slice(0,2),liveEnabled:true,freeEntitlements:{nemotron:true,inkling:true},runners:{nemotron:good,inkling:async()=>{throw new Error('external secret')}}});
  assert.equal(result.models[0].score.correct,2);assert.equal(result.models[1].score.correct,0);
  assert.doesNotMatch(JSON.stringify(result),/external secret/);
});
test('existing Nemotron adapter still validates key before sending network',async()=>{
  let calls=0;const runner=makeExistingNemotronRunner({fetchImpl:async()=>{calls++;throw Error('should not call')}});
  await assert.rejects(()=>runner({prompt:'some test'}),/NVIDIA_NOT_CONFIGURED/);
  assert.equal(calls,0);
});
