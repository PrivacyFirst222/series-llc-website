import {readFileSync} from 'node:fs';
import {getDb} from '../server/db';
import {restoreHeldOwnerRecords,heldPackageManifest,acknowledgeHeldPackages,reconcileHeldPackage,type HoldEvidence} from '../server/recovery-holds';
const [command,...args]=process.argv.slice(2),db=await getDb();
if(command==='list')console.log(JSON.stringify(await heldPackageManifest(db),null,2));
else if(command==='acknowledge')console.log(JSON.stringify(await acknowledgeHeldPackages(db,args[0],args[1]??''),null,2));
else if(command==='restore-owner')console.log(JSON.stringify(await restoreHeldOwnerRecords(db,args[0],JSON.parse(readFileSync(args[1],'utf8'))),null,2));
else if(command==='reconcile')console.log(JSON.stringify(await reconcileHeldPackage(db,args[0],JSON.parse(readFileSync(args[1],'utf8')) as HoldEvidence),null,2));
else throw Error('Usage: recovery-holds.ts list | acknowledge MANIFEST_SHA OPERATOR | restore-owner DOCUMENT_ID ORIGINAL_EXPORT.json | reconcile DOCUMENT_ID VERIFIED_EVIDENCE.json');
