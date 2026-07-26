#!/usr/bin/env python3
from pathlib import Path
import json, argparse
from PIL import Image, ImageOps, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
items={x['id']:x for x in json.load(open(ROOT/'docs/securities-text-full-review.json',encoding='utf-8'))['items']}
def render(segs):
    parts=[]
    for s in segs:
        im=Image.open(ROOT/'public'/s['src']).convert('RGB')
        parts.append(im.crop((s['x'],s['y'],s['x']+s['width'],s['y']+s['height'])))
    w=max(i.width for i in parts); gap=10; h=sum(i.height for i in parts)+gap*(len(parts)-1)
    out=Image.new('RGB',(w,h),'white'); y=0
    for p in parts: out.paste(p,(0,y));y+=p.height+gap
    return out
def main():
 ap=argparse.ArgumentParser();ap.add_argument('ids',nargs='*');a=ap.parse_args()
 outdir=ROOT/'docs/review-crops';outdir.mkdir(parents=True,exist_ok=True)
 ids=a.ids or list(items)
 for qid in ids:
  x=items[qid]; q=render(x['segments']['question']);e=render(x['segments']['explanation'])
  scale=2
  q=q.resize((q.width*scale,q.height*scale),Image.Resampling.LANCZOS);e=e.resize((e.width*scale,e.height*scale),Image.Resampling.LANCZOS)
  header=70; w=max(q.width,e.width); h=header*2+q.height+e.height+20
  out=Image.new('RGB',(w,h),'white');d=ImageDraw.Draw(out)
  d.text((10,10),qid+'  QUESTION',fill='black');out.paste(q,(0,header)); y=header+q.height+10
  d.text((10,y),qid+'  EXPLANATION',fill='black');out.paste(e,(0,y+header))
  out.save(outdir/(qid+'.png'))
  print(outdir/(qid+'.png'))
if __name__=='__main__':main()
