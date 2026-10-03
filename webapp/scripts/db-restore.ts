/** Restore a COMPLETE verified snapshot into a schema-initialized empty target.
 * Reads the current deletion journal before restoring files, never reviving a
 * client deletion from an older snapshot. Keys are supplied separately. */
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { BACKUP_TABLES, type BackupDump } from '../server/backup';
import { restoreBackup } from '../server/restore';
import { getDb } from '../server/db';
import {PackageReconciliationRequired} from '../server/package-recovery';
const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--'));
if(!file)throw new Error('Usage: bun run scripts/db-restore.ts dump.json.gz [--dry-run] [--hold-unresolved-packages] [--first-notice-cutoff=ORIGINAL_ISO_VALUE]');
const dump=JSON.parse(gunzipSync(readFileSync(file)).toString()) as BackupDump;
if(![1,2].includes(dump.version)||dump.fileManifestVersion!==dump.version||!Array.isArray(dump.files))throw new Error('Unknown or inconsistent dump version');
if(dump.version===2&&(!dump.historyGaps?.length||dump.status!=='complete_with_history_gaps'||dump.restorable!==true||dump.historyComplete!==false))throw new Error('The historical-gap envelope is incomplete');
if(dump.version===1&&dump.historyGaps?.length)throw new Error('A version 1 snapshot cannot waive history');
for(const t of BACKUP_TABLES)console.log(`${t}: ${dump.tables[t]?.length??0} rows`);
if(args.includes('--dry-run')){console.log('--dry-run: nothing written. This does not verify file recovery.');process.exit(0);}
if(!process.env.DATABASE_URL&&process.env.E2E_OFFLINE!=='1')throw new Error('Set DATABASE_URL to the empty restore target');
const db=await getDb();
let result;
try{result=await restoreBackup(db,dump,{holdUnresolved:args.includes('--hold-unresolved-packages'),firstNoticeCutoff:args.find(a=>a.startsWith('--first-notice-cutoff='))?.slice('--first-notice-cutoff='.length)});}
catch(error){
 if(error instanceof PackageReconciliationRequired){console.error(JSON.stringify({code:error.code,packages:error.packages}));console.error('Inspect every listed package. Use --hold-unresolved-packages to restore verified data with packages held for reconciliation; the target remains inactive.');}
 else console.error(error instanceof Error?error.message:String(error));
 await db.close?.();process.exit(1);
}
console.log(JSON.stringify(result));
if(result.heldPackages)console.log(`Restored verified data. ${result.heldPackages} S-election package(s) are held for reconciliation and are not available in client accounts. Their encrypted copies and deletion records remain preserved. Review the held-package register before switching production.`);
else console.log('Restore completed: required files verified and current deletion choices applied; target remains inactive.');

console.log('Restored target remains inactive. Verify the restored data and acknowledge any holds, then run scripts/recovery-activate.ts PRODUCTION_ORIGIN OPERATOR as part of switching production. Activation automatically queues required client notices; rehearsals must never be activated.');
await db.close?.();
