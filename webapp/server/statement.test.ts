/**
 * Statement of Authorized Representative: the master's six slots filled,
 * nothing left over, the draft colophon gone, the signature conformed.
 */
import { assembleStatement } from "./statement";

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, got?: unknown): void {
  checks++;
  if (ok) console.log(`✅ ${name}`);
  else { failures++; console.log(`❌ ${name}${got !== undefined ? ` — got ${JSON.stringify(got)?.slice(0, 300)}` : ""}`); }
}

const { markdown: md, title } = assembleStatement({
  memberManaged: true,
  companyName: "ACME Holdings, LLC",
  documentNumber: "L26000123456",
  signerName: "Adam Kirwan",
  signerTitle: "Manager",
  date: "September 13, 2026",
});
check("title names the company", title === "Statement of Authorized Representative — ACME Holdings, LLC", title);
check("heading names the company", md.includes("# STATEMENT OF AUTHORIZED REPRESENTATIVE\n\n## ACME Holdings, LLC"), md.slice(0, 120));
check("the opening names the Filer, the company, and its document number", md.includes('states as follows with respect to **ACME Holdings, LLC**, a Florida limited liability company (the "Company"), Florida document number **L26000123456**:'), md.match(/states as follows[^\n]*/)?.[0]);
check("all seven numbered paragraphs are present", ["**1. Capacity.**","**2. Authorization.**","**3. No ownership or management interest.**","**4. Authority exhausted on filing.**","**5. Where authority resides.**","**6. Registered agent service.**","**7. Purpose.**"].every((h) => md.includes(h)));
check("the signature is conformed in the house entity block: By: /s/ over the printed name and title (15 Sep 2026)", md.includes("FLORIDA PROTECTED SERIES, LLC - PS 1, d/b/a MyFloridaSeriesLLC\n\nBy: /s/ Adam Kirwan\n[[indent]]Adam Kirwan\n[[indent]]Manager\nDate: September 13, 2026"), md.slice(-260));
check("the editing note and draft colophon are gone", !md.includes("<!--") && !/Form document/.test(md) && !/MASTER\. Edit this file/.test(md));
check("no slot is left unfilled", !/\[[A-Z][A-Z ()/.']*\]/.test(md), md.match(/\[[A-Z][A-Z ()/.']*\]/g));
check("the statute cited is s. 605.0102(8)(a)", md.includes("s. 605.0102(8)(a), Florida Statutes"));
check("paragraph 6 says the Filer is not the agent and names PS 2 as a separate series (Adam, 13 Sep 2026)", md.includes("**6. Registered agent service.** The Filer is not the Company's registered agent. If the Company has engaged **FLORIDA PROTECTED SERIES, LLC - PS 2**, a separate protected series of the same limited liability company, as its registered agent, that engagement is a distinct service governed by its own terms and by s. 605.0113, Florida Statutes, and nothing in this Statement affects it.") && !md.includes("or its affiliate"), md.match(/\*\*6\.[^\n]*/)?.[0]);

let threw = "";
try { assembleStatement({ companyName: "ACME Holdings, LLC", documentNumber: " ", signerName: "A", signerTitle: "B", date: "C", memberManaged: true }); } catch (e) { threw = String(e); }
check("a blank document number is refused", /documentNumber is required/.test(threw), threw);

console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
