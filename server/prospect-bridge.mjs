/** Ghost Operator x ASTRA Sales Intelligence / Lead Refinery adapter.
 * Single writer on the existing Railway /data volume. NO sending implementation.
 * Vendored ASTRA source modules are byte-identical copies from Dr-starck66/indexation.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {makeCampaign,validateLead,scoreLead,prepareDrafts,recordEvent,renderTemplate} from './astra-sales/engine.mjs';
import {normalizeRecord,matchOffers} from './astra-sales/refinery.mjs';
import {consentStatus,ensureConsent,consentSummary} from './astra-sales/consent.mjs';
import {queueSnapshot,recoverInterrupted} from './astra-sales/queue.mjs';

export function createProspectBridge({filePath,taskStore}) {
  if (!filePath || !taskStore) throw new Error('Bridge requires a durable path and taskStore');
  fs.mkdirSync(path.dirname(filePath), {recursive:true});
  let state=fs.existsSync(filePath)?JSON.parse(fs.readFileSync(filePath,'utf8')):
    {version:1,leads:[],campaigns:[],outbox:[],events:[],deliveryEvents:[],suppressed:[],prospects:[]};
  if (state.version!==1 || !Array.isArray(state.leads) || !Array.isArray(state.campaigns) ||
      !Array.isArray(state.outbox) || !Array.isArray(state.suppressed)) throw new Error('Invalid ASTRA sales data; refusing overwrite');
  state.prospects ||= [];
  ensureConsent(state);
  // The only supported mode is REVIEW_ONLY. Previously interrupted reservations must never resend.
  if (recoverInterrupted(state)) persist(state);
  function persist(value) {
    const temp=filePath+'.'+process.pid+'.'+randomUUID()+'.tmp';
    try {
      fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});
      fs.renameSync(temp,filePath);
    } finally {if(fs.existsSync(temp))fs.rmSync(temp);}
  }
  function mutate(fn) {const draft=structuredClone(state);const result=fn(draft);persist(draft);state=draft;return result;}
  const limited=v=>String(v||'').trim().slice(0,500);
  const url=v=>{const u=new URL(String(v));if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid source URL');return u.href;};
  function campaign(d,id) {const c=d.campaigns.find(x=>x.id===id);if(!c)throw Error('Campaign not found');return c;}
  function snapshot() {
    return {status:'review_only',outboundEnabled:false,providerConnected:false,
      campaigns:state.campaigns.map(c=>({
        ...c,contacts:state.leads.filter(l=>l.campaignId===c.id).length,
        prospects:state.prospects.filter(p=>p.campaignId===c.id).length,
        drafts:state.outbox.filter(o=>o.campaignId===c.id&&o.status==='draft').length
      })),
      prospects:structuredClone(state.prospects),contacts:structuredClone(state.leads),
      drafts:structuredClone(state.outbox),suppressed:state.suppressed.length,
      consent:consentSummary(state),queue:queueSnapshot(state)};
  }
  function create(input) {
    if(state.campaigns.length>=50)throw Error('Campaign capacity reached');
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid campaign');
    const created=makeCampaign({...input,category:input.category||'marketing'});
    const seedUrl=url(input.seedUrl);
    const goal=String(input.goal||'').trim();
    if(!goal||goal.length>2000)throw Error('Goal required (max 2000)');
    const maxCandidates=Number(input.maxCandidates??10);
    if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>25)throw Error('Candidates range 1-25');
    const task=taskStore.add(seedUrl,goal,'lead_research',{maxCandidates});
    return mutate(d=>{
      created.discoveryTaskId=task.id;created.seedUrl=seedUrl;created.goal=goal;
      created.maxCandidates=maxCandidates;created.reviewStatus='researching';created.approved=false;created.paused=true;
      d.campaigns.push(created);
      return {campaign:created,discoveryTaskId:task.id};
    });
  }
  function syncDiscovery(id) {
    const c=campaign(state,id),task=taskStore.get(c.discoveryTaskId);
    if(!task||task.status!=='completed'||task.result?.workflow!=='lead_research')
      throw Error('Discovery not completed; no unverified promotion');
    const incoming=task.result.report?.prospects||[];
    return mutate(d=>{
      const item=campaign(d,id);
      let added=0,skipped=0;
      for(const prospect of incoming) {
        const website=url(prospect.website),host=new URL(website).hostname.toLowerCase();
        if(d.prospects.some(p=>p.campaignId===id&&p.domain===host)){skipped++;continue;}
        const obj={id:randomUUID(),campaignId:id,domain:host,website,sourceUrl:prospect.source||item.seedUrl,
          title:limited(prospect.title),verdict:prospect.verdict==='potential_match'?'potential_match':'unverified',
          score:Number(prospect.score)||0,evidence:prospect.evidence||[],errors:prospect.errors||[],reviewStatus:'needs_human_review',
          discoveredAt:new Date().toISOString()};
        d.prospects.push(obj);added++;
      }
      item.reviewStatus='research_complete';
      return {added,skipped,total:d.prospects.filter(p=>p.campaignId===id).length,taskId:item.discoveryTaskId};
    });
  }
  function importContacts(id,input) {
    campaign(state,id);
    const list=input?.contacts;
    if(!Array.isArray(list)||list.length<1||list.length>100)throw Error('1-100 contacts required');
    const added=[],rejected=[];
    return mutate(d=>{
      const c=campaign(d,id),emails=new Set(d.leads.map(l=>l.email));
      if(d.leads.length+list.length>3000)throw Error('Global contact capacity reached');
      for(let i=0;i<list.length;i++){
        try{
          const raw=list[i];
          if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid contact');
          const sanitized=normalizeRecord(raw);
          if(sanitized.error)throw Error(sanitized.error);
          if(!sanitized.sourceUrl)throw Error('Original contact source URL required');
          const sourceUrl=url(sanitized.sourceUrl);
          const existing=emails.has(sanitized.email);
          if(existing)throw Error('duplicate_email');
          if(d.suppressed.includes(sanitized.email))throw Error('suppressed');
          const l=validateLead({
            email:sanitized.email,kind:'b2b',name:sanitized.name,company:sanitized.company,
            role:sanitized.role,sector:raw.sector||sanitized.industry,country:sanitized.country,
            sourceUrl,sourceNote:limited(raw.sourceNote),relevanceNote:limited(raw.relevanceNote),
            // Self-declared consent does NOT count as verified opt-in.
            consentAt:raw.consentAt||'',noticeAt:raw.noticeAt||'',costCents:0
          },d);
          l.campaignId=id;l.permissionStatus='UNVERIFIED';
          l.refinery={mailboxType:sanitized.mailboxType,industry:sanitized.industry,
            confidence:sanitized.confidence,offerMatches:matchOffers(sanitized,[{id:id,industries:[sanitized.industry]}])};
          l.leadScore=scoreLead(l,c);
          d.leads.push(l);emails.add(l.email);added.push({id:l.id,email:l.email,status:'REVIEW_REQUIRED',score:l.leadScore.score});
        } catch(e){rejected.push({row:i+1,reason:String(e.message||e)});}
      }
      return {imported:added.length,contacts:added,rejected,liveSending:false};
    });
  }
  function prepare(id) {
    return mutate(d=>{
      const c=campaign(d,id);
      // ASTRA original prepareDrafts works across all leads. Scope it to this campaign only.
      const view={...d,leads:d.leads.filter(l=>l.campaignId===id),outbox:d.outbox};
      const out=prepareDrafts(view,id);
      c.reviewStatus='drafts_ready';c.paused=true;c.approved=false;
      return {...out,queue:queueSnapshot(d),notice:'Drafts only: all outbound routes disabled'};
    });
  }
  function approve(id,confirmation) {
    if(confirmation!=='APPROVE_DRAFTS_ONLY')throw Error('Explicit draft-only approval required');
    return mutate(d=>{
      const c=campaign(d,id);
      const count=d.outbox.filter(o=>o.campaignId===id&&o.status==='draft').length;
      if(!count)throw Error('No reviewable drafts');
      c.approved=true;c.paused=true;c.reviewStatus='approved_drafts_only';
      c.approvedAt=new Date().toISOString();
      return {campaignId:id,approvedDrafts:count,liveSending:false,dispatchBlocked:true};
    });
  }
  function suppress(id,email) {
    campaign(state,id);
    const normalized=String(email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))throw Error('Invalid email');
    return mutate(d=>{
      if(!d.suppressed.includes(normalized))d.suppressed.push(normalized);
      for(const l of d.leads)if(l.email===normalized) {
        l.status='unsubscribed';
        for(const o of d.outbox)if(o.leadId===l.id&&o.status==='draft')o.status='cancelled';
      }
      return {suppressed:normalized,global:true};
    });
  }
  function event(id,input) {
    campaign(state,id);
    return mutate(d=>{
      const lead=d.leads.find(l=>l.id===input?.leadId&&l.campaignId===id);
      if(!lead)throw Error('Campaign contact not found');
      return {event:recordEvent(d,{...input,leadId:lead.id,campaignId:id})};
    });
  }
  function draftPreview(id) {
    campaign(state,id);
    return state.outbox.filter(o=>o.campaignId===id).map(o=>{
      const l=state.leads.find(x=>x.id===o.leadId);
      const consent=consentStatus(state,l,{bulk:true,category:campaign(state,id).category});
      return {...o,recipient:l?.email||'',consent:consent,
        dispatchReady:false,note:'Requires independently verified opt-in, deliverability and explicit send action in an authorized sender'};
    });
  }
  return {create,snapshot,syncDiscovery,importContacts,prepare,approve,suppress,event,draftPreview};
}
