/** ASTRA Audience & Consent Ω: verifiable recipient confirmation, exclusions and preferences. */
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const stamp=(now)=>new Date(now).toISOString();
const hash=(v)=>createHash('sha256').update(v).digest('hex');
const categories=new Set(['marketing','wine','domains','partnerships','news']);
const norm=e=>String(e||'').trim().toLowerCase();
export function ensureConsent(state){state.consentProofs||=[];state.pendingConfirmations||=[];state.preferences||=[];state.suppressed||=[];return state;}
export function consentStatus(state,lead,{bulk=false,category='marketing',now=Date.now()}={}){
  ensureConsent(state);
  const reasons=[];
  if(!lead || state.suppressed.includes(norm(lead.email)) || ['unsubscribed','bounced'].includes(lead?.status))reasons.push('SUPPRESSED');
  const prefs=state.preferences.filter(x=>x.email===norm(lead?.email)&&x.category===category);
  if(prefs.length && prefs.at(-1).allowed===false)reasons.push('CATEGORY_OPT_OUT');
  const all=state.preferences.filter(x=>x.email===norm(lead?.email)&&x.category==='all');
  if(all.length && all.at(-1).allowed===false)reasons.push('GLOBAL_OPT_OUT');
  const verified=state.consentProofs.some(x=>x.email===norm(lead?.email)&&x.category===category&&x.method==='token-confirmed'&&Number.isFinite(Date.parse(x.at))&&Date.parse(x.at)<=now);
  if(!lead?.consentAt)reasons.push('NO_OPT_IN');
  // The legacy consentAt field is self-declared; it is not evidence of control of the mailbox.
  if(bulk&&!verified)reasons.push('BULK_REQUIRES_VERIFIED_OPT_IN');
  return {allowed:reasons.length===0,verified,reasons};
}
export function issueConfirmation(state,lead,{now=Date.now(),ttlHours=24,category='marketing'}={}){
  ensureConsent(state);
  if(!categories.has(category))throw new Error('Invalid confirmation category');
  if(!lead?.id||!lead.email)throw new Error('Lead required');
  if(state.suppressed.includes(norm(lead.email)))throw new Error('Suppressed address cannot be auto-reactivated');
  const token=randomBytes(32).toString('hex');
  state.pendingConfirmations=state.pendingConfirmations.filter(x=>x.leadId!==lead.id && x.expiresAt>now);
  state.pendingConfirmations.push({leadId:lead.id,email:norm(lead.email),category,tokenHash:hash(token),createdAt:stamp(now),expiresAt:now+Math.min(Math.max(ttlHours,1),48)*3600000});
  return {token,expiresAt:stamp(now+Math.min(Math.max(ttlHours,1),48)*3600000)};
}
export function confirmConsent(state,token,{now=Date.now()}={}){
  ensureConsent(state);
  if(!/^[a-f0-9]{64}$/.test(token||''))return {confirmed:false,reason:'INVALID_TOKEN'};
  const digest=hash(token);
  const pending=state.pendingConfirmations.find(x=>x.tokenHash.length===digest.length&&timingSafeEqual(Buffer.from(x.tokenHash),Buffer.from(digest)));
  if(!pending)return {confirmed:false,reason:'UNKNOWN_TOKEN'};
  state.pendingConfirmations=state.pendingConfirmations.filter(x=>x!==pending);
  const lead=state.leads.find(l=>l.id===pending.leadId&&norm(l.email)===pending.email);
  if(!lead||pending.expiresAt<=now||state.suppressed.includes(pending.email))return {confirmed:false,reason:'EXPIRED_OR_SUPPRESSED'};
  if(!lead.consentAt)lead.consentAt=stamp(now);
  state.consentProofs.push({leadId:lead.id,email:pending.email,category:pending.category||'UNVERIFIED',method:'token-confirmed',at:stamp(now)});
  return {confirmed:true,leadId:lead.id,category:pending.category||'UNVERIFIED'};
}
export function setPreference(state,lead,category,allowed,{now=Date.now()}={}){
  ensureConsent(state);
  if(!lead)throw new Error('Lead not found');
  if(category!=='all'&&!categories.has(category))throw new Error('Invalid preference category');
  if(typeof allowed!=='boolean')throw new Error('Preference must be boolean');
  const email=norm(lead.email);
  if(allowed && (state.suppressed.includes(email)||lead.status==='unsubscribed'))throw new Error('Do not reactivate suppressed subscribers without a separate verified process');
  const item={email,category,allowed,at:stamp(now)};
  state.preferences.push(item);
  if(!allowed&&category==='all'){
    if(!state.suppressed.includes(email))state.suppressed.push(email);
    lead.status='unsubscribed';
    for(const o of state.outbox)if(o.leadId===lead.id&&o.status==='draft')o.status='cancelled';
    state.pendingConfirmations=state.pendingConfirmations.filter(x=>x.leadId!==lead.id);
  }
  return item;
}
export function consentSummary(state){ensureConsent(state);return {verifiedContacts:new Set(state.consentProofs.map(x=>x.email)).size,pendingConfirmations:state.pendingConfirmations.length,globalOptOuts:state.suppressed.length,preferences:state.preferences.length,legacySelfDeclaredCount:state.leads.filter(x=>x.consentAt&&!state.consentProofs.some(p=>p.email===norm(x.email))).length};}
