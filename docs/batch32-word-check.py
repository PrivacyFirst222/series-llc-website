#!/usr/bin/env python3
"""render-word-alternatives-glued: real editable Word output, independent label/text proof."""
import importlib.util,sys,re,json,os,subprocess,tempfile,xml.etree.ElementTree as ET
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[1];W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
LABEL_STYLE='DraftingChoice'
def load(path):
 spec=importlib.util.spec_from_file_location('generator',path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def unlabeled_text(root):
 return ''.join(t.text or '' for r in root.iter(W+'r') if r.find(W+'rPr/'+W+'rStyle') is None or r.find(W+'rPr/'+W+'rStyle').get(W+'val')!=LABEL_STYLE for t in r.iter(W+'t'))
shared=load(Path(__file__).with_name('word-text-check.py'))
def verify(generator=None):
 gen=load(generator or ROOT/'docs/md-to-docx.py');results=[]
 def check(label,ok,detail=None):
  results.append(ok);print('CHECK_RESULT '+json.dumps(dict(suite='batch32-word',label=label,ok=bool(ok),detail=detail,commit=os.getenv('CHECK_COMMIT',''),run=os.getenv('CHECK_RUN_ID',''))))
 # Preserved approved generator, not the candidate formatter under test.
 with tempfile.TemporaryDirectory(prefix='word-reference-') as directory:
  reference=Path(directory)/'generator.py'
  reference.write_bytes(subprocess.check_output(['git','show','404669b878756fdbc562aee89c61b6810057484a:docs/md-to-docx.py'],cwd=ROOT))
  reference_gen=load(reference)
 mapping=re.findall(r'  "([^"|]+)\|([^"|]+\.docx)"',(ROOT/'.claude/hooks/update-word-docs.sh').read_text())
 for source,_ in mapping:
  md=(ROOT/source).read_text();xml,_=gen.body_xml(md,gen.PROFILES[gen.profile_for(source)]);root=ET.fromstring('<w:body xmlns:w="'+W[1:-1]+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+xml+'</w:body>')
  labels=[ ''.join(t.text or '' for t in r.iter(W+'t')) for r in root.iter(W+'r') if r.find(W+'rPr/'+W+'rStyle') is not None and r.find(W+'rPr/'+W+'rStyle').get(W+'val')==LABEL_STYLE]
  count=len(re.findall(r'<!--\s*(?:one|many|if):',md))
  check(source+' each drafting choice explicitly opens and closes',len(labels)==2*count,{'choices':count,'labels':len(labels)})
  visible=''.join(t.text or '' for t in root.iter(W+'t'))
  check(source+' no glued alternatives or controls',not any(x in visible for x in ['hashave','MEMBER:MEMBERS:','Manager:Adopted','[MANAGER NAMES].The initial Managers','[[indent]]','\x01','\x02']))
  check(source+' drafting labels have whitespace boundaries',not shared.label_boundaries(root),shared.label_boundaries(root))
  paragraphs=list(root.findall(W+'p'));orphanable=[]
  for n,paragraph in enumerate(paragraphs):
   value=''.join(t.text or '' for t in paragraph.iter(W+'t'))
   if value.startswith('[End ') and (n==0 or paragraphs[n-1].find(W+'pPr/'+W+'keepNext') is None):orphanable.append(value)
  check(source+' closing labels stay with preceding text',not orphanable,orphanable)
  old_xml,_=reference_gen.body_xml(md,reference_gen.PROFILES[reference_gen.profile_for(source)])
  old=ET.fromstring('<w:body xmlns:w="'+W[1:-1]+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+old_xml+'</w:body>')
  check(source+' legal characters and choices identical after removing labels',shared.paragraphs(root)==shared.paragraphs(old))
 print(f'{sum(results)}/{len(results)} Batch32 Word checks passed');return all(results)
if __name__=='__main__':sys.exit(0 if verify(Path(sys.argv[1]) if len(sys.argv)>1 else None) else 1)
