#!/usr/bin/env python3
from pathlib import Path
import json,sys
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
D=json.load(open(ROOT/'public/data/pdf-image-quiz.json',encoding='utf-8'))
items={q['id']:q for b in D['banks'] for c in b['chapters'] for q in c['questions']}
def render(segs):
    parts=[]
    for s in segs:
        im=Image.open(ROOT/'public'/s['src']).convert('RGB')
        parts.append(im.crop((s['x'],s['y'],s['x']+s['width'],s['y']+s['height'])))
    w=max(i.width for i in parts); gap=10; h=sum(i.height for i in parts)+gap*(len(parts)-1)
    out=Image.new('RGB',(w,h),'white');y=0
    for p in parts:out.paste(p,(0,y));y+=p.height+gap
    return out
outdir=ROOT/'docs/review-crops';outdir.mkdir(parents=True,exist_ok=True)
for qid in sys.argv[1:]:
    q=items[qid]
    qi=render(q['questionSegments']);ei=render(q['explanationSegments'])
    scale=2
    qi=qi.resize((qi.width*scale,qi.height*scale),Image.Resampling.LANCZOS)
    ei=ei.resize((ei.width*scale,ei.height*scale),Image.Resampling.LANCZOS)
    header=70; w=max(qi.width,ei.width); h=header*2+qi.height+ei.height+20
    out=Image.new('RGB',(w,h),'white');d=ImageDraw.Draw(out)
    d.text((10,10),qid+' QUESTION',fill='black');out.paste(qi,(0,header));y=header+qi.height+10
    d.text((10,y),qid+' EXPLANATION',fill='black');out.paste(ei,(0,y+header))
    path=outdir/(qid+'.png');out.save(path);print(path)
