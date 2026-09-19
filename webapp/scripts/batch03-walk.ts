import {chromium,type Browser} from 'playwright';
import {guardedRoute,isolateBrowser} from './browser-isolation';
import {startIsolatedStack} from './isolated-stack';
import {mkdirSync} from 'node:fs';
export async function batch03Walk(browser:Browser,web:string,check:(ok:boolean,label:string,detail?:unknown)=>void){
 const page=await browser.newPage();page.setDefaultTimeout(7000);let deleted=false,deleteCalls=0,failDelete=false;
 const tax={id:'tax1',kind:'package',title:'S Corporation Election Package — Review Company',order_id:'company1',deletable:true,encrypted:true,created_at:'2026-09-01',size_bytes:50};
 await guardedRoute(page,'**/api/**',async route=>{
  const u=new URL(route.request().url());const json=(data:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify({data})});
  if(u.pathname==='/api/auth/me')return json({name:'Review Client',email:'review@example.test'});
  if(u.pathname==='/api/portal/companies')return json([{orderId:'company1',llcName:'Review Company, LLC',formed:true,registeredAgentChoice:'SELF'}]);
  if(u.pathname==='/api/portal/documents/tax1'&&route.request().method()==='DELETE'){deleteCalls++;if(failDelete)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Storage unavailable',code:'UNAVAILABLE'}})});deleted=true;return json({ok:true,cleanupPending:false});}
  if(u.pathname==='/api/portal/documents')return json([...(deleted?[]:[tax]),{id:'articles',kind:'articles',title:'Filed Articles — Review Company',order_id:'company1',created_at:'2026-09-01',size_bytes:50}]);
  if(u.pathname==='/api/portal/services')return json({orders:[],members:[],series:[],llcFormed:true,llcName:'Review Company, LLC',sElection:{eligible:false},pricing:{seriesCents:5000,einCents:9500,sElectionCents:9500,certStatusCents:500,certifiedCopyCents:3000}});
  if(u.pathname==='/api/admin/me')return json({ok:true});
  if(u.pathname==='/api/admin/orders')return json({orders:[],total:0,shown:0});
  if(u.pathname==='/api/admin/backups/progress')return json({complete:false,pending:7,error:'7 files pending; retry scheduled',completedAt:null});
  if(u.pathname==='/api/admin/file-mirror')return json({configured:true,mirrored:207,pending:7,failures:1,lastMirroredAt:'2026-09-19T10:00:00Z',complete:false,lastError:'One file needs retry'});
  return json([]);
 });
 try{
  await page.goto(`${web}/portal?company=company1`);
  const row=page.getByTestId('document-row').filter({hasText:tax.title});await row.waitFor();
  check(await row.getByRole('link',{name:'Download',exact:true}).isVisible(),'batch03 retained tax document offers download');
  await row.getByRole('button',{name:`Delete ${tax.title}`,exact:true}).click();
  const dialog=page.getByRole('alertdialog');await dialog.waitFor();const text=await dialog.innerText();
  check(text.includes(tax.title)&&text.includes('Download and keep a copy first'),'batch03 delete confirmation names document and consequence',text);
  if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SHOT_DIR}/batch03-delete-confirmation.png`,fullPage:true,animations:'disabled'});}
  await dialog.getByRole('button',{name:'Keep document',exact:true}).click();check(deleteCalls===0&&await row.isVisible(),'batch03 cancel keeps the tax document');
  await row.getByRole('button',{name:`Delete ${tax.title}`,exact:true}).click();failDelete=true;await dialog.getByRole('button',{name:'Delete document',exact:true}).click();await page.getByText('Deletion did not complete',{exact:true}).first().waitFor();
  check(await row.isVisible()&&await dialog.isVisible(),'batch03 failed deletion remains visible for retry');
  failDelete=false;await dialog.getByRole('button',{name:'Delete document',exact:true}).click();await row.waitFor({state:'hidden'});
  check(deleteCalls===2&&deleted,'batch03 confirmed delete uses the document endpoint');
  check(await page.getByText('Filed Articles — Review Company',{exact:true}).isVisible(),'batch03 deleting a tax document leaves filed Articles');
 }catch(e){check(false,'batch03 document deletion browser journey',String(e));}
 try{
  await page.goto(`${web}/privacy`);const text=await page.locator('main').innerText();check(text.includes('keep these documents in your portal or choose to delete')&&!text.includes('permanently delete every'),'batch03 privacy describes the actual retention choice',text.slice(0,700));
  await page.goto(`${web}/admin`);await page.getByRole('tab',{name:/Reference Library/i}).click();const status=page.getByTestId('backup-progress');await page.waitForFunction(()=>document.querySelector('[data-testid=backup-progress]')?.textContent?.includes('7 files pending'));const message=await status.innerText();check(message.includes('Incomplete')&&message.includes('7'),'batch03 Office does not call pending backup complete',message);
  if(process.env.SHOT_DIR)await page.screenshot({path:`${process.env.SHOT_DIR}/batch03-backup-status.png`,fullPage:true,animations:'disabled'});
 }catch(e){check(false,'batch03 privacy and backup status browser journey',String(e));}
 await page.close();
}
if(import.meta.main){const stack=await startIsolatedStack({cwd:process.cwd()});const browser=await chromium.launch({headless:true});await isolateBrowser(browser);let failures=0;try{await batch03Walk(browser,stack.web,(ok,label,detail)=>{console.log(JSON.stringify({ok,label,detail:ok?undefined:detail}));if(!ok)failures++;});}finally{await browser.close();stack.stop();}process.exit(failures?1:0);}
