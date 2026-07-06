Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Get-ScriptDirectory {
  $scriptPath = $PSCommandPath
  if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }
  if ($scriptPath) { return (Split-Path -Parent $scriptPath) }
  return (Get-Location).Path
}

function Get-ParentDirectories([string]$StartPath) {
  $dirs = New-Object System.Collections.Generic.List[string]
  if (-not $StartPath) { return $dirs }
  $current = Get-Item -LiteralPath $StartPath -ErrorAction SilentlyContinue
  if (-not $current) { return $dirs }
  if (-not $current.PSIsContainer) { $current = $current.Directory }
  while ($current) {
    $dirs.Add($current.FullName)
    $current = $current.Parent
  }
  return $dirs
}

function Find-ProjectRoot([string]$PreferredPath) {
  $candidates = New-Object System.Collections.Generic.List[string]
  foreach ($path in @($PreferredPath, (Get-ScriptDirectory), (Get-Location).Path)) {
    if (-not [string]::IsNullOrWhiteSpace($path)) {
      foreach ($dir in (Get-ParentDirectories $path)) {
        if (-not $candidates.Contains($dir)) { $candidates.Add($dir) }
      }
    }
  }

  foreach ($dir in $candidates) {
    if ((Test-Path (Join-Path $dir ".env.local")) -or (Test-Path (Join-Path $dir ".env"))) {
      return $dir
    }
  }

  foreach ($dir in $candidates) {
    if ((Test-Path (Join-Path $dir "package.json")) -and (Test-Path (Join-Path $dir "src"))) {
      return $dir
    }
  }

  return $PreferredPath
}

function Get-DefaultProjectRoot {
  return Find-ProjectRoot (Get-ScriptDirectory)
}

function Read-EnvFile([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $parts = $line.Split("=", 2)
    $key = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    $map[$key] = $value
  }
  return $map
}

function Merge-EnvMaps([hashtable]$A, [hashtable]$B) {
  $result = @{}
  foreach ($key in $A.Keys) { $result[$key] = $A[$key] }
  foreach ($key in $B.Keys) { $result[$key] = $B[$key] }
  return $result
}

function Create-ActivationCode([string]$ProjectRoot, [string]$Code, [string]$Note, [int]$MaxUses) {
  $resolvedRoot = Find-ProjectRoot $ProjectRoot
  $envLocalPath = Join-Path $resolvedRoot ".env.local"
  $envPath = Join-Path $resolvedRoot ".env"
  $envMap = Merge-EnvMaps (Read-EnvFile $envPath) (Read-EnvFile $envLocalPath)

  $url = $envMap["SUPABASE_URL"]
  if (-not $url) { $url = $envMap["VITE_SUPABASE_URL"] }
  if (-not $url) { $url = [Environment]::GetEnvironmentVariable("SUPABASE_URL") }
  if (-not $url) { $url = [Environment]::GetEnvironmentVariable("VITE_SUPABASE_URL") }

  $serviceKey = $envMap["SUPABASE_SERVICE_ROLE_KEY"]
  if (-not $serviceKey) { $serviceKey = $envMap["SUPABASE_SECRET_KEY"] }
  if (-not $serviceKey) { $serviceKey = [Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY") }
  if (-not $serviceKey) { $serviceKey = [Environment]::GetEnvironmentVariable("SUPABASE_SECRET_KEY") }

  if (-not $url) {
    throw "找不到 VITE_SUPABASE_URL 或 SUPABASE_URL。請確認這個檔案存在：$envLocalPath。若畫面上的資料夾是 desktop，請按「選擇」改選 SeniorSecurities 專案根目錄。"
  }
  if (-not $serviceKey) {
    throw "找不到 SUPABASE_SERVICE_ROLE_KEY。請確認 .env.local 有放 service role key，且 key 名稱沒有打錯。"
  }

  $endpoint = $url.TrimEnd("/") + "/rest/v1/rpc/create_activation_code"
  $payload = @{
    p_code = if ([string]::IsNullOrWhiteSpace($Code)) { $null } else { $Code.Trim() }
    p_note = if ([string]::IsNullOrWhiteSpace($Note)) { $null } else { $Note.Trim() }
    p_max_uses = $MaxUses
  } | ConvertTo-Json

  $headers = @{
    "apikey" = $serviceKey
    "Authorization" = "Bearer $serviceKey"
    "Content-Type" = "application/json"
  }

  $result = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -Body $payload
  if ($result -is [array]) { return [string]$result[0] }
  return [string]$result
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "TrueAlpha Activation Code Generator"
$form.Size = New-Object System.Drawing.Size(720, 560)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Microsoft JhengHei UI", 10)
$form.BackColor = [System.Drawing.Color]::White
$form.MaximizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = "啟用碼產生器"
$title.Font = New-Object System.Drawing.Font("Microsoft JhengHei UI", 18, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(24, 18)
$title.Size = New-Object System.Drawing.Size(640, 38)
$form.Controls.Add($title)

$desc = New-Object System.Windows.Forms.Label
$desc.Text = "輸入自訂啟用碼，或留空自動產生。產生後 Supabase 會立刻認得這組碼。"
$desc.ForeColor = [System.Drawing.Color]::FromArgb(90, 101, 120)
$desc.Location = New-Object System.Drawing.Point(26, 60)
$desc.Size = New-Object System.Drawing.Size(650, 28)
$form.Controls.Add($desc)

$labelRoot = New-Object System.Windows.Forms.Label
$labelRoot.Text = "專案資料夾（請選 SeniorSecurities，不要選 desktop）"
$labelRoot.Location = New-Object System.Drawing.Point(28, 104)
$labelRoot.Size = New-Object System.Drawing.Size(420, 24)
$form.Controls.Add($labelRoot)

$textRoot = New-Object System.Windows.Forms.TextBox
$textRoot.Text = Get-DefaultProjectRoot
$textRoot.Location = New-Object System.Drawing.Point(28, 130)
$textRoot.Size = New-Object System.Drawing.Size(520, 34)
$form.Controls.Add($textRoot)

$buttonBrowse = New-Object System.Windows.Forms.Button
$buttonBrowse.Text = "選擇"
$buttonBrowse.Location = New-Object System.Drawing.Point(560, 128)
$buttonBrowse.Size = New-Object System.Drawing.Size(104, 36)
$form.Controls.Add($buttonBrowse)

$labelCode = New-Object System.Windows.Forms.Label
$labelCode.Text = "自訂啟用碼（可留空自動產生）"
$labelCode.Location = New-Object System.Drawing.Point(28, 180)
$labelCode.Size = New-Object System.Drawing.Size(280, 24)
$form.Controls.Add($labelCode)

$textCode = New-Object System.Windows.Forms.TextBox
$textCode.Location = New-Object System.Drawing.Point(28, 206)
$textCode.Size = New-Object System.Drawing.Size(636, 34)
$form.Controls.Add($textCode)

$labelNote = New-Object System.Windows.Forms.Label
$labelNote.Text = "備註"
$labelNote.Location = New-Object System.Drawing.Point(28, 252)
$labelNote.Size = New-Object System.Drawing.Size(120, 24)
$form.Controls.Add($labelNote)

$textNote = New-Object System.Windows.Forms.TextBox
$textNote.Location = New-Object System.Drawing.Point(28, 278)
$textNote.Size = New-Object System.Drawing.Size(636, 34)
$form.Controls.Add($textNote)

$labelMax = New-Object System.Windows.Forms.Label
$labelMax.Text = "可使用次數"
$labelMax.Location = New-Object System.Drawing.Point(28, 324)
$labelMax.Size = New-Object System.Drawing.Size(120, 24)
$form.Controls.Add($labelMax)

$numMax = New-Object System.Windows.Forms.NumericUpDown
$numMax.Minimum = 1
$numMax.Maximum = 999
$numMax.Value = 1
$numMax.Location = New-Object System.Drawing.Point(28, 350)
$numMax.Size = New-Object System.Drawing.Size(120, 34)
$form.Controls.Add($numMax)

$buttonCreate = New-Object System.Windows.Forms.Button
$buttonCreate.Text = "產生啟用碼"
$buttonCreate.Location = New-Object System.Drawing.Point(502, 345)
$buttonCreate.Size = New-Object System.Drawing.Size(162, 44)
$buttonCreate.BackColor = [System.Drawing.Color]::FromArgb(29, 111, 138)
$buttonCreate.ForeColor = [System.Drawing.Color]::White
$buttonCreate.FlatStyle = "Flat"
$form.Controls.Add($buttonCreate)

$output = New-Object System.Windows.Forms.TextBox
$output.Multiline = $true
$output.ReadOnly = $true
$output.ScrollBars = "Vertical"
$output.Location = New-Object System.Drawing.Point(28, 404)
$output.Size = New-Object System.Drawing.Size(636, 92)
$output.Text = "尚未產生。"
$form.Controls.Add($output)

$buttonBrowse.Add_Click({
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.Description = "選擇 SeniorSecurities 專案根目錄"
  $dialog.SelectedPath = $textRoot.Text
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $textRoot.Text = Find-ProjectRoot $dialog.SelectedPath
  }
})

$buttonCreate.Add_Click({
  $buttonCreate.Enabled = $false
  $output.Text = "產生中..."
  try {
    $resolvedRoot = Find-ProjectRoot $textRoot.Text
    $textRoot.Text = $resolvedRoot
    $createdCode = Create-ActivationCode -ProjectRoot $resolvedRoot -Code $textCode.Text -Note $textNote.Text -MaxUses ([int]$numMax.Value)
    $output.Text = "啟用碼已建立：`r`n$createdCode`r`n`r`n已複製到剪貼簿，可以把這組碼給買家。"
    [System.Windows.Forms.Clipboard]::SetText([string]$createdCode)
  } catch {
    $output.Text = "錯誤：`r`n$($_.Exception.Message)"
  } finally {
    $buttonCreate.Enabled = $true
  }
})

[void]$form.ShowDialog()
