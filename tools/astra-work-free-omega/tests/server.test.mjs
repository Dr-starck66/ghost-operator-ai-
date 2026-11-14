import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication} from '../server.mjs';

async function withServer(fn,executeProject=async p=>({project:p,status:'PASS'}),token='A'.repeat(36)){
 const app=createApplication({projects:['freehotels','avocat'],executeProject,token,clock:()=>Date.parse('2026-11-14T19:30:00Z')});
 await new Promise(done=>app.server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+app.server.address().port;
 try{return await fn(app,base)}
 finally{await new Promise(done=>app.server.close(done))}
}
test('health proves server only',()=>withServer(async(_,base)=>{
 const r=await fetch(base+'/api/health'),j=await r.json();assert.equal(r.status,200);assert.equal(j.scope,'SERVER_REACHABLE_ONLY');
}));
test('public dashboard exists',()=>withServer(async(_,base)=>{
 const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/ASTRA WORK FREE/);
}));
test('no arbitrary server route',()=>withServer(async(_,base)=>{
 const r=await fetch(base+'/remote/cmd');assert.equal(r.status,404);
}));
test('write operations rejected',()=>withServer(async(_,base)=>{
 const r=await fetch(base+'/api/run',{method:'POST'});assert.equal(r.status,405);
}));
test('unauthenticated invocation rejected',()=>withServer(async(_,base)=>{
 const r=await fetch(base+'/api/run?project=freehotels');assert.equal(r.status,401);
}));
test('wrong auth token rejected',()=>withServer(async(_,base)=>{
 const r=await fetch(base+'/api/run?project=freehotels',{headers:{authorization:'Bearer invalid'}});assert.equal(r.status,401);
}));
test('arbitrary project rejected even with valid token',()=>withServer(async(_,base)=>{
 const r=await fetch(base+'/api/run?project=evil',{headers:{authorization:'Bearer '+'A'.repeat(36)}});assert.equal(r.status,400);
}));
test('authorized preset project executed',()=>withServer(async(_,base)=>{
 const r=await fetch(base+'/api/run?project=avocat',{headers:{authorization:'Bearer '+'A'.repeat(36)}});assert.equal(r.status,200);assert.equal((await r.json()).project,'avocat');
}));
test('cold-start cycle covers exact allowlist',()=>withServer(async(app,base)=>{
 const s=await app.runOnce();assert.equal(s.status,'PASS');assert.deepEqual(Object.keys(s.results),['freehotels','avocat']);
 const r=await fetch(base+'/api/status');assert.equal((await r.json()).status,'PASS');
}));
test('repeated cycles are deduplicated',()=>withServer(async app=>{
 const a=await app.runOnce(),b=await app.runOnce();assert.strictEqual(a,b);
}));
test('failure never transforms into PASS',()=>withServer(async(app,base)=>{
 await app.runOnce();const r=await fetch(base+'/api/status');assert.equal((await r.json()).status,'PARTIAL');
},async p=>{if(p==='avocat')throw Error('boom');return {status:'PASS'}}));
test('no token fails closed',async()=>{
 const a=createApplication({projects:['freehotels'],executeProject:async()=>({status:'PASS'}),token:''});
 await new Promise(done=>a.server.listen(0,'127.0.0.1',done));
 try{const r=await fetch('http://127.0.0.1:'+a.server.address().port+'/api/run?project=freehotels',{headers:{authorization:'Bearer '+'A'.repeat(36)}});assert.equal(r.status,401)}
 finally{await new Promise(done=>a.server.close(done))}
});
