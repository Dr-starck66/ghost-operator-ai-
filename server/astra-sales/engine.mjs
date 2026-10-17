import {createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
import {chooseVariant} from './engagement.mjs';

export const iso = () => new Date().toISOString();
export const clean = v => String(v ?? '').trim();
export const normalizeEmail = v => clean(v).toLowerCase();
export const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v)) && clean(v).length <= 254;
export const emptyState = () => ({version:1,leads:[],campaigns:[],outbox:[],events:[],deliveryEvents:[],suppressed:[]});
export function requireText(v, label, max=200) {
  const s=clean(v);if (!s || s.length>max) throw new Error(`${label} must be 1-${max} characters`);return s;
}
export function validateLead(input, state) {
  const email=normalizeEmail(input.email);
  if(!validEmail(email)) throw new Error('Invalid email');
  if(state.leads.some(l=>l.email===email)) throw new Error('Lead already exists');
  const kind=clean(input.kind || 'b2b').toLowerCase();
  if(!['b2b','b2c'].includes(kind)) throw new Error('Invalid lead kind');
  const sourceUrl=clean(input.sourceUrl);
  if(!/^https?:\/\//.test(sourceUrl)) throw new Error('Source URL required');
  const consentAt=clean(input.consentAt), noticeAt=clean(input.noticeAt);
  for(const date of [consentAt,noticeAt]) if(date && (!Number.isFinite(Date.parse(date)) || Date.parse(date)>Date.now())) throw new Error('Invalid or future consent/notice timestamp');
  return {id:randomUUID(),email,kind,name:clean(input.name).slice(0,160),company:clean(input.company).slice(0,160),role:clean(input.role).slice(0,120),sector:clean(input.sector).slice(0,120),country:clean(input.country).slice(0,80),sourceUrl,sourceNote:clean(input.sourceNote).slice(0,500),relevanceNote:clean(input.relevanceNote).slice(0,500),consentAt,noticeAt,costCents:nonnegativeInt(input.costCents||0,'costCents'),status:'new',createdAt:iso()};
}
export function nonnegativeInt(value,label) {
  if(!Number.isSafeInteger(Number(value))||Number(value)<0)throw new Error(`${label} must be a non-negative integer`);return Number(value);
}
export function scoreLead(lead,campaign) {
  const details=[];
  const add=(points,label)=>{if(points>0)details.push({label,points});};
  if(lead.company)add(10,'Entreprise identifiée');
  if(lead.role)add(10,'Fonction identifiée');
  if(lead.sourceUrl)add(10,'Source documentée');
  if(lead.relevanceNote)add(15,'Pertinence justifiée');
  if(lead.consentAt)add(20,'Consentement documenté');
  if(lead.noticeAt)add(10,'Information documentée');
  if(lead.kind==='b2b')add(5,'Prospect professionnel');
  if(campaign?.sector && lead.sector && campaign.sector.toLowerCase()===lead.sector.toLowerCase())add(10,'Secteur ciblé');
  if(campaign?.targetRole && lead.role.toLowerCase().includes(campaign.targetRole.toLowerCase()))add(10,'Fonction ciblée');
  return {score:Math.min(100,details.reduce((a,d)=>a+d.points,0)),details};
}
export function makeCampaign(input){
  const category=String(input.category||'marketing').trim().toLowerCase();
  if(!['marketing','wine','domains','partnerships','news'].includes(category))throw new Error('Invalid campaign category');
  return {category,id:randomUUID(),name:requireText(input.name,'Campaign name',150),sector:clean(input.sector).slice(0,120),targetRole:clean(input.targetRole).slice(0,120),subject:requireText(input.subject,'Subject',180),subjectB:clean(input.subjectB).slice(0,180),autoOptimize:input.autoOptimize===true||input.autoOptimize==='on',body:requireText(input.body,'Email body',6000),followupSubject:clean(input.followupSubject).slice(0,180),followupBody:clean(input.followupBody).slice(0,6000),followupDays:Math.min(30,Math.max(1,nonnegativeInt(input.followupDays??4,'followupDays'))),senderName:requireText(input.senderName,'Sender name',100),approved:false,paused:true,createdAt:iso()};
}
export function suppressed(state,email) {return state.suppressed.includes(normalizeEmail(email));}
export function isEligible(lead,campaign,state,{live=false}={}) {
  if(!lead||!campaign||suppressed(state,lead.email)||['unsubscribed','bounced','replied','qualified','meeting','won','lost'].includes(lead.status))return false;
  if(!lead.sourceUrl)return false;
  // Never let B2C cold data or unnotified professional contacts enter outbound.
  if(!lead.consentAt && !(lead.kind==='b2b'&&lead.noticeAt&&lead.relevanceNote))return false;
  if(live && (!lead.consentAt || !campaign.approved || campaign.paused))return false;
  return true;
}
export function renderTemplate(template,lead) {
  return String(template).replace(/\{\{(name|company|role|sector|country)\}\}/g,(_,k)=>clean(lead[k]));
}
export function prepareDrafts(state,campaignId){
  const c=state.campaigns.find(x=>x.id===campaignId);
  if(!c)throw new Error('Campaign not found');
  let added=0,skipped=0;
  for(const l of state.leads){
    if(!isEligible(l,c,state)||state.outbox.some(o=>o.campaignId===c.id&&o.leadId===l.id)){skipped++;continue;}
    const variant=chooseVariant(state,c,l.id);state.outbox.push({id:randomUUID(),leadId:l.id,campaignId:c.id,step:0,variant,dueAt:iso(),status:'draft',subject:renderTemplate(variant==='B'?c.subjectB:c.subject,l),body:renderTemplate(c.body,l),createdAt:iso()});added++;
  }
  return {added,skipped};
}
export function recordEvent(state,entry){
  const lead=state.leads.find(l=>l.id===entry.leadId);
  if(!lead)throw new Error('Lead not found');
  const type=clean(entry.type);
  if(!['reply','qualified','meeting','won','lost','bounce','unsubscribe','note','cost'].includes(type))throw new Error('Invalid event type');
  const c=entry.campaignId ? state.campaigns.find(x=>x.id===entry.campaignId):null;
  if(entry.campaignId&&!c)throw new Error('Campaign not found');
  const event={id:randomUUID(),leadId:lead.id,campaignId:c?.id||'',type,amountCents:nonnegativeInt(entry.amountCents||0,'amountCents'),note:clean(entry.note).slice(0,1000),at:iso()};
  state.events.push(event);
  if(type==='unsubscribe'){
    if(!suppressed(state,lead.email))state.suppressed.push(lead.email);
    lead.status='unsubscribed';
  } else if(type==='bounce'){lead.status='bounced';}
  else if(type==='reply' || type==='qualified' || type==='meeting'){lead.status=type==='reply'?'replied':type;}
  else if(type==='won' || type==='lost')lead.status=type;
  if(['unsubscribe','bounce','reply','qualified','meeting','won','lost'].includes(type)) for(const o of state.outbox)if(o.leadId===lead.id&&['draft','sending'].includes(o.status))o.status='cancelled';
  return event;
}
export function analytics(state){
  return state.campaigns.map(c=>{
    const out=state.outbox.filter(x=>x.campaignId===c.id),ev=state.events.filter(x=>x.campaignId===c.id);
    const sent=new Set(out.filter(x=>x.status==='sent').map(x=>x.leadId));
    const replied=new Set(ev.filter(x=>x.type==='reply').map(x=>x.leadId));
    const qualified=new Set(ev.filter(x=>['qualified','meeting','won'].includes(x.type)).map(x=>x.leadId));
    const won=new Set(ev.filter(x=>x.type==='won').map(x=>x.leadId));
    const relatedLeadIds=new Set(out.map(x=>x.leadId));
    const leadCost=state.leads.filter(x=>relatedLeadIds.has(x.id)&&state.outbox.find(o=>o.leadId===x.id)?.campaignId===c.id).reduce((s,x)=>s+x.costCents,0);
    const eventCost=ev.filter(x=>x.type==='cost').reduce((s,x)=>s+x.amountCents,0);
    const costCents=leadCost+eventCost;
    const revenueCents=ev.filter(x=>x.type==='won').reduce((s,x)=>s+x.amountCents,0);
    return {id:c.id,name:c.name,approved:c.approved,paused:c.paused,drafts:out.filter(x=>x.status==='draft').length,sent:sent.size,replied:replied.size,qualified:qualified.size,won:won.size,costCents,revenueCents,replyRate:sent.size?replied.size/sent.size:null,cplCents:qualified.size?Math.round(costCents/qualified.size):null,roi:costCents?(revenueCents-costCents)/costCents:null};
  });
}
export function signUnsubscribe(secret,leadId,campaignId){
  const payload=`${leadId}.${campaignId}`;
  return `${payload}.${createHmac('sha256',secret).update(payload).digest('hex')}`;
}
export function verifyUnsubscribe(secret,token){
  const match=/^([a-f0-9-]{36})\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(token||'');
  if(!match)return null;
  const expected=createHmac('sha256',secret).update(`${match[1]}.${match[2]}`).digest();
  const provided=Buffer.from(match[3],'hex');
  if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return null;
  return {leadId:match[1],campaignId:match[2]};
}
export const htmlEscape = value => String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function parseCsv(raw){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];if(c==='"') {if(quoted&&raw[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if((c===','||c===';')&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&raw[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('Unterminated CSV quote');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  if(!rows.length)return [];
  const names=rows.shift().map(x=>x.trim());
  if(!names.includes('email')||!names.includes('sourceUrl'))throw new Error('CSV requires email,sourceUrl headers');
  return rows.map(r=>Object.fromEntries(names.map((name,i)=>[name,r[i]||''])));
}
