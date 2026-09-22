#!/usr/bin/env python3
"""Batch 25: WORD-EXHIBIT-TABLE-ROWS and WORD-INDENT-CONTROL-LEAK.

Compare real generated OOXML with every source table and signature control,
and preserve the visible text of the committed pre-repair Word artifacts.
--generator permits the identical assertions to exercise the old converter.
No network or publication; generated fixtures live in a temporary directory.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
BASELINE = "2559e18f5094b70c8eba1eb64e3c3519aa609f3e"


def text(element):
    # Ignore only the separately styled drafting annotations introduced by
    # Batch32; compare every original cell/indent character without them.
    return "".join(t.text or "" for r in element.iter(W + "r")
                   if r.find(W + "rPr/" + W + "rStyle") is None or
                   r.find(W + "rPr/" + W + "rStyle").get(W + "val") != "DraftingChoice"
                   for t in r.iter(W + "t"))


def plain(value):
    return re.sub(r"\*{1,3}", "", value).strip()


def expected_tables(md):
    # Read the authored rows, ignoring comment-only control lines. A real blank
    # line still ends a table. Inline choices remain present in editable forms.
    tables, rows = [], []
    for raw in md.splitlines():
        line = re.sub(r"<!--.*?-->", "", raw).strip()
        if not line and "<!--" in raw:
            continue
        if line.startswith("|"):
            if not ("-" in line and re.fullmatch(r"[| :\-]+", line)):
                rows.append([plain(c) for c in line[1:-1].split("|")])
        elif rows:
            tables.append(rows)
            rows = []
    if rows:
        tables.append(rows)
    return tables


def actual_tables(root):
    return [[[re.sub(r"\s+", " ", text(cell)).strip() for cell in row.findall(W + "tc")]
             for row in table.findall(W + "tr")]
            for table in root.iter(W + "tbl")]


def content(root):
    # Spaces between table cells replace their Markdown pipe delimiters. Only
    # structural pipes/control tokens are normalized, never legal words/blanks.
    paragraphs = [text(p).replace("[[indent]]", "") for p in root.iter(W + "p")]
    paragraphs = [re.sub(r"\s*\|\s*", " ", p) if p.startswith("|") else p for p in paragraphs]
    return re.sub(r"\s+", " ", " ".join(paragraphs)).strip()


def docxml(path):
    with zipfile.ZipFile(path) as z:
        return ET.fromstring(z.read("word/document.xml"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generator", type=Path, default=ROOT / "docs/md-to-docx.py")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("word_generator", args.generator)
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    mapping = re.findall(r'^  "([^"|]+)\|([^"\n]+\.docx)"$',
                         (ROOT / ".claude/hooks/update-word-docs.sh").read_text(), re.M)
    results = []

    # The original Batch 25 proof compared every generated document with the
    # pre-repair Word text. Later approved wording batches must not make that
    # proof impossible. Use the latest implemented/released batch as a chain-
    # of-custody step: its base already passed this check, its work order names
    # every permitted replacement, and the generator itself must be unchanged.
    ledger = json.loads((ROOT / "docs/audit/ledger.json").read_text())
    requested = os.environ.get("FPSLLC_BATCH", "")
    eligible = [b for b in ledger.get("batches", [])
                if b.get("status") in ("implemented", "released")]
    if requested:
        eligible = [b for b in eligible if str(b.get("id", "")).lower() == requested.lower()]
    governing = eligible[-1] if eligible else None
    work_order = None
    if governing:
        snapshot = ROOT / "docs/audit/batches" / str(governing["id"]) / "revisions" / f'r{governing["revision"]}.json'
        if snapshot.exists():
            work_order = json.loads(snapshot.read_text())
    reference = work_order.get("base") if work_order else BASELINE
    default_generator = (ROOT / "docs/md-to-docx.py").resolve()
    using_default_generator = args.generator.resolve() == default_generator

    def check(label, ok, detail):
        row = {"suite": "batch25-word", "label": label, "ok": bool(ok),
               "detail": detail, "commit": os.environ.get("CHECK_COMMIT", ""),
               "run": os.environ.get("CHECK_RUN_ID", "")}
        results.append(row)
        print(("PASS " if ok else "FAIL ") + label + ": " + str(detail))
        print("CHECK_RESULT " + json.dumps(row))

    check("all twelve published Word mappings checked", len(mapping) == 12, len(mapping))
    generator_unchanged = True
    baseline_generator = None
    if using_default_generator and work_order:
        try:
            before_generator = subprocess.check_output(
                ["git", "show", reference + ":docs/md-to-docx.py"], cwd=ROOT)
            generator_unchanged = before_generator == default_generator.read_bytes()
        except subprocess.CalledProcessError:
            generator_unchanged = False
        if not generator_unchanged:
            # Load the actual base converter. Comparing two outputs of the new
            # converter would not prove that its new labels preserve old text.
            baseline_generator = before_generator
        check("Word generator baseline available for independent preservation check",
              generator_unchanged or baseline_generator is not None,
              {"batch": work_order["id"], "base": reference, "unchanged": generator_unchanged})
    with tempfile.TemporaryDirectory(prefix="batch25-word-") as temporary:
        tmp = Path(temporary)
        old_generator = generator
        if baseline_generator is not None:
            old_path = tmp / "base-generator.py"
            old_path.write_bytes(baseline_generator)
            old_spec = importlib.util.spec_from_file_location("base_word_generator", old_path)
            old_generator = importlib.util.module_from_spec(old_spec)
            old_spec.loader.exec_module(old_generator)
        for source, filename in mapping:
            md = (ROOT / source).read_text()
            output = tmp / filename
            generator.build(str(ROOT / source), str(output))
            actual = docxml(output)
            with zipfile.ZipFile(output) as fresh, zipfile.ZipFile(ROOT / 'docs/word' / filename) as kept:
                parts = sorted(fresh.namelist())
                mismatches = [name for name in parts if name not in kept.namelist() or fresh.read(name) != kept.read(name)]
                check(source + " tracked Word contains the current generator output",
                      not mismatches and parts == sorted(kept.namelist()), mismatches)
            expected = expected_tables(md)
            tables = actual_tables(actual)
            check(source + " complete table cell matrix", [[[re.sub(r"\s+", "", c) for c in row] for row in t] for t in tables] == [[[re.sub(r"\s+", "", c) for c in row] for row in t] for t in expected],
                  {"expectedRows": [len(t) for t in expected], "actualRows": [len(t) for t in tables]})
            expected_indent = [plain(line.split("[[indent]]", 1)[1])
                               for line in md.splitlines() if line.startswith("[[indent]]")]
            indented = [p for p in actual.iter(W + "p")
                        if (p.find(W + "pPr/" + W + "ind") is not None)]
            got_indent = [text(p) for p in indented]
            control_leaks = text(actual).count("[[indent]]")
            check(source + " entity signature controls become indents",
                  control_leaks == 0 and (not expected_indent or got_indent == expected_indent),
                  {"expected": len(expected_indent), "actual": len(indented), "controlLeaks": control_leaks})
            if using_default_generator and work_order:
                try:
                    expected_md = subprocess.check_output(
                        ["git", "show", reference + ":" + source], cwd=ROOT, text=True)
                except subprocess.CalledProcessError:
                    expected_md = ""
                replacements = [a for item in work_order.get("items", [])
                                for a in item.get("assertions", [])
                                if a.get("kind") == "replace" and a.get("file") == source]
                missing = []
                for replacement in replacements:
                    before, after = replacement["before"], replacement["after"]
                    if before not in expected_md:
                        missing.append(before[:120])
                    expected_md = expected_md.replace(before, after)
                source_exact = not missing and expected_md == md
                check(source + " source is exactly its batch base plus declared replacements",
                      source_exact,
                      {"batch": work_order["id"], "revision": work_order["revision"],
                       "replacements": len(replacements), "missing": missing,
                       "expectedChars": len(expected_md), "actualChars": len(md)})
                expected_source = tmp / "expected" / Path(source).name
                expected_source.parent.mkdir(parents=True, exist_ok=True)
                expected_source.write_text(expected_md)
                expected_word = tmp / ("expected-" + filename)
                old_generator.build(str(expected_source), str(expected_word))
                expected_content = content(docxml(expected_word))
                check(source + " all baseline text and drafting choices retained",
                      source_exact and re.sub(r"\s+", "", content(actual)) == re.sub(r"\s+", "", expected_content),
                      {"base": reference, "expectedChars": len(expected_content),
                       "afterChars": len(content(actual))})
            else:
                baseline = tmp / "baseline.docx"
                baseline.write_bytes(subprocess.check_output([
                    "git", "show", BASELINE + ":docs/word/" + filename], cwd=ROOT))
                check(source + " all baseline text and drafting choices retained",
                      content(actual) == content(docxml(baseline)),
                      {"beforeChars": len(content(docxml(baseline))), "afterChars": len(content(actual))})

        fixture = "| Owner | Share |\n|---|---|\n<!-- repeat:member -->\n| [NAME] | 100% |\n<!-- /repeat -->\n| **Total** | **100%** |\n\nOutside paragraph.\n\n| Other | Value |\n|---|---|\n| A | B |\n"
        xml, _ = generator.body_xml(fixture, generator.PROFILES["agreement"])
        root = ET.fromstring('<w:body xmlns:w="' + W[1:-1] + '">' + xml + '</w:body>')
        check("comment-wrapped data and totals remain in first table; blank separates second table",
              actual_tables(root) == [[['Owner', 'Share'], ['[NAME]', '100%'], ['Total', '100%']], [['Other', 'Value'], ['A', 'B']]],
              actual_tables(root))
        check("intervening ordinary paragraph stays outside tables",
              [text(p) for p in root.findall(W + "p") if text(p)] == ["Outside paragraph."],
              [text(p) for p in root.findall(W + "p") if text(p)])
        check("table header repeat and body row no-split survive",
              all(t.find(W + "tr/" + W + "trPr/" + W + "tblHeader") is not None and
                  all(r.find(W + "trPr/" + W + "cantSplit") is not None for r in t.findall(W + "tr"))
                  for t in root.iter(W + "tbl")), "all fixture rows")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(results, indent=2) + "\n")
    passed = sum(row["ok"] for row in results)
    print(f"Batch 25 Word: {passed}/{len(results)} checks passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
