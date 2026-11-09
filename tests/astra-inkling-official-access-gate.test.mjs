import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SOURCES, analyzeHuggingFaceStatus, analyzeOpenCodeEuPolicy, officialPreflight} from '../server/astra-inkling-official-access-gate.mjs';
const modelJson=(more={})=>JSON.stringify({id:'thinkingmachines/Inkling-2-Small',cardData:{license:'apache-2.0'},siblings:[{rfilename:'model-00001.safetensors'}],...more});
const restrictedHtml='<p>Inkling 2 Small Free is free on OpenCode for a limited time. It’s not available in the European Union, Iceland, Liechtenstein.</p><p>Crouton Alpha Free</p>';

test('404 of exact official model is not published, not a success',()=>{
  assert.equal(analyzeHuggingFaceStatus(404,'').status,'NOT_PUBLISHED');
});
test('older official Inkling-Small does not count as second generation',()=>{
  assert.equal(analyzeHuggingFaceStatus(200,modelJson({id:'thinkingmachines/Inkling-Small'})).evidence,'WRONG_REPOSITORY_ID');
});
test('weights metadata needs exact repo AND Apache 2.0 AND weights',()=>{
  assert.equal(analyzeHuggingFaceStatus(200,modelJson()).status,'PUBLIC_WEIGHTS_METADATA_PASS');
  assert.equal(analyzeHuggingFaceStatus(200,modelJson({cardData:{license:'other'}})).evidence,'LICENSE_NOT_APACHE_2_0');
  assert.equal(analyzeHuggingFaceStatus(200,modelJson({siblings:[{rfilename:'README.md'}]})).evidence,'NO_PUBLIC_WEIGHT_FILES_IN_METADATA');
});
test('malformed or unknown HTTP is never pass',()=>{
  assert.equal(analyzeHuggingFaceStatus(500,'').status,'UNVERIFIED');
  assert.equal(analyzeHuggingFaceStatus(200,'bad json').status,'UNVERIFIED');
});
test('OpenCode official EU prohibition detected',()=>{
  assert.equal(analyzeOpenCodeEuPolicy(200,restrictedHtml).status,'BLOCKED_EU');
});
test('policy missing or different model restriction is NOT authorization',()=>{
  assert.equal(analyzeOpenCodeEuPolicy(200,'Other model does not allow Europe').status,'UNVERIFIED');
  assert.equal(analyzeOpenCodeEuPolicy(200,'Inkling 2 Small Free is free on OpenCode. Crouton Alpha Free is not available in the European Union').status,'UNVERIFIED');
  assert.equal(analyzeOpenCodeEuPolicy(503,'').status,'UNVERIFIED');
});
test('preflight contacts only two fixed official read-only URLs, NEVER inference',async()=>{
  const urls=[];
  const fetchFn=async(url,options)=>{urls.push(url);assert.equal(options.method,'GET');
    return {status: url===SOURCES.model?404:200,headers:{get:()=>null},text:async()=>url===SOURCES.model?'':restrictedHtml};
  };
  const report=await officialPreflight({fetchFn,now:'2026-11-10T00:00:00Z'});
  assert.deepEqual(urls,[SOURCES.model,SOURCES.opencode]);
  assert.equal(report.inferenceAllowed,false);assert.equal(report.weights.status,'NOT_PUBLISHED');
  assert.equal(report.euFreeAccess.status,'BLOCKED_EU');
  assert.equal(report.checkedAt,'2026-11-10T00:00:00Z');
});
test('network errors fail closed with explicit unknown status',async()=>{
  const report=await officialPreflight({fetchFn:async()=>{throw Error('network blocked')}});
  assert.equal(report.inferenceAllowed,false);
  assert.equal(report.weights.status,'UNVERIFIED');
  assert.equal(report.euFreeAccess.status,'UNVERIFIED');
});
