/**
 * The fact ledger's check (docs/facts.md). Fails closed:
 *  - every `where` text must appear in its file;
 *  - every `retired` wording must appear nowhere a client or the office reads
 *    (or nowhere under its named path prefix);
 *  - each agreement master's colophon must list exactly the statute sections
 *    its own body cites;
 *  - every portal rate limit for a signed-in action must be charged after the
 *    route's first shape check, so a refusal never spends the allowance.
 * Run: bun run docs/facts-check.ts  (from the repo root or webapp/).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const rd = (p: string) => readFileSync(join(ROOT, p), "utf8");

interface Fact { name: string; where: { path: string; text: string }[]; retired: { text: string; scope: string | null }[] }

function parseLedger(md: string): Fact[] {
  const facts: Fact[] = [];
  let cur: Fact | null = null;
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("### ")) { cur = { name: line.slice(4).trim(), where: [], retired: [] }; facts.push(cur); continue; }
    if (!cur) continue;
    let m = line.match(/^- where: (\S+) — `([^`]*)`\s*$/);
    if (m) { cur.where.push({ path: m[1], text: m[2] }); continue; }
    // a `where` text that spans lines: opened on this line, closed on a later one
    m = line.match(/^- where: (\S+) — `([^`]*)$/);
    if (m) {
      let text = m[2];
      while (++i < lines.length && !lines[i].includes("`")) text += "\n" + lines[i];
      text += "\n" + lines[i].slice(0, lines[i].indexOf("`"));
      cur.where.push({ path: m[1], text }); continue;
    }
    m = line.match(/^- retired: `([^`]*)`(?: in (\S+))?\s*$/);
    if (m) { cur.retired.push({ text: m[1], scope: m[2] ?? null }); continue; }
  }
  return facts;
}

/** Everything a client or the office can read, plus the code that composes it. */
function scanSet(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = join(dir, name);
      const st = statSync(join(ROOT, rel));
      if (st.isDirectory()) { if (!/node_modules|dist|\.git|api$/.test(rel)) walk(rel); continue; }
      if (!/\.(tsx?|md|html)$/.test(name)) continue;
      if (/\.test\.ts$|e2e\.ts$|provenance\.ts$|behavioral\.ts$|chapter-605-notes\.md$|facts\.md$|facts-check\.ts$|oa-map\.md$|event-map|coverage-605|FAILURES\.md$|README\.md$|CLAUDE\.md$/.test(rel)) continue;
      out.push(rel);
    }
  };
  walk("webapp/src"); walk("webapp/server"); walk("docs");
  out.push("webapp/index.html");
  return out;
}

const problems: string[] = [];
const ledger = parseLedger(rd("docs/facts.md"));
let places = 0;
for (const f of ledger) {
  for (const w of f.where) {
    places++;
    let content = "";
    try { content = rd(w.path); } catch { problems.push(`${f.name}: ${w.path} does not exist`); continue; }
    if (!content.includes(w.text)) problems.push(`${f.name}: ${w.path} no longer says "${w.text.replace(/\n\s*/g, " ")}"`);
  }
}
const files = scanSet();
const contents = new Map(files.map((p) => [p, rd(p)]));
for (const f of ledger) {
  for (const r of f.retired) {
    for (const [p, c] of contents) {
      if (r.scope && !p.startsWith(r.scope)) continue;
      if (c.includes(r.text)) {
        const line = c.slice(0, c.indexOf(r.text)).split("\n").length;
        problems.push(`${f.name}: retired wording "${r.text}" still in ${p}:${line}`);
      }
    }
  }
}

// Each master's colophon lists exactly the sections its body cites.
const masters = readdirSync(join(ROOT, "webapp/server")).filter((n) => /^templates-oa-(?!amendment).*\.md$/.test(n));
for (const n of masters) {
  const t = rd(`webapp/server/${n}`);
  const m = t.match(/^\*Form document — .*?Statutory citations in this form: ss\. (.*?), Fla\. Stat\./m);
  if (!m || m.index === undefined) { problems.push(`${n}: no colophon in the ledger's form`); continue; }
  const body = t.slice(0, m.index);
  const cite = (s: string) => new Set([...s.matchAll(/\b605\.\d{4,5}\b/g), ...s.matchAll(/\b711\.\d{3}\b/g), ...s.matchAll(/\b48\.\d{3}\b/g)].map((x) => x[0]));
  const inBody = cite(body); const inColophon = cite(m[1]);
  for (const c of inBody) if (!inColophon.has(c)) problems.push(`${n}: body cites s. ${c}, colophon does not list it`);
  for (const c of inColophon) if (!inBody.has(c)) problems.push(`${n}: colophon lists s. ${c}, body never cites it`);
}

// Portal limits for signed-in actions are charged after the route's first check.
{
  const t = rd("webapp/server/routes-portal.ts");
  const routes = [...t.matchAll(/app\.(post|put)\("(\/portal\/[^"]+)"/g)];
  for (let i = 0; i < routes.length; i++) {
    const start = routes[i].index ?? 0;
    const end = i + 1 < routes.length ? (routes[i + 1].index ?? t.length) : t.length;
    const body = t.slice(start, end);
    const lim = body.search(/rateLimit\(`(oagen|oaamend|svc|acct):/);
    if (lim < 0) continue;
    const parse = body.search(/\.safeParse\(|resolveCompanyOrder\(|clientLlcName\(/);
    if (parse < 0 || lim < parse) problems.push(`${routes[i][2]}: its rate limit is charged before the request is checked`);
  }
}

const retiredCount = ledger.reduce((n, f) => n + f.retired.length, 0);
if (problems.length) {
  console.error(`facts-check: ${problems.length} problem(s)`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log(`  ok    ${ledger.length} facts, ${places} places agree; ${retiredCount} retired wordings absent from ${files.length} files; ${masters.length} colophons match their bodies; portal limits charged after checks`);
