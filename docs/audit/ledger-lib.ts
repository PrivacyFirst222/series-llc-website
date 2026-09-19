/**
 * The fix ledger's shared parts (17 Sep 2026, FAILURES.md P88–P92; reviewed by
 * Codex before each revision was built).
 *
 * The audit machinery in this folder finds defects. This records repairs:
 * which item, which batch and revision, who did it, the exact commit Adam
 * accepted, and what must stay true afterwards. Nothing here is graded by the
 * session that made the fix — the "before" words come from the audit finding
 * or are proven present at proposal time, the "after" words come from the
 * batch file Adam approved before Go, and the acceptance is recorded outside
 * the repository by Adam's own message or command.
 *
 * Revision 3 (Codex's review of revision 2): what a record may never do is
 * written down as rules, not left to the reader —
 *   - a batch moves only by the events of its transition table, and the ones
 *     that stand for Adam's decision need his record outside the repository;
 *   - an item's identity, its parts, its waits, its links and an accepted
 *     fix's assertions are immutable, except in the exact ways a reviewed
 *     migration file declares;
 *   - a second sighting links to a PART of its main record, so one item's
 *     independent parts can go to different batches;
 *   - a ruling in the ledger or in rulings.md must match a ruling Adam made;
 *   - a review package has an identity, and an acceptance names it.
 *
 * What it promises: it DETECTS a regression that a recorded assertion covers,
 * and it refuses a release Adam has not accepted. It does not promise that a
 * past fix can never be disturbed, and a session holding Adam's permissions
 * could bypass all of it. It is a procedural safeguard.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, lstatSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
export const LEDGER = join(ROOT, "docs/audit/ledger.json");
export const BATCHES = join(ROOT, "docs/audit/batches");

/** Adam's decisions and the review packages live OUTSIDE the repository,
 *  where a commit cannot rewrite them. FPSLLC_HOME exists so the
 *  demonstrations can run against simulated records in a disposable copy;
 *  nothing else sets it. */
export const HOME = process.env.FPSLLC_HOME || join(homedir(), ".fpsllc");
export const ACCEPTANCES = join(HOME, "acceptances.jsonl");
export const RULINGS_FILE = join(HOME, "rulings.jsonl");
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

/** One part of one item: `{ item: "65", part: "dead-step" }`. */
export interface PartRef { item: string; part: string }

export interface Part {
  key: string;
  scope: string;
  status: PartStatus;
  batch?: string;
  waitsOn: string[];
  history: HistoryEntry[];
  fix?: Fix;
  /** Append-only attempts to replace a released fix. Rejection restores prior
   * but keeps this entry and the part's whole history. */
  supersessions?: Supersession[];
  /** Set when this part is a second sighting of another item's part: the
   *  same defect, seen in another place. Work is claimed by defect. */
  canonical?: PartRef;
}

export interface Supersession {
  prior: Fix;
  batch: string;
  revision: number;
  hash: string;
}

/** Assertions remain active while a replacement is only assigned. */
export function activeFix(p: Part): Fix | undefined {
  return p.fix ?? (p.status === "assigned" ? p.supersessions?.at(-1)?.prior : undefined);
}

/** A part that a migration replaced with narrower ones. Kept, with its whole
 *  history, under the item it belonged to. */
export interface RetiredPart extends Part { migratedTo: string[]; retiredBy: string }

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
  /** Findings that are about the same place but are not the same defect. */
  related?: string[];
  waitsOn: string[];
  parts: Part[];
  retiredParts?: RetiredPart[];
}

/** A ruling Adam made on an item (kind "ruling", the default), or his
 *  approval of a migration file (kind "migration"), copied into the ledger
 *  only from his own record outside the repository. */
export interface Ruling { date: string; kind?: "ruling" | "migration"; item?: string; part?: string; text: string; supersedes?: string; migration?: string; migrationHash?: string }

/** Three different things, recorded separately: the push, the live site, the Dropbox copies. */
export interface ReleaseRecord { git: { at: string; remoteMain: string; commit: string; packageId: string }; deployment: { at: string; evidence: string } | null; documents: { at: string; evidence: string } | null }
export type BatchStatus = "authorized" | "implemented" | "accepted" | "released" | "rejected";
export interface BatchIndex { id: string; revision: number; frozenHash: string; status: BatchStatus; model: string; base: string; history: HistoryEntry[]; release?: ReleaseRecord }

export interface Ledger { version: 1 | 2; builtFrom: string[]; items: Item[]; rulings: Ruling[]; batches: BatchIndex[] }

export interface BatchFile {
  id: string;
  revision: number;
  title: string;
  model: string;
  /** The commit on main this batch was cut from. */
  base: string;
  items: { id: string; part: string; covers?: string[]; scope: string; assertions: Assertion[]; replaces?: Fix }[];
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
export const MANDATORY_CHECKS = ["typecheck", "lint", "unit", "facts", "guard", "documents", "server", "walk", "assertions", "dropbox-unchanged", "checkout-unchanged", "ledger-controls"] as const;

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

/** A reader of files as they are at one commit. */
export const readAt = (rev: string) => (p: string): string | null => { const t = git(["show", `${rev}:${p}`], { allowFail: true }); return t || (gitOk(["cat-file", "-e", `${rev}:${p}`]) ? "" : null); };
/** A reader of the working tree. */
export const readTree = (p: string): string | null => (existsSync(join(ROOT, p)) ? rd(join(ROOT, p)) : null);

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
 *  acceptance (Codex, round 4) — and only if it obeys the records rules
 *  (release-check.ts): FAILURES.md append-only, the readable list generated,
 *  rulings.md from Adam's records, the ledger's invariants, batch files
 *  frozen and their revision snapshots retained. Nothing else is a record. */
export const RECORD_PATHS: RegExp[] = [
  /^FAILURES\.md$/,
  /^docs\/audit\/ledger\.json$/,
  /^docs\/audit\/findings-open\.md$/,
  /^docs\/audit\/rulings\.md$/,
  /^docs\/audit\/migrations\/[^/]+\.json$/,
  /^docs\/audit\/batches\/[^/]+\/(batch\.json|batch\.md|revisions\/r\d+\.json|evidence\/.+|codex-[^/]*\.md)$/,
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
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isPrefix = (a: unknown[], b: unknown[]): boolean => JSON.stringify(b.slice(0, a.length)) === JSON.stringify(a);
const rulingKind = (r: Ruling): "ruling" | "migration" => r.kind ?? "ruling";

/* ---- A: batch events and the transition table ---- */

/** Batch events, exactly as batch.ts writes them from revision 3 on. The
 *  history of revisions 1 and 2 of batch 0 keeps its older wording; a record
 *  that appends no event is judged only by its status staying the same. */
export const EVENT = { authorized: "authorized", implemented: "implemented", accepted: "accepted by Adam", released: "released", rejected: "rejected by Adam" } as const;
export const FINAL_STATES: BatchStatus[] = ["released", "rejected"];

/** The status a record reaches by replaying appended events from a status;
 *  "invalid" when any step is not in the table. */
export function replayEvents(from: BatchStatus | "absent", events: string[]): BatchStatus | "invalid" {
  let s: BatchStatus | "absent" | "invalid" = from;
  for (const e of events) {
    if (s === "absent" && e === EVENT.authorized) s = "authorized";
    else if (s === "authorized" && e === EVENT.implemented) s = "implemented";
    else if (s === "implemented" && e === EVENT.accepted) s = "accepted";
    else if (s === "accepted" && e === EVENT.released) s = "released";
    else if ((s === "authorized" || s === "implemented") && e === EVENT.rejected) s = "rejected";
    else return "invalid";
  }
  return s === "absent" ? "invalid" : s;
}

/* ---- B: migrations, the one reviewed way to change a protected field ---- */

/** docs/audit/migrations/<id>.json: the exact structural change, per item.
 *  `link` sets a part's canonical link; `split` adds parts and `retire` moves
 *  the named parts to retiredParts (history kept, migratedTo = the new keys);
 *  `related` sets the related-items note. Nothing not declared may differ. */
export interface Migration {
  id: string;
  title: string;
  date: string;
  schema?: { from: number; to: number; note: string };
  items: Record<string, { link?: Record<string, PartRef>; split?: { key: string; scope: string; waitsOn?: string[]; canonical?: PartRef }[]; retire?: string[]; related?: string[]; note?: string }>;
}
export const migrationPath = (id: string): string => `docs/audit/migrations/${id}.json`;
export function loadMigration(id: string, read: (p: string) => string | null = readTree): { m: Migration; hash: string } | null {
  const t = read(migrationPath(id));
  return t ? { m: JSON.parse(t) as Migration, hash: sha256(t) } : null;
}
/** Apply only the structural operations the reviewed file declares. Both the
 * migration builder and the gates use this check; permission to change one
 * link is never permission to change all links on the item. */
export function migrationProjection(before: Ledger, migrations: Migration[]): Ledger {
  const expected = structuredClone(before);
  for (const m of migrations) {
    if (m.schema) {
      if (expected.version !== m.schema.from) throw new Error(`migration ${m.id}: wrong starting schema`);
      expected.version = m.schema.to as Ledger["version"];
      if (m.schema.from === 1 && m.schema.to === 2) for (const it of expected.items) delete (it as Item & { canonical?: string }).canonical;
    }
    for (const [id, d] of Object.entries(m.items)) {
      const it = expected.items.find(i => i.id === id);
      if (!it) throw new Error(`migration ${m.id}: unknown item ${id}`);
      const newKeys = (d.split ?? []).map(p => p.key);
      for (const key of d.retire ?? []) {
        const p = it.parts.find(p => p.key === key);
        if (!p || p.status !== "open" || !newKeys.length) throw new Error(`migration ${m.id}: cannot retire ${id}:${key}`);
        it.retiredParts = [...(it.retiredParts ?? []), { ...p, migratedTo: newKeys, retiredBy: m.id }];
        it.parts = it.parts.filter(p => p.key !== key);
      }
      for (const p of d.split ?? []) {
        if (it.parts.some(q => q.key === p.key)) throw new Error(`migration ${m.id}: duplicate part ${id}:${p.key}`);
        it.parts.push({ key: p.key, scope: p.scope, status: "open", waitsOn: p.waitsOn ?? [], history: [{ at: "", event: `recorded by migration ${m.id}` }], ...(p.canonical ? { canonical: p.canonical } : {}) });
      }
      for (const [key, ref] of Object.entries(d.link ?? {})) {
        const p = it.parts.find(p => p.key === key);
        if (!p) throw new Error(`migration ${m.id}: unknown part ${id}:${key}`);
        p.canonical = ref;
      }
      if (d.related) it.related = d.related;
    }
  }
  return expected;
}
const structure = (i: Item) => ({
  legacyCanonical: (i as Item & { canonical?: string }).canonical,
  related: i.related, retiredParts: i.retiredParts,
  parts: i.parts.map(p => ({ key: p.key, scope: p.scope, waitsOn: p.waitsOn, canonical: p.canonical })),
});

/** External evidence of Adam's decisions, needed for the transitions that
 *  stand for them. "required": read his records here (the local gates).
 *  "skip": not available on this machine (GitHub); the caller says so. */
export function hasReplacementApproval(b: BatchFile): boolean {
  return rulingRecords().some(r => r.kind === "replacement" && r.batch === b.id && r.revision === b.revision && r.hash === frozenHashOf(b));
}

/** Validate a retained attempt even on a clean checkout: approving the old
 * text or adding a free-form supersedes flag is never replacement permission. */
function supersessionProblems(l: Ledger, item: string, part: string, s: Supersession, read: (p: string) => string | null, external: "required" | "skip"): string[] {
  const out: string[] = [], name = `item ${item} part ${part}: replacement`;
  const old = l.batches.find(b => b.id === s.prior.batch && b.revision === s.prior.revision);
  const next = l.batches.find(b => b.id === s.batch && b.revision === s.revision);
  const parse = (id: string, revision: number): BatchFile | null => { try { const t = read(`docs/audit/batches/${id}/revisions/r${revision}.json`); return t ? JSON.parse(t) : null; } catch { return null; } };
  const ob = parse(s.prior.batch, s.prior.revision), nb = parse(s.batch, s.revision);
  const oldPart = ob?.items.find(x => x.id === item && x.part === part), newPart = nb?.items.find(x => x.id === item && x.part === part);
  if (!old || old.status !== "released" || old.release?.git.commit !== s.prior.commit || old.model !== s.prior.doneBy || !same(oldPart?.assertions, s.prior.assertions)) out.push(`${name}: archived prior fix is not the released work order`);
  if (!next || next.id === old?.id || next.frozenHash !== s.hash || !nb || frozenHashOf(nb) !== s.hash || !same(newPart?.replaces, s.prior) || !newPart?.assertions.length) out.push(`${name}: exact prior fix and new work order are not bound by the retained snapshot`);
  if (nb && external === "required" && !hasReplacementApproval(nb)) out.push(`${name}: no owner approval names this exact replacement work order`);
  return out;
}

export interface RegressionOpts { strict?: boolean; read?: (p: string) => string | null; external?: "required" | "skip" }

/** What may never happen between two versions of the ledger.
 *  STRICT (a push that claims to be records only): no protected field may
 *  change except by a migration Adam approved by record; batches move only
 *  by the transition table; an accepted fix may not weaken.
 *  Otherwise (the commit guard, a push Adam accepted): a protected field may
 *  change only in the ways a migration file named by a new migration ruling
 *  declares (its hash recorded in the ruling), and an accepted fix's
 *  assertions only in a new work order that exactly names the released fix
 *  it replaces, with Adam's hash-bound replacement approval. */
export function ledgerRegressions(before: Ledger, after: Ledger, opts: RegressionOpts = {}): string[] {
  const out: string[] = [];
  const read = opts.read ?? readTree;
  const external = opts.external ?? "required";
  if (!isPrefix(before.rulings, after.rulings)) out.push("rulings were rewritten (they are append-only)");
  const newRulings = isPrefix(before.rulings, after.rulings) ? after.rulings.slice(before.rulings.length) : [];

  /* rulings: each new one is Adam's, by his record; a migration ruling names a file whose hash it carries */
  const migrations: Migration[] = [];
  for (const r of newRulings) {
    if (rulingKind(r) === "migration") {
      const f = r.migration ? loadMigration(r.migration, read) : null;
      if (!f) { out.push(`a migration ruling names ${r.migration ?? "no file"}, and no such file is in this version`); continue; }
      if (f.hash !== r.migrationHash) { out.push(`migration ${r.migration}: the ruling records hash ${String(r.migrationHash).slice(0, 12)}, the file in this version hashes to ${f.hash.slice(0, 12)} — a record names one exact file`); continue; }
      if (opts.strict) { if (external === "required" && !hasRulingRecord(r)) { out.push(`migration ${r.migration}: no record from Adam approves this file (his whole message "Approve migration ${r.migration}") — a migration is never a records-only change without one`); continue; } }
      migrations.push(f.m);
    } else if (external === "required" && !hasRulingRecord(r)) out.push(`ruling on item ${r.item}${r.part ? ` (${r.part})` : ""}: no record from Adam says this (his whole message "Ruling ${r.item}${r.part ? `, part ${r.part}` : ""}: <text>", or accept.ts ruling) — a ruling in the ledger is copied from his record, never written first`);
  }
  let expected = before;
  try { expected = migrationProjection(before, migrations); } catch (e) { out.push(String(e)); }
  const allowed = (item: string, _field: string): boolean => migrations.some(m => Object.hasOwn(m.items, item));
  for (const e of expected.items) {
    const actual = after.items.find(i => i.id === e.id);
    if (actual && !same(structure(e), structure(actual))) out.push(`item ${e.id}: structural fields do not equal the exact declared migration (parts, links, waits, retired parts or related items)`);
    for (const p of e.parts) {
      if (before.items.find(i => i.id === e.id)?.parts.some(q => q.key === p.key)) continue;
      const got = actual?.parts.find(q => q.key === p.key);
      if (!got || got.history[0]?.event !== p.history[0].event || !got.history[0]?.at || !Number.isFinite(Date.parse(got.history[0].at))) out.push(`item ${e.id} part ${p.key}: missing migration creation history`);
      if (got) {
        const first = { ...got.history[0], at: "" };
        if (!same(first, p.history[0])) out.push(`item ${e.id} part ${p.key}: undeclared migration creation metadata`);
        if (got.status === "open" && !same({ ...got, history: got.history.map(h => ({ ...h, at: "" })) }, p)) out.push(`item ${e.id} part ${p.key}: new open part differs from its exact declared initial state`);
      }
    }
  }
  const never = opts.strict ? " (never as records only)" : " with no migration that declares it";

  for (const b of before.items) {
    const a = after.items.find((i) => i.id === b.id);
    if (!a) { out.push(`item ${b.id}: the source record was removed`); continue; }
    if (a.text !== b.text) out.push(`item ${b.id}: the auditor's text was edited`);
    if (a.tag !== b.tag || a.area !== b.area || a.source !== b.source || a.housekeeping !== b.housekeeping) out.push(`item ${b.id}: its identity fields changed`);
    if (!same(a.codex, b.codex) || a.verdict !== b.verdict || (a.verdictReason ?? "") !== (b.verdictReason ?? "") || (a.correctedReplacement ?? "") !== (b.correctedReplacement ?? "")) out.push(`item ${b.id}: the verdicts on it changed`);
    if (!same(a.related ?? [], b.related ?? []) && !allowed(b.id, "related")) out.push(`item ${b.id}: its related-items note changed${never}`);
    if (!same(a.waitsOn, b.waitsOn)) out.push(`item ${b.id}: its waits changed — a wait is satisfied by a ruling, never edited`);
    const keysB = b.parts.map((p) => p.key).sort(), keysA = a.parts.map((p) => p.key).sort();
    if (!same(keysA, keysB) && !allowed(b.id, "parts")) out.push(`item ${b.id}: its set of parts changed (${keysB.join(", ")} → ${keysA.join(", ")})${never}`);
    for (const rb of b.retiredParts ?? []) { const ra = (a.retiredParts ?? []).find((p) => p.key === rb.key); if (!ra || !same(ra, rb)) out.push(`item ${b.id}: retired part ${rb.key} was altered or removed — retired parts are kept as they were`); }
    for (const bp of b.parts) {
      const ap = a.parts.find((p) => p.key === bp.key);
      const name = `item ${b.id} part ${bp.key}`;
      if (!ap) {
        const kept = (a.retiredParts ?? []).find((p) => p.key === bp.key);
        if (!kept) out.push(`${name}: removed and not kept as a retired part`);
        else if (!same(kept.history, bp.history) || kept.scope !== bp.scope || !same(kept.waitsOn, bp.waitsOn) || !same(kept.fix, bp.fix) || kept.status !== bp.status) out.push(`${name}: retired, but its history, scope, waits, status or fix was altered`);
        continue;
      }
      if (ap.scope !== bp.scope && !allowed(b.id, "parts")) out.push(`${name}: its scope changed${never}`);
      if (!same(ap.canonical, bp.canonical) && !allowed(b.id, "canonical")) out.push(`${name}: its link to the main record changed${never}`);
      if (!same(ap.waitsOn, bp.waitsOn)) out.push(`${name}: its waits changed — a wait is satisfied by a ruling, never edited`);
      if (!isPrefix(bp.history, ap.history)) out.push(`${name}: history was rewritten (it is append-only)`);
      const back = ORDER.indexOf(ap.status) < ORDER.indexOf(bp.status);
      const owner = bp.fix ? before.batches.find(x => x.id === bp.fix!.batch && x.revision === bp.fix!.revision) : before.batches.filter(x => x.id === bp.batch).at(-1);
      const nextOwner = owner && after.batches.find(x => x.id === owner.id && x.revision === owner.revision);
      const priorAttempts = bp.supersessions ?? [], attempts = ap.supersessions ?? [];
      if (!isPrefix(priorAttempts, attempts)) out.push(`${name}: supersession archive was rewritten`);
      const appendedAttempts = isPrefix(priorAttempts, attempts) ? attempts.slice(priorAttempts.length) : [];
      // Replay exact attempts across the compared commits. A cancelled
      // attempt retains its archive but returns to the same released fix.
      const completedBeforeReplacement = bp.fix && bp.status === "implemented" && owner && nextOwner?.status === "released" && nextOwner.release
        && isPrefix(owner.history, nextOwner.history) && replayEvents(owner.status, nextOwner.history.slice(owner.history.length).map(h => h.event)) === "released"
        && ap.history.slice(bp.history.length).some(h => h.event === "released" && h.batch === owner.id && h.revision === owner.revision);
      let cursor = completedBeforeReplacement ? { ...bp.fix!, commit: nextOwner!.release!.git.commit } : bp.fix;
      let cursorBatch = bp.batch, cursorStatus: PartStatus = completedBeforeReplacement ? "released" : bp.status;
      let replaced = appendedAttempts.length > 0 && cursorStatus === "released" && !!cursor;
      for (const attempt of appendedAttempts) {
        const target = after.batches.find(x => x.id === attempt.batch && x.revision === attempt.revision);
        const events = ap.history.slice(bp.history.length);
        if (!target || cursorStatus !== "released" || !same(attempt.prior, cursor)
          || before.batches.some(x => x.id === target.id && x.revision === target.revision)
          || supersessionProblems(after, b.id, bp.key, attempt, read, external).length
          || !events.some(h => h.event === "superseded by approved replacement" && h.batch === target.id && h.revision === target.revision)) { replaced = false; break; }
        if (target.status === "rejected") {
          if (!events.some(h => h.event === `rejected r${target.revision}` && h.batch === target.id && h.revision === target.revision)) replaced = false;
          continue;
        }
        cursorBatch = target.id;
        cursorStatus = target.status === "authorized" ? "assigned" : target.status as PartStatus;
        const work = JSON.parse(read(`docs/audit/batches/${target.id}/revisions/r${target.revision}.json`)!) as BatchFile;
        const entry = work.items.find(x => x.id === b.id && x.part === bp.key)!;
        cursor = target.status === "authorized" ? undefined : { batch: target.id, revision: target.revision, commit: target.release?.git.commit ?? "", doneBy: target.model, assertions: entry.assertions };
      }
      replaced = replaced && cursorStatus === ap.status && cursorBatch === ap.batch && same(cursor, ap.fix);
      if (appendedAttempts.length && !replaced) out.push(`${name}: invalid replacement transition or archived prior fix`);
      if (replaced && opts.strict && (bp.status !== ap.status || bp.batch !== ap.batch || !same(bp.fix, ap.fix))) out.push(`${name}: replacement needs acceptance; never records-only publication`);
      const restore = bp.supersessions?.at(-1);
      const restored = restore && owner && restore.batch === owner.id && restore.revision === owner.revision
        && ap.status === "released" && same(ap.fix, restore.prior) && ap.batch === restore.prior.batch;
      const rejected = owner && nextOwner && !FINAL_STATES.includes(owner.status) && nextOwner.status === "rejected"
        && isPrefix(owner.history, nextOwner.history) && replayEvents(owner.status, nextOwner.history.slice(owner.history.length).map(h => h.event)) === "rejected"
        && ((ap.status === "open" && !ap.fix && !ap.batch && !restore) || restored)
        && ap.history.slice(bp.history.length).some(h => h.event === `rejected r${owner.revision}` && h.batch === owner.id && h.revision === owner.revision);
      const reasoned = !!rejected || !!replaced;
      if (bp.fix && !rejected && !replaced) {
        const expectedFix = { ...bp.fix, ...(nextOwner?.status === "released" && nextOwner.release ? { commit: nextOwner.release.git.commit } : {}) };
        if (!same(ap.fix, expectedFix) || ap.batch !== bp.batch) out.push(`${name}: recorded fix cannot be erased or changed outside its authenticated batch rejection or release transition`);
      }
      const wasAccepted = bp.status === "accepted" || bp.status === "released";
      if (back && (!reasoned || (opts.strict && wasAccepted))) out.push(`${name}: status went back from ${bp.status} to ${ap.status}${opts.strict && wasAccepted ? " — reopening an accepted fix needs Adam's acceptance, not a records push" : " with no recorded reason"}`);
      if (wasAccepted && bp.fix && !same(ap.fix?.assertions, bp.fix.assertions) && !replaced) out.push(`${name}: an accepted fix's assertions changed without an exact approved replacement work order`);
    }
  }
  for (const a of after.items) if (!before.items.some((i) => i.id === a.id)) out.push(`item ${a.id}: a record appeared that the auditors never wrote`);
  if (before.version !== after.version && !migrations.some((m) => m.schema && m.schema.from === before.version && m.schema.to === after.version)) out.push(`the ledger's version changed (${before.version} → ${after.version})${never}`);
  out.push(...linkProblems(after));

  // A part cannot claim a later state than its own frozen work order. This
  // also validates parts first created by a migration in this comparison.
  for (const it of after.items) for (const p of it.parts) {
    const name = `item ${it.id} part ${p.key}`;
    for (const s of p.supersessions ?? []) out.push(...supersessionProblems(after, it.id, p.key, s, read, external));
    if (p.status === "open") {
      if (p.batch || p.fix) out.push(`${name}: open part still carries a batch or fix`);
      continue;
    }
    const owner = p.fix ? after.batches.find(b => b.id === p.fix!.batch && b.revision === p.fix!.revision) : after.batches.filter(b => b.id === p.batch).at(-1);
    const expectedState = owner?.status === "authorized" ? "assigned" : owner?.status;
    if (!owner || p.batch !== owner.id || p.status !== expectedState) out.push(`${name}: part state ${p.status} does not match its owning batch transition (${owner?.status ?? "no batch"})`);
    if (!owner) continue;
    const text = read(`docs/audit/batches/${owner.id}/revisions/r${owner.revision}.json`);
    let declared: BatchFile["items"][number] | undefined;
    try { declared = text ? (JSON.parse(text) as BatchFile).items.find(x => x.id === it.id && x.part === p.key) : undefined; } catch { /* refused below */ }
    if (!declared) out.push(`${name}: not assigned by the owning batch's retained work order`);
    if (declared?.replaces && !(p.supersessions ?? []).some(s => s.batch === owner.id && s.revision === owner.revision && same(s.prior, declared.replaces))) out.push(`${name}: replacement has no retained prior fix`);
    if (p.status === "assigned" && p.fix) out.push(`${name}: assigned part already carries a fix`);
    if (["implemented", "accepted", "released"].includes(p.status)) {
      if (!p.fix || !same(p.fix.assertions, declared?.assertions) || p.fix.doneBy !== owner.model) out.push(`${name}: recorded fix differs from the owning batch's frozen assertions or model`);
      if (p.status === "released" && p.fix?.commit !== owner.release?.git.commit) out.push(`${name}: released fix does not name the owning batch's released commit`);
    }
    const previous = before.items.find(i => i.id === it.id)?.parts.find(q => q.key === p.key);
    const lastAttempt = p.supersessions?.at(-1);
    const restoration = lastAttempt && p.status === "released" && same(p.fix, lastAttempt.prior)
      && after.batches.some(b => b.id === lastAttempt.batch && b.revision === lastAttempt.revision && b.status === "rejected")
      && p.history.slice(previous?.history.length ?? 0).some(h => h.event === `rejected r${lastAttempt.revision}` && h.batch === lastAttempt.batch && h.revision === lastAttempt.revision);
    if (previous?.status !== p.status && !restoration) {
      const event = p.status === "assigned" ? "assigned" : p.status === "accepted" ? EVENT.accepted : p.status;
      if (!p.history.slice(previous?.history.length ?? 1).some(h => h.event === event && h.batch === owner.id && h.revision === owner.revision)) out.push(`${name}: transition to ${p.status} lacks its owning batch event`);
    }
  }

  /* batches: the transition table */
  for (const bb of before.batches) {
    const ab = after.batches.find((x) => x.id === bb.id && x.revision === bb.revision);
    const name = `batch ${bb.id} r${bb.revision}`;
    if (!ab) { out.push(`${name}: its record was removed`); continue; }
    if (ab.frozenHash !== bb.frozenHash || ab.base !== bb.base || ab.model !== bb.model) out.push(`${name}: its frozen hash, base or model was edited`);
    if (!isPrefix(bb.history, ab.history)) { out.push(`${name}: its history was rewritten (it is append-only)`); continue; }
    if (bb.release && !same(ab.release, bb.release)) out.push(`${name}: its release record was edited`);
    const appended = ab.history.slice(bb.history.length).map((h) => h.event);
    if (appended.length === 0) { if (ab.status !== bb.status) out.push(`${name}: status changed from ${bb.status} to ${ab.status} with no event — a status is reached only by its events, and never by editing it`); continue; }
    if (FINAL_STATES.includes(bb.status)) { out.push(`${name}: is ${bb.status}, which is final — ${bb.status} → ${ab.status} is a forbidden transition`); continue; }
    const reached = replayEvents(bb.status, appended);
    if (reached === "invalid" || reached !== ab.status) { out.push(`${name}: ${bb.status} → ${ab.status} is not a permitted transition for the events appended (${appended.join(", ")})`); continue; }
    out.push(...decisionEvidence(ab, appended, external).map((w) => `${name}: ${w}`));
  }
  for (const ab of after.batches) {
    if (before.batches.some((x) => x.id === ab.id && x.revision === ab.revision)) continue;
    const name = `batch ${ab.id} r${ab.revision}`;
    const events = ab.history.map((h) => h.event);
    const reached = replayEvents("absent", events);
    if (reached === "invalid" || reached !== ab.status) out.push(`${name}: a new record whose history (${events.join(", ") || "empty"}) does not lead to its status ${ab.status} by the transition table`);
    else out.push(...decisionEvidence(ab, events, external).map((w) => `${name}: ${w}`));
    if (ab.revision > 1) { const prev = after.batches.find((x) => x.id === ab.id && x.revision === ab.revision - 1); if (!prev) out.push(`${name}: revision ${ab.revision - 1} is not on record`); else if (prev.status !== "rejected") out.push(`${name}: revision ${ab.revision - 1} is ${prev.status}, not rejected — a next revision follows a rejection`); }
    if (!gitOk(["cat-file", "-e", `${ab.base}^{commit}`])) out.push(`${name}: its base ${ab.base.slice(0, 7)} is not a commit here`);
  }
  return out;
}

/** The events that stand for Adam's decision need his record outside the
 *  repository: "rejected by Adam" a reject record for that batch and
 *  revision (or batch-wide) after the batch was authorized; "released" his
 *  standing acceptance of the recorded commit and package. */
function decisionEvidence(ab: BatchIndex, appended: string[], external: "required" | "skip"): string[] {
  const out: string[] = [];
  if (appended.includes(EVENT.rejected)) {
    if (external === "required") {
      const authorizedAt = ab.history.find((h) => h.event === EVENT.authorized || /^authorized/.test(h.event))?.at ?? "";
      const rec = acceptances().find((a) => a.kind === "reject" && a.batch.toLowerCase() === ab.id.toLowerCase() && (a.revision === null || a.revision === ab.revision) && a.at > authorizedAt);
      if (!rec) out.push(`rejected — no rejection record from Adam names batch ${ab.id}${ab.revision > 0 ? ` revision ${ab.revision}` : ""} after it was authorized (his whole message "Reject ${ab.id}, revision ${ab.revision}: <reason>")`);
    }
  }
  if (appended.includes(EVENT.released) || appended.includes(EVENT.accepted)) {
    if (!ab.release) out.push("released with no release record");
    else if (external === "required") {
      const { acc, why } = standingAcceptance(ab.release.git.commit, ab.id, ab.revision);
      if (!acc) out.push(`released — ${why}`);
      else if (acc.packageId !== ab.release.git.packageId) out.push(`released — the release names package ${ab.release.git.packageId}, Adam's acceptance names ${acc.packageId}`);
    }
  }
  return out;
}

/** The batch definitions that must match their frozen hashes in a version:
 *  every revision's retained snapshot, always; and batch.json for the newest
 *  revision of each batch, whatever its status — a later revision lifts the
 *  batch.json rule for the earlier one only because it is itself a valid
 *  record (ledgerRegressions) with its own matching file. */
export function frozenFileProblems(l: Ledger, read: (p: string) => string | null): string[] {
  const out: string[] = [];
  const hashOf = (t: string | null): string | null => { if (t === null) return null; try { return frozenHashOf(JSON.parse(t) as BatchFile); } catch { return "unreadable"; } };
  for (const b of l.batches) {
    const snap = hashOf(read(`docs/audit/batches/${b.id}/revisions/r${b.revision}.json`));
    if (snap === null) out.push(`batch ${b.id} r${b.revision}: its retained snapshot revisions/r${b.revision}.json is missing`);
    else if (snap !== b.frozenHash) out.push(`batch ${b.id} r${b.revision}: its retained snapshot does not match its frozen hash — a snapshot is written once, at Go, and never changes`);
    if (l.batches.some((x) => x.id === b.id && x.revision > b.revision)) continue;
    const cur = hashOf(read(`docs/audit/batches/${b.id}/batch.json`));
    if (cur !== b.frozenHash) out.push(`batch ${b.id} r${b.revision} (${b.status}): batch.json is ${cur === null ? "missing" : "not the file frozen at Go"} — a changed batch is the next revision, approved again`);
  }
  return out;
}

/* ---- C: defects, claims, waits, links ---- */

const refEq = (a: PartRef | undefined, b: PartRef): boolean => !!a && a.item === b.item && a.part === b.part;
/** The main record a part belongs to (itself, if it is the main record). */
export function mainOf(l: Ledger, ref: PartRef): PartRef {
  const seen = new Set<string>();
  let cur = ref;
  for (;;) {
    const key = `${cur.item}:${cur.part}`;
    if (seen.has(key)) return ref;
    seen.add(key);
    const p = partOf(l, cur.item, cur.part);
    if (!p?.canonical) return cur;
    cur = p.canonical;
  }
}
/** One defect: the main part and every part that points at it. */
export function defectGroup(l: Ledger, ref: PartRef): { item: Item; part: Part }[] {
  const main = mainOf(l, ref);
  const out: { item: Item; part: Part }[] = [];
  for (const it of l.items) for (const p of it.parts) if (refEq({ item: it.id, part: p.key }, main) || (p.canonical && refEq(mainOf(l, p.canonical), main))) out.push({ item: it, part: p });
  return out;
}
/** Another batch already working on this defect, if any. */
export function familyClaim(l: Ledger, ref: PartRef, myBatch: string): string | null {
  for (const { item, part } of defectGroup(l, ref)) {
    if (part.batch && part.batch !== myBatch && (part.status === "assigned" || part.status === "implemented")) return `item ${item.id}${part.key === "all" ? "" : ` (${part.key})`} is ${part.status} in batch ${part.batch}`;
  }
  return null;
}
/** What a part still waits on: its own waits, its item's, and — for a
 *  second sighting — its main record's part and item. A wait on a ruling is
 *  satisfied by a ruling on that item; a wait on an item by its release. */
export function unmetWaits(l: Ledger, item: Item, part: Part): string[] {
  const main = mainOf(l, { item: item.id, part: part.key });
  const mi = l.items.find((i) => i.id === main.item), mp = partOf(l, main.item, main.part);
  const all = [...new Set([...item.waitsOn, ...part.waitsOn, ...(mi?.waitsOn ?? []), ...(mp?.waitsOn ?? [])])];
  return all.filter((w) => (w.startsWith("ruling:") ? !l.rulings.some((r) => rulingKind(r) === "ruling" && r.item === w.slice(7)) : !(l.items.find((i) => i.id === w)?.parts.every((p) => p.status === "released") ?? false)));
}
/** Every link must point at an existing part, never at itself, never in a cycle. */
export function linkProblems(l: Ledger): string[] {
  const out: string[] = [];
  for (const it of l.items) for (const p of it.parts) {
    if (!p.canonical) continue;
    if (!partOf(l, p.canonical.item, p.canonical.part)) { out.push(`item ${it.id} part ${p.key}: links to ${p.canonical.item}:${p.canonical.part}, which does not exist`); continue; }
    if (refEq(p.canonical, { item: it.id, part: p.key })) { out.push(`item ${it.id} part ${p.key}: links to itself`); continue; }
    const seen = new Set<string>([`${it.id}:${p.key}`]);
    let cur: PartRef | undefined = p.canonical;
    while (cur) { const k = `${cur.item}:${cur.part}`; if (seen.has(k)) { out.push(`item ${it.id} part ${p.key}: its links form a cycle`); break; } seen.add(k); cur = partOf(l, cur.item, cur.part)?.canonical; }
  }
  for (const it of l.items) for (const r of it.related ?? []) if (!l.items.some((i) => i.id === r)) out.push(`item ${it.id}: related to ${r}, which does not exist`);
  return out;
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
    const fix = activeFix(part);
    if (!fix) continue;
    const name = `item ${item.id}${part.key === "all" ? "" : ` (${part.key})`}`;
    // An approved sentence that contains the retired one is not a relapse —
    // in the file it was approved for, and nowhere else.
    const aftersIn = (f: string) => fix.assertions.flatMap((a) => (a.kind === "replace" && a.file === f ? [a.after] : []));
    for (const a of fix.assertions) {
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

/* ---- Adam's decisions, recorded outside the repository ---- */

export interface Acceptance { kind: "accept" | "reject"; batch: string; revision: number | null; commit: string | null; packageId?: string; note?: string; at: string; source: string }
export function acceptances(): Acceptance[] {
  if (!existsSync(ACCEPTANCES)) return [];
  return rd(ACCEPTANCES).split("\n").filter((x) => x.trim()).map((x) => JSON.parse(x) as Acceptance);
}
/** A ruling Adam made ("Ruling 28: …"), or his approval of a migration file
 *  ("Approve migration 001-…"), recorded with the file's hash at that moment. */
export interface RulingRecord { kind: "ruling" | "migration" | "replacement"; batch?: string; revision?: number; item?: string; part?: string; text?: string; migration?: string; hash?: string; at: string; source: string }
export function rulingRecords(): RulingRecord[] {
  if (!existsSync(RULINGS_FILE)) return [];
  return rd(RULINGS_FILE).split("\n").filter((x) => x.trim()).map((x) => JSON.parse(x) as RulingRecord);
}
export function hasRulingRecord(r: Ruling): boolean {
  if (rulingKind(r) === "migration") return rulingRecords().some((x) => x.kind === "migration" && x.migration === r.migration && x.hash === r.migrationHash);
  return rulingRecords().some((x) => x.kind === "ruling" && x.item === r.item && (x.part ?? "") === (r.part ?? "") && (x.text ?? "").trim() === r.text.trim());
}

/** Adam's standing acceptance of exactly this FULL commit — or why there is
 *  none. A later rejection of the same batch and revision cancels it. An
 *  acceptance names one review package; one without a package identity
 *  releases nothing. */
export function standingAcceptance(commitFull: string, batch?: string, revision?: number): { acc: Acceptance | null; why: string } {
  const all = acceptances();
  const mine = all.filter((a) => a.kind === "accept" && a.commit === commitFull && (batch === undefined || a.batch.toLowerCase() === batch.toLowerCase()) && (revision === undefined || a.revision === revision)).pop();
  if (!mine) return { acc: null, why: `no acceptance from Adam names commit ${commitFull.slice(0, 7)}` };
  const later = all.slice(all.indexOf(mine) + 1).find((a) => a.kind === "reject" && a.batch.toLowerCase() === mine.batch.toLowerCase() && (a.revision === null || a.revision === mine.revision));
  if (later) return { acc: null, why: `batch ${mine.batch} revision ${mine.revision} was rejected by Adam on ${later.at.slice(0, 10)}${later.note ? ` (${later.note.slice(0, 120)})` : ""} after he accepted it — nothing in it is released; issue the next revision` };
  if (!mine.packageId) return { acc: null, why: `Adam's acceptance of ${commitFull.slice(0, 7)} names no review package; an acceptance is of one exact package — accept again` };
  return { acc: mine, why: "" };
}

/* ---- H: review packages, each with an identity ---- */

export interface SiteFile { path: string; sha: string }
export interface ReviewPackage {
  batch: string; revision: number; base: string; commit: string; packageId: string; diffSha: string; createdAt: string; runId: string;
  /** null for a full run; the names of the checks a partial run was limited to. */
  partial: string[] | null;
  required: string[];
  checks: { name: string; command: string; exit: number | null; skipped: boolean; log: string }[];
  docs: SiteFile[];
  /** Every file of the kept site, by path and content hash. */
  site: SiteFile[];
}
export function listPackages(): { dir: string; pkg: ReviewPackage }[] {
  if (!existsSync(REVIEWS)) return [];
  const out: { dir: string; pkg: ReviewPackage }[] = [];
  for (const d of readdirSync(REVIEWS).sort()) {
    const p = join(REVIEWS, d, "package.json");
    if (!existsSync(p)) continue;
    try { const pkg = JSON.parse(rd(p)) as ReviewPackage; if (pkg.packageId) out.push({ dir: join(REVIEWS, d), pkg }); } catch { /* not a package */ }
  }
  return out;
}
/** The ONE way to find a package, used by every consumer. By acceptance (the
 *  release gate, the publisher, the release bookkeeping): exactly the package
 *  the acceptance names. Or by batch, revision, commit and — when more than
 *  one exists — its id (the review before any acceptance, and the acceptance
 *  itself). Ambiguity is refused, with the exact command that resolves it. */
export function resolvePackage(q: { acceptance?: Acceptance; batch?: string; revision?: number; commit?: string; packageId?: string }): { dir: string; pkg: ReviewPackage } | { error: string } {
  const all = listPackages();
  if (q.acceptance) {
    const a = q.acceptance;
    const hit = all.filter((x) => x.pkg.packageId === a.packageId);
    if (hit.length !== 1) return { error: `Adam's acceptance names package ${a.packageId ?? "(none)"}, which ${hit.length === 0 ? "no longer exists — a regenerated package is a new package, with no acceptance" : "is not unique"}` };
    if (hit[0].pkg.commit !== a.commit || hit[0].pkg.batch.toLowerCase() !== a.batch.toLowerCase() || hit[0].pkg.revision !== a.revision) return { error: `package ${a.packageId} is not for batch ${a.batch} revision ${a.revision} at ${String(a.commit).slice(0, 7)}` };
    return hit[0];
  }
  const cands = all.filter((x) => (!q.batch || x.pkg.batch.toLowerCase() === q.batch.toLowerCase()) && (q.revision === undefined || x.pkg.revision === q.revision) && (!q.commit || x.pkg.commit === q.commit) && (!q.packageId || x.pkg.packageId === q.packageId));
  if (cands.length === 1) return cands[0];
  if (cands.length === 0) return { error: `no review package for batch ${q.batch ?? "?"} revision ${q.revision ?? "?"} at ${String(q.commit ?? "?").slice(0, 7)}${q.packageId ? ` with id ${q.packageId}` : ""} — the review command builds it, with the checks, before Adam is asked` };
  return { error: `${cands.length} review packages exist for batch ${q.batch} revision ${q.revision} at ${String(q.commit).slice(0, 7)}; name the one you reviewed:  bun run docs/audit/accept.ts accept ${q.batch} ${q.revision} ${String(q.commit).slice(0, 7)} --package <id>  where <id> is one of ${cands.map((c) => c.pkg.packageId).join(", ")}` };
}
/** A package must be a full run, and its kept site must be exactly the
 *  manifest — nothing added, missing or changed since the review. */
export function packageProblems(x: { dir: string; pkg: ReviewPackage }): string[] {
  const out: string[] = [];
  if (x.pkg.partial !== null) out.push(`package ${x.pkg.packageId} is PARTIAL or has no explicit full-run marker — partial must be null`);
  if (!Array.isArray(x.pkg.site) || x.pkg.site.length === 0) { out.push(`package ${x.pkg.packageId} has no nonempty site manifest`); return out; }
  const seen = new Set<string>();
  for (const f of x.pkg.site) {
    if (!f || typeof f.path !== "string" || !f.path || f.path.startsWith("/") || f.path.includes("\\") || f.path.split("/").some(p => !p || p === "." || p === "..") || typeof f.sha !== "string" || !/^[a-f0-9]{64}$/.test(f.sha)) out.push("the kept site: invalid manifest path or hash");
    else if (seen.has(f.path)) out.push(`the kept site: duplicate manifest path ${f.path}`);
    else seen.add(f.path);
  }
  if (!seen.has("index.html")) out.push("the kept site: manifest has no index.html");
  if (out.some(w => /invalid|duplicate/.test(w))) return out;
  const siteDir = join(x.dir, "site");
  try {
    const root = lstatSync(siteDir);
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("site is not a regular directory");
    const files: string[] = [];
    const walk = (d: string) => { for (const n of readdirSync(d)) {
      const p = join(d, n), st = lstatSync(p);
      if (st.isSymbolicLink()) throw new Error(`symbolic link ${relative(siteDir, p)}`);
      if (st.isDirectory()) walk(p);
      else if (st.isFile()) files.push(relative(siteDir, p).split("\\").join("/"));
      else throw new Error(`not a regular file: ${p}`);
    } };
    walk(siteDir);
    for (const f of x.pkg.site) { if (!files.includes(f.path)) out.push(`the kept site: ${f.path} is missing since the review`); else if (sha256(readFileSync(join(siteDir, f.path))) !== f.sha) out.push(`the kept site: ${f.path} changed since the review`); }
    for (const f of files) if (!seen.has(f)) out.push(`the kept site: ${f} was added since the review`);
  } catch (e) { out.push(`package ${x.pkg.packageId}: its kept site is missing or invalid: ${String(e)}`); }
  return out;
}
/** The manifest of a site folder, as the review runner writes it. */
export function siteManifest(siteDir: string): SiteFile[] {
  const out: SiteFile[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push({ path: relative(siteDir, p).split("\\").join("/"), sha: sha256(readFileSync(p)) }); } };
  if (existsSync(siteDir)) walk(siteDir);
  return out;
}

export { partOf, existsSync, join };

/** One physical line; JSON escaping preserves newlines and all decision text. */
export const rulingLine = (r: { item?: string; part?: string; text?: string }): string => `- Ruling ${r.item}${r.part ? `, part ${r.part}` : ""}: ${JSON.stringify(r.text ?? "")}`;
