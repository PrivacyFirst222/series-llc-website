/** Restore a COMPLETE verified snapshot into a schema-initialized empty target.
 * Reads the current deletion journal before restoring files, never reviving a
 * client deletion from an older snapshot. Keys are supplied separately. */
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { BACKUP_TABLES, type BackupDump } from '../server/backup';
import { restoreBackup } from '../server/restore';
import { getDb } from '../server/db';
const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--'));
if(!file)throw new Error('Usage: bun run scripts/db-restore.ts dump.json.gz [--dry-run]');
const dump=JSON.parse(gunzipSync(readFileSync(file)).toString()) as BackupDump;
if(dump.version!==1)throw new Error('Unknown dump version');
for(const t of BACKUP_TABLES)console.log(`${t}: ${dump.tables[t]?.length??0} rows`);
if(args.includes('--dry-run')){console.log('--dry-run: nothing written. This does not verify file recovery.');process.exit(0);}
if(!process.env.DATABASE_URL&&process.env.E2E_OFFLINE!=='1')throw new Error('Set DATABASE_URL to the empty restore target');
console.log(JSON.stringify(await restoreBackup(await getDb(),dump)));
console.log('Recovery completed: required files verified and current deletion choices applied.');
