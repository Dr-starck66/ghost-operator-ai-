import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGETS,listProjects,inspectTarget,runProject,VERSION} from '../runner.mjs';

const fixed=()=>new Date('2026-11-14T20:00:00.000Z');
const fetchFixture=(body,status=200,headers={})=>async()=>new Response(body,{status,headers});
const html='<!doctype html><html><head><title>Example</title></head><body>Healthy</body></html>';
const target=TARGETS.freehotels[0];
const run=(t,f)=>inspectTarget(t,{fetcher:f,now:fixed});

test('version and project allowlist',()=>{
  assert.equal(VERSION,'0.1.0');
  assert.deepEqual(listProjects(),['freehotels','avocat','gamicnews','wineelse']);
});
test('unknown project denies network',async()=>{
  const response=await runProject('evil.example',{fetcher:()=>{throw new Error('must not run')}});
  assert.equal(response.status,'FAIL');
  assert.equal(response.reason,'UNKNOWN_PROJECT');
});
test('synthetic target denies network',async()=>{
  let reached=false;
  const response=await inspectTarget({url:'https://localhost/'},{fetcher:async()=>{reached=true;return new Response(html)}});
  assert.equal(response.reason,'TARGET_NOT_PREAPPROVED');
  assert.equal(reached,false);
});
test('HTML PASS has narrowly defined proof and SHA',async()=>{
  const response=await run(target,fetchFixture(html));
  assert.equal(response.status,'PASS');
  assert.match(response.bodySha256,/^[0-9a-f]{64}$/);
  assert.equal(response.proofScope,'PUBLIC_HTTP_FORMAT_ONLY_NOT_DEPLOY_OR_SEO_SUCCESS');
});
test('meta robots noindex cannot PASS',async()=>{
  const response=await run(target,fetchFixture('<html><title>X</title><meta name="robots" content="noindex,nofollow">'));
  assert.equal(response.status,'PARTIAL');
  assert.equal(response.noindex,true);
});
test('x-robots-tag noindex cannot PASS',async()=>{
  const response=await run(target,fetchFixture(html,200,{'x-robots-tag':'noindex'}));
  assert.equal(response.reason,'NOINDEX_OBSERVED');
});
test('404 FAIL',async()=>{
  const response=await run(target,fetchFixture('404',404));
  assert.equal(response.status,'FAIL');
  assert.equal(response.httpStatus,404);
});
test('HTTP redirect is PARTIAL, never followed',async()=>{
  const response=await run(target,fetchFixture('',302,{location:'https://evil.example/'}));
  assert.equal(response.status,'PARTIAL');
});
test('network failure is UNVERIFIED',async()=>{
  const response=await run(target,async()=>{throw new Error('offline')});
  assert.equal(response.status,'UNVERIFIED');
  assert.equal(response.reason,'NETWORK_PROBE_ERROR');
});
test('valid robots.txt PASS',async()=>{
  const response=await run(TARGETS.freehotels[1],fetchFixture('User-agent: *\nDisallow:'));
  assert.equal(response.status,'PASS');
});
test('valid XML sitemap PASS',async()=>{
  const response=await run(TARGETS.freehotels[2],fetchFixture('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'));
  assert.equal(response.status,'PASS');
});
test('excessive content is bounded and PARTIAL',async()=>{
  const response=await run(target,fetchFixture('x'.repeat(140000)));
  assert.equal(response.status,'PARTIAL');
  assert.equal(response.reason,'BODY_EXCEEDS_128_KIB');
});
test('fake HTTP 200 with unrelated body never PASS',async()=>{
  const response=await run(target,fetchFixture('hello world'));
  assert.equal(response.status,'PARTIAL');
});
test('bounded preset executes exactly three HTTPS reads',async()=>{
  const seen=[];
  const result=await runProject('freehotels',{now:fixed,fetcher:async url=>{seen.push(url);return new Response(html)}});
  assert.equal(seen.length,3);
  assert.equal(result.results.length,3);
  assert.equal(result.boundaries.gitWrite,'NOT_CONNECTED');
  assert.equal(result.boundaries.storage,'NO_HOSTED_PERSISTENCE');
});
test('deterministic fingerprint for the same evidence',async()=>{
  const args={now:fixed,fetcher:fetchFixture(html)};
  const a=await runProject('freehotels',args),b=await runProject('freehotels',args);
  assert.equal(a.fingerprintSha256,b.fingerprintSha256);
  assert.match(a.fingerprintSha256,/^[a-f0-9]{64}$/);
});
test('failed and unverified steps prevent project PASS',async()=>{
  const result=await runProject('avocat',{now:fixed,fetcher:async url=>url.endsWith('/robots.txt')?new Response('blocked',{status:403}):new Response(html)});
  assert.equal(result.status,'PARTIAL');
  assert.equal(result.results.find(x=>x.id==='robots').status,'FAIL');
});
