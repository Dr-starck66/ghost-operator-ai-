import test from 'node:test';
import assert from 'node:assert/strict';
import { createOsintService, searchOsintCatalog, validateOsintDomain } from '../server/astra-osint.mjs';

const sample = { type: 'folder', name: 'OSINT Framework', children: [
  {type: 'folder', name:'Domain Name', children:[
    {type:'url', name:'Free Passive Whois', url:'https://who.is/', status:'live', pricing:'free',opsec:'passive'},
    {type:'url', name:'IP logger', url:'https://grabify.link/', status:'live', pricing:'free',opsec:'active'},
    {type:'url', name:'Paid domain service', url:'https://paid.example/', status:'live', pricing:'paid',opsec:'passive'},
    {type:'url', name:'Local scanner', url:'https://scan.example/', status:'live', pricing:'free',opsec:'passive',localInstall:true}
  ]},
  {type:'folder', name:'Business Records', children:[
    {type:'url',name:'Registry',url:'https://www.gov.uk/get-information-about-a-company',status:'live',pricing:'free',opsec:'passive'}
  ]}
]};

test('validates public domains and rejects IPs, local hosts, URLs and abuse inputs', () => {
  assert.equal(validateOsintDomain(' EXAMPLE.COM. '), 'example.com');
  assert.equal(validateOsintDomain('münchen.de'), 'xn--mnchen-3ya.de');
  for(const value of ['http://example.com','127.0.0.1','localhost','x.local','example.test','a..com','a.com:443','evil.com/foo','host_name.com'])
    assert.throws(() => validateOsintDomain(value));
});

test('filters paid, active, locally installed and URL-bad entries, preserves negatives', () => {
  const a = searchOsintCatalog(sample,{category:'domain'});
  assert.equal(a.total,1);
  assert.equal(a.tools[0].url,'https://who.is/');
  assert.equal(searchOsintCatalog(sample,{category:'business'}).total,1);
  assert.equal(searchOsintCatalog(sample,{category:'domain',query:'not present'}).total,0);
  assert.throws(() => searchOsintCatalog(sample,{category:'people'}),/INVALID_CATEGORY/);
});

test('catalog single-flight fetch, no target leakage, retained cache', async () => {
  let calls = [];
  const svc=createOsintService({fetchImpl:async (url,opts)=>{calls.push([url,opts.method]);return {
    ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(sample)
  };},clock:()=>1000});
  const [a,b]=await Promise.all([svc.catalog({category:'domain'}),svc.catalog({category:'business'})]);
  assert.equal(calls.length,1);
  assert.equal(a.total,1);assert.equal(b.total,1);
  await svc.catalog({category:'domain'});
  assert.equal(calls.length,1);
});

test('DNS report retains failures, grounded observations, hash, no active scans', async () => {
  const svc=createOsintService({fetchImpl:async()=>{throw Error('unused')},
    clock:()=>Date.parse('2026-10-18T14:00:00Z'),
    resolverFactory:()=>({
      resolve4:async()=>['203.0.113.1'],
      resolveMx:async()=>{const e=new Error('not found');e.code='ENODATA';throw e},
      resolveNs:async()=>['ns1.example.com'],
      resolveCaa:async()=>[]
    })});
  const report=await svc.domainReport('example.com');
  assert.equal(report.status,'PARTIAL');
  assert.equal(report.checkedCount,2);
  assert.equal(report.checks.find(x=>x.recordType==='MX').status,'UNVERIFIED');
  assert.match(report.proofSha256,/^[a-f0-9]{64}$/);
  assert.equal(svc.status().activeScansEnabled,false);
});
