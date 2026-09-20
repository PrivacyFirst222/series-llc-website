/** Pure audit validation. Coverage and evidence attestations are not proof of comprehension. */
import { createHash } from "node:crypto";
import type { Ledger, Item } from "./ledger-lib";
export const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
export const lineCount = (s: string) => s ? s.split("\n").length - Number(s.endsWith("\n")) : 0;
export const safeId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,90}$/.test(s);
export const safePath = (s: unknown): s is string => typeof s === "string" && !!s && !s.startsWith("/") && !s.includes("\\") && !s.split("/").some(x => !x || x === "." || x === "..");
const nonempty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
export const sha = (s: unknown): s is string => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
export const CHECKS = ["facts-and-owner-decisions", "statutes-and-primary-sources", "cross-references", "agreement-variants", "consent-and-series-exhibits", "manual-and-instructions", "formation-and-payment", "portal-and-company-isolation", "office-and-delivery", "renewals-and-dates", "retention-and-restored-backup", "rendered-deliverables", "test-expectations-and-controls"] as const;
export type Outcome = "fixed" | "still open" | "regressed" | "retained by owner" | "dropped" | "optional" | "duplicate" | "not verified";
export interface FileEntry { path: string; lines: number; sha: string; area: string; bucket: number; scope: "product" | "supplement" }
export interface Prior { id: string; part: string; bucket: number; item: Item }
export interface Manifest { schema: 1; run: string; commit: string; createdAt: string; files: FileEntry[]; excluded: { path: string; reason: string }[]; priors: Prior[]; ledger: Ledger; ledgerSha: string; rulingsText: string; buckets: number; requestedBuckets: number; obligations: { id: string; kind: Evidence["kind"]; scope: string; targets: string[] }[] }
export interface Receipt { file: string; sha: string; from: number; to: number; reader: string; chunkSha: string }
export interface Finding { key: string; where: string; file: string; line: number; reads: string; claims: string; truth: string; replacement: string; severity: "substantive" | "wording" | "housekeeping"; relation: "new" | "prior"; prior?: {id: string; part: string}; evidence: string[]; review: { reviewer: string; evidence: string; replacement: "correct" | "needs owner ruling"; priorCompared: boolean } }
export interface Report { bucket: number; commit: string; reader: string; files: { path: string; lines: number; sha: string; noFindings: boolean }[]; priorFindings: { id: string; part: string; status: Outcome; evidence: string; evidenceIds: string[]; ruling?: string; duplicate?: {id: string; part: string} }[]; findings: Finding[] }
export interface Evidence { id: string; commit: string; kind: "source" | "runtime" | "render" | "comparison" | "decision"; status: "verified" | "not verified"; detail: string; artifact: string; sha: string; url?: string; quote?: string; checkedAt: string; offline?: boolean; expected?: string; observed?: string; pages?: number; pagesInspected?: number }
export interface Check { id: string; status: "verified" | "not verified"; evidence: string[]; detail: string }
export interface AuditData { manifest: Manifest; receipts: Receipt[]; reports: Report[]; evidence: Evidence[]; checks: Check[] }
export interface Validation { problems: string[]; files: number; lines: number; priors: number; findings: number }
export function validateAudit(d: AuditData, readSource: (path: string) => string | null, readArtifact: (path: string) => Buffer | null): Validation {
  const problems: string[] = []; const fail = (s: string) => problems.push(s);
  const m = d.manifest;
  if (m.schema !== 1 || !safeId(m.run) || !/^[a-f0-9]{40}$/.test(m.commit)) fail("invalid run identity");
  if (hash(JSON.stringify(m.ledger)) !== m.ledgerSha) fail("ledger snapshot hash mismatch");
  const parts = m.ledger.items.flatMap(i => i.parts.map(p => `${i.id}:${p.key}`));
  if (new Set(parts).size !== parts.length) fail("duplicate ledger part identity");
  const priorKeys = m.priors.map(p => `${p.id}:${p.part}`);
  if (new Set(priorKeys).size !== parts.length || priorKeys.length !== parts.length || parts.some(p => !priorKeys.includes(p))) fail("manifest does not assign every ledger part exactly once");
  const expected = new Map(m.files.map(f => [f.path, f]));
  if (!m.files.length || expected.size !== m.files.length) fail("empty or duplicate inventory");
  const sources = new Map<string, string>();
  for (const f of m.files) {
    if (!safePath(f.path) || !Number.isSafeInteger(f.lines) || f.lines < 0 || !sha(f.sha) || !Number.isInteger(f.bucket) || f.bucket < 1 || f.bucket > m.buckets) { fail(`invalid inventory entry ${f.path}`); continue; }
    const text = readSource(f.path);
    if (text === null || hash(text) !== f.sha || lineCount(text) !== f.lines) fail(`source changed or missing: ${f.path}`);
    else sources.set(f.path, text);
  }
  for (const p of m.priors) {
    const original = m.ledger.items.find(i => i.id === p.id);
    if (!original || JSON.stringify(original) !== JSON.stringify(p.item) || !original.parts.some(x => x.key === p.part) || !Number.isInteger(p.bucket) || p.bucket < 1 || p.bucket > m.buckets) fail(`invalid prior assignment ${p.id}:${p.part}`);
  }
  const evidence = new Map<string, Evidence>();
  for (const e of d.evidence) {
    if (!safeId(e.id) || evidence.has(e.id)) fail(`duplicate/invalid evidence id ${e.id}`);
    evidence.set(e.id, e);
    if (e.commit !== m.commit || !nonempty(e.detail) || !Number.isFinite(Date.parse(e.checkedAt)) || !["source","runtime","render","comparison","decision"].includes(e.kind)) fail(`invalid evidence ${e.id}`);
    if (e.status !== "verified") fail(`evidence not verified: ${e.id}`);
    if (!safePath(e.artifact) || !e.artifact.startsWith("evidence/") || !sha(e.sha)) fail(`invalid artifact for ${e.id}`);
    else { const bytes = readArtifact(e.artifact); if (!bytes || hash(bytes) !== e.sha) fail(`missing/changed evidence artifact: ${e.id}`); }
    if (["runtime","render","comparison"].includes(e.kind) && (!nonempty(e.expected) || !nonempty(e.observed))) fail(`expected and observed evidence missing: ${e.id}`);
    if (e.kind === "render" && (!Number.isSafeInteger(e.pages) || (e.pages ?? 0) < 1 || e.pagesInspected !== e.pages)) fail(`not every rendered page inspected: ${e.id}`);
    if (e.kind === "runtime" && e.offline !== true) fail(`runtime evidence lacks offline isolation attestation: ${e.id}`);
    if (e.url && (!/^https:\/\//.test(e.url) || !nonempty(e.quote))) fail(`external evidence needs source URL and quote: ${e.id}`);
  }
  const refs = (ids: string[], label: string) => { if (!Array.isArray(ids) || !ids.length || ids.some(id => !evidence.has(id) || evidence.get(id)?.status !== "verified")) fail(`missing verified evidence: ${label}`); };
  const required = [...CHECKS, ...m.obligations.map(o => o.id)];
  if (new Set(required).size !== required.length) fail("duplicate audit obligation");
  for (const id of required) {
    const cs = d.checks.filter(c => c.id === id);
    if (cs.length !== 1 || cs[0].status !== "verified" || !nonempty(cs[0].detail)) fail(`required audit check incomplete: ${id}`);
    else {
      refs(cs[0].evidence, id);
      const obligation = m.obligations.find(o => o.id === id);
      if (obligation && !cs[0].evidence.some(e => evidence.get(e)?.kind === obligation.kind)) fail(`wrong evidence kind for ${id}`);
      if (id.startsWith("statute-") && !cs[0].evidence.some(e => { const v=evidence.get(e); try { return v?.url && /(^|\.)leg\.state\.fl\.us$/.test(new URL(v.url).hostname) && nonempty(v.quote); } catch { return false; } })) fail(`statute source not opened on Online Sunshine: ${id}`);
    }
  }
  if (d.checks.some(c => !required.includes(c.id))) fail("unknown audit checklist entry");
  const seenFiles = new Set<string>(), seenPriors = new Set<string>(), buckets = new Set<number>(), keys = new Set<string>(), fingerprints = new Set<string>();
  let lines = 0;
  const allReceipts = d.receipts;
  for (const r of allReceipts) {
    const f = expected.get(r.file); const text = sources.get(r.file);
    if (!f || text === undefined || !nonempty(r.reader) || r.sha !== f.sha || !Number.isSafeInteger(r.from) || !Number.isSafeInteger(r.to) || (f.lines === 0 ? r.from !== 0 || r.to !== 0 : r.from < 1 || r.to < r.from || r.to > f.lines)) { fail(`invalid reading receipt: ${r.file}`); continue; }
    const chunk = f.lines === 0 ? "" : text.split("\n").slice(r.from - 1, r.to).join("\n");
    if (hash(chunk) !== r.chunkSha) fail(`reading receipt hash mismatch: ${r.file}`);
  }
  for (const r of d.reports) {
    if (!Number.isInteger(r.bucket) || r.bucket < 1 || r.bucket > m.buckets || buckets.has(r.bucket) || r.commit !== m.commit || !nonempty(r.reader)) fail(`duplicate/invalid report ${r.bucket}`);
    buckets.add(r.bucket);
    for (const f of r.files) {
      const ex = expected.get(f.path);
      if (!ex || ex.bucket !== r.bucket || seenFiles.has(f.path)) { fail(`unexpected/duplicate file ${f.path}`); continue; }
      seenFiles.add(f.path);
      if (!Number.isSafeInteger(f.lines) || f.lines !== ex.lines || f.sha !== ex.sha) fail(`exact file coverage mismatch: ${f.path}`);
      else lines += ex.lines;
      const intervals = allReceipts.filter(x => x.file === f.path && x.reader === r.reader).sort((a,b) => a.from-b.from);
      let covered = 0;
      for (const x of intervals) { if (x.from > covered + 1) break; covered = Math.max(covered, x.to); }
      if (!intervals.length || covered !== ex.lines) fail(`whole-file reading receipts missing: ${f.path}`);
      if (typeof f.noFindings !== "boolean" || f.noFindings !== !r.findings.some(x => x.file === f.path)) fail(`no-findings declaration disagrees: ${f.path}`);
    }
    for (const p of r.priorFindings) {
      const k = `${p.id}:${p.part}`, assignment = m.priors.find(x => x.id === p.id && x.part === p.part);
      if (!assignment || assignment.bucket !== r.bucket || seenPriors.has(k)) fail(`unexpected/duplicate prior ${k}`);
      seenPriors.add(k);
      if (!["fixed","still open","regressed","retained by owner","dropped","optional","duplicate"].includes(p.status) || !nonempty(p.evidence)) fail(`prior not reconciled: ${k}`);
      refs(p.evidenceIds, k);
      if (p.status === "retained by owner" && !nonempty(p.ruling)) fail(`retained item lacks quoted owner decision: ${k}`);
      if (p.status === "duplicate" && (!p.duplicate || !parts.includes(`${p.duplicate.id}:${p.duplicate.part}`) || `${p.duplicate.id}:${p.duplicate.part}` === k)) fail(`invalid duplicate target: ${k}`);
    }
    for (const f of r.findings) {
      if (!safeId(f.key) || keys.has(f.key)) fail(`duplicate/invalid finding key: ${f.key}`); keys.add(f.key);
      const ex = expected.get(f.file), src = sources.get(f.file);
      if (!ex || ex.bucket !== r.bucket || !Number.isSafeInteger(f.line) || f.line < 1 || f.line > ex.lines) fail(`finding outside assigned source: ${f.key}`);
      for (const k of ["where","reads","claims","truth","replacement"] as const) if (!nonempty(f[k])) fail(`finding ${f.key} lacks ${k}`);
      if (src) { const first=src.split("\n")[f.line-1]??"";const offset=first.indexOf(f.reads.split("\n")[0]);if(offset<0 || !src.split("\n").slice(f.line-1).join("\n").slice(offset).startsWith(f.reads)) fail(`quoted text not at the cited line: ${f.key}`); }
      if (!["substantive","wording","housekeeping"].includes(f.severity)) fail(`invalid severity: ${f.key}`);
      const fingerprint = hash(JSON.stringify([f.file,f.reads,f.claims]));
      if (fingerprints.has(fingerprint)) fail(`duplicate defect text: ${f.key}`); fingerprints.add(fingerprint);
      if (f.relation !== "new" && f.relation !== "prior") fail(`finding lacks prior/new classification: ${f.key}`);
      if (f.relation === "prior" && (!f.prior || !parts.includes(`${f.prior.id}:${f.prior.part}`))) fail(`finding lacks valid prior target: ${f.key}`);
      refs(f.evidence, f.key);
      if (!f.review || !nonempty(f.review.reviewer) || f.review.reviewer === r.reader || !nonempty(f.review.evidence) || f.review.priorCompared !== true || !["correct","needs owner ruling"].includes(f.review.replacement)) fail(`independent recheck/replacement review missing: ${f.key}`);
    }
  }
  for (const f of m.files) if (!seenFiles.has(f.path)) fail(`file unread: ${f.path}`);
  for (const k of priorKeys) if (!seenPriors.has(k)) fail(`prior missing: ${k}`);
  for (let i=1;i<=m.buckets;i++) if (!buckets.has(i)) fail(`bucket missing: ${i}`);
  return { problems, files: seenFiles.size, lines, priors: seenPriors.size, findings: keys.size };
}
