import { chromium, type Browser, type Page } from 'playwright';
import { guardedRoute, isolateBrowser } from './browser-isolation';
import { startIsolatedStack } from './isolated-stack';
import { mkdirSync } from 'node:fs';

export async function batch04Walk(browser:Browser,web:string,check:(ok:boolean,label:string,detail?:unknown)=>void){
 const page=await browser.newPage();page.setDefaultTimeout(5000);
 let authStatus=200,authAbort=false,resetStatus=200,docsStatus=200,oaStatus=200,oaCode='NO_LLC',orderStatus='paid',conversion=false,hasPassword=false,resendStatus=200,deletionStatus=503,deleted=false,deleteCalls=0,contactCalls=0,nativeDialogs=0;
 const title='Operating agreement — Batch Four LLC';
 const document={id:'agreement',kind:'package',title,order_id:'company1',created_at:'2026-09-01',size_bytes:100};
 let docs:unknown[]=[];
 page.on('dialog',async dialog=>{nativeDialogs++;await dialog.accept();});
 await guardedRoute(page,'**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const data=(value:unknown)=>route.fulfill({contentType:'application/json',body:JSON.stringify({data:value})});
  const fail=(status:number,code='UNAVAILABLE')=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:{code,message:'Synthetic failure'}})});
  if(path==='/api/contact'){contactCalls++;return data({ok:true});}
  if(path==='/api/auth/login'||path==='/api/admin/login'){if(authAbort)return route.abort();return authStatus===200?data({ok:true}):fail(authStatus);}
  if(path==='/api/auth/forgot')return resetStatus===200?data({ok:true}):resetStatus===0?route.abort():fail(resetStatus);
  if(path.endsWith('/resend-welcome'))return resendStatus===200?data({ok:true,sent:true}):fail(resendStatus,'EMAIL_FAILED');
  if(path.endsWith('/status')&&path.startsWith('/api/orders/'))return data({status:orderStatus,llcName:'Batch Four LLC',isConversion:conversion,hasPassword});
  if(path==='/api/auth/me')return data({name:'Batch Four',email:'batch04@example.test'});
  if(path==='/api/admin/me')return data({ok:true});
  if(path==='/api/admin/orders')return data({orders:[],total:0,shown:0});
  if(path==='/api/portal/companies')return data([{orderId:'company1',llcName:'Batch Four LLC',formed:true,registeredAgentChoice:'SELF'}]);
  if(path==='/api/portal/documents')return docsStatus===200?data(deleted?docs.filter(d=>(d as {id:string}).id!=='agreement'):docs):fail(docsStatus);
  if(path==='/api/portal/oa/generations/gen1'&&route.request().method()==='DELETE'){deleteCalls++;if(deletionStatus!==200){if(deletionStatus===404)deleted=true;return fail(deletionStatus,'NOT_FOUND');}deleted=true;return data({ok:true});}
  if(path==='/api/portal/oa')return oaStatus===200?data({generations:deleted?[]:[{id:'gen1',document_id:'agreement',version:'sm-mm'}],memberManaged:true,seed:{llcName:'Batch Four LLC',members:[],suggestedOwners:[],series:[]},answers:null}):fail(oaStatus,oaCode);
  if(path==='/api/portal/services')return data({orders:[],members:[],series:[],llcFormed:true,llcName:'Batch Four LLC',sElection:{eligible:false},pricing:{seriesCents:5000,einCents:9500,sElectionCents:9500,certStatusCents:500,certifiedCopyCents:3000}});
  return data([]);
 });
 const go=async(path:string)=>{await page.goto(web+path);await page.waitForLoadState('networkidle');};
 const text=()=>page.locator('main').innerText();
 const shot=async(name:string)=>{if(process.env.SHOT_DIR){mkdirSync(process.env.SHOT_DIR,{recursive:true});await page.screenshot({path:`${process.env.SHOT_DIR}/batch04-${name}.png`,fullPage:true,animations:'disabled'});}};
 const attempt=async(label:string,fn:()=>Promise<void>)=>{try{await fn();}catch(e){check(false,label,String(e));}};
 await attempt('batch04 24: contact requires a message',async()=>{
  await go('/contact');await page.getByLabel('Full name').fill('Test Visitor');await page.getByLabel('Email',{exact:false}).fill('test@example.test');await page.getByRole('button',{name:'Send message'}).click();await page.waitForTimeout(200);
  const body=await page.locator('body').innerText();check(contactCalls===0&&body.includes('Message *')&&body.includes('Please add your name, email, and a message so we can reply.'),'batch04 24: contact requires a message',{contactCalls,body});
  await page.getByLabel('Message').fill('Please help with my order.');await page.getByRole('button',{name:'Send message'}).click();await page.waitForTimeout(200);check(contactCalls===1&&await page.getByLabel('Message').inputValue()==='','batch04 valid contact message submits and clears');
 });
 await attempt('batch04 N4.10: confirmation matches filing stage',async()=>{
  const states=[];
  for(conversion of [false,true])for(orderStatus of ['paid','filed','formed']){await go('/order/confirmed?ref=fixture');const body=await text();const expected=orderStatus==='paid'?"We're preparing your filing.":orderStatus==='filed'?'Your filing has been submitted.':conversion?'Your protected series have been established.':'Your LLC has been formed.';states.push({conversion,orderStatus,correct:body.includes(expected),body});}
  check(states.every(s=>s.correct),'batch04 N4.10: confirmation matches filing stage',states);
  check(!(await page.getByRole('link',{name:'Sign in to your portal',exact:true}).isVisible()),'batch04 new client is not sent to sign in before setting a password');
  resendStatus=503;await page.getByRole('button',{name:'Resend the email'}).click();await page.waitForTimeout(200);const error=await text();check(error.includes('Could not send the email. Please try again.')&&await page.getByRole('button',{name:'Resend the email'}).isVisible(),'batch04 failed resend is visible and retry remains',error);
  resendStatus=200;await page.getByRole('button',{name:'Resend the email'}).click();await page.waitForTimeout(200);check((await text()).includes('Sent — check your inbox.'),'batch04 successful resend is acknowledged');
  hasPassword=true;await go('/order/confirmed?ref=fixture');check(await page.getByRole('link',{name:'Sign in to your portal',exact:true}).isVisible()&&!(await page.getByRole('button',{name:'Resend the email'}).isVisible()),'batch04 returning client gets sign-in');
 });
 for(const office of [false,true])await attempt(office?'batch04 182: office login separates failures':'batch04 148: client login separates failures',async()=>{
  const cases=[];
  for(const status of [401,500,429,400,0]){authStatus=status;authAbort=status===0;await go(office?'/admin/login':'/portal/login');if(!office)await page.getByLabel('Email',{exact:true}).fill('client@example.test');await page.getByLabel('Password',{exact:true}).fill('Password123');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('p.text-destructive').waitFor();const message=await page.locator('p.text-destructive').innerText();const expected=status===401?(office?'Incorrect password.':'Incorrect email or password.'):status===500?'Something went wrong on our end. Please try again.':status===429?'Too many attempts. Try again in a few minutes.':status===400?(office?'Enter your password.':'Enter a valid email address and your password.'):'We could not reach the server. Check your connection and try again.';cases.push({status,message,correct:message===expected});}
  check(cases.every(x=>x.correct),office?'batch04 182: office login separates failures':'batch04 148: client login separates failures',cases);await shot(office?'office-login-failure':'client-login-failure');
  authStatus=200;authAbort=false;await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(web+(office?'/admin':'/portal'));check(true,office?'batch04 office login recovers':'batch04 client login recovers');
 });
 await attempt('batch04 147: reset asks for current sign-in email',async()=>{await go('/portal/forgot');const body=await text();check(body.includes('email address you currently use to sign in'),'batch04 147: reset asks for current sign-in email',body);});
 await attempt('batch04 N3.07: failed reset stays retryable',async()=>{
  const cases=[];for(resetStatus of [503,0,429]){await go('/portal/forgot');await page.getByLabel('Email',{exact:true}).fill('client@example.test');await page.getByRole('button',{name:'Email me a reset link'}).click();await page.waitForTimeout(200);const body=await text();cases.push({status:resetStatus,body,correct:!body.includes('a reset link is on its way')&&await page.getByRole('button',{name:'Email me a reset link'}).isVisible()&&(body.includes('We could not request')||body.includes('Too many requests'))});}
  check(cases.every(c=>c.correct),'batch04 N3.07: failed reset stays retryable',cases);await shot('reset-failure');
  resetStatus=200;await go('/portal/forgot');await page.getByLabel('Email',{exact:true}).fill('unknown@example.test');await page.getByRole('button',{name:'Email me a reset link'}).click();await page.waitForTimeout(200);check((await text()).includes('If an account exists for that email address'),'batch04 reset success does not reveal account existence');
 });
 await attempt('batch04 N3.09: failed mail loading is not empty mail',async()=>{
  docsStatus=503;await go('/portal?company=company1');await page.waitForTimeout(7500);const body=await text();check(body.includes('We could not load your documents or legal mail. Try again.')&&!body.includes("Nothing here — that's good news"),'batch04 N3.09: failed mail loading is not empty mail',body);await shot('mail-failure');
  docsStatus=200;await page.getByRole('button',{name:'Retry',exact:true}).first().click();await page.getByText(/Nothing here — that's good news/).waitFor();check(true,'batch04 successful empty mail load is distinguished from failure');
  const empty=await text();check(empty.includes('Your documents will appear here as they are prepared or uploaded.'),'batch04 145: documents explain preparation and upload',empty);
 });
 await attempt('batch04 115: agreement tools explain paid-order eligibility',async()=>{
  const cases=[];for(const path of ['/portal/agreement?company=company1','/portal/amend?company=company1'])for(const status of [400,500,401]){oaStatus=status;oaCode='NO_LLC';if(status!==400)oaCode='UNAVAILABLE';await go(path);const body=await text();cases.push({path,status,body,correct:status===400?body.includes("We couldn't find a paid order for this company."):status===500?body.includes("We couldn't check your agreement just now.")&&await page.getByRole('button',{name:'Try again'}).isVisible():await page.getByRole('link',{name:'Sign in again'}).isVisible()});}
  check(cases.every(c=>c.correct),'batch04 115: agreement tools explain paid-order eligibility',cases);
 });
 await attempt('batch04 143: agreement card separates eligibility and failure',async()=>{
  const cases=[];for(const [status,code]of [[400,'NO_LLC'],[400,'INVALID_INPUT'],[500,'UNAVAILABLE'],[401,'UNAUTHENTICATED']]as const){oaStatus=status;oaCode=code;await go('/portal?company=company1');const body=await text();cases.push({status,code,body,correct:code==='NO_LLC'?body.includes("We couldn't find a paid order for this company."):status===401?body.includes('Your sign-in has expired.'):body.includes("We couldn't check your agreement just now.")&&!body.includes('once your order is paid')});}
  check(cases.every(c=>c.correct),'batch04 143: agreement card separates eligibility and failure',cases);oaStatus=200;
 });
 await attempt('batch04 169: agreement deletion uses portal confirmation',async()=>{
  docs=[document,{id:'articles',kind:'articles',title:'Filed Articles',order_id:'company1',created_at:'2026-09-01',size_bytes:100}];await go('/portal?company=company1');await page.getByRole('button',{name:'Delete this agreement'}).click();await page.waitForTimeout(150);const dialog=page.getByRole('alertdialog');const hasDialog=await dialog.isVisible();const dialogText=hasDialog?await dialog.innerText():'';
  check(hasDialog&&dialogText.includes(title)&&dialogText.includes('Keep it')&&dialogText.includes('Delete')&&nativeDialogs===0,'batch04 169: agreement deletion uses portal confirmation',{nativeDialogs,dialogText});
  if(hasDialog){await shot('delete-confirmation');await dialog.getByRole('button',{name:'Keep it',exact:true}).click();check(deleteCalls===0,'batch04 cancelling agreement deletion sends no request');await page.getByRole('button',{name:'Delete this agreement'}).click();await dialog.getByRole('button',{name:'Delete',exact:true}).click();}
  await page.waitForTimeout(200);const body=await page.locator('body').innerText();check(body.includes('We could not delete that agreement. Try again.')&&await page.getByTestId('document-row').filter({hasText:title}).isVisible(),'batch04 163: agreement deletion reports failure',{deleteCalls,body});
  if(hasDialog){deletionStatus=200;await dialog.getByRole('button',{name:'Delete',exact:true}).click();await page.getByTestId('document-row').filter({hasText:title}).waitFor({state:'hidden'});check(await page.getByText('Filed Articles',{exact:true}).isVisible(),'batch04 successful deletion preserves filed documents');
  deleted=false;deletionStatus=404;await go('/portal?company=company1');await page.getByRole('button',{name:'Delete this agreement'}).click();await dialog.getByRole('button',{name:'Delete',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByText('That agreement is no longer on your account.',{exact:true}).waitFor();check(!(await page.getByTestId('document-row').filter({hasText:title}).isVisible()),'batch04 missing agreement refreshes the list and explains removal');}
 });
 await page.close();
}
if(import.meta.main){const stack=await startIsolatedStack({cwd:process.cwd()});const browser=await chromium.launch({headless:true});await isolateBrowser(browser);let failed=0;try{await batch04Walk(browser,stack.web,(ok,label,detail)=>{console.log(JSON.stringify({label,ok,detail:ok?undefined:detail}));if(!ok)failed++;});}finally{await browser.close();stack.stop();}process.exit(failed?1:0);}
