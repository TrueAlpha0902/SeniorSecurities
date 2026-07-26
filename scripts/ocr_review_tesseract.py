#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, os, re
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps
import pytesseract
from pytesseract import Output

ROOT=Path(__file__).resolve().parents[1]
REVIEW=ROOT/'docs/securities-text-full-review.json'

def render(segments, scale:int, mode:str):
    parts=[]
    for s in segments:
        img=Image.open(ROOT/'public'/s['src']).convert('RGB')
        crop=img.crop((s['x'],s['y'],s['x']+s['width'],s['y']+s['height']))
        if scale!=1:
            crop=crop.resize((crop.width*scale,crop.height*scale),Image.Resampling.LANCZOS)
        if mode=='sharpen':
            crop=ImageOps.autocontrast(crop.convert('L')).filter(ImageFilter.UnsharpMask(radius=1.5,percent=180,threshold=2)).convert('RGB')
        elif mode=='threshold':
            g=ImageOps.autocontrast(crop.convert('L'))
            crop=g.point(lambda p:255 if p>170 else 0).convert('RGB')
        parts.append(crop)
    if len(parts)==1:return parts[0]
    gap=12*scale
    w=max(x.width for x in parts); h=sum(x.height for x in parts)+gap*(len(parts)-1)
    out=Image.new('RGB',(w,h),'white'); y=0
    for p in parts:
        out.paste(p,(0,y)); y+=p.height+gap
    return out

def run_ocr(img, lang, psm):
    cfg=f'--oem 1 --psm {psm} -c preserve_interword_spaces=1'
    text=pytesseract.image_to_string(img,lang=lang,config=cfg)
    data=pytesseract.image_to_data(img,lang=lang,config=cfg,output_type=Output.DICT)
    conf=[]
    for c,t in zip(data['conf'],data['text']):
        try:c=float(c)
        except:continue
        if c>=0 and str(t).strip():conf.append(c)
    return {'text':text.strip(),'meanConfidence':round(sum(conf)/len(conf),3) if conf else 0,'wordCount':len(conf)}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--lang',required=True);ap.add_argument('--scale',type=int,default=1);ap.add_argument('--mode',default='none');ap.add_argument('--psm',type=int,default=6);ap.add_argument('--out',required=True)
    a=ap.parse_args(); out=ROOT/a.out; (out/'question').mkdir(parents=True,exist_ok=True);(out/'explanation').mkdir(parents=True,exist_ok=True)
    items=json.load(open(REVIEW,encoding='utf-8'))['items']
    for i,item in enumerate(items,1):
        for field in ('question','explanation'):
            dest=out/field/(item['id']+'.json')
            if dest.exists():continue
            img=render(item['segments'][field],a.scale,a.mode)
            result=run_ocr(img,a.lang,a.psm)
            result.update({'id':item['id'],'field':field,'lang':a.lang,'scale':a.scale,'mode':a.mode,'psm':a.psm})
            dest.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        if i%20==0: print(f'{i}/{len(items)}',flush=True)
    print('done',len(items),out)
if __name__=='__main__':main()
