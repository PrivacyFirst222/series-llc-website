"""Positive controls and real Word-gate mutations. No published artifact is changed."""
import json,os,subprocess,tempfile,zipfile,sys,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
rows=[]
def check(label,ok,detail=None): rows.append(dict(label=label,ok=bool(ok),detail=detail))
def run(command):return subprocess.run(command,cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
with tempfile.TemporaryDirectory(prefix='b38-word-') as d:
 d=Path(d)
 good=run([sys.executable,'docs/batch32-word-check.py']);check('current Word text and boundaries pass',good.returncode==0,good.stdout[-120:])
 source=(ROOT/'docs/md-to-docx.py').read_text();needle='out.append(leading + annotation("[" + label + ":" + label_gap) + clause + annotation("]") + trailing)'
 assert needle in source
 mutant=d/'glued.py';mutant.write_text(source.replace(needle,'out.append(annotation("[" + label + ":" + label_gap) + clause + annotation("]"))'))
 bad=run([sys.executable,'docs/batch32-word-check.py',str(mutant)])
 check('glued drafting labels are rejected by real Word gate',bad.returncode!=0 and '"ok": false' in bad.stdout and ('boundaries' in bad.stdout or 'choices identical' in bad.stdout),bad.stdout[-500:])
 for original in (ROOT/'docs/word').glob('*.docx'):
  if 'Amendment' not in original.name and 'Statement' not in original.name:continue
  good=run([sys.executable,'docs/format-check.py',str(original)]);check(original.name+' current typography passes',good.returncode==0,good.stdout[-300:])
  for mutation in ['font','size','spacing']:
   target=d/mutation/original.name;target.parent.mkdir(exist_ok=True)
   with zipfile.ZipFile(original) as src,zipfile.ZipFile(target,'w') as out:
    for name in src.namelist():
     data=src.read(name)
     if name in ['word/document.xml','word/styles.xml']:
      value=data.decode()
      if mutation=='font':value=value.replace('Times New Roman','Arial')
      elif mutation=='size':value=value.replace('<w:sz w:val="24"','<w:sz w:val="20"')
      else:value=value.replace('w:line="276"','w:line="240"')
      data=value.encode()
     out.writestr(name,data)
   bad=run([sys.executable,'docs/format-check.py',str(target)])
   check(original.name+' rejects changed '+mutation,bad.returncode!=0 and 'typography/layout differs' in bad.stdout,bad.stdout[-400:])
print('B38WORD:'+json.dumps(rows));sys.exit(0 if all(r['ok'] for r in rows) else 1)
