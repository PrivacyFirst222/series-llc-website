import {getDb} from '../server/db';
import {activateRecovery} from '../server/s-election-recovery';
const [origin,operator]=process.argv.slice(2);
if(!origin||!operator)throw Error('Usage: recovery-activate.ts PRODUCTION_ORIGIN OPERATOR');
console.log(JSON.stringify(await activateRecovery(await getDb(),origin,operator)));
