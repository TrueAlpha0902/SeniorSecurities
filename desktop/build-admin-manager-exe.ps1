$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$input = Join-Path $here "admin-account-manager.ps1"
if (-not (Test-Path $input)) {
  $candidate = Get-ChildItem $here -File -Filter "*admin*manager*.ps1" |
    Where-Object { $_.Name -notlike "build-*" } |
    Select-Object -First 1

  if ($candidate) {
    $input = $candidate.FullName
  }
}

if (-not (Test-Path $input)) {
  Write-Host "Cannot find admin manager ps1 file in desktop folder." -ForegroundColor Red
  Write-Host "Please check that admin-account-manager.ps1 exists." -ForegroundColor Yellow
  exit 1
}

$output = Join-Path $here "AdminAccountManager.exe"
$cmdOutput = Join-Path $here "AdminAccountManager.cmd"

@"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0$([System.IO.Path]::GetFileName($input))"
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

  if (Test-Path $output) {
    Remove-Item $output -Force
  }

  Invoke-ps2exe -inputFile $input -outputFile $output -title "TrueAlpha Admin Manager" -noConsole

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
  Write-Host ""
  Write-Host "CMD fallback created. You can use this instead:" -ForegroundColor Green
  Write-Host $cmdOutput -ForegroundColor Cyan
}
