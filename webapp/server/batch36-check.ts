/** Mandatory real-route and browser regression check; the walk owns its fixture. */
import { fileURLToPath } from 'node:url';
export async function batch36Checks(report: (label: string, ok: boolean, detail?: unknown) => void) {
  const child = Bun.spawn([process.execPath, fileURLToPath(new URL('../scripts/batch36-walk.ts', import.meta.url))], {stdout:'pipe', stderr:'pipe'});
  const [out, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  const line = out.split('\n').find(x => x.startsWith('B36:'));
  const result = line ? JSON.parse(line.slice(4)) : null;
  report('batch36 office workflow', code === 0 && !!result?.rows?.length && result.rows.every((r:{ok:boolean}) => r.ok), {code,result,error:code?error:undefined});
}
if (import.meta.main) await batch36Checks((label,ok,detail) => {console.log(JSON.stringify({label,ok,detail}));process.exitCode=ok?0:1;});
