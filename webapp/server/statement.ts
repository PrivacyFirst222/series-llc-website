/**
 * Statement of Authorized Representative (Adam, 13 Sep 2026: "It appears
 * automatically when the articles are uploaded"). Furnished when the client
 * appointed us to sign and file their Articles under s. 605.0102(8)(a), so a
 * bank reading the public record can see why the name on the Articles is not
 * a member's. The master, templates-statement-of-authorized-representative.md,
 * carries every word; this fills its six slots and nothing else.
 */
import { readFileSync } from "node:fs";
import statementRaw from "./templates-statement-of-authorized-representative.md";

function loadTemplate(v: string): string {
  return v.includes("STATEMENT OF AUTHORIZED REPRESENTATIVE") ? v : readFileSync(v, "utf8");
}
const statementTemplate = loadTemplate(statementRaw as string);

export interface StatementInputs {
  /** As the Division filed it — "ACME Holdings, LLC". */
  companyName: string;
  /** Florida document number from the stamped Articles — "L26000123456". */
  documentNumber: string;
  signerName: string;
  signerTitle: string;
  /** Human format, "September 13, 2026". */
  date: string;
}

function must(haystack: string, needle: string, label: string): void {
  if (!haystack.includes(needle)) throw new Error(`Statement template marker missing: ${label}`);
}

export function assembleStatement(inp: StatementInputs): { markdown: string; title: string } {
  for (const [k, v] of Object.entries(inp)) {
    if (!String(v ?? "").trim()) throw new Error(`Statement: ${k} is required`);
  }
  let s = statementTemplate;
  // The master's own editing note and draft colophon are not part of the
  // delivered document.
  s = s.replace(/<!--[\s\S]*?-->\s*/g, "");
  s = s.replace(/\n---\n\n\*Form document\.[^\n]*\*\s*$/, "\n");
  // The company's name in the master is "[COMPANY NAME], LLC"; the filed name
  // already carries its own designator.
  must(s, "[COMPANY NAME], LLC", "company name");
  s = s.split("[COMPANY NAME], LLC").join(inp.companyName);
  must(s, "[DOCUMENT NUMBER]", "document number");
  s = s.split("[DOCUMENT NUMBER]").join(inp.documentNumber);
  // A conformed signature on the master's own line: "/s/" and the signer.
  must(s, "_____________________________\nBy: [SIGNER NAME]", "signature block");
  s = s.replace("_____________________________\nBy: [SIGNER NAME]", `/s/ ${inp.signerName}\nBy: ${inp.signerName}`);
  must(s, "[SIGNER TITLE]", "signer title");
  s = s.split("[SIGNER TITLE]").join(inp.signerTitle);
  must(s, "[DATE]", "date");
  s = s.split("[DATE]").join(inp.date);
  const leftover = s.match(/\[[A-Z][A-Z ()/.']*\]/g);
  if (leftover) throw new Error(`Statement: unfilled slot(s): ${[...new Set(leftover)].join(", ")}`);
  if (/Form document/.test(s)) throw new Error("Statement: draft colophon left in the document");
  return { markdown: s.trimEnd() + "\n", title: `Statement of Authorized Representative — ${inp.companyName}` };
}
