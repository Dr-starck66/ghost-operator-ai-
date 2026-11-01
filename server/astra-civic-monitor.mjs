/** ASTRA CIVIC WATCH Ω — institutional-publication monitor; no suspect tracking.
 * Uses existing Ghost Operator persistent /data. No new cloud service or paid API.
 * Content digests attest integrity of local copies, not truth of the publications.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const CIVIC_FEEDS = Object.freeze([
 {id:'gendinfo-organized-crime',name:'Gendarmerie / Gendinfo',url:'https://www.gendarmerie.interieur.gouv.fr/gendinfo/rss/55328',type:'rss',host:'www.gendarmerie.interieur.gouv.fr',prefix:'/gendinfo/'},
 {id:'justice-press',name:'Ministère de la Justice / Espace presse',url:'https://www.justice.gouv.fr/espace-presse',type:'html',host:'www.justice.gouv.fr',prefix:'/'}
]);
const hash=s=>createHash('sha256').update(typeof s==='string'?s:JSON.stringify(s)).digest('hex');
const MATCH=[
 ['narcotrafic',/dz[\s-]?mafia|narcotraf|trafic de stup[eé]fiants|trafic de drogue|ofast/i],
 ['criminalite-organisee',/criminalit[eé] organis[eé]e|bande organis[eé]e|r[eé]seau criminel|anticriminalit[eé]/i],
 ['blanchiment',/blanchiment|avoirs criminels/i]
];
const dec=s=>String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>{const v=Number(n);return v>=32&&v<=0x10ffff?String.fromCodePoint(v):' '});
const clean=s=>dec(s).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,220);
const tag=(s,t)=>clean((new RegExp('<'+t+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+t+'>','i').exec(s)||[])[1]);
function allowedLink(raw,feed){
 try{const u=new URL(dec(raw),feed.url);
  if(u.protocol!=='https:'||u.hostname!==feed.host||u.port||u.username||u.password||!u.pathname.startsWith(feed.prefix)||u.pathname.includes('/rss/')||/\.(pdf|zip|jpg|png|gif|exe)$/i.test(u.pathname))return null;
  u.search='';u.hash='';return u.href;
 }catch{return null}
}
const date=s=>{const v=new Date(s);return Number.isFinite(v.getTime())&&v.getUTCFullYear()>2010&&v.getUTCFullYear()<2100?v.toISOString().slice(0,10):null};
const months=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
function dateFr(s){const m=/publi[eé]\s+le\s+(\d{1,2})\s+([a-zéûô]+)\s+(20\d{2})/i.exec(s);if(!m)return null;const month=months.indexOf(m[2].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());return month<0?null:date(m[3]+'-'+String(month+1).padStart(2,'0')+'-'+m[1].padStart(2,'0')+'T12:00:00Z')}
function entry(feed,url,title,published){
 const theme=MATCH.find(x=>x[1].test(title))?.[0];if(!url||!theme)return null;
 const base={id:'pub_'+hash(feed.id+'|'+url),sourceId:feed.id,sourceName:feed.name,sourceUrl:url,topic:theme,publishedAt:published||null,titleSha256:hash(title),humanReviewed:false,sourceKind:'OFFICIAL_PUBLIC_LISTING'};
 return {...base,entrySha256:hash(base)};
}
export function parseInstitutionalFeed(body,feed){
 const out=[];
 if(feed.type==='rss'){
  if(!/<rss(\s|>)|<rdf:RDF(\s|>)/i.test(body))throw Error('BAD_RSS_FORMAT');
  for(const it of body.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
   const value=entry(feed,allowedLink(tag(it[1],'link'),feed),tag(it[1],'title'),date(tag(it[1],'pubDate')));
   if(value)out.push(value);if(out.length>=100)break;
  }
 }else{
  if(!/espace presse|communiqu[eé] de presse/i.test(clean(body.slice(0,10000))))throw Error('BAD_PRESS_FORMAT');
  const found=[...body.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  for(let i=0;i<found.length;i++){
   const segment=body.slice(found[i].index+found[i][0].length,i+1<found.length?found[i+1].index:Math.min(body.length,found[i].index+2500));
   const href=/<a\b[^>]*href=["']([^"']+)["'][^>]*>(?:(?!<\/a>)[\s\S])*?voir\s+la\s+page(?:(?!<\/a>)[\s\S])*?<\/a>/i.exec(segment)?.[1];
   const value=entry(feed,allowedLink(href,feed),clean(found[i][1]),dateFr(clean(segment.slice(0,600))));
   if(value)out.push(value);if(out.length>=100)break;
  }
 }
 return out;
}
export function assertEntry(e){
 const f=CIVIC_FEEDS.find(x=>x.id===e?.sourceId);
 if(!f||Object.keys(e).length!==10||e.sourceName!==f.name||e.sourceUrl!==allowedLink(e.sourceUrl,f)||e.id!=='pub_'+hash(f.id+'|'+e.sourceUrl)||!MATCH.some(x=>x[0]===e.topic)||e.humanReviewed!==false||e.sourceKind!=='OFFICIAL_PUBLIC_LISTING'||!/^[a-f0-9]{64}$/.test(e.titleSha256)||!(e.publishedAt===null||/^20\d\d-\d\d-\d\d$/.test(e.publishedAt)))throw Error('BAD_PUBLICATION_RECORD');
 const {entrySha256,...rest}=e;if(entrySha256!==hash(rest))throw Error('RECORD_TAMPERED');return e;
}
async function load(file){
 let state;try{state=JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return{version:1,entries:[],lastScan:null};throw e}
 if(state?.version!==1||!Array.isArray(state.entries)||state.entries.length>2500||!('lastScan'in state))throw Error('STORE_INVALID');
 const ids=new Set();for(const e of state.entries){assertEntry(e);if(ids.has(e.id))throw Error('STORE_DUPLICATE');ids.add(e.id)}return state;
}
async function persist(file,state){await mkdir(dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(state,null,2),{mode:0o600});await rename(tmp,file)}
async function fetchIndex(feed,fetchImpl){
 const ctl=new AbortController(),stop=setTimeout(()=>ctl.abort(),8000);stop.unref?.();
 try{
  const res=await fetchImpl(feed.url,{method:'GET',redirect:'error',credentials:'omit',signal:ctl.signal,headers:{accept:feed.type==='rss'?'application/rss+xml,application/xml':'text/html'}});
  if(!res.ok||(res.url&&res.url!==feed.url))throw Error('SOURCE_HTTP_'+res.status);
  const mime=res.headers?.get?.('content-type')||'';
  if(mime&&!((feed.type==='rss'&&/xml|rss/i.test(mime))||(feed.type==='html'&&/html/i.test(mime))))throw Error('BAD_MIME');
  if(Number(res.headers?.get?.('content-length')||0)>1200000)throw Error('BODY_TOO_LARGE');
  const decoder=new TextDecoder();let body='',size=0;
  if(res.body?.getReader){const reader=res.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value?.byteLength||0;if(size>1200000)throw Error('BODY_TOO_LARGE');body+=decoder.decode(value,{stream:true})}body+=decoder.decode()}finally{reader.releaseLock?.()}}
  else{body=await res.text();if(Buffer.byteLength(body)>1200000)throw Error('BODY_TOO_LARGE')}
  return {entries:parseInstitutionalFeed(body,feed),sourceDigest:hash(body)};
 }finally{clearTimeout(stop)}
}
export function createCivicMonitor({filePath,fetchImpl=globalThis.fetch,clock=()=>new Date(),autoStart=false,tickMs=3600000}={}){
 if(!filePath||typeof fetchImpl!=='function')throw Error('CIVIC_CONFIG_INVALID');
 let working=null,timer=null;
 const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(clock());
 async function scan({force=false}={}){
  if(working)return working;
  working=(async()=>{
   const state=await load(filePath),day=localDay();
   if(!force&&state.lastScan?.localDay===day&&state.lastScan?.status==='PASS')return {skipped:true,reason:'DAY_ALREADY_SCANNED',...state.lastScan};
   if(!force&&state.lastScan?.status!=='PASS'&&state.lastScan?.checkedAt&&clock().getTime()-Date.parse(state.lastScan.checkedAt)<14400000)return {skipped:true,reason:'COOLDOWN',...state.lastScan};
   const checks=[],discovered=[];
   for(const feed of CIVIC_FEEDS){try{const result=await fetchIndex(feed,fetchImpl);checks.push({source:feed.id,status:'PASS',sourceDigest:result.sourceDigest,candidates:result.entries.length});discovered.push(...result.entries)}catch(e){checks.push({source:feed.id,status:'FAIL',reason:String(e?.message||'NETWORK_ERROR').slice(0,90)})}}
   const seen=new Set(state.entries.map(x=>x.id));let added=0;
   for(const e of discovered){assertEntry(e);if(seen.has(e.id))continue;if(state.entries.length>=2500)throw Error('STORE_CAPACITY_REVIEW_REQUIRED');state.entries.push(e);seen.add(e.id);added++}
   const count=checks.filter(x=>x.status==='PASS').length,status=count===2?'PASS':count?'PARTIAL':'FAIL';
   state.lastScan={status,localDay:day,checkedAt:clock().toISOString(),checks,added,stored:state.entries.length,scope:'public_listing_metadata_only',claimsVerified:false};
   await persist(filePath,state);return {skipped:false,...state.lastScan};
  })().finally(()=>{working=null});return working;
 }
 async function report(){const state=await load(filePath);const data={project:'ASTRA_CIVIC_WATCH_OMEGA',...state,scope:'PUBLIC_INSTITUTIONAL_LINKS_ONLY',contentVerified:false,noIndividualProfiles:true};return {...data,reportSha256:hash(data)}}
 async function start(){if(timer)return;const run=()=>scan().then(x=>console.log('ASTRA_CIVIC_WATCH',JSON.stringify({status:x.status,added:x.added,skipped:x.skipped}))).catch(e=>console.error('ASTRA_CIVIC_WATCH_FAIL',String(e?.message||e)));await run();timer=setInterval(run,tickMs);timer.unref?.()}
 const stop=()=>{if(timer)clearInterval(timer);timer=null};
 if(autoStart)setTimeout(()=>start().catch(e=>console.error('ASTRA_CIVIC_WATCH_START_FAIL',String(e))),2500).unref?.();
 return {scan,report,start,stop};
}
const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export function renderMonitorDashboard(data){
 let html='<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;;style-src &#39;unsafe-inline&#39;"><title>ASTRA CIVIC WATCH</title><style>body{max-width:1100px;margin:auto;background:#132034;color:#eff;font:16px/1.5 system-ui;padding:2rem}a{color:#8cf}td,th{padding:.7rem;border:1px solid #678}table{border-collapse:collapse}</style></head><body><h1>ASTRA CIVIC WATCH Ω</h1><p>Veille de publications officielles — aucune donnée nominative, aucun profil de suspect.</p><p>Dernière collecte : '+esc(data.lastScan?.checkedAt||'jamais')+' — '+esc(data.lastScan?.status||'UNVERIFIED')+'</p><p>Chiffres institutionnels non vérifiés individuellement. Aucun signalement automatisé.</p><table><tr><th>Date</th><th>Source</th><th>Thème</th><th>Publication</th></tr>';
 for(const e of data.entries.slice(-200).reverse())html+='<tr><td>'+esc(e.publishedAt||'non précisée')+'</td><td>'+esc(e.sourceName)+'</td><td>'+esc(e.topic)+'</td><td><a target="_blank" rel="noopener noreferrer" href="'+esc(e.sourceUrl)+'">Consulter la source officielle</a></td></tr>';
 return html+'</table><p>Pour un signalement légal : <a href="https://www.masecurite.interieur.gouv.fr/">Ma Sécurité</a>. Danger immédiat : 17 ou 112.</p><small>SHA-256 du rapport : '+esc(data.reportSha256)+'</small></body></html>';
}
