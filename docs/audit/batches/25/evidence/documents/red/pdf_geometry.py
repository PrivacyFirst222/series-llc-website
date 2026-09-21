import json,sys,pdfplumber
out=[]
with pdfplumber.open(sys.argv[1]) as pdf:
 for p in pdf.pages:
  text=p.extract_text() or ''
  words=p.extract_words()
  rules=[l for l in p.lines if abs(l['top']-l['bottom'])<.1 and abs(l['x1']-324)<.1 and l['x1']-l['x0']>100]
  sig=[]
  for l in rules:
   label=[w['text'] for w in words if abs(w['bottom']-l['top'])<5 and w['x0']<l['x0']]
   if abs(l['x0']-72)<.1 or 'By:' in label:
    following=[w for w in words if 1<w['top']-l['top']<21 and w['x0']<400]
    sig.append({'top':l['top'],'x0':l['x0'],'following':[w['text'] for w in following]})
  ink=[c for c in p.chars if c['top']<735]
  out.append({'text':text,'signatures':sig,'rules':len(rules),'inBounds':all(71<=c['x0'] and c['x1']<=541 and c['bottom']<=722 for c in ink)})
print(json.dumps(out))