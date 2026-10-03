/** Restore a COMPLETE verified snapshot into a schema-initialized empty target.
 * Reads the current deletion journal before restoring files, never reviving a
 * client deletion from an older snapshot. Keys are supplied separately. */
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { BACKUP_TABLES, type BackupDump } from '../server/backup';
import { restoreBackup } from '../server/restore';
import { getDb } from '../server/db';
const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--'));
if(!file)throw new Error('Usage: bun run scripts/db-restore.ts dump.json.gz [--dry-run] [--hold-unresolved-packages] [--first-notice-cutoff=ORIGINAL_ISO_VALUE]');
const dump=JSON.parse(gunzipSync(readFileSync(file)).toString()) as BackupDump;
if(dump.version!==1)throw new Error('Unknown dump version');
for(const t of BACKUP_TABLES)console.log(`${t}: ${dump.tables[t]?.length??0} rows`);
if(args.includes('--dry-run')){console.log('--dry-run: nothing written. This does not verify file recovery.');process.exit(0);}
if(!process.env.DATABASE_URL&&process.env.E2E_OFFLINE!=='1')throw new Error('Set DATABASE_URL to the empty restore target');
const result=await restoreBackup(await getDb(),dump,{holdUnresolved:args.includes('--hold-unresolved-packages'),firstNoticeCutoff:args.find(a=>a.startsWith('--first-notice-cutoff='))?.slice('--first-notice-cutoff='.length)});
console.log(JSON.stringify(result));
if(result.heldPackages)console.log(`Restored verified data. ${result.heldPackages} S-election package(s) are held for reconciliation and are not available in client accounts. Their encrypted copies and deletion records remain preserved. Review the held-package register before switching production.`);
else console.log('Restore completed: required files verified and current deletion choices applied; target remains inactive.');

console.log('Restored target remains inactive. Verify the restored data and acknowledge any holds, then run scripts/recovery-activate.ts PRODUCTION_ORIGIN OPERATOR as part of switching production. Activation automatically queues required client notices; rehearsals must never be activated.');
