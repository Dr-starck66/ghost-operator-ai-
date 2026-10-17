import {createHash} from 'node:crypto';
const ratio=(n,d)=>d?n/d:null;
const wilson=(x,n)=>{if(!n)return {low:0,high:1};const z=1.96,p=x/n,den=1+z*z/n,c=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return {low:Math.max(0,c-half),high:Math.min(1,c+half)};};
export function assignedVariant(leadId,campaignId){return createHash('sha256').update(campaignId+':'+leadId).digest()[0]%2?'B':'A';}
export function subjectExperiment(state,campaign){
 const rows=Object.fromEntries(['A','B'].map(variant=>{
  const sent=state.outbox.filter(o=>o.campaignId===campaign.id&&o.step===0&&o.variant===variant&&o.status==='sent');
  const leadIds=new Set(sent.map(o=>o.leadId)),replied=new Set(state.events.filter(e=>e.campaignId===campaign.id&&e.type==='reply'&&leadIds.has(e.leadId)).map(e=>e.leadId));
  const engaged=new Set(sent.filter(o=>o.clickedAt).map(o=>o.leadId));for(const id of replied)engaged.add(id);
  return [variant,{sent:sent.length,engaged:engaged.size,replies:replied.size,uniqueClicks:sent.filter(o=>o.clickedAt).length,reportedOpens:sent.filter(o=>o.observedOpenAt).length,proxyOpens:sent.filter(o=>o.proxyOpenAt).length,engagementRate:ratio(engaged.size,sent.length),interval:wilson(engaged.size,sent.length)}];
 }));
 const A=rows.A,B=rows.B,winner=(A.engagementRate||0)>=(B.engagementRate||0)?'A':'B',loser=winner==='A'?'B':'A',w=rows[winner],l=rows[loser];
 const enough=A.sent>=30&&B.sent>=30&&A.engaged+B.engaged>=10;
 const conclusive=enough&&w.interval.low>l.interval.high&&w.engagementRate-l.engagementRate>=.03;
 return {campaignId:campaign.id,enabled:!!campaign.subjectB,rows,eligibleForOptimization:!!campaign.subjectB&&conclusive,winner:conclusive?winner:null,decision:!campaign.subjectB?'NO_VARIANT_B':!enough?'INSUFFICIENT_EVIDENCE':conclusive?'SIGNIFICANT_ENGAGEMENT_ADVANTAGE':'NO_CONCLUSIVE_WINNER',metric:'Unique clicks or actual replies; pixel opens are not decisive'};
}
export function chooseVariant(state,campaign,leadId){if(!campaign.subjectB)return 'A';const e=subjectExperiment(state,campaign);return campaign.autoOptimize&&e.eligibleForOptimization?e.winner:assignedVariant(leadId,campaign.id);}
