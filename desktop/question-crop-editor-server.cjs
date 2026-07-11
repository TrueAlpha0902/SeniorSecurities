#!/usr/bin/env node
/* TrueAlpha Question Editor - simplified local desktop tool v62 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const here = __dirname;
const projectRoot = path.resolve(here, '..');
const publicRoot = path.join(projectRoot, 'public');
const dataRoot = path.join(publicRoot, 'data');
const dataPath = path.join(dataRoot, 'pdf-image-quiz.json');
const backupDir = path.join(dataRoot, 'backups');

function send(res, status, body, type = 'application/json; charset=utf-8') {
  const out = type.includes('json') && typeof body !== 'string' ? JSON.stringify(body) : body;
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(out);
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 10_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function loadData() {
  if (!fs.existsSync(dataPath)) {
    throw new Error(`找不到 ${dataPath}。請確認工具放在 SeniorSecurities\\desktop 資料夾內。`);
  }
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}
function saveData(data) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const backupName = `pdf-image-quiz-before-edit-${stamp}.json`;
  fs.copyFileSync(dataPath, path.join(backupDir, backupName));
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  return `public/data/backups/${backupName}`;
}
function findQuestion(data, id) {
  for (const bank of data.banks || []) {
    for (const chapter of bank.chapters || []) {
      for (const question of chapter.questions || []) {
        if (question.id === id) return { bank, chapter, question };
      }
    }
  }
  return null;
}
function sanitizeSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map(s => ({
    page: Math.max(1, Math.round(Number(s.page || 1))),
    src: String(s.src || '').replace(/^\/+/, '').replace(/^public\//, '').replace(/^data\//, ''),
    x: Math.max(0, Math.round(Number(s.x || 0))),
    y: Math.max(0, Math.round(Number(s.y || 0))),
    width: Math.max(1, Math.round(Number(s.width || 1))),
    height: Math.max(1, Math.round(Number(s.height || 1))),
    pageWidth: Math.max(1, Math.round(Number(s.pageWidth || 1))),
    pageHeight: Math.max(1, Math.round(Number(s.pageHeight || 1))),
  })).filter(s => s.src);
}
function publicAssetPath(src) {
  const safe = String(src || '').replace(/^\/+/, '').replace(/^public\//, '').replace(/^data\//, '');
  const target = path.normalize(path.join(publicRoot, safe));
  if (!target.startsWith(publicRoot)) throw new Error('Invalid asset path');
  return target;
}
function mime(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.html') return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

const html = String.raw`<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TrueAlpha 題目修正工具</title>
<style>
:root{--brand:#1f7890;--brand2:#2f8ea5;--ink:#182238;--muted:#728096;--line:#e3e9f0;--bg:#f6f8fb;--danger:#b42b42;--ok:#147a52;--warn:#a16207}*{box-sizing:border-box}body{margin:0;font-family:"Microsoft JhengHei",system-ui,-apple-system,Segoe UI,sans-serif;background:linear-gradient(135deg,#f9fbfd,#eef3f7);color:var(--ink)}.shell{max-width:1500px;margin:0 auto;padding:26px}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}.eyebrow{color:var(--brand);font-weight:900;letter-spacing:.08em}.title{font-size:42px;font-weight:950;margin:4px 0}.subtitle{color:var(--muted);font-size:16px}.card{background:rgba(255,255,255,.9);border:1px solid var(--line);border-radius:28px;padding:22px;box-shadow:0 18px 60px rgba(15,23,42,.08);margin-bottom:18px}.grid{display:grid;grid-template-columns:360px 1fr;gap:18px}.formGrid{display:grid;grid-template-columns:1fr;gap:12px}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.three{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}label{font-size:14px;font-weight:900;color:#3a465c;margin-bottom:6px;display:block}select,input{width:100%;padding:13px 14px;border:1px solid var(--line);border-radius:16px;background:white;font-size:16px;color:var(--ink);outline:none}select:focus,input:focus{border-color:#93c8d5;box-shadow:0 0 0 4px rgba(31,120,144,.1)}button{border:1px solid var(--line);background:white;color:var(--ink);border-radius:999px;padding:12px 16px;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.07)}button:hover{transform:translateY(-1px)}button.primary{background:var(--brand);border-color:transparent;color:#fff}button.danger{background:var(--danger);border-color:transparent;color:#fff}button.ok{background:var(--ok);border-color:transparent;color:#fff}button.ghost{box-shadow:none;background:#f8fafc}.tabs{display:flex;gap:10px;flex-wrap:wrap}.tabs button.active{background:#e4f4f8;color:#176579;border-color:#a8d6e0}.status{padding:12px 14px;border-radius:18px;background:#eef6f8;color:#176579;font-weight:800;white-space:pre-wrap}.status.err{background:#ffe8ec;color:#9f1f37}.status.ok{background:#e9f8ef;color:#127244}.hint{font-size:13px;color:var(--muted);line-height:1.55}.miniHint{font-size:12px;color:var(--muted);line-height:1.45;margin-top:6px}.segActions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.segActions button{width:100%}.previewGrid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;align-items:start}.canvasBox{border:1px solid var(--line);border-radius:22px;background:white;padding:14px;overflow:auto}.canvasTitle{font-size:14px;font-weight:950;color:#506078;margin-bottom:10px;display:flex;justify-content:space-between;gap:8px}canvas{display:block;background:white;border-radius:14px;border:1px solid #edf2f7;max-width:100%}.cropCanvas{width:100%;max-height:560px;object-fit:contain}.fullCanvas{width:100%;max-height:560px;object-fit:contain}.quick{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.quickGroup{border:1px solid var(--line);border-radius:22px;padding:14px;background:#fbfdff}.quickGroup h3{font-size:15px;margin:0 0 10px}.btnGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wide{grid-column:1/-1}.advanced{border:1px dashed #cbd5e1;border-radius:20px;padding:14px;background:#fbfdff}.advanced summary{cursor:pointer;font-weight:950;color:#506078}.small{font-size:13px;padding:9px 11px}.answerBox{background:#f7fbfc;border:1px solid #d7eaf0;border-radius:18px;padding:14px}.answerBox .answer{font-size:28px;font-weight:950;color:var(--brand);margin-top:4px}.footerActions{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(246,248,251,0),rgba(246,248,251,.98) 22%);padding:20px 0 4px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}.pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;background:#eef6f8;color:#176579;font-weight:900;padding:8px 12px}.muted{color:var(--muted)}@media(max-width:1000px){.grid,.previewGrid{grid-template-columns:1fr}.quick{grid-template-columns:1fr 1fr}.title{font-size:34px}.shell{padding:16px}}@media(max-width:640px){.quick{grid-template-columns:1fr}.two,.three{grid-template-columns:1fr}.top{flex-direction:column}.footerActions{justify-content:stretch}.footerActions button{width:100%}}
</style>
</head>
<body>
<div class="shell">
  <div class="top">
    <div>
      <div class="eyebrow">QUESTION EDITOR</div>
      <div class="title">題目截圖與答案修正</div>
      <div class="subtitle">流程：選題 → 微調截圖 → 確認答案 → 儲存。儲存時會自動備份原始資料。</div>
    </div>
    <button id="shutdownBtn" class="ghost">關閉工具</button>
  </div>

  <div class="grid">
    <div class="card">
      <div class="formGrid">
        <div><label>科目</label><select id="bankSelect"></select></div>
        <div><label>章節</label><select id="chapterSelect"></select></div>
        <div class="two"><div><label>直接輸入題號</label><input id="questionSearch" placeholder="例如 130" /></div><div style="align-self:end"><button id="goQuestionBtn" class="primary" style="width:100%">跳到題號</button></div></div>
        <div><label>目前題目</label><select id="questionSelect"></select></div>
        <div class="answerBox"><label>正確答案</label><select id="answerSelect"><option value="1">(1)</option><option value="2">(2)</option><option value="3">(3)</option><option value="4">(4)</option></select><div class="hint">如果答案給錯，只要改這裡後按「儲存修改」。</div></div>
        <div><label>要調整哪一張</label><div class="tabs"><button id="modeQuestion" class="active">題目截圖</button><button id="modeExplanation">解析截圖</button></div></div>
        <div><label>截圖段落</label><select id="segmentSelect"></select><div class="segActions"><button id="addNextPageSegBtn" class="primary">補下一頁一段</button><button id="addSegBtn">複製目前段落</button></div><button id="deleteSegBtn" class="danger small" style="margin-top:8px;width:100%">刪除目前段落</button><div class="miniHint">若題目跨頁，按「補下一頁一段」，再用右側微調框出下一頁那一行。左邊預覽會把所有段落上下接在一起。</div></div>
        <div><label>微調幅度</label><select id="stepSelect"><option>1</option><option selected>5</option><option>10</option><option>20</option><option>50</option></select></div>
        <div id="questionInfo" class="pill">尚未載入</div>
        <div id="status" class="status">載入中...</div>
      </div>
    </div>

    <div>
      <div class="card">
        <div class="previewGrid">
          <div class="canvasBox"><div class="canvasTitle"><span>裁切後在 App 看到的樣子</span><span id="modeLabel" class="muted">題目截圖</span></div><canvas id="cropCanvas" class="cropCanvas"></canvas></div>
          <div class="canvasBox"><div class="canvasTitle"><span>原圖位置</span><span class="muted">紅框是目前裁切範圍</span></div><canvas id="fullCanvas" class="fullCanvas"></canvas></div>
        </div>
      </div>

      <div class="card">
        <div class="quick">
          <div class="quickGroup"><h3>移動整個框</h3><div class="btnGrid"><button data-nudge="up">上移</button><button data-nudge="down">下移</button><button data-nudge="left">左移</button><button data-nudge="right">右移</button></div></div>
          <div class="quickGroup"><h3>調上下邊界</h3><div class="btnGrid"><button data-nudge="topUp">上緣往上</button><button data-nudge="topDown">上緣往下</button><button data-nudge="bottomUp">下緣往上</button><button data-nudge="bottomDown">下緣往下</button></div></div>
          <div class="quickGroup"><h3>調左右邊界</h3><div class="btnGrid"><button data-nudge="leftOut">左緣往左</button><button data-nudge="leftIn">左緣往右</button><button data-nudge="rightIn">右緣往左</button><button data-nudge="rightOut">右緣往右</button></div></div>
          <div class="quickGroup"><h3>常用操作</h3><div class="btnGrid"><button data-nudge="hplus">高度加大</button><button data-nudge="hminus">高度縮小</button><button data-nudge="wplus">寬度加大</button><button data-nudge="wminus">寬度縮小</button></div></div>
        </div>
        <details class="advanced" style="margin-top:14px"><summary>進階座標，通常不用打開</summary><div class="three" style="margin-top:12px"><div><label>圖片路徑</label><input id="srcInput"></div><div><label>頁碼</label><input id="pageInput" type="number"></div><div><label>X</label><input id="xInput" type="number"></div><div><label>Y</label><input id="yInput" type="number"></div><div><label>寬</label><input id="wInput" type="number"></div><div><label>高</label><input id="hInput" type="number"></div><div><label>原圖寬</label><input id="pwInput" type="number"></div><div><label>原圖高</label><input id="phInput" type="number"></div></div></details>
      </div>
    </div>
  </div>

  <div class="footerActions">
    <button id="reloadBtn">重新載入資料</button>
    <button id="resetBtn">放棄本題修改</button>
    <button id="openDataBtn">打開資料夾</button>
    <button id="saveBtn" class="ok">儲存修改</button>
  </div>
</div>

<script>
const $ = id => document.getElementById(id);
let data = null;
let current = null;
let mode = 'question';
let segIndex = 0;
let dirty = false;
function setStatus(msg, type='') { const el=$('status'); el.textContent=msg; el.className='status '+type; }
async function api(url, opt) { const r = await fetch(url, opt); const text = await r.text(); let out; try { out = JSON.parse(text); } catch { out = text; } if (!r.ok) throw new Error(out.error || text); return out; }
function banks(){return data?.banks || []}
function selectedBank(){return banks().find(b => b.bankId === $('bankSelect').value)}
function selectedChapter(){return (selectedBank()?.chapters || []).find(c => c.chapterSlug === $('chapterSelect').value || c.chapterId === $('chapterSelect').value)}
function selectedQuestion(){return (selectedChapter()?.questions || []).find(q => q.id === $('questionSelect').value)}
function clone(o){return JSON.parse(JSON.stringify(o))}
function fillBanks(){ $('bankSelect').innerHTML = banks().map(b => '<option value="'+b.bankId+'">'+(b.bankTitle || b.bankId)+'</option>').join(''); fillChapters(); }
function fillChapters(){ const b=selectedBank(); $('chapterSelect').innerHTML=(b?.chapters||[]).map(c => '<option value="'+(c.chapterSlug || c.chapterId)+'">'+c.chapterId+' - '+(c.chapterTitle || '')+'</option>').join(''); fillQuestions(); }
function fillQuestions(){ const c=selectedChapter(); $('questionSelect').innerHTML=(c?.questions||[]).map(q => '<option value="'+q.id+'">第 '+q.number+' 題｜答案 '+(q.answer || '-')+'</option>').join(''); loadCurrent(); }
function loadCurrent(){ const q=selectedQuestion(); if(!q)return; current=clone(q); segIndex=0; $('answerSelect').value=String(current.answer || '1'); $('questionInfo').textContent=(selectedBank()?.bankTitle || '')+' / '+(selectedChapter()?.chapterId || '')+' / 第 '+current.number+' 題'; fillSegmentSelect(); fillSegmentForm(); renderPreview(); setStatus('已載入。用右側按鈕調整截圖，或改正確答案後按「儲存修改」。'); dirty=false; }
function segments(){ return mode === 'question' ? (current.questionSegments ||= []) : (current.explanationSegments ||= []) }
function currentSeg(){ const segs=segments(); if(!segs.length){segs.push({page:1,src:'',x:0,y:0,width:100,height:100,pageWidth:1000,pageHeight:1000});} if(segIndex >= segs.length) segIndex = segs.length - 1; return segs[segIndex]; }
function fillSegmentSelect(){ const segs=segments(); $('segmentSelect').innerHTML=segs.map((s,i)=>'<option value="'+i+'">段落 '+(i+1)+' / '+segs.length+'｜p.'+(s.page||1)+'｜'+(s.src||'尚無圖片')+'</option>').join(''); $('segmentSelect').value=String(segIndex); $('modeLabel').textContent=(mode==='question'?'題目截圖':'解析截圖')+'｜共 '+segs.length+' 段'; $('modeQuestion').classList.toggle('active',mode==='question'); $('modeExplanation').classList.toggle('active',mode==='explanation'); }
function fillSegmentForm(){ const s=currentSeg(); $('srcInput').value=s.src||''; $('pageInput').value=s.page||1; $('xInput').value=s.x||0; $('yInput').value=s.y||0; $('wInput').value=s.width||1; $('hInput').value=s.height||1; $('pwInput').value=s.pageWidth||1; $('phInput').value=s.pageHeight||1; }
function readSegmentForm(){ const s=currentSeg(); s.src=$('srcInput').value.trim().replace(/^\/+/, '').replace(/^public\//, '').replace(/^data\//, ''); s.page=+($('pageInput').value||1); s.x=Math.max(0,Math.round(+($('xInput').value||0))); s.y=Math.max(0,Math.round(+($('yInput').value||0))); s.width=Math.max(1,Math.round(+($('wInput').value||1))); s.height=Math.max(1,Math.round(+($('hInput').value||1))); s.pageWidth=Math.max(1,Math.round(+($('pwInput').value||1))); s.pageHeight=Math.max(1,Math.round(+($('phInput').value||1))); dirty=true; return s; }
function loadImage(src){ return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('圖片載入失敗：'+src+'\n請確認 public 資料夾內有這張圖片。')); img.src='/asset/'+encodeURIComponent(src).replace(/%2F/g,'/')+'?t='+Date.now(); }); }
function nextPageSrc(src){
  const raw = String(src || '');
  return raw.replace(/page-(\d+)(\.[a-zA-Z0-9]+)$/,(m,num,ext)=>{
    const next = String(Number(num)+1).padStart(num.length,'0');
    return 'page-'+next+ext;
  });
}
async function drawStackedPreview(){
  const segs = segments().filter(s=>s && s.src);
  const crop=$('cropCanvas');
  const ctx=crop.getContext('2d');
  if(!segs.length){ crop.width=1; crop.height=1; ctx.clearRect(0,0,1,1); return; }
  const loaded=[];
  for(const s of segs){
    const img = await loadImage(s.src);
    loaded.push({s,img});
    if(s.pageWidth<=1) s.pageWidth=img.naturalWidth;
    if(s.pageHeight<=1) s.pageHeight=img.naturalHeight;
  }
  const gap = loaded.length > 1 ? 16 : 0;
  const width = Math.max(1, ...loaded.map(({s})=>Math.max(1,Math.round(s.width||1))));
  const height = loaded.reduce((sum,{s})=>sum+Math.max(1,Math.round(s.height||1)),0) + gap*(loaded.length-1);
  crop.width = width;
  crop.height = Math.max(1,height);
  ctx.clearRect(0,0,crop.width,crop.height);
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,crop.width,crop.height);
  let y=0;
  loaded.forEach(({s,img},i)=>{
    const h=Math.max(1,Math.round(s.height||1));
    const w=Math.max(1,Math.round(s.width||1));
    ctx.drawImage(img,Math.max(0,s.x||0),Math.max(0,s.y||0),w,h,0,y,w,h);
    if(i===segIndex){
      ctx.strokeStyle='#e11d48';
      ctx.lineWidth=4;
      ctx.strokeRect(2,y+2,Math.max(1,w-4),Math.max(1,h-4));
    }
    if(i < loaded.length-1){
      ctx.fillStyle='#eef2f7';
      ctx.fillRect(0,y+h, crop.width, gap);
      ctx.fillStyle='#64748b';
      ctx.font='bold 13px Microsoft JhengHei, sans-serif';
      ctx.fillText('下一段', 10, y+h+12);
    }
    y += h + gap;
  });
}
async function renderPreview(){ try{ const s=readSegmentForm(); if(!s.src){setStatus('目前段落沒有圖片路徑，請打開進階座標確認。','err');return;} await drawStackedPreview(); const img=await loadImage(s.src); if(s.pageWidth<=1){s.pageWidth=img.naturalWidth;$('pwInput').value=s.pageWidth;} if(s.pageHeight<=1){s.pageHeight=img.naturalHeight;$('phInput').value=s.pageHeight;} const full=$('fullCanvas'); const maxW=1050; const scale=Math.min(1,maxW/img.naturalWidth); full.width=Math.round(img.naturalWidth*scale); full.height=Math.round(img.naturalHeight*scale); const fc=full.getContext('2d'); fc.clearRect(0,0,full.width,full.height); fc.drawImage(img,0,0,full.width,full.height); fc.strokeStyle='#e11d48'; fc.lineWidth=Math.max(2,3*scale); fc.strokeRect(s.x*scale,s.y*scale,s.width*scale,s.height*scale); fc.fillStyle='rgba(225,29,72,.12)'; fc.fillRect(s.x*scale,s.y*scale,s.width*scale,s.height*scale); } catch(e){ setStatus(e.message,'err'); } }
function nudge(kind){ const step=+($('stepSelect').value||5); const s=readSegmentForm(); if(kind==='up')s.y-=step; if(kind==='down')s.y+=step; if(kind==='left')s.x-=step; if(kind==='right')s.x+=step; if(kind==='wplus')s.width+=step; if(kind==='wminus')s.width-=step; if(kind==='hplus')s.height+=step; if(kind==='hminus')s.height-=step; if(kind==='topUp'){s.y-=step;s.height+=step;} if(kind==='topDown'){s.y+=step;s.height-=step;} if(kind==='bottomUp'){s.height-=step;} if(kind==='bottomDown'){s.height+=step;} if(kind==='leftOut'){s.x-=step;s.width+=step;} if(kind==='leftIn'){s.x+=step;s.width-=step;} if(kind==='rightIn'){s.width-=step;} if(kind==='rightOut'){s.width+=step;} s.x=Math.max(0,Math.round(s.x)); s.y=Math.max(0,Math.round(s.y)); s.width=Math.max(1,Math.round(s.width)); s.height=Math.max(1,Math.round(s.height)); fillSegmentForm(); renderPreview(); }
async function loadAll(){ data=await api('/api/data'); fillBanks(); setStatus('資料載入完成。','ok'); }
async function save(){ try{ readSegmentForm(); current.answer=$('answerSelect').value; const payload={id:current.id,answer:current.answer,questionSegments:current.questionSegments,explanationSegments:current.explanationSegments}; const r=await api('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const q=selectedQuestion(); Object.assign(q, clone(current)); if($('questionSelect').selectedOptions[0]) $('questionSelect').selectedOptions[0].textContent='第 '+q.number+' 題｜答案 '+current.answer; setStatus('已儲存。本機 JSON 已更新，並建立備份：\n'+r.backup,'ok'); dirty=false;}catch(e){setStatus(e.message,'err')} }
$('bankSelect').onchange=fillChapters; $('chapterSelect').onchange=fillQuestions; $('questionSelect').onchange=loadCurrent; $('segmentSelect').onchange=()=>{segIndex=+$('segmentSelect').value;fillSegmentForm();renderPreview()};
$('modeQuestion').onclick=()=>{readSegmentForm();mode='question';segIndex=0;fillSegmentSelect();fillSegmentForm();renderPreview()}; $('modeExplanation').onclick=()=>{readSegmentForm();mode='explanation';segIndex=0;fillSegmentSelect();fillSegmentForm();renderPreview()};
['srcInput','pageInput','xInput','yInput','wInput','hInput','pwInput','phInput'].forEach(id=>$(id).addEventListener('input',()=>{readSegmentForm();renderPreview()}));
document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>nudge(b.dataset.nudge));
$('addSegBtn').onclick=()=>{ const segs=segments(); const base=clone(currentSeg()); segs.push(base); segIndex=segs.length-1; fillSegmentSelect(); fillSegmentForm(); renderPreview(); setStatus('已複製一個段落。左側預覽會把所有段落上下接在一起。'); };
$('addNextPageSegBtn').onclick=()=>{ const segs=segments(); const base=clone(currentSeg()); const nextSrc=nextPageSrc(base.src); if(nextSrc===base.src){ alert('無法自動判斷下一頁圖片路徑，請用「複製目前段落」後到進階座標手動修改圖片路徑。'); return; } const h=Math.min(180, Math.max(80, Math.round((base.height || 120) * 0.45))); const next={...base, page:Math.max(1,Number(base.page||1)+1), src:nextSrc, y:0, height:h}; segs.push(next); segIndex=segs.length-1; fillSegmentSelect(); fillSegmentForm(); renderPreview(); setStatus('已加入下一頁段落。請在右邊原圖用微調按鈕框住下一頁那一行，左邊會顯示合併後效果。','ok'); };
$('deleteSegBtn').onclick=()=>{ const segs=segments(); if(segs.length<=1){alert('至少保留一個段落');return;} if(confirm('確定刪除目前段落？')){segs.splice(segIndex,1);segIndex=0;fillSegmentSelect();fillSegmentForm();renderPreview();} };
$('goQuestionBtn').onclick=()=>{ const n=Number($('questionSearch').value.trim()); if(!n)return; const qs=selectedChapter()?.questions||[]; const q=qs.find(x=>Number(x.number)===n); if(q){$('questionSelect').value=q.id;loadCurrent()}else alert('本章找不到這個題號'); };
$('saveBtn').onclick=save; $('resetBtn').onclick=loadCurrent; $('reloadBtn').onclick=loadAll; $('openDataBtn').onclick=()=>api('/api/open-data',{method:'POST'}); $('shutdownBtn').onclick=async()=>{await api('/api/shutdown',{method:'POST'}); document.body.innerHTML='<h1 style="padding:40px">工具已關閉，可以關掉這個視窗。</h1>'};
window.onbeforeunload = () => dirty ? '尚未儲存修改，確定離開？' : undefined;
loadAll().catch(e=>setStatus(e.message,'err'));
</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8');
    if (url.pathname.startsWith('/asset/')) {
      const src = decodeURIComponent(url.pathname.slice('/asset/'.length));
      const file = publicAssetPath(src);
      if (!fs.existsSync(file)) return send(res, 404, `Not found: ${file}`, 'text/plain; charset=utf-8');
      res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname === '/api/data') return send(res, 200, loadData());
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const data = loadData();
      const found = findQuestion(data, body.id);
      if (!found) return send(res, 404, { error: '找不到這一題。' });
      const answer = String(body.answer || '').trim();
      if (!/^[1-4]$/.test(answer)) return send(res, 400, { error: '答案必須是 1、2、3、4。' });
      const qSegs = sanitizeSegments(body.questionSegments);
      const eSegs = sanitizeSegments(body.explanationSegments);
      if (!qSegs.length) return send(res, 400, { error: '題目截圖至少要保留一個段落。' });
      found.question.answer = answer;
      found.question.questionSegments = qSegs;
      found.question.explanationSegments = eSegs;
      const backup = saveData(data);
      return send(res, 200, { ok: true, backup });
    }
    if (url.pathname === '/api/open-data' && req.method === 'POST') {
      exec(`explorer "${dataRoot}"`);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === '/api/shutdown' && req.method === 'POST') {
      send(res, 200, { ok: true });
      setTimeout(() => process.exit(0), 300);
      return;
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    return send(res, 500, { error: e.message || String(e) });
  }
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  const url = 'http://127.0.0.1:' + port;
  console.log('TrueAlpha Question Editor running at ' + url);
  const opener = process.platform === 'win32' ? 'start "" "' + url + '"' : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
  exec(opener);
});
