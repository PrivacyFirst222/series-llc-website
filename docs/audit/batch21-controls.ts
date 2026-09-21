/** Seven approved audit-control repairs. Always run under mandatory ledger-controls. */
import { spawnSync } from "node:child_process";
import { ROOT } from "./ledger-lib";
const commands = [
  ["bun", "run", "docs/audit/ruling-scope-check.ts"],
  ["bun", "run", "docs/audit/inventory-check.ts"],
  ["python3", "docs/audit/document-checks-test.py"],
  ["bun", "run", "webapp/scripts/isolation-check.ts"],
];
let failed = 0;
for (const cmd of commands) {
  console.log(`\n$ ${cmd.join(" ")}`);
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, env: process.env, stdio: "inherit" });
  if (r.status !== 0) { failed++; console.error(`FAILED: ${cmd.join(" ")} (exit ${r.status}, ${r.error ?? ""})`); }
}
console.log(`${commands.length - failed}/${commands.length} Batch 21 control suites passed`);
if (failed) process.exitCode = 1;
