/** Execute one bounded cycle on EXISTING ASTRA runner only; no new cron, charge or provider. */
import { resolve } from 'node:path';
import { createCivicMonitor } from './astra-civic-monitor.mjs';
const filePath=resolve(process.env.GHOST_DATA_DIR||'./data','astra-civic-sources.json');
const monitor=createCivicMonitor({filePath});
try {
  const r=await monitor.scan();
  console.log('ASTRA_CIVIC_WATCH '+JSON.stringify(r));
  if(r.status==='FAIL')process.exitCode=1;
} catch(e) {
  console.error('ASTRA_CIVIC_WATCH_FAIL '+String(e?.message||e).slice(0,120));
  process.exitCode=1;
}
