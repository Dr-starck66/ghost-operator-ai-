import test from 'node:test';
import assert from 'node:assert/strict';
import { TASKS, runPairedArena, taskFingerprint } from '../server/astra-arena-inkling-benchmark.mjs';

const runners={
  nemotron: async ({taskId})=>({answer:JSON.stringify(TASKS.find(t=>t.id===taskId).expected)}),
  inkling: async ({taskId})=>({answer:JSON.stringify(TASKS.find(t=>t.id===taskId).expected)}),
};
const config={liveEnabled:true,freeEntitlements:{nemotron:true,inkling:true},runners};
test('opt-in exports exactly 16 bounded public synthetic responses for ASTRA HG',async()=>{
 const result=await runPairedArena({...config,emitPublicTranscripts:true});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.liveCalls,16);
 assert.deepEqual(Object.keys(result.publicSyntheticTranscripts),['nemotron','inkling']);
 for(const name of ['nemotron','inkling']){
  const attempts=result.publicSyntheticTranscripts[name];
  assert.equal(attempts.length,8);
  assert.deepEqual(attempts.map(x=>x.taskId),TASKS.map(x=>x.id));
  assert.deepEqual(attempts.map(x=>x.promptSha256),TASKS.map(taskFingerprint));
  assert.equal(result.models.find(x=>x.name===name).score.correct,8);
 }
});
test('default runner does not disclose raw transcripts',async()=>{
 const result=await runPairedArena(config);
 assert.equal(result.publicSyntheticTranscripts,undefined);
});
test('non-reference tasks are rejected before any runner call',async()=>{
 let calls=0;
 const runner=async()=>{calls++;return{answer:'{}'}};
 await assert.rejects(
  ()=>runPairedArena({runners:{nemotron:runner,inkling:runner},freeEntitlements:{nemotron:true,inkling:true},liveEnabled:true,emitPublicTranscripts:true,tasks:TASKS.slice(0,1)}),
  /ONLY_REFERENCE_PUBLIC_TASKS_MAY_BE_EXPORTED/
 );
 assert.equal(calls,0);
});
test('no entitlement does not produce transcripts or calls',async()=>{
 let calls=0;
 const runner=async()=>{calls++;return{answer:'{}'}};
 const result=await runPairedArena({runners:{nemotron:runner,inkling:runner},freeEntitlements:{nemotron:false,inkling:true},liveEnabled:true,emitPublicTranscripts:true});
 assert.equal(result.liveCalls,0);
 assert.equal(result.status,'UNVERIFIED');
 assert.equal(result.publicSyntheticTranscripts,undefined);
 assert.equal(calls,0);
});
