Set-ExecutionPolicy -Scope Process Bypass -Force
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$inputFile = Join-Path $scriptDir "activation-code-generator.ps1"
$outputFile = Join-Path $scriptDir "ActivationCodeGenerator.exe"
$launcherFile = Join-Path $scriptDir "ActivationCodeGenerator.cmd"

if (-not (Test-Path $inputFile)) {
  throw "Cannot find $inputFile"
}

if (-not (Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue)) {
  Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force
}

if (-not (Get-Module -ListAvailable -Name ps2exe)) {
  Write-Host "Installing ps2exe module for current user..."
  Install-Module ps2exe -Scope CurrentUser -Force -AllowClobber
}

Import-Module ps2exe -Force

if (Test-Path $outputFile) {
  Remove-Item $outputFile -Force
}

Write-Host "Reading input file: $inputFile"
Write-Host "Compiling ActivationCodeGenerator.exe..."

try {
  $params = @{
    inputFile = $inputFile
    outputFile = $outputFile
    title = "TrueAlpha Activation Code Generator"
    description = "SeniorSecurities activation code generator"
    company = "TrueAlpha"
    product = "SeniorSecurities"
    version = "1.0.0"
    STA = $true
    noConsole = $true
  }

  Invoke-ps2exe @params
} catch {
  Write-Host "PS2EXE build failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}

if (Test-Path $outputFile) {
  Write-Host "Done: $outputFile" -ForegroundColor Green
  Write-Host "You can double-click ActivationCodeGenerator.exe to create activation codes."
  exit 0
}

@"
@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0activation-code-generator.ps1"
"@ | Set-Content -Path $launcherFile -Encoding ASCII

Write-Host "EXE was not created by PS2EXE." -ForegroundColor Yellow
Write-Host "A fallback launcher was created instead: $launcherFile" -ForegroundColor Yellow
Write-Host "You can double-click ActivationCodeGenerator.cmd, or run this command:" -ForegroundColor Yellow
Write-Host "powershell -ExecutionPolicy Bypass -File `"$inputFile`"" -ForegroundColor Yellow
