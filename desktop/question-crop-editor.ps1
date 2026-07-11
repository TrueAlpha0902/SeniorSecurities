$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue | Out-Null

  function Resolve-ToolFolder {
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $candidates += $PSScriptRoot }
    if ($MyInvocation -and $MyInvocation.MyCommand -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
      $candidates += (Split-Path -Parent $MyInvocation.MyCommand.Path)
    }
    try {
      $exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
      if (-not [string]::IsNullOrWhiteSpace($exePath)) { $candidates += (Split-Path -Parent $exePath) }
    } catch {}
    try { $candidates += (Get-Location).Path } catch {}

    foreach ($candidate in $candidates) {
      if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
      $serverPath = Join-Path $candidate "question-crop-editor-server.cjs"
      if (Test-Path $serverPath) { return (Resolve-Path $candidate).Path }
    }
    throw "Cannot find question-crop-editor-server.cjs. Keep the EXE/CMD and server file inside SeniorSecurities\desktop."
  }

  $here = Resolve-ToolFolder
  $log = Join-Path $here "QuestionCropEditor-error.log"
  Remove-Item $log -Force -ErrorAction SilentlyContinue

  $server = Join-Path $here "question-crop-editor-server.cjs"
  $projectRoot = Split-Path -Parent $here
  $dataFile = Join-Path $projectRoot "public\data\pdf-image-quiz.json"
  if (-not (Test-Path $dataFile)) { throw "Cannot find public\data\pdf-image-quiz.json. Current tool folder: $here" }

  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { throw "Cannot find Node.js. Please install Node.js first, then reopen this tool." }

  Push-Location $here
  & node $server 2>&1 | Tee-Object -FilePath $log
  Pop-Location
}
catch {
  $msg = $_.Exception.Message
  try { [System.Windows.Forms.MessageBox]::Show($msg, "TrueAlpha Question Editor ERROR") | Out-Null } catch {}
  Write-Host "ERROR:" -ForegroundColor Red
  Write-Host $msg -ForegroundColor Yellow
  Write-Host ""
  Write-Host "This window will stay open so you can screenshot the error." -ForegroundColor Cyan
  pause
}
