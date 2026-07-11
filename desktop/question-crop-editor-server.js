#!/usr/bin/env node
/* TrueAlpha Question Crop Editor - local desktop tool */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const here = __dirname;
const projectRoot = path.resolve(here, '..');
const dataPath = path.join(projectRoot, 'public', 'data', 'pdf-image-quiz.json');
const dataRoot = path.join(projectRoot, 'public', 'data');
const backupDir = path.join(dataRoot, 'backups');

function send(res, status, body, type='application/json; charset=utf-8') {
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
  if (!fs.existsSync(dataPath)) throw new Error('Cannot find public/data/pdf-image-quiz.json. Please run from the project desktop folder.');
  return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}
function saveData(data) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  fs.copyFileSync(dataPath, path.join(backupDir, `pdf-image-quiz-before-edit-${stamp}.json`));
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
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
  return segments.map((s) => ({
    page: Math.max(1, Number(s.page || 1)),
    src: String(s.src || '').replace(/^\/?data\//, '').replace(/^\/?public\/?data\//, ''),
    x: Math.max(0, Math.round(Number(s.x || 0))),
    y: Math.max(0, Math.round(Number(s.y || 0))),
    width: Math.max(1, Math.round(Number(s.width || 1))),
    height: Math.max(1, Math.round(Number(s.height || 1))),
    pageWidth: Math.max(1, Math.round(Number(s.pageWidth || 1))),
    pageHeight: Math.max(1, Math.round(Number(s.pageHeight || 1))),
  })).filter(s => s.src);
}
function publicAssetPath(src) {
  const safe = String(src || '').replace(/^\/+/, '').replace(/^data\//, '');
  const target = path.normalize(path.join(dataRoot, safe));
  if (!target.startsWith(dataRoot)) throw new Error('Invalid asset path');
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
<title>TrueAlpha 題目裁切與答案修正工具</title>
<style>
:root{--ink:#182238;--muted:#6b7280;--brand:#1f7a8c;--bg:#f4f6f8;--card:#fff;--line:#dfe7ee;--danger:#a72e3f;--ok:#0f8f61}
*{box-sizing:border-box}body{margin:0;font-family:"Microsoft JhengHei",system-ui,sans-serif;background:linear-gradient(135deg,#f7f9fb,#eef2f5);color:var(--ink)}
header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);padding:16px 24px;display:flex;gap:16px;align-items:center;justify-content:space-between}
h1{margin:0;font-size:26px}.sub{color:var(--muted);font-size:14px;margin-top:4px}.wrap{padding:22px;display:grid;grid-template-columns:420px 1fr;gap:18px}.card{background:rgba(255,255,255,.88);border:1px solid var(--line);border-radius:24px;padding:18px;box-shadow:0 14px 45px rgba(15,23,42,.06)}
label{display:block;font-weight:800;margin:12px 0 6px}.row{display:flex;gap:10px;align-items:center}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.grid6{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}select,input{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:white;font-size:16px;color:var(--ink)}button{border:0;border-radius:999px;padding:12px 16px;font-size:15px;font-weight:900;cursor:pointer;background:white;color:var(--ink);box-shadow:0 8px 24px rgba(15,23,42,.08);border:1px solid var(--line)}button.primary{background:var(--brand);color:#fff;border-color:transparent}button.danger{background:var(--danger);color:white;border-color:transparent}button.ok{background:var(--ok);color:white;border-color:transparent}button.small{padding:8px 10px;font-size:13px}.segTabs{display:flex;gap:8px;flex-wrap:wrap}.segTabs button.active{background:#e6f4f7;color:#176579;border-color:#b7dbe4}.pill{display:inline-flex;gap:6px;align-items:center;border-radius:999px;padding:8px 12px;background:#eef6f8;color:#176579;font-weight:900}.hint{font-size:13px;color:var(--muted);line-height:1.55}.status{padding:10px 12px;border-radius:14px;background:#eef6f8;color:#176579;font-weight:800;margin-top:12px;white-space:pre-wrap}.status.err{background:#ffe8ec;color:#9f1f37}.status.ok{background:#e9f8ef;color:#127244}
.previewHeader{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.canvasWrap{background:white;border:1px solid var(--line);border-radius:18px;padding:12px;overflow:auto}.canvasTitle{font-size:14px;font-weight:900;color:var(--muted);margin:10px 0 8px}canvas{max-width:100%;background:#fff;border-radius:12px;border:1px solid #edf2f7}.fullCanvas{width:100%;max-height:480px;object-fit:contain}.cropCanvas{width:100%;max-height:380px;object-fit:contain}.kbd{font-family:Consolas,monospace;background:#f2f4f7;border:1px solid var(--line);border-radius:8px;padding:2px 6px}.divider{height:1px;background:var(--line);margin:14px 0}.muted{color:var(--muted)}
@media(max-width:1100px){.wrap{grid-template-columns:1fr}.card{border-radius:18px}header{align-items:flex-start;flex-direction:column}.grid6{grid-template-columns:repeat(3,1fr)}}
</style>
</head>
<body>
<header>
  <div><h1>題目裁切與答案修正工具</h1><div class="sub">本工具只修改本機專案的 <span class="kbd">public/data/pdf-image-quiz.json</span>，儲存時會自動備份。</div></div>
  <div class="row"><button id="openDataBtn">打開資料夾</button><button class="danger" id="shutdownBtn">關閉工具</button></div>
</header>
<div class="wrap">
  <section class="card">
    <label>科目</label><select id="bankSelect"></select>
    <label>章節</label><select id="chapterSelect"></select>
    <label>題號 / 搜尋</label><div class="row"><input id="questionSearch" placeholder="輸入題號，例如 130" /><button id="goQuestionBtn">前往</button></div>
    <label>題目</label><select id="questionSelect"></select>
    <div class="divider"></div>
    <div class="row" style="justify-content:space-between"><span class="pill" id="questionInfo">尚未載入</span><button id="reloadBtn">重新載入</button></div>
    <label>正確答案</label><select id="answerSelect"><option value="1">(1)</option><option value="2">(2)</option><option value="3">(3)</option><option value="4">(4)</option></select>
    <div class="hint">如果題庫答案錯誤，在這裡改答案後按「儲存」。</div>
    <div class="divider"></div>
    <label>調整區塊</label><div class="segTabs"><button id="modeQuestion" class="active">題目截圖</button><button id="modeExplanation">解析截圖</button></div>
    <label>截圖段落</label><div class="row"><select id="segmentSelect"></select><button id="addSegBtn">新增段落</button><button class="danger" id="deleteSegBtn">刪除段落</button></div>
    <div class="grid2"><div><label>圖片路徑</label><input id="srcInput" placeholder="pdf-pages/.../page-01.webp" /></div><div><label>頁碼</label><input id="pageInput" type="number" min="1" /></div></div>
    <div class="grid4"><div><label>X</label><input id="xInput" type="number" /></div><div><label>Y</label><input id="yInput" type="number" /></div><div><label>寬</label><input id="wInput" type="number" /></div><div><label>高</label><input id="hInput" type="number" /></div></div>
    <div class="grid2"><div><label>原圖寬</label><input id="pwInput" type="number" /></div><div><label>原圖高</label><input id="phInput" type="number" /></div></div>
    <label>微調步距</label><select id="stepSelect"><option>1</option><option selected>5</option><option>10</option><option>20</option><option>50</option></select>
    <div class="grid6" style="margin-top:10px"><button class="small" data-nudge="up">上移</button><button class="small" data-nudge="down">下移</button><button class="small" data-nudge="left">左移</button><button class="small" data-nudge="right">右移</button><button class="small" data-nudge="wplus">加寬</button><button class="small" data-nudge="wminus">縮寬</button><button class="small" data-nudge="hplus">加高</button><button class="small" data-nudge="hminus">縮高</button><button class="small" data-nudge="xminus">左界左</button><button class="small" data-nudge="xplus">左界右</button><button class="small" data-nudge="yminus">上界上</button><button class="small" data-nudge="yplus">上界下</button></div>
    <div class="divider"></div>
    <div class="row"><button class="primary" id="saveBtn">儲存修改</button><button id="resetBtn">放棄本題修改</button></div>
    <div id="status" class="status">正在載入...</div>
  </section>
  <section class="card">
    <div class="previewHeader"><div><h2 style="margin:0">即時預覽</h2><div class="hint">左邊調整 X/Y/寬/高後，這裡會立即顯示裁切結果。</div></div><span class="pill" id="modeLabel">題目截圖</span></div>
    <div class="canvasWrap">
      <div class="canvasTitle">裁切結果</div><canvas id="cropCanvas" class="cropCanvas"></canvas>
      <div class="canvasTitle">原圖位置</div><canvas id="fullCanvas" class="fullCanvas"></canvas>
    </div>
  </section>
</div>
<script>
let data=null,current=null,mode='question',segIndex=0,dirty=false;
const $=id=>document.getElementById(id);
function setStatus(msg,type=''){const el=$('status');el.textContent=msg;el.className='status '+type;}
async function api(url,opt){const r=await fetch(url,opt);const text=await r.text();let out;try{out=JSON.parse(text)}catch{out=text} if(!r.ok) throw new Error(out.error||text); return out;}
function banks(){return data?.banks||[]}
function selectedBank(){return banks().find(b=>b.bankId===$('bankSelect').value)}
function selectedChapter(){return (selectedBank()?.chapters||[]).find(c=>c.chapterSlug===$('chapterSelect').value || c.chapterId===$('chapterSelect').value)}
function selectedQuestion(){return (selectedChapter()?.questions||[]).find(q=>q.id===$('questionSelect').value)}
function labelQuestion(q){return '第 '+q.number+' 題｜答案 '+(q.answer||'-')+'｜'+q.id}
function fillBanks(){ $('bankSelect').innerHTML=banks().map(b=>'<option value="'+b.bankId+'">'+(b.bankTitle||b.bankId)+'</option>').join(''); fillChapters(); }
function fillChapters(){ const b=selectedBank(); $('chapterSelect').innerHTML=(b?.chapters||[]).map(c=>'<option value="'+(c.chapterSlug||c.chapterId)+'">'+c.chapterId+' - '+(c.chapterTitle||'')+'</option>').join(''); fillQuestions(); }
function fillQuestions(){ const c=selectedChapter(); $('questionSelect').innerHTML=(c?.questions||[]).map(q=>'<option value="'+q.id+'">第 '+q.number+' 題｜答案 '+q.answer+'</option>').join(''); loadCurrent(); }
function clone(o){return JSON.parse(JSON.stringify(o))}
function loadCurrent(){ const q=selectedQuestion(); if(!q)return; current=clone(q); segIndex=0; $('answerSelect').value=String(current.answer||'1'); $('questionInfo').textContent=(selectedBank()?.bankTitle||'')+' / '+(selectedChapter()?.chapterId||'')+' / 第 '+current.number+' 題'; fillSegmentSelect(); fillSegmentForm(); renderPreview(); setStatus('已載入。調整後按「儲存修改」。'); }
function segments(){ return mode==='question' ? (current.questionSegments ||= []) : (current.explanationSegments ||= []) }
function currentSeg(){ const segs=segments(); if(!segs.length){segs.push({page:1,src:'',x:0,y:0,width:100,height:100,pageWidth:1000,pageHeight:1000});} if(segIndex>=segs.length) segIndex=segs.length-1; return segs[segIndex]; }
function fillSegmentSelect(){ const segs=segments(); $('segmentSelect').innerHTML=segs.map((s,i)=>'<option value="'+i+'">段落 '+(i+1)+'｜p.'+(s.page||1)+'</option>').join(''); $('segmentSelect').value=String(segIndex); $('modeLabel').textContent=mode==='question'?'題目截圖':'解析截圖'; $('modeQuestion').classList.toggle('active',mode==='question'); $('modeExplanation').classList.toggle('active',mode==='explanation'); }
function fillSegmentForm(){ const s=currentSeg(); $('srcInput').value=s.src||''; $('pageInput').value=s.page||1; $('xInput').value=s.x||0; $('yInput').value=s.y||0; $('wInput').value=s.width||1; $('hInput').value=s.height||1; $('pwInput').value=s.pageWidth||1; $('phInput').value=s.pageHeight||1; }
function readSegmentForm(){ const s=currentSeg(); s.src=$('srcInput').value.trim().replace(/^\/?data\//,'').replace(/^\/?public\/?data\//,''); s.page=+($('pageInput').value||1); s.x=Math.max(0,Math.round(+($('xInput').value||0))); s.y=Math.max(0,Math.round(+($('yInput').value||0))); s.width=Math.max(1,Math.round(+($('wInput').value||1))); s.height=Math.max(1,Math.round(+($('hInput').value||1))); s.pageWidth=Math.max(1,Math.round(+($('pwInput').value||1))); s.pageHeight=Math.max(1,Math.round(+($('phInput').value||1))); dirty=true; return s; }
function loadImage(src){ return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('圖片載入失敗：'+src)); img.src='/data/'+src+'?t='+Date.now(); }); }
async function renderPreview(){ try{ const s=readSegmentForm(); if(!s.src){setStatus('請輸入圖片路徑。','err');return;} const img=await loadImage(s.src); if(s.pageWidth<=1){s.pageWidth=img.naturalWidth; $('pwInput').value=s.pageWidth;} if(s.pageHeight<=1){s.pageHeight=img.naturalHeight; $('phInput').value=s.pageHeight;} const crop=$('cropCanvas'); crop.width=Math.max(1,s.width); crop.height=Math.max(1,s.height); const cc=crop.getContext('2d'); cc.clearRect(0,0,crop.width,crop.height); cc.drawImage(img,s.x,s.y,s.width,s.height,0,0,s.width,s.height);
 const full=$('fullCanvas'); const maxW=1100; const scale=Math.min(1,maxW/img.naturalWidth); full.width=Math.round(img.naturalWidth*scale); full.height=Math.round(img.naturalHeight*scale); const fc=full.getContext('2d'); fc.clearRect(0,0,full.width,full.height); fc.drawImage(img,0,0,full.width,full.height); fc.strokeStyle='#e11d48'; fc.lineWidth=Math.max(2,3*scale); fc.strokeRect(s.x*scale,s.y*scale,s.width*scale,s.height*scale); fc.fillStyle='rgba(225,29,72,.12)'; fc.fillRect(s.x*scale,s.y*scale,s.width*scale,s.height*scale);
 } catch(e){setStatus(e.message,'err')} }
function nudge(kind){ const step=+($('stepSelect').value||5); const s=readSegmentForm(); if(kind==='up')s.y-=step; if(kind==='down')s.y+=step; if(kind==='left')s.x-=step; if(kind==='right')s.x+=step; if(kind==='wplus')s.width+=step; if(kind==='wminus')s.width-=step; if(kind==='hplus')s.height+=step; if(kind==='hminus')s.height-=step; if(kind==='xminus'){s.x-=step;s.width+=step} if(kind==='xplus'){s.x+=step;s.width-=step} if(kind==='yminus'){s.y-=step;s.height+=step} if(kind==='yplus'){s.y+=step;s.height-=step} s.x=Math.max(0,Math.round(s.x)); s.y=Math.max(0,Math.round(s.y)); s.width=Math.max(1,Math.round(s.width)); s.height=Math.max(1,Math.round(s.height)); fillSegmentForm(); renderPreview(); }
async function loadAll(){ data=await api('/api/data'); fillBanks(); setStatus('資料載入完成。','ok'); }
async function save(){ try{ readSegmentForm(); current.answer=$('answerSelect').value; const payload={id:current.id,answer:current.answer,questionSegments:current.questionSegments,explanationSegments:current.explanationSegments}; const r=await api('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const q=selectedQuestion(); Object.assign(q, clone(current)); $('questionSelect').selectedOptions[0].textContent='第 '+q.number+' 題｜答案 '+current.answer; setStatus('已儲存。本機 JSON 已更新，並已建立備份：\n'+r.backup,'ok'); dirty=false;}catch(e){setStatus(e.message,'err')} }
$('bankSelect').onchange=fillChapters; $('chapterSelect').onchange=fillQuestions; $('questionSelect').onchange=loadCurrent; $('segmentSelect').onchange=()=>{segIndex=+$('segmentSelect').value;fillSegmentForm();renderPreview()};
$('modeQuestion').onclick=()=>{readSegmentForm();mode='question';segIndex=0;fillSegmentSelect();fillSegmentForm();renderPreview()}; $('modeExplanation').onclick=()=>{readSegmentForm();mode='explanation';segIndex=0;fillSegmentSelect();fillSegmentForm();renderPreview()};
['srcInput','pageInput','xInput','yInput','wInput','hInput','pwInput','phInput'].forEach(id=>$(id).addEventListener('input',()=>{readSegmentForm();renderPreview()}));
document.querySelectorAll('[data-nudge]').forEach(b=>b.onclick=()=>nudge(b.dataset.nudge));
$('addSegBtn').onclick=()=>{ const segs=segments(); const base=clone(currentSeg()); segs.push(base); segIndex=segs.length-1; fillSegmentSelect(); fillSegmentForm(); renderPreview(); };
$('deleteSegBtn').onclick=()=>{ const segs=segments(); if(segs.length<=1){alert('至少保留一個段落');return;} if(confirm('確定刪除目前段落？')){segs.splice(segIndex,1);segIndex=0;fillSegmentSelect();fillSegmentForm();renderPreview();} };
$('goQuestionBtn').onclick=()=>{ const n=Number($('questionSearch').value.trim()); if(!n)return; const qs=selectedChapter()?.questions||[]; const q=qs.find(x=>Number(x.number)===n); if(q){$('questionSelect').value=q.id;loadCurrent()}else alert('本章找不到這個題號'); };
$('saveBtn').onclick=save; $('resetBtn').onclick=loadCurrent; $('reloadBtn').onclick=loadAll; $('openDataBtn').onclick=()=>api('/api/open-data',{method:'POST'}); $('shutdownBtn').onclick=async()=>{await api('/api/shutdown',{method:'POST'}); document.body.innerHTML='<h1 style="padding:40px">工具已關閉，可以關掉這個視窗。</h1>'};
loadAll().catch(e=>setStatus(e.message,'err'));
</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8');
    if (url.pathname.startsWith('/data/')) {
      const file = publicAssetPath(decodeURIComponent(url.pathname.slice('/data/'.length)));
      if (!fs.existsSync(file)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
      res.writeHead(200, { 'Content-Type': mime(file), 'Cache-Control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname === '/api/data') {
      return send(res, 200, loadData());
    }
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const data = loadData();
      const found = findQuestion(data, body.id);
      if (!found) return send(res, 404, { error: 'Question not found' });
      const answer = String(body.answer || '').trim();
      if (!/^[1-4]$/.test(answer)) return send(res, 400, { error: 'Answer must be 1, 2, 3, or 4.' });
      found.question.answer = answer;
      found.question.questionSegments = sanitizeSegments(body.questionSegments);
      found.question.explanationSegments = sanitizeSegments(body.explanationSegments);
      if (!found.question.questionSegments.length) return send(res, 400, { error: 'Question screenshot must contain at least one segment.' });
      const before = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
      saveData(data);
      return send(res, 200, { ok: true, backup: `public/data/backups/pdf-image-quiz-before-edit-${before}.json` });
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
  const url = `http://127.0.0.1:${port}`;
  console.log(`TrueAlpha Question Crop Editor running at ${url}`);
  const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(opener);
});
