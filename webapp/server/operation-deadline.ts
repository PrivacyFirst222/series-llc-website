import {AsyncLocalStorage} from 'node:async_hooks';
/** Request-scoped absolute deadline. Nested cleanup/provider calls inherit the
 * same bound; a helper cannot accidentally allocate a fresh relative timeout. */
const deadlines=new AsyncLocalStorage<number>();
export const activeDeadline=()=>deadlines.getStore()??Infinity;
export function checkDeadline(deadline=activeDeadline()):void{if(Date.now()>=deadline)throw new DOMException('Operation deadline reached','TimeoutError');}
export function ioSignal(maxMs=20000,deadline=activeDeadline()):AbortSignal {
 checkDeadline(deadline);return AbortSignal.timeout(Math.max(1,Math.min(maxMs,deadline-Date.now())));
}
export async function withDeadline<T>(deadline:number,work:()=>Promise<T>):Promise<T>{
 const until=Math.min(deadline,activeDeadline());checkDeadline(until);return deadlines.run(until,async()=>{const result=await work();checkDeadline(until);return result;});
}
export function providerFailure(response:Response,action:string):Error&{retryAfterMs?:number}{
 const error:Error&{retryAfterMs?:number}=new Error(`${action} failed (${response.status})`);
 if(response.status===429||response.status===503){
  const header=response.headers.get('retry-after'),seconds=header!==null?Number(header):NaN;
  error.retryAfterMs=Number.isFinite(seconds)?Math.max(0,seconds*1000):header&&Number.isFinite(Date.parse(header))?Math.max(0,Date.parse(header)-Date.now()):1000;
 }
 return error;
}
