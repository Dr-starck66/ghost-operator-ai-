import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TASKS, promptFor, taskFingerprint} from '../server/astra-arena-inkling-benchmark.mjs';
import {OPENROUTER_MODEL,OPENROUTER_MODELS_URL,OPENROUTER_CHAT_URL,probeFreeModelCatalog,makeOpenRouterFreeRunner} from '../server/astra-arena-openrouter-free.mjs';
const key='sk-or-v1-'+'x'.repeat(64); // synthetic, NOT a real credential
const proof={status:'PASS_FREE_CATALOG',modelId:OPENROUTER_MODEL,checkedAt:'2026-11-10T00:00:00.000Z',prices:{prompt:'0',completion:'0'},inferenceAllowed:false};
const authorization={officialProviderConfirmed:true,euStandardEndpointPermitted:true,writtenReference:'SUPPORT_CONFIRMATION_00001'};
const task=t=>({prompt:promptFor(t),promptSha256:taskFingerprint(t),taskId:t.id});
const now=()=>Date.parse('2026-11-10T00:05:00Z');
function runner(options={}){return makeOpenRouterFreeRunner({apiKey:key,authorization,freeCatalogProof:proof,acceptedResearchDataTerms:true,now,...options})}

test('catalog exact $0 model is visible, but visibility never enables inference',async()=>{
  let calls=0;
  const result=await probeFreeModelCatalog({checkedAt:proof.checkedAt,fetchImpl:async(url,opts)=>{calls++;assert.equal(url,OPENROUTER_MODELS_URL);assert.equal(opts.method,'GET');return {status:200,json:async()=>({data:[{id:OPENROUTER_MODEL,pricing:{prompt:'0',completion:'0'}}]})}}});
  assert.equal(calls,1);assert.equal(result.status,'PASS_FREE_CATALOG');assert.equal(result.inferenceAllowed,false);
});
test('a priced or unknown price model fails closed',async()=>{
  const p=async(price)=>probeFreeModelCatalog({fetchImpl:async()=>({status:200,json:async()=>({data:[{id:OPENROUTER_MODEL,pricing:price}]})})});
  assert.equal((await p({prompt:'0',completion:'0.02'})).status,'FAIL');
  assert.equal((await p({prompt:'0'})).status,'FAIL');
  assert.equal((await p({prompt:0,completion:0})).status,'PASS_FREE_CATALOG');
});
test('wrong model or inaccessible catalog never counts as available',async()=>{
  const a=await probeFreeModelCatalog({fetchImpl:async()=>({status:200,json:async()=>({data:[{id:'thinkingmachines/inkling-small:free',pricing:{prompt:'0',completion:'0'}}]})})});
  const b=await probeFreeModelCatalog({fetchImpl:async()=>({status:503})});
  assert.equal(a.status,'UNVERIFIED');assert.equal(b.status,'UNVERIFIED');
});
test('EU eligibility absent means 0 model calls, even with an existing key',async()=>{
  let n=0;const fetchImpl=async()=>{n++;throw Error('network not permitted')};
  await assert.rejects(()=>runner({authorization:{}}) (task(TASKS[0])),/EU_AUTHORIZATION_NOT_CONFIRMED/);
  assert.equal(n,0);
});
test('terms acceptance missing means 0 model calls',async()=>{
  let n=0;
  await assert.rejects(()=>runner({acceptedResearchDataTerms:false,fetchImpl:async()=>{n++}})(task(TASKS[0])),/RESEARCH_DATA_TERMS_NOT_ACCEPTED/);
  assert.equal(n,0);
});
test('expired or missing zero-cost metadata means 0 model calls',async()=>{
  let n=0;
  await assert.rejects(()=>runner({freeCatalogProof:null,fetchImpl:async()=>{n++}})(task(TASKS[0])),/NO_FRESH_FREE_PRICE_PROOF/);
  await assert.rejects(()=>runner({now:()=>Date.parse('2026-11-10T02:00:00Z'),fetchImpl:async()=>{n++}})(task(TASKS[0])),/NO_FRESH_FREE_PRICE_PROOF/);
  assert.equal(n,0);
});
test('only unchanged ASTRA ARENA public prompts can be sent',async()=>{
  let calls=0;
  await assert.rejects(()=>runner({fetchImpl:async()=>{calls++}})({prompt:'secrets',taskId:TASKS[0].id,promptSha256:taskFingerprint(TASKS[0])}),/ONLY_SYNTHETIC_ARENA_TASKS_ALLOWED/);
  assert.equal(calls,0);
});
test('no key available in same runtime means 0 model calls',async()=>{
  let calls=0;
  await assert.rejects(()=>runner({apiKey:undefined,fetchImpl:async()=>{calls++}})(task(TASKS[0])),/RUNTIME_KEY_MISSING/);
  assert.equal(calls,0);
});
test('only free model exact ID, synthetic task and no paid fallback on a mocked request',async()=>{
  let sent=0;const r=runner({fetchImpl:async(url,opts)=>{sent++;assert.equal(url,OPENROUTER_CHAT_URL);assert.equal(opts.method,'POST');
    const body=JSON.parse(opts.body);assert.equal(body.model,'thinkingmachines/inkling-2-small:free');assert.equal(body.messages[1].content,promptFor(TASKS[0]));assert.equal(body.provider.allow_fallbacks,false);assert.equal(body.max_tokens,128);assert.deepEqual(body.usage,{include:true});
    return {status:200,json:async()=>({id:'gen_123',model:OPENROUTER_MODEL,choices:[{message:{content:'{"submit":["/fr/paris"]}'}}],usage:{cost:0}})};
  }});
  const answer=await r(task(TASKS[0]));assert.equal(sent,1);assert.equal(answer.answer,'{"submit":["/fr/paris"]}');assert.equal(answer.costVerified,true);
});
test('403, wrong-model and nonzero reported cost are hard failures',async()=>{
  const t=task(TASKS[0]);
  await assert.rejects(()=>runner({fetchImpl:async()=>({status:403})})(t),/ACCESS_DENIED_NO_RETRY/);
  await assert.rejects(()=>runner({fetchImpl:async()=>({status:200,json:async()=>({model:'paid-model',choices:[{message:{content:'hi'}}]})})})(t),/WRONG_MODEL/);
  await assert.rejects(()=>runner({fetchImpl:async()=>({status:200,json:async()=>({model:OPENROUTER_MODEL,choices:[{message:{content:'{}'}}],usage:{cost:0.01}})})})(t),/NONZERO_COST_REPORTED/);
});
test('timeouts/network failures do not leak key or retry',async()=>{
  let calls=0;
  await assert.rejects(()=>runner({fetchImpl:async()=>{calls++;throw Error('sk-or-v1-real-secret')}})(task(TASKS[0])),e=>e.message==='OPENROUTER_NETWORK_OR_TIMEOUT_NO_RETRY');
  assert.equal(calls,1);
});
