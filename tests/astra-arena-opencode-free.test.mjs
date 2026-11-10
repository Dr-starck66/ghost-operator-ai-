import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {makeOpenCodeInklingRunner,INKLING_FREE_MODEL} from '../server/astra-arena-opencode-free.mjs';
import {runPairedArena,TASKS} from '../server/astra-arena-inkling-benchmark.mjs';

test('fixed free OpenCode identifier, no account or paid fallback',()=>{
  assert.equal(INKLING_FREE_MODEL,'opencode/inkling-2-small-free');
  assert.throws(()=>makeOpenCodeInklingRunner({binary:'opencode;curl x'}),/UNSAFE_BINARY/);
  assert.throws(()=>makeOpenCodeInklingRunner({timeoutMs:1000000}),/INVALID_TIMEOUT/);
});
test('isolated OpenCode CLI only, public prompt and all tools denied',async()=>{
  let temp=null;let inspected=false;
  const runner=makeOpenCodeInklingRunner({execute:async(binary,args,options)=>{
    temp=options.cwd;
    assert.equal(binary,'opencode');
    assert.deepEqual(args,['run','--model',INKLING_FREE_MODEL,'Public test 12']);
    const config=JSON.parse(await readFile(path.join(temp,'opencode.json'),'utf8'));
    assert.equal(config.permission,'deny');
    assert.deepEqual(config.permissions,[{action:'*',resource:'*',effect:'deny'}]);
    assert.equal(options.shell,false);
    assert.equal(options.env.HOME,temp);
    assert.equal(options.env.OPENCODE_API_KEY,undefined);
    assert.equal(options.maxBuffer,65536);
    inspected=true;
    return {stdout:'{"x":12}\n'};
  }});
  const r=await runner({prompt:'Public test 12'});
  assert.equal(r.answer,'{"x":12}');assert.equal(inspected,true);
  await assert.rejects(()=>access(temp));
});
test('errors are redacted and temp directory is still removed',async()=>{
  let tmp;
  const runner=makeOpenCodeInklingRunner({execute:async(_b,_a,opt)=>{tmp=opt.cwd;throw Error('secret stderr')}});
  await assert.rejects(()=>runner({prompt:'public'}),e=>e.message==='INKLING_FREE_CLI_UNAVAILABLE_OR_FAILED');
  await assert.rejects(()=>access(tmp));
});
test('no execution at all without verified BOTH-model free entitlement',async()=>{
  let calls=0;
  const fake=makeOpenCodeInklingRunner({execute:async()=>{calls++;return {stdout:'{}'}}});
  const r=await runPairedArena({runners:{inkling:fake,nemotron:async()=>{calls++}},liveEnabled:true,freeEntitlements:{inkling:false,nemotron:true},tasks:TASKS.slice(0,1)});
  assert.equal(r.liveCalls,0);assert.equal(calls,0);
});

test('geo-restricted provider result yields stable non-retryable error without leaking text',async()=>{
  let calls=0;
  const runner=makeOpenCodeInklingRunner({execute:async()=>{calls++;const e=new Error('CLI failed');e.stderr='Error: This model is not available in your country — internal diagnostic';throw e;}});
  await assert.rejects(()=>runner({prompt:'public, no secrets'}),e=>e.message==='INKLING_GEO_RESTRICTED_NO_RETRY');
  assert.equal(calls,1);
});
