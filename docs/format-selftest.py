#!/usr/bin/env python3
"""Break each new pagination check on purpose and watch it fire.

A check nobody has seen fail is not known to work. Four regressions shipped in
all eight agreements precisely because nothing measured them; adding a
measurement that cannot fail would repeat that with extra steps.

Each mutation edits a copy of a passing document, runs format-check.py against
it, and requires a FAIL naming the right thing.
"""
import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DOC = os.path.join(ROOT, "docs/word",
                   "SMMEMS - FPSLLC Operating Agreement - Member-Managed Single Member (S Corporation) - DRAFT.docx")


def rewrite(src, dst, part, fn):
    zin = zipfile.ZipFile(src)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == part:
                data = fn(data.decode("utf8")).encode("utf8")
            zout.writestr(item, data)


MUTATIONS = [
    ("line spacing back to single", "word/styles.xml",
     lambda s: s.replace('w:line="276" w:lineRule="auto"', ""), "line spacing"),
    ("heading space-below back to 0", "word/document.xml",
     lambda s: re.sub(r'(<w:spacing w:before="240" w:after=")\d+(")', r"\g<1>0\g<2>", s),
     "flush against the text"),
    ("page breaks removed", "word/document.xml",
     lambda s: s.replace("<w:pageBreakBefore/>", ""), "page breaks"),
    ("widow control switched off", "word/document.xml",
     lambda s: s.replace("<w:widowControl/>", '<w:widowControl w:val="0"/>', 1),
     "widow control"),
    # s. 8.5 on page 9 of SMMEMS: a heading alone above a third of a blank page.
    ("keepNext stripped from every heading", "word/document.xml",
     lambda s: s.replace("<w:keepNext/>", ""), "stranding"),
]

tmp = tempfile.mkdtemp()
name = os.path.basename(DOC)
failures = 0
for label, part, fn, expect in MUTATIONS:
    dst = os.path.join(tmp, name)
    rewrite(DOC, dst, part, fn)
    r = subprocess.run([sys.executable, os.path.join(ROOT, "docs/format-check.py"), dst],
                       capture_output=True, text=True)
    out = r.stdout + r.stderr
    ok = r.returncode != 0 and expect in out
    print(f"  {'ok  ' if ok else 'DEAD'}  {label}")
    if not ok:
        failures += 1
        print("        expected a FAIL mentioning %r, got:" % expect)
        for line in out.strip().split("\n"):
            print("          " + line)

shutil.rmtree(tmp)
print(f"\n  {len(MUTATIONS) - failures} of {len(MUTATIONS)} pagination checks caught the defect they exist for")
sys.exit(1 if failures else 0)
