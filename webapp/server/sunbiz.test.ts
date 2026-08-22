/** Parser test against real records recorded from doc/cor/20260821c.txt
 *  (five genuine rows + one deliberately broken row). Run:
 *  bun run server/sunbiz.test.ts */
import { readFileSync } from "node:fs";
import { parseCorFile, parseCorRecord } from "./sunbiz";

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) console.log(`  ok  ${msg}`);
  else { failed++; console.error(`FAIL  ${msg}`); }
}

const text = readFileSync(new URL("./fixtures/sunbiz-daily-sample.txt", import.meta.url), "latin1");
const { entities, skipped } = parseCorFile(text);

ok(entities.length === 5, `5 of 6 fixture rows parse (got ${entities.length})`);
ok(skipped === 1, `1 broken row skipped (got ${skipped})`);

const first = entities[0];
ok(first.docNumber === "L26000435080", `doc number (got ${first.docNumber})`);
ok(first.name === "ROTELLA FARMS LLC", `name (got ${first.name})`);
ok(first.status === "A", `status (got ${first.status})`);
ok(first.filingType === "FLAL", `filing type (got ${first.filingType})`);
ok(first.fileDate === "2026-08-18", `file date MMDDYYYY -> ISO (got ${first.fileDate})`);
ok(first.normKey === "ROTELLA FARM", `norm key strips LLC + plural (got ${first.normKey})`);

// Guide: "Status: 'A' (active), 'I' (inactive)" — an 'I' row must parse too.
const inactive = parseCorRecord(entities[1] ? text.split("\n")[1].slice(0, 204) + "I" + text.split("\n")[1].slice(205) : "");
ok(inactive !== null && inactive.status === "I", "inactive rows parse");

if (failed) { console.error(`${failed} FAILED`); process.exit(1); }
console.log("All sunbiz parser checks passed.");
