"""Check the approved Manual table and the generated Word signature grouping.

Prints one B41DOCS: JSON array of {label, ok, detail} rows; exits nonzero if
any row fails. Optional inputs let mutation checks exercise the same gate.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--generator', type=Path, default=ROOT / 'docs/md-to-docx.py')
parser.add_argument('--manual', type=Path, default=ROOT / 'docs/owners-manual.md')
parser.add_argument('--word', type=Path, default=ROOT / 'docs/word/Series LLC Owners Manual - REVISED DRAFT.docx')
args = parser.parse_args()
rows = []
def check(label, ok, detail=None):
    rows.append(dict(label=label, ok=bool(ok), detail=detail))

APPROVED = 'If you choose to file a statement of authority, identify the entity that holds the property. A statement concerning property held by the company identifies the company; a statement concerning property held by a protected series identifies that protected series. The company-form instructions below should not be used for a series filing without confirming the Division’s filing requirements for that series.'
CELL = 'In the official records of every county where the company owns real property. The clerk charges a separate recording fee.'
SIGNATURE = ['SUNSHINE HOLDINGS, LLC - PS 2', 'By: _______________________', 'Name: Maria Santos', 'Title: Manager', '(if clarity helps the other side: "a protected series of Sunshine Holdings, LLC, a Florida limited liability company")']
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def text(p):
    return ''.join(n.text or '' for n in p.iter(W + 't'))
def parts(path):
    with zipfile.ZipFile(path) as z:
        return {name: z.read(name) for name in z.namelist()}
def inspect_document(data, label):
    root = ET.fromstring(data)
    paragraphs = list(root.iter(W + 'p'))
    values = [text(p) for p in paragraphs]
    check(label + ' preserves approved optional filing and series qualification', values.count(APPROVED) == 1)
    check(label + ' company filing table is company-only', values.count(CELL) == 1 and not any('company or a series owns real property' in v for v in values))
    start = next((i for i, value in enumerate(values) if value == SIGNATURE[0]), None)
    group = paragraphs[start:start + len(SIGNATURE)] if start is not None else []
    check(label + ' preserves every sample signature word', [text(p) for p in group] == SIGNATURE)
    flags = [p.find(W + 'pPr/' + W + 'keepNext') is not None for p in group]
    check(label + ' keeps the complete sample together and releases its final note', flags == [True, True, True, True, False], flags)

manual = args.manual.read_text()
check('master preserves exact approved paragraph', manual.count(APPROVED) == 1)
check('master company table does not cover series property',
      '| **4. Record the certified copy** | In the official records of **every county where the company owns real property.** The clerk charges a separate recording fee. |' in manual
      and 'company or a series owns real property' not in manual)
spec = importlib.util.spec_from_file_location('batch41_generator', args.generator)
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)
with tempfile.TemporaryDirectory(prefix='batch41-word-') as tmp:
    generated = Path(tmp) / 'manual.docx'
    generator.build(str(args.manual), str(generated))
    generated_parts, committed_parts = parts(generated), parts(args.word)
    inspect_document(generated_parts['word/document.xml'], 'fresh Word')
    inspect_document(committed_parts['word/document.xml'], 'committed Word')
    check('committed Word equals fresh generation in every OOXML part', generated_parts == committed_parts)

ordinary = '> An ordinary quotation that may span pages.\n> Its next paragraph may start another page.\n'
body, _ = generator.body_xml(ordinary, generator.PROFILES['manual'])
root = ET.fromstring(f'<w:body {generator.NS} {generator.RNS}>{body}</w:body>')
check('ordinary quoted prose remains unchained', all(p.find(W + 'pPr/' + W + 'keepNext') is None for p in root.iter(W + 'p')))
sample = 'The signature block that does it right:\n' + '\n'.join('> ' + s for s in SIGNATURE)
body, _ = generator.body_xml(sample, generator.PROFILES['agreement'])
root = ET.fromstring(f'<w:body {generator.NS} {generator.RNS}>{body}</w:body>')
name = next(p for p in root.iter(W + 'p') if text(p) == 'Name: Maria Santos')
check('manual grouping does not alter the agreement profile', name.find(W + 'pPr/' + W + 'keepNext') is None)
print('B41DOCS:' + json.dumps(rows))
sys.exit(0 if all(row['ok'] for row in rows) else 1)
