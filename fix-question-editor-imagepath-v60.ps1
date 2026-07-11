$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\speci\Documents\SeniorSecurities"
$desktopDir = Join-Path $projectRoot "desktop"
$serverPath = Join-Path $desktopDir "question-crop-editor-server.cjs"

if (-not (Test-Path $serverPath)) {
  Write-Host "找不到 question-crop-editor-server.cjs：" -ForegroundColor Red
  Write-Host $serverPath -ForegroundColor Yellow
  exit 1
}

$publicDir = Join-Path $projectRoot "public"
$pdfPagesDir = Join-Path $publicDir "pdf-pages"

if (-not (Test-Path $publicDir)) {
  Write-Host "找不到 public 資料夾，請確認專案位置正確：" -ForegroundColor Red
  Write-Host $publicDir -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path $pdfPagesDir)) {
  Write-Host "找不到 public\pdf-pages 資料夾：" -ForegroundColor Yellow
  Write-Host $pdfPagesDir -ForegroundColor Yellow
  Write-Host "如果你的圖片資料夾不是這個名稱，請截圖給我。" -ForegroundColor Yellow
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "$serverPath.before-v60-$stamp.bak"
Copy-Item $serverPath $backupPath -Force

$code = Get-Content $serverPath -Raw -Encoding UTF8

$helper = @'

// V60_STATIC_PUBLIC_FILES_START
// Serve App public files for the local question editor.
// The editor runs from /desktop, but question images live under /public/pdf-pages.
// Without this, paths like /pdf-pages/investment/ch01/page-01.webp will fail.
const v60Fs = require('fs');
const v60Path = require('path');
const V60_PROJECT_ROOT = v60Path.resolve(__dirname, '..');
const V60_PUBLIC_ROOT = v60Path.join(V60_PROJECT_ROOT, 'public');

function v60ContentType(filePath) {
  const ext = v60Path.extname(filePath).toLowerCase();
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.html') return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

function v60SafePublicPath(urlPath) {
  let clean = decodeURIComponent(String(urlPath || '/').split('?')[0]).replace(/\\/g, '/');
  clean = clean.replace(/^\/+/, '');
  clean = clean.replace(/^public\//, '');

  if (!clean || clean.includes('..')) return null;

  // Only expose assets needed by the editor.
  const allowed =
    clean.startsWith('pdf-pages/') ||
    clean.startsWith('data/') ||
    clean.startsWith('assets/') ||
    clean.startsWith('images/');

  if (!allowed) return null;

  const fullPath = v60Path.normalize(v60Path.join(V60_PUBLIC_ROOT, clean));
  if (!fullPath.startsWith(v60Path.normalize(V60_PUBLIC_ROOT))) return null;
  return fullPath;
}

function v60TryServePublicFile(req, res) {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const filePath = v60SafePublicPath(url.pathname);
    if (!filePath) return false;

    if (!v60Fs.existsSync(filePath) || !v60Fs.statSync(filePath).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Local editor image not found: ' + url.pathname + '\nExpected file: ' + filePath);
      return true;
    }

    res.writeHead(200, {
      'Content-Type': v60ContentType(filePath),
      'Cache-Control': 'no-store'
    });
    v60Fs.createReadStream(filePath).pipe(res);
    return true;
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Local editor static file error: ' + (error && error.message ? error.message : String(error)));
    return true;
  }
}
// V60_STATIC_PUBLIC_FILES_END

'@

if ($code -notmatch "V60_STATIC_PUBLIC_FILES_START") {
  # Put helper code after the initial require/import block when possible.
  $code = $helper + "`r`n" + $code
}

# Insert public-file handling at the beginning of the HTTP handler.
if ($code -notmatch "V60_STATIC_PUBLIC_FILES_HANDLER") {
  $patterns = @(
    "http\.createServer\(\s*async\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*=>\s*\{",
    "http\.createServer\(\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*=>\s*\{",
    "http\.createServer\(\s*function\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\{"
  )

  $done = $false
  foreach ($pattern in $patterns) {
    $m = [regex]::Match($code, $pattern)
    if ($m.Success) {
      $reqName = $m.Groups[1].Value
      $resName = $m.Groups[2].Value
      $insert = $m.Value + "`r`n  // V60_STATIC_PUBLIC_FILES_HANDLER`r`n  if (v60TryServePublicFile($reqName, $resName)) return;"
      $code = $code.Substring(0, $m.Index) + $insert + $code.Substring($m.Index + $m.Length)
      $done = $true
      break
    }
  }

  if (-not $done) {
    Write-Host "無法自動找到 http.createServer handler。" -ForegroundColor Red
    Write-Host "已備份原檔案：" -ForegroundColor Yellow
    Write-Host $backupPath -ForegroundColor Cyan
    Write-Host "請把 desktop\question-crop-editor-server.cjs 的前 80 行截圖給我。" -ForegroundColor Yellow
    exit 1
  }
}

Set-Content -Path $serverPath -Value $code -Encoding UTF8

Write-Host ""
Write-Host "已修正 Question Editor 圖片載入路徑。" -ForegroundColor Green
Write-Host "已備份原檔案：" -ForegroundColor Yellow
Write-Host $backupPath -ForegroundColor Cyan
Write-Host ""
Write-Host "請重新產生 EXE：" -ForegroundColor Green
Write-Host "cd C:\Users\speci\Documents\SeniorSecurities\desktop" -ForegroundColor Cyan
Write-Host "powershell -ExecutionPolicy Bypass -File .\build-question-crop-editor-exe.ps1" -ForegroundColor Cyan
