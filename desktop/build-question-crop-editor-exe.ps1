$ErrorActionPreference = "Stop"

$here = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($here)) {
  if ($MyInvocation -and $MyInvocation.MyCommand -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
    $here = Split-Path -Parent $MyInvocation.MyCommand.Path
  } else {
    $here = (Get-Location).Path
  }
}

$input = Join-Path $here "question-crop-editor.ps1"
$output = Join-Path $here "QuestionCropEditor.exe"
$cmdOutput = Join-Path $here "QuestionCropEditor.cmd"

if (-not (Test-Path $input)) {
  Write-Host "Cannot find question-crop-editor.ps1 in desktop folder." -ForegroundColor Red
  exit 1
}

@"
@echo off
cd /d "%~dp0"
echo Starting TrueAlpha Question Editor...
echo.
node question-crop-editor-server.cjs
if errorlevel 1 (
  echo.
  echo ERROR occurred. Please screenshot this window.
)
echo.
pause
"@ | Set-Content -Encoding ASCII $cmdOutput

try {
  if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue)) {
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force | Out-Null
  }
  if (-not (Get-Module -ListAvailable -Name ps2exe)) {
    Install-Module ps2exe -Scope CurrentUser -Force -AllowClobber
  }
  Import-Module ps2exe -Force
  if (Test-Path $output) { Remove-Item $output -Force }
  Invoke-ps2exe -inputFile $input -outputFile $output -title "TrueAlpha Question Editor"
  if (Test-Path $output) {
    Write-Host "EXE created successfully:" -ForegroundColor Green
    Write-Host $output -ForegroundColor Cyan
  } else {
    Write-Host "EXE was not created. Use CMD fallback instead:" -ForegroundColor Yellow
    Write-Host $cmdOutput -ForegroundColor Cyan
  }
}
catch {
  Write-Host "EXE build failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
  Write-Host "CMD fallback created. You can use this instead:" -ForegroundColor Green
  Write-Host $cmdOutput -ForegroundColor Cyan
}
