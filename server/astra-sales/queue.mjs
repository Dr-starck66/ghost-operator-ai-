/** ASTRA Durable Queue Ω — a single-writer, persist-before-send queue.
 * Never automatically retry an uncertain provider response. Multi-replica is forbidden.
 */
const due=o=>Number.isFinite(Date.parse(o.dueAt||''))?Date.parse(o.dueAt):Infinity;
export function recoverInterrupted(state,{now=Date.now()}={}){
  let recovered=0;
  for(const item of state.outbox||[])if(item.status==='sending'){
    item.status='unknown';item.error='Interrupted after reservation; verify provider message status manually';item.recoveredAt=new Date(now).toISOString();recovered++;
  }
  return recovered;
}
export function queueSnapshot(state,{now=Date.now()}={}){
  const out=state.outbox||[],count=status=>out.filter(o=>o.status===status).length;
  return {at:new Date(now).toISOString(),pending:count('draft'),due:out.filter(o=>o.status==='draft'&&due(o)<=now).length,inFlight:count('sending'),accepted:count('sent'),uncertain:count('unknown'),cancelled:count('cancelled'),mode:'single-writer-persistent-json',exactlyOnce:'NOT_GUARANTEED_EXTERNAL_PROVIDER',note:'Crash after provider acceptance may leave unknown; never auto-resend an ambiguous request.'};
}
export function nextDue(state,{now=Date.now(),eligible=()=>true}={}){
  return (state.outbox||[]).filter(o=>o.status==='draft'&&due(o)<=now&&eligible(o)).sort((a,b)=>due(a)-due(b)||String(a.id).localeCompare(String(b.id)))[0]||null;
}
export function reserveAttempt(state,id,{now=Date.now()}={}){
  const item=(state.outbox||[]).find(o=>o.id===id);
  if(!item||item.status!=='draft'||due(item)>now)throw new Error('Queue reservation denied');
  item.status='sending';item.attemptedAt=new Date(now).toISOString();item.attemptId=`${item.id}:${now}`;
  return item;
}
