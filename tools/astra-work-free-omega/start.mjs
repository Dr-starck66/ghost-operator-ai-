import {readFile} from 'node:fs/promises';
import {createApplication} from './server.mjs';
import {runProject,listProjects} from './runner.mjs';

const port=Number(process.env.PORT||10000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('INVALID_PORT');
const page=await readFile(new URL('./index.html',import.meta.url),'utf8');
const app=createApplication({projects:listProjects(),executeProject:runProject,
  token:process.env.ASTRA_EXECUTION_TOKEN||'',page});
app.server.listen(port,'0.0.0.0',()=>{
 console.log('ASTRA_WORK_FREE_HOST_READY',JSON.stringify({port,scope:'SERVER_REACHABLE_ONLY',at:new Date().toISOString()}));
 void app.runOnce().then(s=>console.log('ASTRA_WORK_FREE_CYCLE',JSON.stringify({
   status:s.status,at:s.completedAt,projects:Object.fromEntries(Object.entries(s.results||{}).map(([k,v])=>[k,v.status]))
 }))).catch(()=>console.error('ASTRA_WORK_FREE_CYCLE_UNVERIFIED'));
});
const timer=setInterval(()=>void app.runOnce().catch(()=>console.error('ASTRA_WORK_FREE_CYCLE_UNVERIFIED')),21600000);
timer.unref();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.server.close(()=>process.exit(0)));
