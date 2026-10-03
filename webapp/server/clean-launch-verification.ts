import {createHash} from 'node:crypto';

/** Read-only preflight. Deletion and initialization are deliberately absent.
 * The operator supplies the separately approved resource/seed inventory. */
export interface LaunchResources {databaseHost:string;databaseName:string;blobStoreId:string;dropboxAccountId:string;dropboxAppKey:string;dropboxRoot:string}
export interface LaunchObject {path:string;sha256:string;size:number}
export interface LaunchSnapshot {
 resources:LaunchResources;tables:Record<string,{count:number;sha256:string}>;
 migrations:{id:number;checksum:string}[];noticeCutoff:string;
 objects:{blob:LaunchObject[];mirror:LaunchObject[]};
}
export interface LaunchInventory {
 version:1;approvedBuild:string;resourceApproval:string;writerDrainEvidence:string;
 resources:LaunchResources;noticeCutoff:string;migrations:{id:number;checksum:string}[];
 seedTables:Partial<Record<'library_documents'|'schema_migrations'|'launch_policy'|'backup_progress',{count:number;sha256:string}>>;
 seedObjects:{blob:LaunchObject[];mirror:LaunchObject[]};
}
export interface LaunchReader {read():Promise<LaunchSnapshot>}
export const launchDigest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sortedObjects=(rows:LaunchObject[])=>[...rows].sort((a,b)=>a.path.localeCompare(b.path));
const requiredEmpty=['clients','orders','service_orders','office_operations','documents','document_deletions','staged_documents','sessions'];
function objectsMatch(actual:LaunchObject[],expected:LaunchObject[]){
 for(const rows of [actual,expected])if(new Set(rows.map(r=>r.path)).size!==rows.length||rows.some(r=>!r.path||!Number.isSafeInteger(r.size)||r.size<0||!/^[a-f0-9]{64}$/.test(r.sha256)))throw Error('Invalid or duplicate object inventory');
 return JSON.stringify(sortedObjects(actual))===JSON.stringify(sortedObjects(expected));
}
function validate(expected:LaunchInventory,actual:LaunchSnapshot){
 if(expected.version!==1||!expected.approvedBuild||!expected.resourceApproval||!expected.writerDrainEvidence)throw Error('Approved build, resource inventory and writer-drain evidence are required');
 for(const key of Object.keys(expected.resources) as (keyof LaunchResources)[])if(!expected.resources[key]||actual.resources[key]!==expected.resources[key])throw Error('RESET_RESOURCE_MISMATCH: '+key);
 const resourceKeys=['databaseHost','databaseName','blobStoreId','dropboxAccountId','dropboxAppKey','dropboxRoot'];
 if(resourceKeys.some(k=>!expected.resources[k as keyof LaunchResources]))throw Error('Incomplete resource inventory');
 if(!Number.isFinite(Date.parse(expected.noticeCutoff))||actual.noticeCutoff!==expected.noticeCutoff)throw Error('Initial-launch notice cutoff differs');
 if((expected.seedTables.backup_progress?.count??0)>1)throw Error('Only the deletion-journal initialization row is allowed');
 if(actual.migrations.length!==26||expected.migrations.length!==26)throw Error('Expected migrations 1 through 26');
 for(let n=1;n<=26;n++){
  const a=actual.migrations.find(m=>m.id===n),e=expected.migrations.find(m=>m.id===n);
  if(!a||!e||!/^[a-f0-9]{64}$/.test(e.checksum)||a.checksum!==e.checksum)throw Error('Migration checksum differs: '+n);
 }
 for(const table of requiredEmpty)if(!actual.tables[table]||actual.tables[table].count!==0)throw Error('Residual test data or missing table: '+table);
 for(const [table,row]of Object.entries(actual.tables)){
  if(!Number.isSafeInteger(row.count)||row.count<0)throw Error('Invalid table count: '+table);
  const seed=expected.seedTables[table as keyof typeof expected.seedTables];
  if(seed){if(!['library_documents','schema_migrations','launch_policy','backup_progress'].includes(table)||requiredEmpty.includes(table)||seed.count!==row.count||seed.sha256!==row.sha256)throw Error('Seed table differs: '+table);}
  else if(row.count!==0)throw Error('Unlisted nonempty table: '+table);
 }
 for(const table of Object.keys(expected.seedTables))if(!actual.tables[table])throw Error('Missing seed table: '+table);
 for(const store of ['blob','mirror'] as const)if(!objectsMatch(actual.objects[store],expected.seedObjects[store]))throw Error('Residual, missing or changed objects: '+store);
}
export async function verifyCleanLaunch(expected:LaunchInventory,reader:LaunchReader){
 const first=await reader.read();validate(expected,first);
 const second=await reader.read();validate(expected,second);
 // A clean receipt cannot race an old writer. Every table and object must be
 // stable across two complete, independently fetched inventories.
 if(launchDigest(first)!==launchDigest(second))throw Error('Resources changed during verification; writers are not drained');
 return {version:1,clean:true,verifiedAt:new Date().toISOString(),approvedBuild:expected.approvedBuild,resources:first.resources,noticeCutoff:first.noticeCutoff,resourceApproval:expected.resourceApproval,writerDrainEvidence:expected.writerDrainEvidence,inventorySha256:launchDigest(expected),observedSha256:launchDigest(first),tables:first.tables,objectCounts:{blob:first.objects.blob.length,mirror:first.objects.mirror.length},scope:'read-only preflight; baseline backup and isolated restore receipts are also required before first-client traffic'};
}
