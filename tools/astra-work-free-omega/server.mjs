import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';

const HEADER=Object.freeze({'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'"});
const SIX_HOURS=21600000;
function authorized(req,token){
 if(typeof token!=='string'||token.length<32)return false;
 const expected=Buffer.from('Bearer '+token),received=Buffer.from(String(req.headers.authorization||''));
 return received.length===expected.length&&timingSafeEqual(expected,received);
}
function json(res,code,data){
 const raw=JSON.stringify(data);
 res.writeHead(code,{...HEADER,'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(raw)});
 res.end(raw);
}
export function createApplication({projects,executeProject,clock=()=>Date.now(),token='',intervalMs=SIX_HOURS,page='<h1>ASTRA WORK FREE</h1>'}={}){
 if(!Array.isArray(projects)||!projects.length||!projects.every(x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,40}$/.test(x))||new Set(projects).size!==projects.length||typeof executeProject!=='function')throw Error('INVALID_APPLICATION_CONFIGURATION');
 let latest={schema:'astra-work-free-omega/host-1',status:'UNVERIFIED',reason:'NOT_EXECUTED_YET',projects};
 let lastStartedMs=0,active=null;
 async function runOnce({force=false}={}){
   if(active)return active;
   if(!force&&lastStartedMs&&clock()-lastStartedMs<intervalMs)return latest;
   lastStartedMs=clock();
   latest={...latest,status:'PARTIAL',reason:'EXECUTION_IN_PROGRESS',startedAt:new Date(lastStartedMs).toISOString()};
   active=(async()=>{
     const results={};
     for(const project of projects){
       try{results[project]=await executeProject(project)}
       catch{results[project]={status:'UNVERIFIED',reason:'OPERATOR_FAILURE'}}
     }
     latest={schema:'astra-work-free-omega/host-1',
       status:Object.values(results).every(r=>r.status==='PASS')?'PASS':'PARTIAL',
       scope:'READ_ONLY_PUBLIC_HTTP_AUDIT',startedAt:new Date(lastStartedMs).toISOString(),
       completedAt:new Date(clock()).toISOString(),results,
       evidencePersistence:'PROCESS_MEMORY_ONLY',schedule:'WHILE_AWAKE_OR_ON_COLD_START'};
     return latest;
   })().finally(()=>{active=null});
   return active;
 }
 const server=createServer(async(req,res)=>{
   if(req.method!=='GET')return json(res,405,{status:'FAIL',reason:'METHOD_NOT_ALLOWED'});
   if(Number(req.headers['content-length']||0)>1024)return json(res,413,{status:'FAIL',reason:'REQUEST_TOO_LARGE'});
   let url;
   try{url=new URL(req.url,'http://internal.invalid')}
   catch{return json(res,400,{status:'FAIL',reason:'MALFORMED_PATH'})}
   if(url.pathname==='/api/health')return json(res,200,{schema:'astra-work-free-omega/host-1',status:'PASS',scope:'SERVER_REACHABLE_ONLY',projects});
   if(url.pathname==='/api/status'){
     if(!lastStartedMs||clock()-lastStartedMs>=intervalMs)void runOnce().catch(()=>{});
     return json(res,latest.reason==='NOT_EXECUTED_YET'?202:200,latest);
   }
   if(url.pathname==='/api/run'){
     if(!authorized(req,token))return json(res,401,{status:'FAIL',reason:'AUTHENTICATION_REQUIRED'});
     const project=url.searchParams.get('project');
     if(!projects.includes(project))return json(res,400,{status:'FAIL',reason:'UNKNOWN_PROJECT'});
     try{return json(res,200,await executeProject(project))}
     catch{return json(res,503,{status:'UNVERIFIED',reason:'OPERATOR_FAILURE'})}
   }
   if(url.pathname==='/'&&!url.search){
     res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline' 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});
     return res.end(page);
   }
   return json(res,404,{status:'FAIL',reason:'NOT_FOUND'});
 });
 return {server,runOnce,getSnapshot:()=>latest};
}
