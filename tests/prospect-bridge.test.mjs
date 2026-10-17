import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createProspectBridge} from '../server/prospect-bridge.mjs';
const input={
 name:'WINE ELSE USA',category:'wine',sector:'wine',seedUrl:'https://example.org/',
 goal:'Find wine importers and distributors',subject:'Wine collaboration — {{company}}',
 body:'Hello {{company}}, discussing Occitanie wines.',senderName:'WINE ELSE',maxCandidates:25
};
function make(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-sales-'));
 const calls=[];
 const taskStore={
  add(url,goal,workflow,opts){calls.push({url,goal,workflow,opts});return{id:'task-demo'};},
  get(){return {status:'completed',result:{workflow:'lead_research',report:{prospects:[
   {website:'https://buyer.example/',source:'https://example.org/',title:'Wine importer',
    verdict:'potential_match',score:2,evidence:[{url:'https://buyer.example/'}]},
   {website:'https://buyer.example/page',source:'https://example.org/',title:'duplicate domain',
    verdict:'unverified',score:0}
  ]}}};}
 };
 const filePath=path.join(dir,'campaigns.json');
 return{dir,filePath,taskStore,calls,bridge:createProspectBridge({filePath,taskStore})};
}
test('ASTRA integration discovers, deduplicates and persists independently of browser',t=>{
 const x=make();t.after(()=>fs.rmSync(x.dir,{recursive:true,force:true}));
 const created=x.bridge.create(input);
 assert.equal(created.campaign.approved,false);
 assert.equal(created.campaign.paused,true);
 assert.equal(x.calls[0].workflow,'lead_research');
 assert.equal(x.calls[0].opts.maxCandidates,25);
 const imported=x.bridge.syncDiscovery(created.campaign.id);
 assert.equal(imported.added,1);
 assert.equal(imported.skipped,1);
 assert.equal(x.bridge.syncDiscovery(created.campaign.id).added,0);
 const bridgeAfterRestart=createProspectBridge({filePath:x.filePath,taskStore:x.taskStore});
 assert.equal(bridgeAfterRestart.snapshot().prospects.length,1);
 assert.equal(bridgeAfterRestart.snapshot().campaigns[0].approved,false);
 assert.equal(bridgeAfterRestart.snapshot().outboundEnabled,false);
});
test('ASTRA refinery rejects bad provenance, duplicate emails; campaign drafts require human review',t=>{
 const x=make();t.after(()=>fs.rmSync(x.dir,{recursive:true,force:true}));
 const id=x.bridge.create(input).campaign.id;
 const result=x.bridge.importContacts(id,{contacts:[
  {email:'Sales@winebuyer.example',company:'Winebuyer',sourceUrl:'https://winebuyer.example/contact',
   noticeAt:'2026-09-01T00:00:00Z',relevanceNote:'Contact corporate vin'},
  {email:'sales@winebuyer.example',company:'Winebuyer',sourceUrl:'https://winebuyer.example/contact'},
  {email:'invalid',company:'Bad',sourceUrl:'https://example.org'},
  {email:'a@other.example',company:'Other',sourceUrl:''}
 ]});
 assert.equal(result.imported,1);
 assert.equal(result.rejected.length,3);
 const drafts=x.bridge.prepare(id);
 assert.equal(drafts.added,1);
 assert.throws(()=>x.bridge.approve(id,'YES'),/Explicit/);
 const preview=x.bridge.draftPreview(id);
 assert.equal(preview.length,1);
 assert.equal(preview[0].consent.verified,false);
 assert.equal(preview[0].dispatchReady,false);
 const approved=x.bridge.approve(id,'APPROVE_DRAFTS_ONLY');
 assert.equal(approved.approvedDrafts,1);
 assert.equal(approved.liveSending,false);
 assert.equal(x.bridge.snapshot().campaigns[0].paused,true);
 x.bridge.suppress(id,'sales@winebuyer.example');
 assert.equal(x.bridge.snapshot().drafts[0].status,'cancelled');
 const restarted=createProspectBridge({filePath:x.filePath,taskStore:x.taskStore});
 assert.equal(restarted.snapshot().drafts[0].status,'cancelled');
 assert.equal(restarted.snapshot().suppressed,1);
});
test('ASTRA fails closed for missing discovery and sends never supported',t=>{
 const x=make();t.after(()=>fs.rmSync(x.dir,{recursive:true,force:true}));
 const id=x.bridge.create(input).campaign.id;
 assert.throws(()=>x.bridge.approve(id,'APPROVE_DRAFTS_ONLY'),/No reviewable drafts/);
 assert.throws(()=>x.bridge.create({...input,maxCandidates:500}),/Candidates range/);
 assert.equal(typeof x.bridge.send, 'undefined');
 assert.equal(x.bridge.snapshot().outboundEnabled,false);
});
