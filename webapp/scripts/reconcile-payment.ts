import {readFileSync} from 'node:fs';
import {reconcileRecordedPayment} from '../server/payment-reconciliation';
const path=process.argv[2];
if(!path)throw Error('Usage: bun scripts/reconcile-payment.ts ORIGINAL-REQUEST-EVIDENCE.json');
console.log(JSON.stringify(await reconcileRecordedPayment(JSON.parse(readFileSync(path,'utf8'))),null,2));
