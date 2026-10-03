/** Batch 33: real validators and HMAC verification, offline and without a server. */
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
process.env.E2E_OFFLINE='1';
const {env}=await import('../server/env');
if(!env.OFFLINE)throw Error('Offline mode required');
globalThis.fetch=async()=>{throw Error('No network allowed in Batch33 fixture');};
const {agentFixture}=await import('../server/batch06-check');
const {validateStep}=await import('../src/components/forms/florida-llc/stepValidation');
const {orderFormSchema}=await import('../server/validation');
const {verifyWebhookSignature}=await import('../server/square');
const {raRenewalNoticeEmail}=await import('../server/email');
let count=0,failed=0;
function check(ok:boolean,label:string,detail?:unknown){count++;if(!ok)failed++;console.log('CHECK_RESULT '+JSON.stringify({suite:'batch33',label,ok,commit:process.env.CHECK_COMMIT??'local',run:process.env.CHECK_RUN_ID??'local',...(!ok?{detail}:{})}));}
const fields=['registeredAgentAcceptanceName','registeredAgentElectronicSignature']as const;
const base=agentFixture();
check(orderFormSchema.safeParse(base).success,'complete personal-agent order still passes');
for(const field of fields){
 for(const value of ['', '   ']){
  const input={...base,[field]:value},ui=validateStep('acceptance',input),parsed=orderFormSchema.safeParse(input);
  const messages=parsed.success?[]:parsed.error.issues.filter(i=>i.path.join('.')===field).map(i=>i.message);
  check(/required/i.test(ui[field]??'')&&!/match/i.test(ui[field]??'')&&messages.length===1&&/required/i.test(messages[0]),`blank agent fields show only required errors: ${field} ${value.length?'spaces':'empty'}`,{ui,messages});
 }
 const bad={...base,[field]:'Different Person'},ui=validateStep('acceptance',bad),p=orderFormSchema.safeParse(bad);
 check(/must match/.test(ui[field]??'')&&!p.success&&p.error.issues.some(i=>i.path.join('.')===field&&/must match/.test(i.message)),`nonblank mismatch remains refused: ${field}`);
 const spaced={...base,[field]:' John Smith, Jr. '};
 check(!validateStep('acceptance',spaced)[field]&&orderFormSchema.safeParse(spaced).success,`outer whitespace stays accepted: ${field}`);
}
const one={...base,registeredAgentAcceptanceName:'John'},oneUI=validateStep('acceptance',one),oneServer=orderFormSchema.safeParse(one);
check(/first.*last/i.test(oneUI.registeredAgentAcceptanceName??'')&&!oneServer.success&&oneServer.error.issues.some(i=>i.path[0]==='registeredAgentAcceptanceName'&&/first.*last/i.test(i.message)),'first-and-last-name requirement retained');
const saved={key:env.SQUARE_WEBHOOK_SIGNATURE_KEY,prod:env.isProd};
try{
 env.SQUARE_WEBHOOK_SIGNATURE_KEY='batch33-fixture-key';
 const notificationUrl='https://example.invalid/api/square/webhook',rawBody='{"type":"payment.updated","data":{"id":"fixture"}}';
 const signatureHeader=createHmac('sha256',env.SQUARE_WEBHOOK_SIGNATURE_KEY).update(notificationUrl+rawBody).digest('base64');
 check(verifyWebhookSignature({notificationUrl,rawBody,signatureHeader}),'Square known valid HMAC accepted');
 for(const [label,opts] of Object.entries({alteredBody:{notificationUrl,rawBody:rawBody+' ',signatureHeader},alteredUrl:{notificationUrl:notificationUrl+'/other',rawBody,signatureHeader},firstByte:{notificationUrl,rawBody,signatureHeader:(signatureHeader[0]==='A'?'B':'A')+signatureHeader.slice(1)},lastByte:{notificationUrl,rawBody,signatureHeader:signatureHeader.slice(0,-1)+'X'},short:{notificationUrl,rawBody,signatureHeader:'x'},long:{notificationUrl,rawBody,signatureHeader:signatureHeader+'x'},missing:{notificationUrl,rawBody,signatureHeader:null},unicode:{notificationUrl,rawBody,signatureHeader:'é'.repeat(signatureHeader.length)}})){
  check(!verifyWebhookSignature(opts),`Square refuses ${label} signature input`);
 }
 env.SQUARE_WEBHOOK_SIGNATURE_KEY='';env.isProd=true;
 check(!verifyWebhookSignature({notificationUrl,rawBody,signatureHeader}),'Square missing key refused in production');
 env.isProd=false;check(verifyWebhookSignature({notificationUrl,rawBody,signatureHeader:null}),'Square development no-key behavior preserved');
}finally{env.SQUARE_WEBHOOK_SIGNATURE_KEY=saved.key;env.isProd=saved.prod;}
const noCard=raRenewalNoticeEmail({name:'Casey',llcName:'Fixture LLC',renewalDate:'October 1, 2026',amount:'$99',last4:null,chargeDate:'September 16, 2026',cancelBy:'September 1, 2026',linkUrl:'https://example.invalid/pay'});
check(noCard.html.includes('No eligible card is on file')&&noCard.html.includes('$99')&&noCard.html.includes('https://example.invalid/pay'),'renewal notice preserves no-card wording');
const admin=readFileSync(new URL('../server/routes-admin.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../src/pages/admin/ServiceOrdersSection.tsx',import.meta.url),'utf8');
check(!/\bein_pending\b/.test(admin+ui),'unused account-wide EIN flag removed');
console.log(`${count-failed}/${count} Batch33 checks passed`);if(failed)process.exit(1);
