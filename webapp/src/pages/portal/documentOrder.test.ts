/**
 * The order of "Your documents", as Adam set it: Articles, then a certified
 * copy of the Articles if bought (9 Sep 2026), then the Protected Series
 * Designation, then the EIN letter, then the operating agreement, then the
 * rest — newest first within a rank.
 */
import { sortDocuments } from "./documentOrder";

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, got?: unknown): void {
  checks++;
  if (ok) console.log(`✅ ${name}`);
  else { failures++; console.log(`❌ ${name}${got !== undefined ? ` — got ${JSON.stringify(got)?.slice(0, 200)}` : ""}`); }
}

// Deliberately shuffled, with two documents of the same rank at different times.
const docs = [
  { kind: "certificate-of-status", title: "Certificate of Status — Coral Gate, LLC", created_at: "2026-09-07T13:14:00Z" },
  { kind: "package", title: "Operating Agreement No. 1 — Coral Gate, LLC", created_at: "2026-09-08T09:00:00Z" },
  { kind: "psd", title: "Protected Series Designation — PS 1, PS 2", created_at: "2026-09-07T13:15:00Z" },
  { kind: "package", title: "S Corporation Election Package (Form 2553) — Coral Gate, LLC", created_at: "2026-09-07T22:00:00Z" },
  { kind: "certified-copy", title: "Certified Copy of the Articles — Coral Gate, LLC", created_at: "2026-09-07T13:15:00Z" },
  { kind: "package", title: "EIN Confirmation Letter — Coral Gate, LLC", created_at: "2026-09-07T22:07:00Z" },
  { kind: "articles", title: "Articles of Organization — Coral Gate, LLC", created_at: "2026-09-07T12:02:00Z" },
  { kind: "legal_mail", title: "Legal mail — service of process", created_at: "2026-09-08T10:00:00Z" },
  { kind: "amendment", title: "Amendment No. 1 to Operating Agreement — Coral Gate, LLC", created_at: "2026-09-09T10:00:00Z" },
  { kind: "package", title: "Operating Agreement No. 2 — Coral Gate, LLC", created_at: "2026-09-08T12:00:00Z" },
];
const order = sortDocuments(docs).map((d) => d.kind === "package" || d.kind === "amendment" ? d.title.split(" — ")[0] : d.kind);
check("Articles come first", order[0] === "articles", order);
check("the certified copy sits directly under the Articles", order[1] === "certified-copy", order);
check("the Protected Series Designation follows", order[2] === "psd", order);
check("the EIN letter follows", order[3] === "EIN Confirmation Letter", order);
check("the current operating agreement follows", order[4] === "Operating Agreement No. 2", order);
check("the amendment sits just under the agreement it amends", order[5] === "Amendment No. 1 to Operating Agreement", order);
check("a superseded agreement comes after the amendment", order[6] === "Operating Agreement No. 1", order);
check("the rest come after, newest first", order.slice(7).join(",") === "legal_mail,S Corporation Election Package (Form 2553),certificate-of-status", order.slice(7));

const withoutCopy = sortDocuments(docs.filter((d) => d.kind !== "certified-copy")).map((d) => d.kind);
check("without a certified copy, the Designation is second", withoutCopy[0] === "articles" && withoutCopy[1] === "psd", withoutCopy);

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
