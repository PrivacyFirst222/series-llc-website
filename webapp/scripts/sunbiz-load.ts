/**
 * One-time / catch-up loader for the fl_entities mirror.
 *
 *   bun run scripts/sunbiz-load.ts --baseline <label> file1.txt [file2.txt ...]
 *   bun run scripts/sunbiz-load.ts --daily file1.txt [file2.txt ...]
 *
 * --baseline: load quarterly baseline file(s) (extracted from
 *   doc/Quarterly/Cor/cordata.zip) and record the label (e.g. "2026-Q3").
 * --daily: load daily files named YYYYMMDDc.txt; records the newest date
 *   as fl_sync_state.last_daily.
 *
 * Reads line-by-line (the quarterly is multi-GB), reports raw counts:
 * lines read, records written, rows skipped.
 */
import { createReadStream } from "node:fs";
import { stdin as procStdin } from "node:process";
import { createInterface } from "node:readline";
import { basename } from "node:path";
import { parseCorRecord, upsertEntities, setSyncState, type FlEntity } from "../server/sunbiz";

const args = process.argv.slice(2);
const mode = args[0];
if (mode !== "--baseline" && mode !== "--daily") {
  console.error("Usage: sunbiz-load.ts --baseline <label> files... | --daily files...");
  process.exit(1);
}
const label = mode === "--baseline" ? args[1] : null;
const files = mode === "--baseline" ? args.slice(2) : args.slice(1);
if (files.length === 0 || (mode === "--baseline" && !label)) {
  console.error("No files given.");
  process.exit(1);
}

let totalLines = 0, totalWritten = 0, totalSkipped = 0, totalFiltered = 0;
let newestDaily: string | null = null;

/** Baseline loads keep only rows that can block a client's name: every
 *  active entity, plus inactives whose last transaction is recent enough
 *  that the s. 605.0715 hold window (up to one year) could still apply —
 *  400 days, a buffer past the statute. Older inactives are what the
 *  checker reports as clear, identical to absent, so they are not stored
 *  (the full file is ~12.8M rows; this keeps the mirror a fraction of it). */
const KEEP_INACTIVE_DAYS = 400;
const cutoff = Date.now() - KEEP_INACTIVE_DAYS * 86_400_000;
function keep(e: FlEntity): boolean {
  if (mode !== "--baseline") return true;
  if (e.status === "A") return true;
  const ref = e.lastTxnDate ?? e.fileDate;
  return ref !== null && new Date(ref).getTime() >= cutoff;
}

for (const file of files) {
  const input = file === "-" ? procStdin : createReadStream(file, { encoding: "latin1" });
  if (file === "-") procStdin.setEncoding("latin1");
  const rl = createInterface({ input, crlfDelay: Infinity });
  let batch: FlEntity[] = [];
  let lines = 0, written = 0, skipped = 0, filtered = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    lines++;
    const e = parseCorRecord(line);
    if (!e) { skipped++; continue; }
    if (!keep(e)) { filtered++; continue; }
    batch.push(e);
    if (batch.length >= 5000) {
      written += await upsertEntities(batch);
      batch = [];
      if (written % 100_000 < 5000) console.log(`  ${basename(file)}: ${written} written…`);
    }
  }
  if (batch.length) written += await upsertEntities(batch);
  console.log(`${basename(file)}: ${lines} lines, ${written} written, ${filtered} filtered (old inactive), ${skipped} skipped`);
  totalLines += lines; totalWritten += written; totalSkipped += skipped; totalFiltered += filtered;
  const m = basename(file).match(/^(\d{4})(\d{2})(\d{2})c\.txt$/);
  if (mode === "--daily" && m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    if (!newestDaily || iso > newestDaily) newestDaily = iso;
  }
}

if (mode === "--baseline") await setSyncState({ baselineLabel: label! });
if (newestDaily) await setSyncState({ lastDaily: newestDaily });
console.log(`TOTAL: ${totalLines} lines, ${totalWritten} written, ${totalFiltered} filtered (old inactive), ${totalSkipped} skipped`);
process.exit(0);
