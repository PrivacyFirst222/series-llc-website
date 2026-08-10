/**
 * Copies the authored documents out of Dropbox into docs/source/ and
 * regenerates the diffable markdown beside them.
 *
 * Dropbox is where Adam writes; this repository is the system of record. Run
 * this after any edit so the committed copy and the markdown match what he
 * actually has. See docs/README.md.
 *
 *   bun run docs:sync
 */
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(HERE, "source");

const ORIGIN =
  "/Users/adam/Library/CloudStorage/Dropbox/00 SharedWithMac/FPSLLC Operating Agreement";

/** Authored file -> generated markdown. A file with no markdown target (the
 *  PDF) is still copied, so it cannot be lost. */
const DOCUMENTS: { file: string; md?: string }[] = [
  { file: "Series LLC Owners Manual - REVISED DRAFT.docx", md: "owners-manual.md" },
  { file: "Series LLC Owners Manual.pdf" },
  { file: "FPSLLC Operating Agreement Instructions - DRAFT.docx", md: "oa-instructions.md" },
  {
    file: "FPSLLC Operating Agreement - Manager-Managed Single Member (Disregarded) - DRAFT.docx",
    md: "oa-draft-single-disregarded.md",
  },
  {
    file: "FPSLLC Operating Agreement - Manager-Managed Multi-Member (Partnership) - DRAFT.docx",
    md: "oa-draft-multi-partnership.md",
  },
  {
    file: "FPSLLC Operating Agreement - Manager-Managed (S Corporation) - DRAFT.docx",
    md: "oa-draft-manager-s-corp.md",
  },
  {
    file: "FPSLLC Operating Agreement - Member-Managed Multi-Member (Partnership) - DRAFT.docx",
    md: "oa-draft-member-partnership.md",
  },
  {
    file: "FPSLLC Operating Agreement - Member-Managed (S Corporation) - DRAFT.docx",
    md: "oa-draft-member-s-corp.md",
  },
];

await mkdir(SOURCE_DIR, { recursive: true });

let copied = 0;
let missing: string[] = [];
for (const doc of DOCUMENTS) {
  const from = join(ORIGIN, doc.file);
  if (!existsSync(from)) {
    missing.push(doc.file);
    continue;
  }
  await copyFile(from, join(SOURCE_DIR, doc.file));
  copied++;
}

/** Research material in the same folder that is deliberately NOT committed:
 *  samples and other people's documents, not anything we deliver. Listed so
 *  the check below stays meaningful — it must fire on a genuinely new
 *  deliverable, not on these. */
const REFERENCE_ONLY = new Set([
  "Florida Operating Agreement.pdf",
  "SM1003-001.Smith.DE LLC Operating Agreement.p'ship.pdf",
  // a client's document — reference only, never ours to redistribute
  "Operating Agreement- pilfered from client.pdf",
]);

// Anything sitting in the origin folder that this script does not know about
// is a deliverable with no home here — surface it rather than let it sit
// outside version control.
const known = new Set([...DOCUMENTS.map((d) => d.file), ...REFERENCE_ONLY]);
let unlisted: string[] = [];
try {
  for (const name of await readdir(ORIGIN)) {
    if (name.startsWith(".") || !/\.(docx|pdf)$/i.test(name)) continue;
    if (!known.has(name)) unlisted.push(name);
  }
} catch {
  // origin unreachable (different machine) — the committed copies still stand
}

const CONVERTER = join(HERE, "docx-to-md.py");
const targets = DOCUMENTS.filter((d) => d.md && existsSync(join(SOURCE_DIR, d.file)));
for (const doc of targets) {
  const res = spawnSync("python3", [CONVERTER, join(SOURCE_DIR, doc.file), join(HERE, doc.md!)], {
    encoding: "utf8",
  });
  if (res.status !== 0) {
    console.error(`  convert failed: ${doc.file}\n${res.stderr}`);
    process.exitCode = 1;
  }
}

console.log(`copied ${copied}/${DOCUMENTS.length}, converted ${targets.length}`);
if (missing.length) {
  console.error("MISSING from the origin folder — check Dropbox:");
  for (const m of missing) console.error("  " + m);
  process.exitCode = 1;
}
if (unlisted.length) {
  console.error("NOT TRACKED — in the origin folder but not in docs/README.md:");
  for (const u of unlisted) console.error("  " + u);
  process.exitCode = 1;
}
