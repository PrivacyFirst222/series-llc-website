/** Browser counterpart to the permanent recovery contract. */
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {recoveryBrowserModes,runRecoveryGroups} from '../server/chunk3-recovery-contract-check';
const root=resolve(import.meta.dir,'..');
const output=process.env.CHECK_OUTPUT_DIR?resolve(process.env.CHECK_OUTPUT_DIR):mkdtempSync(join(tmpdir(),'chunk3-recovery-walk-'));
mkdirSync(output,{recursive:true});process.env.CHECK_OUTPUT_DIR=output;
const build=join(output,'production-site');
const result=spawnSync(process.execPath,['x','vite','build','--configLoader','native','--outDir',build],{cwd:root,env:{...process.env,E2E_OFFLINE:'1',VERCEL:''},encoding:'utf8',maxBuffer:16*1024*1024});
writeFileSync(join(output,'build.log'),(result.stdout??'')+(result.stderr??''));
if(result.status!==0)throw Error('Recovery browser build failed; see '+join(output,'build.log'));
process.exit(runRecoveryGroups(recoveryBrowserModes,build)?0:1);
