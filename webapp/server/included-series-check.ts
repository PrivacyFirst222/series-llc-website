/** Mandatory regression check for the included third series; the check file owns its own throwaway database. */
import { fileURLToPath } from 'node:url';
export async function includedSeriesChecks(report: (label: string, ok: boolean, detail?: unknown) => void) {
  const child = Bun.spawn([process.execPath, fileURLToPath(new URL('./included-series-credit-check.ts', import.meta.url))], {stdout:'pipe', stderr:'pipe'});
  const [out, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  const summary = out.split('\n').find(x => x.startsWith('[included series credit]'));
  const m = summary?.match(/(\d+) checks, 0 failures\./);
  report('included third series credit', code === 0 && !!m && Number(m[1]) > 0, {code,summary,failures:out.split('\n').filter(x => x.startsWith('FAIL')),error:code?error:undefined});
}
if (import.meta.main) await includedSeriesChecks((label,ok,detail) => {console.log(JSON.stringify({label,ok,detail}));process.exitCode=ok?0:1;});
