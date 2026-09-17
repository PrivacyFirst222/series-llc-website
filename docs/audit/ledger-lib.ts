/**
 * The fix ledger's shared parts (17 Sep 2026, FAILURES.md P88–P90; reviewed by
 * Codex in four rounds before it was built).
 *
 * The audit machinery in this folder finds defects. This records repairs:
 * which item, which batch and revision, who did it, the exact commit Adam
 * accepted, and what must stay true afterwards. Nothing here is graded by the
 * session that made the fix — the "before" words come from the audit finding
 * or are proven present at proposal time, the "after" words come from the
 * batch file Adam approved before Go, and the acceptance is recorded outside
 * the repository by Adam's own message or command.
 *
 * What it promises: it DETECTS a regression that a recorded assertion covers,
 * and it refuses a release Adam has not accepted. It does not promise that a
 * past fix can never be disturbed, and a session holding Adam's permissions
 * could bypass all of it. It is a procedural safeguard.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
export const LEDGER = join(ROOT, "docs/audit/ledger.json");
export const BATCHES = join(ROOT, "docs/audit/batches");

/** Adam's acceptances and the review packages live OUTSIDE the repository,
 *  where a commit cannot rewrite them. FPSLLC_HOME exists so the
 *  demonstrations can run against a simulated acceptance in a disposable
 *  copy; nothing else sets it. */
export const HOME = process.env.FPSLLC_HOME || join(homedir(), ".fpsllc");
export const ACCEPTANCES = join(HOME, "acceptances.jsonl");
export const REVIEWS = join(HOME, "reviews");

/* ------------------------------ the record ----------------------------- */

export type Assertion =
  /** A wording fix: `before` became `after` in `file`. Afterwards `after`
   *  must be in the file and `before` must be nowhere in the product. */
  | { kind: "replace"; file: string; before: string; after: string; count?: number; for?: string }
  /** A deletion, or a sentence retired everywhere. `allow` names the exact
   *  places it may legitimately remain: file, how many times, and the words
   *  around it — never a whole-file exemption. */
  | { kind: "absent"; text: string; allow?: { file: string; count: number; context: string }[]; for?: string }
  | { kind: "present"; file: string; text: string; for?: string }
  /** What a reader sees on a rendered page of the running site. */
  | { kind: "page"; path: string; present?: string[]; absent?: string[]; for?: string }
  /** A master and the Word document generated from it. */
  | { kind: "document"; master: string; word: string; masterPresent?: string[]; masterAbsent?: string[]; wordPresent?: string[]; wordAbsent?: string[]; for?: string }
  /** A behaviour, proven by a named check in one of the suites. A check that
   *  is missing from the results, or did not run, counts as failed. */
  | { kind: "check"; suite: "server" | "walk"; label: string; for?: string };

export type PartStatus = "open" | "assigned" | "implemented" | "accepted" | "released";
const ORDER: PartStatus[] = ["open", "assigned", "implemented", "accepted", "released"];

export interface HistoryEntry { at: string; event: string; batch?: string; revision?: number; note?: string }

export interface Fix {
  batch: string;
  revision: number;
  commit: string;
  doneBy: string;
  assertions: Assertion[];
  /** Entries in docs/facts.md that carry this fix's shared facts. */
  facts?: string[];
}

export interface Part {
  key: string;
  scope: string;
  status: PartStatus;
  batch?: string;
  waitsOn: string[];
  history: HistoryEntry[];
  fix?: Fix;
}

export interface Item {
  id: string;
  tag: string;
  area: string;
  housekeeping: boolean;
  source: string;
  /** The finding exactly as its auditor wrote it. */
  text: string;
  verdict: "open" | "dropped" | "optional";
  verdictReason?: string;
  codex?: { status: string; note: string };
  correctedReplacement?: string;
  /** Set when this item is a second sighting of another: that item's id. */
  canonical?: string;
  waitsOn: string[];
  parts: Part[];
}

export interface Ruling { date: string; item: string; part?: string; text: string; supersedes?: string }

export interface BatchIndex { id: string; revision: number; frozenHash: string; status: "proposed" | "authorized" | "implemented" | "accepted" | "released" | "rejected"; model: string; base: string; history: HistoryEntry[] }

export interface Ledger { version: 1; builtFrom: string[]; items: Item[]; rulings: Ruling[]; batches: BatchIndex[] }

export interface BatchFile {
  id: string;
  revision: number;
  title: string;
  model: string;
  /** The commit on main this batch was cut from. */
  base: string;
  items: { id: string; part: string; covers?: string[]; scope: string; assertions: Assertion[] }[];
  /** Every file the batch may touch. "replace" files are rebuilt from the
   *  declared replacements and compared; "code" files are left to Adam's
   *  complete-diff review; "control" marks a check, hook, guard or publishing
   *  control, which must always be declared. */
  files: { path: string; mode: "replace" | "code" | "new" | "delete" | "generated"; control?: boolean; why: string }[];
  requiredChecks: string[];
}

/* -------------------------------- helpers ------------------------------ */

export const rd = (p: string): string => readFileSync(p, "utf8");
export const sha256 = (s: string | Buffer): string => createHash("sha256").update(s).digest("hex");
export const now = (): string => new Date().toISOString();

export function git(args: string[], opts: { allowFail?: boolean } = {}): string {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    if (opts.allowFail) return "";
    throw e;
  }
}

/** True when the git command succeeds (exit 0). */
export function gitOk(args: string[]): boolean {
  try { execFileSync("git", args, { cwd: ROOT, stdio: "ignore" }); return true; } catch { return false; }
}

/** A file's bytes at a commit — Word documents are not text. */
export function gitBytes(spec: string): Buffer | null {
  try { return execFileSync("git", ["cat-file", "-p", spec], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); } catch { return null; }
}

export function loadLedger(text?: string): Ledger {
  return JSON.parse(text ?? rd(LEDGER)) as Ledger;
}
export function saveLedger(l: Ledger): void {
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");
}

export function batchPath(id: string): string { return join(BATCHES, id, "batch.json"); }
export function loadBatch(id: string): BatchFile { return JSON.parse(rd(batchPath(id))) as BatchFile; }

/** The hash Adam's Go freezes: everything he approved, in a stable order. */
export function frozenHashOf(b: BatchFile): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable)
      : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
      : v;
  return sha256(JSON.stringify(stable(b)));
}

/** Product files, discovered fresh on every run — the audit's 166-file
 *  inventory is a snapshot and a new or renamed file must not escape. The
 *  check suites and generated bundles are not product text. */
export function productFiles(): string[] {
  const out: string[] = [];
  const skipDir = new Set(["node_modules", "dist", ".dev-data", "audit", "source", "word", "ui"]);
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (!skipDir.has(name)) walk(p); continue; }
      const rel = relative(ROOT, p).split("\\").join("/");
      if (!/\.(tsx?|md|json|html)$/.test(rel)) continue;
      if (/\.test\.tsx?$/.test(rel) || /^webapp\/server\/e2e\.ts$/.test(rel)) continue;
      if (/^docs\//.test(rel) && !/\.md$/.test(rel)) continue;
      out.push(rel);
    }
  };
  walk(join(ROOT, "webapp/src"));
  walk(join(ROOT, "webapp/server"));
  walk(join(ROOT, "docs"));
  out.push("webapp/index.html", "webapp/vercel.json");
  return out.sort();
}

export const count = (hay: string, needle: string): number => (needle === "" ? 0 : hay.split(needle).length - 1);

/** Paths that are records, not product: a push made only of these needs no
 *  acceptance (Codex, round 4). Accepted batches' files and released fixes
 *  inside the ledger are separately protected from edits. */
export const RECORD_PATHS: RegExp[] = [
  /^FAILURES\.md$/,
  /^docs\/audit\/ledger\.json$/,
  /^docs\/audit\/findings-open\.md$/,
  /^docs\/audit\/rulings\.md$/,
  /^docs\/audit\/batches\/[^/]+\/(batch\.json|batch\.md|evidence\/.+|codex-review\.md)$/,
];
export const isRecordPath = (p: string): boolean => RECORD_PATHS.some((r) => r.test(p));

/** Checks, hooks, approval rules and publishing controls. A change to any of
 *  these must be declared in its batch with control: true. */
export const CONTROL_PATHS: RegExp[] = [
  /^\.githooks\//, /^\.claude\/hooks\//, /^\.claude\/settings/, /^\.github\//,
  /^docs\/audit\/[^/]+\.ts$/, /^docs\/facts-check\.ts$/, /^docs\/[^/]+\.py$/,
  /^webapp\/server\/e2e\.ts$/, /^webapp\/scripts\//, /\.test\.tsx?$/, /^webapp\/package\.json$/,
];
export const isControlPath = (p: string): boolean => CONTROL_PATHS.some((r) => r.test(p));

/* ------------------------ rules shared by both gates -------------------- */

const partOf = (l: Ledger, id: string, key: string): Part | undefined => l.items.find((i) => i.id === id)?.parts.find((p) => p.key === key);

/** What may never happen between two versions of the ledger: a source record
 *  disappearing, history being rewritten, a status moving backwards without
 *  a recorded reason, or an accepted fix's assertions changing without a
 *  ruling that supersedes it. */
export function ledgerRegressions(before: Ledger, after: Ledger): string[] {
  const out: string[] = [];
  for (const b of before.items) {
    const a = after.items.find((i) => i.id === b.id);
    if (!a) { out.push(`item ${b.id}: the source record was removed`); continue; }
    if (a.text !== b.text) out.push(`item ${b.id}: the auditor's text was edited`);
    for (const bp of b.parts) {
      const ap = a.parts.find((p) => p.key === bp.key);
      if (!ap) {
        if (bp.status !== "open") out.push(`item ${b.id} part ${bp.key}: removed after work began`);
        continue;
      }
      const prefix = JSON.stringify(ap.history.slice(0, bp.history.length)) === JSON.stringify(bp.history);
      if (!prefix) out.push(`item ${b.id} part ${bp.key}: history was rewritten (it is append-only)`);
      const back = ORDER.indexOf(ap.status) < ORDER.indexOf(bp.status);
      const reasoned = ap.history.slice(bp.history.length).some((h) => /^(rejected|reopened|superseded)/.test(h.event));
      if (back && !reasoned) out.push(`item ${b.id} part ${bp.key}: status went back from ${bp.status} to ${ap.status} with no recorded reason`);
      if ((bp.status === "accepted" || bp.status === "released") && bp.fix) {
        const same = JSON.stringify(ap.fix?.assertions ?? null) === JSON.stringify(bp.fix.assertions);
        const ruled = after.rulings.slice(before.rulings.length).some((r) => r.item === b.id && (!r.part || r.part === bp.key));
        if (!same && !ruled && !reasoned) out.push(`item ${b.id} part ${bp.key}: an accepted fix's assertions changed with no ruling`);
      }
    }
  }
  if (JSON.stringify(after.rulings.slice(0, before.rulings.length)) !== JSON.stringify(before.rulings)) out.push("rulings were rewritten (they are append-only)");
  for (const bb of before.batches) {
    const ab = after.batches.find((x) => x.id === bb.id && x.revision === bb.revision);
    if (!ab) out.push(`batch ${bb.id} r${bb.revision}: its record was removed`);
    else if (ab.frozenHash !== bb.frozenHash) out.push(`batch ${bb.id} r${bb.revision}: its frozen hash changed — a changed batch is a new revision`);
  }
  return out;
}

/** Every fix Adam has accepted, replayed against the files as they stand:
 *  the assertions a text search can decide. Page, document-in-Word and
 *  behaviour assertions are replayed by webapp/scripts/audit-assert.ts. */
export function replayStatic(l: Ledger, read: (file: string) => string | null, files: string[]): string[] {
  const out: string[] = [];
  const cache = new Map<string, string | null>();
  const get = (f: string) => { if (!cache.has(f)) cache.set(f, read(f)); return cache.get(f) ?? null; };
  for (const item of l.items) for (const part of item.parts) {
    if (!part.fix || !(part.status === "accepted" || part.status === "released" || part.status === "implemented")) continue;
    const name = `item ${item.id}${part.key === "all" ? "" : ` (${part.key})`}`;
    const afters = part.fix.assertions.flatMap((a) => (a.kind === "replace" ? [a.after] : []));
    for (const a of part.fix.assertions) {
      if (a.kind === "replace" || a.kind === "present") {
        const text = a.kind === "replace" ? a.after : a.text;
        const body = get(a.file);
        if (body === null) out.push(`${name}: ${a.file} no longer exists`);
        else if (!body.includes(text)) out.push(`${name}: the fixed wording is gone from ${a.file}: "${text.slice(0, 90)}"`);
      }
      if (a.kind === "replace" || a.kind === "absent") {
        const text = a.kind === "replace" ? a.before : a.text;
        const allow = a.kind === "absent" ? a.allow ?? [] : [];
        for (const f of files) {
          let body = get(f);
          if (body === null) continue;
          // An approved sentence that contains the retired one is not a relapse.
          for (const keep of afters) body = body.split(keep).join("");
          const n = count(body, text);
          if (n === 0) continue;
          const ok = allow.find((x) => x.file === f);
          if (ok && n <= ok.count && (get(f) ?? "").includes(ok.context)) continue;
          out.push(`${name}: retired wording is back in ${f} (${n}×): "${text.slice(0, 90)}"`);
        }
      }
      if (a.kind === "document") {
        const body = get(a.master);
        if (body === null) { out.push(`${name}: ${a.master} no longer exists`); continue; }
        for (const t of a.masterPresent ?? []) if (!body.includes(t)) out.push(`${name}: ${a.master} no longer says "${t.slice(0, 90)}"`);
        for (const t of a.masterAbsent ?? []) if (body.includes(t)) out.push(`${name}: ${a.master} says again "${t.slice(0, 90)}"`);
      }
    }
  }
  return out;
}

export interface Acceptance { kind: "accept" | "reject"; batch: string; revision: number | null; commit: string | null; note?: string; at: string; source: string }
export function acceptances(): Acceptance[] {
  if (!existsSync(ACCEPTANCES)) return [];
  return rd(ACCEPTANCES).split("\n").filter((x) => x.trim()).map((x) => JSON.parse(x) as Acceptance);
}

export { partOf, existsSync, join };
