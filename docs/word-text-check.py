"""Whitespace-sensitive paragraph and drafting-label checks, shared by Word gates."""
import re
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def collapsed(s):
    return re.sub(r'\s+', ' ', s).strip()
def is_label(run):
    style=run.find(W+'rPr/'+W+'rStyle')
    return style is not None and style.get(W+'val')=='DraftingChoice'
def run_text(run):
    return ''.join(t.text or '' for t in run.iter(W+'t'))
def paragraphs(root):
    return [value for p in root.iter(W+'p') if (value:=collapsed(''.join(run_text(r) for r in p.iter(W+'r') if not is_label(r))))]
def label_boundaries(root):
    problems=[]
    for pi,p in enumerate(root.iter(W+'p')):
        runs=[r for r in p.iter(W+'r') if run_text(r)]
        for i,r in enumerate(runs):
            if not is_label(r): continue
            here=run_text(r); before=run_text(runs[i-1]) if i else ''; after=run_text(runs[i+1]) if i+1<len(runs) else ''
            # Labels may adjoin punctuation, never a letter, digit or another label.
            if here.lstrip().startswith('[') and before and not before[-1].isspace() and (before[-1].isalnum() or before[-1] in ']_') and not here[0].isspace(): problems.append((pi,'before',before[-30:]+here[:30]))
            if after and not here[-1].isspace() and not after[0].isspace() and (after[0].isalnum() or after[0] in '[_'): problems.append((pi,'after',here[-30:]+after[:30]))
    return problems
