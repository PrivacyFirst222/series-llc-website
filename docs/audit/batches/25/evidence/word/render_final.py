from pathlib import Path
import subprocess,sys,json
root=Path(__file__).resolve().parent
renderer=Path('/Users/adam/.codex/plugins/cache/openai-primary-runtime/documents/26.909.12148/skills/documents/render_docx.py')
rows=[]
for index,source in enumerate(sorted((root.parent/'repo/docs/word').glob('*.docx')),1):
 for phase,p in [('baseline',root/'baseline/word'/source.name),('green-final',source)]:
  out=root/phase/f'doc-{index:02}'
  if not list(out.glob('page-*.png')):
   out.mkdir(parents=True,exist_ok=True)
   result=subprocess.run([sys.executable,str(renderer),str(p),'--output_dir',str(out),'--emit_pdf'],capture_output=True,text=True)
   (out/'render.log').write_text(result.stdout+result.stderr)
   if result.returncode:raise SystemExit(f'{phase} {p}: {result.stderr}')
  pages=len(list(out.glob('page-*.png')))
  rows.append({'index':index,'phase':phase,'file':source.name,'pages':pages,'path':str(out)})
  (root/'renders-final.json').write_text(json.dumps(rows,indent=2)+'\n')
  print(phase,index,pages,source.name,flush=True)
