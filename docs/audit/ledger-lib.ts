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
  /** Codex's verdict on the DEFECT (status) and, separately, on the proposed
   *  REPLACEMENT. A confirmed defect does not mean an approved fix. */
  codex?: { status: string; evidence: string; replacementOk: boolean | null; replacementNote: string };
  correctedReplacement?: string;
  /** Set when this item is a second sighting of another: that item's id. */
  canonical?: string;
  waitsOn: string[];
  parts: Part[];
}

export interface Ruling { date: string; item: string; part?: string; text: string; supersedes?: string }

/** Three different things, recorded separately: the push, the live site, the Dropbox copies. */
export interface ReleaseRecord { git: { at: string; remoteMain: string }; deployment: { at: string; evidence: string } | null; documents: { at: string; evidence: string } | null }
export interface BatchIndex { id: string; revision: number; frozenHash: string; status: "proposed" | "authorized" | "implemented" | "accepted" | "released" | "rejected"; model: string; base: string; history: HistoryEntry[]; release?: ReleaseRecord }

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
  /** Checks the batch ADDS. The mandatory minimum (MANDATORY_CHECKS) is not
   *  the batch's to shorten. */
  requiredChecks: string[];
  /** Test-only files a new check needs, carried onto the before-fix tree. */
  testSupport?: string[];
  /** Check labels this batch removes on purpose. Any other check that
   *  disappears from a suite is refused. */
  removedChecks?: string[];
}

/** Run for every batch, whatever its file says (Codex, review of r1, finding 5). */
export const MANDATORY_CHECKS = ["typecheck", "lint", "unit", "facts", "guard", "documents", "server", "walk", "assertions", "dropbox-unchanged", "checkout-unchanged"] as const;

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
  /^docs\/audit\/batches\/[^/]+\/(batch\.json|batch\.md|evidence\/.+|codex-review[^/]*\.md)$/,
];
export const isRecordPath = (p: string): boolean => RECORD_PATHS.some((r) => r.test(p));

/** Checks, hooks, approval rules and publishing controls. A change to any of
 *  these must be declared in its batch with control: true. */
export const CONTROL_PATHS: RegExp[] = [
  /^\.githooks\//, /^\.claude\/hooks\//, /^\.claude\/settings/, /^\.github\//,
  /^docs\/audit\/[^/]+\.ts$/, /^docs\/facts-check\.ts$/, /^docs\/[^/]+\.py$/,
  /^webapp\/server\/e2e\.ts$/, /^webapp\/scripts\//, /\.test\.tsx?$/, /^webapp\/package\.json$/, /^webapp\/bun\.lock$/,
  // settings that decide what is built, checked or deployed; the verdicts the
  // ledger was built from; the fact ledger and the formatting baselines
  /^webapp\/vercel\.json$/, /^webapp\/(vite|eslint|postcss|tailwind)\.config\.(ts|js)$/, /^webapp\/tsconfig[^/]*\.json$/, /^webapp\/components\.json$/,
  /^docs\/audit\/verdicts\.json$/, /^\.claude\/launch\.json$/, /^docs\/facts\.md$/, /^docs\/[^/]*baseline[^/]*\.json$/, /^docs\/source\//,
];
export const isControlPath = (p: string): boolean => CONTROL_PATHS.some((r) => r.test(p));

/* ------------------------ rules shared by both gates -------------------- */

const partOf = (l: Ledger, id: string, key: string): Part | undefined => l.items.find((i) => i.id === id)?.parts.find((p) => p.key === key);

/** What may never happen between two versions of the ledger: a source record
 *  disappearing, item or batch history being rewritten, a batch record or its
 *  frozen hash changing, a status moving backwards without a recorded reason.
 *
 *  An accepted fix's assertions are what protect it. In STRICT mode (a push
 *  that claims to be records only) they may not change at all, and nothing
 *  accepted may move backwards: weakening a protection is never "just
 *  records" and must go through Adam's acceptance. In the ordinary mode (the
 *  commit guard, and a push Adam accepted) they may change only under a new
 *  ruling that says in so many words what it supersedes. */
export function ledgerRegressions(before: Ledger, after: Ledger, opts: { strict?: boolean } = {}): string[] {
  const out: string[] = [];
  const isPrefix = (a: unknown[], b: unknown[]) => JSON.stringify(b.slice(0, a.length)) === JSON.stringify(a);
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
      if (!isPrefix(bp.history, ap.history)) out.push(`item ${b.id} part ${bp.key}: history was rewritten (it is append-only)`);
      const back = ORDER.indexOf(ap.status) < ORDER.indexOf(bp.status);
      const reasoned = ap.history.slice(bp.history.length).some((h) => /^(rejected|reopened|superseded)/.test(h.event));
      const wasAccepted = bp.status === "accepted" || bp.status === "released";
      if (back && (!reasoned || (opts.strict && wasAccepted))) out.push(`item ${b.id} part ${bp.key}: status went back from ${bp.status} to ${ap.status}${opts.strict && wasAccepted ? " — reopening an accepted fix needs Adam's acceptance, not a records push" : " with no recorded reason"}`);
      if (wasAccepted && bp.fix) {
        const same = JSON.stringify(ap.fix?.assertions ?? null) === JSON.stringify(bp.fix.assertions);
        const superseded = after.rulings.slice(before.rulings.length).some((r) => r.item === b.id && (!r.part || r.part === bp.key) && (r.supersedes ?? "").trim() !== "");
        if (!same && (opts.strict || !superseded)) out.push(`item ${b.id} part ${bp.key}: an accepted fix's assertions changed${opts.strict ? " — that weakens a protection and needs Adam's acceptance, not a records push" : " with no ruling that says what it supersedes"}`);
      }
    }
  }
  if (!isPrefix(before.rulings, after.rulings)) out.push("rulings were rewritten (they are append-only)");
  for (const bb of before.batches) {
    const ab = after.batches.find((x) => x.id === bb.id && x.revision === bb.revision);
    if (!ab) { out.push(`batch ${bb.id} r${bb.revision}: its record was removed`); continue; }
    if (ab.frozenHash !== bb.frozenHash) out.push(`batch ${bb.id} r${bb.revision}: its frozen hash changed — a changed batch is a new revision`);
    if (!isPrefix(bb.history, ab.history)) out.push(`batch ${bb.id} r${bb.revision}: its history was rewritten (it is append-only)`);
    if (ab.base !== bb.base || ab.model !== bb.model) out.push(`batch ${bb.id} r${bb.revision}: its base or model was edited`);
  }
  return out;
}

/** Batches whose files are frozen: from Adam's Go onward, not only after
 *  acceptance. A rejected revision stays on file but is no longer guarded. */
export const FROZEN_STATES = ["authorized", "implemented", "accepted", "released"];

/** One defect, however many items saw it: the main record and every item that
 *  is a second sighting of it. Work is claimed by defect, not by number. */
export function familyOf(l: Ledger, id: string): Item[] {
  const root = l.items.find((i) => i.id === id)?.canonical ?? id;
  return l.items.filter((i) => i.id === root || i.canonical === root);
}
/** Another batch already working on this defect, if any. */
export function familyClaim(l: Ledger, id: string, myBatch: string): string | null {
  for (const it of familyOf(l, id)) for (const p of it.parts) {
    if (p.batch && p.batch !== myBatch && (p.status === "assigned" || p.status === "implemented")) return `item ${it.id}${p.key === "all" ? "" : ` (${p.key})`} is ${p.status} in batch ${p.batch}`;
  }
  return null;
}
/** What an item (or a part of it) still waits on. A second sighting inherits
 *  its main record's waits. */
export function unmetWaits(l: Ledger, item: Item, part: Part): string[] {
  const main = item.canonical ? l.items.find((i) => i.id === item.canonical) : undefined;
  const all = [...new Set([...item.waitsOn, ...part.waitsOn, ...(main?.waitsOn ?? [])])];
  return all.filter((w) => (w.startsWith("ruling:") ? !l.rulings.some((r) => r.item === w.slice(7)) : !(l.items.find((i) => i.id === w)?.parts.every((p) => p.status === "released") ?? false)));
}

/** The labels of the checks in a suite file, comments ignored — so a check
 *  that is commented out or deleted inside a DECLARED file is still seen. */
export function checkLabels(source: string): { labels: string[]; calls: number } {
  const code = source.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const labels = [...code.matchAll(/\bcheck\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((m) => m[2]);
  const calls = (code.match(/\b(check|expect)\(/g) ?? []).length;
  return { labels, calls };
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
    // An approved sentence that contains the retired one is not a relapse —
    // in the file it was approved for, and nowhere else.
    const aftersIn = (f: string) => part.fix!.assertions.flatMap((a) => (a.kind === "replace" && a.file === f ? [a.after] : []));
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
          for (const keep of aftersIn(f)) body = body.split(keep).join("");
          // A permitted leftover is removed at its exact place, at most the
          // permitted number of times. Whatever remains is a relapse — another
          // use in the same file does not hide behind the allowance.
          for (const ok of allow.filter((x) => x.file === f && x.context.includes(text))) {
            for (let k = 0; k < ok.count; k++) { const at = body.indexOf(ok.context); if (at < 0) break; body = body.slice(0, at) + body.slice(at + ok.context.length); }
          }
          const n = count(body, text);
          if (n === 0) continue;
          out.push(`${name}: retired wording is back in ${f} (${n}×${allow.some((x) => x.file === f) ? ", outside its permitted place" : ""}): "${text.slice(0, 90)}"`);
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

/** Adam's standing acceptance of exactly this batch, revision and FULL
 *  commit — or why there is none. A later rejection of the same batch and
 *  revision cancels it. Shared by the release gate, the publisher and the
 *  release bookkeeping, so they cannot disagree. */
export function standingAcceptance(commitFull: string, batch?: string, revision?: number): { acc: Acceptance | null; why: string } {
  const all = acceptances();
  const mine = all.filter((a) => a.kind === "accept" && a.commit === commitFull && (batch === undefined || a.batch.toLowerCase() === batch.toLowerCase()) && (revision === undefined || a.revision === revision)).pop();
  if (!mine) return { acc: null, why: `no acceptance from Adam names commit ${commitFull.slice(0, 7)}` };
  const later = all.slice(all.indexOf(mine) + 1).find((a) => a.kind === "reject" && a.batch.toLowerCase() === mine.batch.toLowerCase() && (a.revision === null || a.revision === mine.revision));
  if (later) return { acc: null, why: `batch ${mine.batch} revision ${mine.revision} was rejected by Adam on ${later.at.slice(0, 10)}${later.note ? ` (${later.note.slice(0, 120)})` : ""} after he accepted it — nothing in it is released; issue the next revision` };
  return { acc: mine, why: "" };
}

/** The review package for a batch revision at a full commit, if one exists. */
export function packageDir(batch: string, revision: number, commitFull: string): string | null {
  if (!existsSync(REVIEWS)) return null;
  const want = `${batch}-r${revision}-${commitFull}`.toLowerCase();
  const found = readdirSync(REVIEWS).find((d) => d.toLowerCase() === want);
  return found && existsSync(join(REVIEWS, found, "package.json")) ? join(REVIEWS, found) : null;
}

export { partOf, existsSync, join };
