import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const early = process.argv[2] === 'early';
const dir = mkdtempSync(join(tmpdir(), 'batch25-import-probe-'));
try {
  const a = join(dir, 'a.mjs'), b = join(dir, 'b.mjs');
  await Bun.write(a, 'export const value = 1;');
  if (early) await Bun.write(b, 'export const value = 2;');
  console.log(JSON.stringify({ early, first: (await import(a)).value }));
  if (!early) await Bun.write(b, 'export const value = 2;');
  console.log(JSON.stringify({ secondFileExists: existsSync(b) }));
  try { console.log(JSON.stringify({ second: (await import(b)).value })); }
  catch (e) { console.log(JSON.stringify({ error: String(e) })); process.exitCode = 1; }
} finally { rmSync(dir, { recursive: true, force: true }); }
