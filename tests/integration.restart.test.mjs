import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./restart-fixture.mjs', import.meta.url));
async function boot(filename, delay) {
  const child = spawn(process.execPath,[fixture],{env:{...process.env,GHOST_TEST_STORE:filename,GHOST_TEST_DELAY:String(delay)},stdio:['ignore','pipe','pipe']});
  const port = await Promise.race([
    new Promise((resolve,reject)=>{
      let data='';
      child.stdout.on('data', chunk=>{
        data+=chunk.toString();
        const m=data.match(/PORT:(\d+)/);
        if(m)resolve(Number(m[1]));
      });
      child.on('exit',code=>reject(new Error('Server exited before startup '+code)));
    }),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server start timed out')),5000)),
  ]);
  return {child,url:'http://127.0.0.1:'+port};
}
async function waitCompleted(url,id,timeout=5000){
  const end=Date.now()+timeout;
  while(Date.now()<end){
    const t=await (await fetch(url+'/api/tasks/'+id)).json();
    if(t.status==='completed')return t;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('Task did not complete');
}
async function stop(child){
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited=new Promise(resolve=>child.once('exit',resolve));
  child.kill('SIGKILL');
  await exited;
}

test('task survives independent client closure, full process termination and restart', {timeout:20000},async()=>{
  const filename=join(mkdtempSync(join(tmpdir(),'ghost-restart-')),'tasks.json');
  let first=await boot(filename,180);
  let second;
  try {
    const created=await fetch(first.url+'/api/tasks',{method:'POST'}).then(r=>{assert.equal(r.status,202);return r.json()});
    // The initial HTTP client/response is fully closed; processing runs in another process.
    const task=await waitCompleted(first.url,created.taskId);
    assert.equal(task.result.pages_fetched,2);
    assert.equal(task.result.total_unique_external_links,1);
    await stop(first.child);
    second=await boot(filename,180);
    const retained=await (await fetch(second.url+'/api/tasks/'+created.taskId)).json();
    assert.equal(retained.status,'completed');
    assert.deepEqual(retained.result,task.result);
    assert.ok(retained.logs.some(line=>line.includes('Server completed')));
  }finally{await stop(first.child);if(second)await stop(second.child)}
});

test('interrupting an in-flight task requeues it for completion after server restart',{timeout:20000},async()=>{
  const filename=join(mkdtempSync(join(tmpdir(),'ghost-requeue-')),'tasks.json');
  const first=await boot(filename,4000);
  let second;
  try {
    const created=await fetch(first.url+'/api/tasks',{method:'POST'}).then(r=>r.json());
    await new Promise(r=>setTimeout(r,150));
    const running=await (await fetch(first.url+'/api/tasks/'+created.taskId)).json();
    assert.equal(running.status,'running');
    await stop(first.child);
    second=await boot(filename,20);
    const completed=await waitCompleted(second.url,created.taskId);
    assert.equal(completed.status,'completed');
    assert.ok(completed.logs.some(line=>line.includes('[RECOVERY]')));
  }finally{await stop(first.child);if(second)await stop(second.child)}
});
