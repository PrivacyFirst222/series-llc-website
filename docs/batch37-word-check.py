"""Checks the actual generator output, including whitespace and style definitions."""
import importlib.util, json, re, sys, xml.etree.ElementTree as ET
from pathlib import Path
sys.dont_write_bytecode=True
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('generator',root/'docs/md-to-docx.py');g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
rows=[]
def check(label,ok):rows.append({'label':label,'ok':bool(ok)})
styles=ET.fromstring(g.styles_xml(g.PROFILES['agreement']))
check('DraftingChoice is defined as a character style',any(x.get(W+'styleId')=='DraftingChoice' and x.get(W+'type')=='character' for x in styles))
md='The owners <!--one:owners-->have one vote<!--/one-->, and <!--if:exhibit-->Exhibit A applies<!--/if-->. '
# Use a real conditional key from the masters to retain the known label text.
md=(root/'webapp/server/templates-oa-multi.md').read_text()
xml,_=g.body_xml(md,g.PROFILES[g.profile_for('webapp/server/templates-oa-multi.md')])
body=ET.fromstring('<w:body xmlns:w="'+W[1:-1]+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+xml+'</w:body>')
paragraphs=[''.join(t.text or '' for t in p.iter(W+'t')) for p in body.iter(W+'p')]
choices=[x for x in paragraphs if '[If ' in x or '[One ' in x or '[Multiple ' in x]
check('conditional paragraphs present',len(choices)>0)
check('Exhibit A capitalization preserved in drafting labels','Exhibit A' in g.drafting_choices('<!--if:attached-->attached text<!--/if-->') and 'exhibit a' not in g.drafting_choices('<!--if:attached-->attached text<!--/if-->'))
check('no doubled spaces around drafting labels',not any(re.search(r' {2}\[|\] {2}|\] [,.]',x) for x in choices))
check('manual describes both ownership notations','membership interests as percentages or fractions of the whole' in (root/'docs/owners-manual.md').read_text())
print('B37WORD:'+json.dumps(rows));sys.exit(0 if all(r['ok'] for r in rows) else 1)
