/**
 * The audit inventory (16 Sep 2026, FAILURES.md P86–P87): every product file
 * with its exact line count, sorted into areas by path. Nobody chooses what
 * to read; this script lists it, and docs/audit/coverage-check.ts refuses an
 * audit that did not read all of it.
 *
 *   bun run docs/audit/inventory.ts            → docs/audit/inventory.json
 *   bun run docs/audit/inventory.ts --buckets 7 → docs/audit/runs/<today>/buckets.json
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

export type Area =
  | "public pages"
  | "order form and payment"
  | "client portal"
  | "office"
  | "server and emails"
  | "documents and masters"
  | "guidance";

export interface InventoryFile { path: string; lines: number; area: Area }

const EXCLUDED_REASONS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^webapp\/src\/components\/ui\//, reason: "stock UI widgets (shadcn), not product text" },
  { pattern: /\.test\.tsx?$/, reason: "test file" },
  { pattern: /^webapp\/server\/e2e\.ts$/, reason: "check suite" },
  { pattern: /^webapp\/scripts\//, reason: "check suite" },
  { pattern: /^webapp\/api\//, reason: "generated bundle" },
  { pattern: /^docs\/(coverage-605|event-map|event-map-text-review|oa-map|dependency-audit|db-restore)\.md$/, reason: "gate output or ops note, not client-facing" },
];

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === ".dev-data" || name === "runs" || name === "source" || name === "word") continue;
      walk(p, out);
    } else out.push(p);
  }
}

function areaOf(rel: string): Area {
  if (/^webapp\/src\/pages\/admin\//.test(rel)) return "office";
  if (/^webapp\/src\/pages\/portal\//.test(rel) || /^webapp\/src\/content\/oaLearnMore/.test(rel)) return "client portal";
  if (/^webapp\/src\/components\/forms\//.test(rel) || /^webapp\/src\/pages\/(FormLLC|OrderConfirmed)\.tsx$/.test(rel)) return "order form and payment";
  if (/^webapp\/src\//.test(rel)) return "public pages";
  if (/^webapp\/server\/templates-/.test(rel) || /^webapp\/server\/(oa|oa-amendment|oa-capital|new-series|statement|s-election|order-summary|manual-pdf|pdf-render|filing)\.ts$/.test(rel)) return "documents and masters";
  if (/^webapp\/server\//.test(rel) || /^webapp\/vercel\.json$/.test(rel)) return "server and emails";
  return "guidance";
}

export function buildInventory(): { files: InventoryFile[]; excluded: { path: string; reason: string }[] } {
  const all: string[] = [];
  walk(join(ROOT, "webapp/src"), all);
  walk(join(ROOT, "webapp/server"), all);
  walk(join(ROOT, "docs"), all);
  all.push(join(ROOT, "webapp/vercel.json"));
  const files: InventoryFile[] = [];
  const excluded: { path: string; reason: string }[] = [];
  for (const abs of all) {
    const rel = relative(ROOT, abs).split("\\").join("/");
    if (!/\.(tsx?|md|json)$/.test(rel)) continue;
    if (/^webapp\/src\//.test(rel) && /\.json$/.test(rel)) continue;
    if (/^docs\//.test(rel) && !/\.md$/.test(rel)) continue;
    if (/^docs\/audit\//.test(rel)) continue;
    const ex = EXCLUDED_REASONS.find((e) => e.pattern.test(rel));
    if (ex) { excluded.push({ path: rel, reason: ex.reason }); continue; }
    const text = readFileSync(abs, "utf8");
    const lines = text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    files.push({ path: rel, lines, area: areaOf(rel) });
  }
  const order: Area[] = ["public pages", "order form and payment", "client portal", "office", "server and emails", "documents and masters", "guidance"];
  files.sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area) || a.path.localeCompare(b.path));
  return { files, excluded };
}

/** Greedy split into N buckets of roughly equal lines, keeping areas together
 *  where the arithmetic allows: files are taken in area order and each goes
 *  to the current bucket until it is full. */
export function buckets(files: InventoryFile[], n: number): InventoryFile[][] {
  const total = files.reduce((s, f) => s + f.lines, 0);
  const target = Math.ceil(total / n);
  const out: InventoryFile[][] = [[]];
  let sum = 0;
  for (const f of files) {
    if (sum + f.lines > target && out[out.length - 1].length > 0 && out.length < n) { out.push([]); sum = 0; }
    out[out.length - 1].push(f);
    sum += f.lines;
  }
  return out;
}

if (import.meta.main) {
  const inv = buildInventory();
  const total = inv.files.reduce((s, f) => s + f.lines, 0);
  writeFileSync(join(ROOT, "docs/audit/inventory.json"), JSON.stringify({ generatedAt: new Date().toISOString(), totalFiles: inv.files.length, totalLines: total, files: inv.files, excluded: inv.excluded }, null, 2) + "\n");
  console.log(`inventory: ${inv.files.length} files, ${total} lines (${inv.excluded.length} excluded)`);
  const bi = process.argv.indexOf("--buckets");
  if (bi >= 0) {
    const n = Number(process.argv[bi + 1] ?? 7);
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const dir = join(ROOT, "docs/audit/runs", day);
    mkdirSync(dir, { recursive: true });
    const b = buckets(inv.files, n).map((files, i) => ({ id: `bucket-${i + 1}`, lines: files.reduce((s, f) => s + f.lines, 0), files }));
    writeFileSync(join(dir, "buckets.json"), JSON.stringify({ day, buckets: b }, null, 2) + "\n");
    for (const x of b) console.log(`${x.id}: ${x.files.length} files, ${x.lines} lines`);
  }
}
