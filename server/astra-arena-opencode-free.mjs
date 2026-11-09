/**
 * Optional ASTRA ARENA Ω Inkling 2 Small free runner through the official OpenCode CLI.
 * NO auto-installation, NO key, NO paid/provider fallback, NO default execution.
 * Works only on a host with an already-installed OpenCode CLI and verified free access.
 * Creates a throwaway private config with ALL agent tools denied; input must be public.
 */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execFileAsync=promisify(execFile);
export const INKLING_FREE_MODEL='opencode/inkling-2-small-free';

/** Optional model runner for use behind runPairedArena's BOTH-entitlements gate. */
export function makeOpenCodeInklingRunner({binary='opencode',execute=execFileAsync,timeoutMs=120000}={}) {
  if (typeof binary!=='string' || !/^([\w./-]+)$/.test(binary)) throw Error('UNSAFE_BINARY_NAME');
  if (typeof execute!=='function') throw Error('INVALID_EXECUTOR');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs<1000 || timeoutMs>120000) throw Error('INVALID_TIMEOUT');
  return async ({prompt}={}) => {
    if (typeof prompt!=='string' || !prompt.trim() || prompt.length>6000) throw Error('INVALID_PUBLIC_PROMPT');
    const sandbox=await mkdtemp(path.join(os.tmpdir(),'astra-inkling-free-'));
    try {
      // Explicit V1 and V2 policy forms: don't allow shell, edits, web, MCP, reads, etc.
      const config={
        '$schema':'https://opencode.ai/config.json',
        model:INKLING_FREE_MODEL,
        permission:'deny',
        permissions:[{action:'*',resource:'*',effect:'deny'}],
      };
      await writeFile(path.join(sandbox,'opencode.json'),JSON.stringify(config)+'\n',{mode:0o600});
      for(const folder of ['data','cache','config','state'])await mkdir(path.join(sandbox,folder));
      const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:sandbox,LANG:'C.UTF-8',
        XDG_CONFIG_HOME:path.join(sandbox,'config'),XDG_CACHE_HOME:path.join(sandbox,'cache'),
        XDG_DATA_HOME:path.join(sandbox,'data'),XDG_STATE_HOME:path.join(sandbox,'state'),
        OPENCODE_DISABLE_FREE_MODELS:'0'};
      const args=['run','--standalone','--model',INKLING_FREE_MODEL,prompt];
      const result=await execute(binary,args,{cwd:sandbox,env,timeout:timeoutMs,maxBuffer:65536,windowsHide:true,shell:false});
      if(typeof result?.stdout!=='string'||!result.stdout.trim())throw Error('EMPTY_OPEN_CODE_OUTPUT');
      return {answer:result.stdout.trim(),responseId:null,provider:'OpenCode free model; CLI identity not independently attested'};
    } catch {
      throw Error('INKLING_FREE_CLI_UNAVAILABLE_OR_FAILED');
    } finally {
      await rm(sandbox,{recursive:true,force:true});
    }
  };
}
