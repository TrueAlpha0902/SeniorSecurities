Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

function Write-Log {
  param([string]$Message, [string]$Level = "INFO")
  $time = Get-Date -Format "HH:mm:ss"
  $text = "[$time][$Level] $Message`r`n"
  $script:Output.AppendText($text)
  $script:Output.ScrollToCaret()
}

function Get-EnvMap {
  param([string]$ProjectFolder)
  $map = @{}
  $files = @(".env.local", ".env", ".env.production")
  foreach ($name in $files) {
    $path = Join-Path $ProjectFolder $name
    if (-not (Test-Path $path)) { continue }
    Get-Content $path -Encoding UTF8 | ForEach-Object {
      $line = $_.Trim()
      if (-not $line -or $line.StartsWith("#")) { return }
      $idx = $line.IndexOf("=")
      if ($idx -le 0) { return }
      $key = $line.Substring(0, $idx).Trim()
      $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
      $map[$key] = $value
    }
  }
  return $map
}

function Get-SupabaseConfig {
  $folder = $ProjectFolderText.Text.Trim()
  if (-not (Test-Path $folder)) { throw "找不到專案資料夾：$folder" }
  $env = Get-EnvMap -ProjectFolder $folder
  $url = ""
  foreach ($key in @("SUPABASE_URL", "VITE_SUPABASE_URL")) {
    if ($env.ContainsKey($key) -and $env[$key]) { $url = $env[$key]; break }
  }
  $serviceKey = ""
  foreach ($key in @("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")) {
    if ($env.ContainsKey($key) -and $env[$key]) { $serviceKey = $env[$key]; break }
  }
  if (-not $url) { throw "找不到 VITE_SUPABASE_URL 或 SUPABASE_URL。請確認 .env.local。" }
  if (-not $serviceKey) { throw "找不到 SUPABASE_SERVICE_ROLE_KEY。請確認 .env.local。" }
  return @{ Url = $url.TrimEnd('/'); Key = $serviceKey }
}

function Invoke-SupabaseRest {
  param(
    [string]$Method,
    [string]$Path,
    $Body = $null,
    [hashtable]$ExtraHeaders = @{}
  )
  $config = Get-SupabaseConfig
  $headers = @{
    "apikey" = $config.Key
    "Authorization" = "Bearer $($config.Key)"
    "Content-Type" = "application/json"
  }
  foreach ($k in $ExtraHeaders.Keys) { $headers[$k] = $ExtraHeaders[$k] }
  $uri = "$($config.Url)/rest/v1/$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers
  }
  return Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -Body ($Body | ConvertTo-Json -Depth 10)
}

function Normalize-Email {
  param([string]$Email)
  $value = $Email.Trim().ToLowerInvariant()
  if (-not $value -or $value -notmatch "^[^@\s]+@[^@\s]+\.[^@\s]+$") {
    throw "Email 格式不正確。"
  }
  return $value
}

function Add-Admin {
  try {
    $email = Normalize-Email $EmailText.Text
    $note = $NoteText.Text.Trim()
    $body = @(@{
      email = $email
      role = "admin"
      is_active = $true
      note = $note
      created_by = "AdminAccountManager.exe"
    })
    Invoke-SupabaseRest -Method "Post" -Path "admin_users" -Body $body -ExtraHeaders @{ "Prefer" = "resolution=merge-duplicates,return=representation" } | Out-Null
    Write-Log "已加入 / 恢復管理員：$email"
    List-Admins
  } catch {
    Write-Log $_.Exception.Message "ERROR"
  }
}

function Disable-Admin {
  try {
    $email = Normalize-Email $EmailText.Text
    if ($email -eq "true.alpha0902@gmail.com") {
      $answer = [System.Windows.Forms.MessageBox]::Show("這是主要管理員帳號。確定要停用嗎？", "確認", "YesNo", "Warning")
      if ($answer -ne "Yes") { return }
    }
    $encoded = [System.Uri]::EscapeDataString($email)
    $body = @{ is_active = $false; note = "disabled by AdminAccountManager.exe" }
    Invoke-SupabaseRest -Method "Patch" -Path "admin_users?email=eq.$encoded" -Body $body -ExtraHeaders @{ "Prefer" = "return=representation" } | Out-Null
    Write-Log "已停用管理員：$email"
    List-Admins
  } catch {
    Write-Log $_.Exception.Message "ERROR"
  }
}

function Delete-Admin {
  try {
    $email = Normalize-Email $EmailText.Text
    if ($email -eq "true.alpha0902@gmail.com") {
      [System.Windows.Forms.MessageBox]::Show("主要管理員不建議刪除。請改用停用，或保留此帳號。", "安全提醒", "OK", "Warning") | Out-Null
      return
    }
    $answer = [System.Windows.Forms.MessageBox]::Show("確定要刪除管理員紀錄？`n$email", "確認刪除", "YesNo", "Warning")
    if ($answer -ne "Yes") { return }
    $encoded = [System.Uri]::EscapeDataString($email)
    Invoke-SupabaseRest -Method "Delete" -Path "admin_users?email=eq.$encoded" -ExtraHeaders @{ "Prefer" = "return=representation" } | Out-Null
    Write-Log "已刪除管理員紀錄：$email"
    List-Admins
  } catch {
    Write-Log $_.Exception.Message "ERROR"
  }
}

function List-Admins {
  try {
    $rows = Invoke-SupabaseRest -Method "Get" -Path "admin_users?select=email,role,is_active,note,created_at,updated_at&order=created_at.desc"
    $ListBox.Items.Clear()
    foreach ($row in $rows) {
      $status = if ($row.is_active) { "啟用" } else { "停用" }
      $note = if ($row.note) { " - $($row.note)" } else { "" }
      [void]$ListBox.Items.Add("[$status] $($row.email)$note")
    }
    Write-Log "已重新整理管理員名單，共 $($rows.Count) 筆。"
  } catch {
    Write-Log $_.Exception.Message "ERROR"
    Write-Log "如果顯示找不到 admin_users，請先到 Supabase SQL Editor 執行 supabase/admin-users-v55.sql。" "ERROR"
  }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "TrueAlpha 管理員帳號管理器"
$form.Size = New-Object System.Drawing.Size(880, 680)
$form.StartPosition = "CenterScreen"
$form.Font = New-Object System.Drawing.Font("Microsoft JhengHei UI", 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = "管理員帳號管理器"
$title.Font = New-Object System.Drawing.Font("Microsoft JhengHei UI", 22, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(28, 24)
$title.Size = New-Object System.Drawing.Size(760, 46)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "輸入 Email 後即可加入或停用管理員。資料會寫入 Supabase admin_users。"
$subtitle.Location = New-Object System.Drawing.Point(32, 74)
$subtitle.Size = New-Object System.Drawing.Size(790, 28)
$subtitle.ForeColor = [System.Drawing.Color]::SlateGray
$form.Controls.Add($subtitle)

$folderLabel = New-Object System.Windows.Forms.Label
$folderLabel.Text = "專案資料夾"
$folderLabel.Location = New-Object System.Drawing.Point(32, 118)
$folderLabel.Size = New-Object System.Drawing.Size(120, 28)
$form.Controls.Add($folderLabel)

$ProjectFolderText = New-Object System.Windows.Forms.TextBox
$ProjectFolderText.Location = New-Object System.Drawing.Point(32, 148)
$ProjectFolderText.Size = New-Object System.Drawing.Size(650, 30)
$ProjectFolderText.Text = "C:\Users\speci\Documents\SeniorSecurities"
$form.Controls.Add($ProjectFolderText)

$browse = New-Object System.Windows.Forms.Button
$browse.Text = "選擇"
$browse.Location = New-Object System.Drawing.Point(700, 146)
$browse.Size = New-Object System.Drawing.Size(120, 34)
$browse.Add_Click({
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.SelectedPath = $ProjectFolderText.Text
  if ($dialog.ShowDialog() -eq "OK") { $ProjectFolderText.Text = $dialog.SelectedPath }
})
$form.Controls.Add($browse)

$emailLabel = New-Object System.Windows.Forms.Label
$emailLabel.Text = "要設為管理員的 Email"
$emailLabel.Location = New-Object System.Drawing.Point(32, 200)
$emailLabel.Size = New-Object System.Drawing.Size(260, 28)
$form.Controls.Add($emailLabel)

$EmailText = New-Object System.Windows.Forms.TextBox
$EmailText.Location = New-Object System.Drawing.Point(32, 230)
$EmailText.Size = New-Object System.Drawing.Size(380, 30)
$form.Controls.Add($EmailText)

$noteLabel = New-Object System.Windows.Forms.Label
$noteLabel.Text = "備註"
$noteLabel.Location = New-Object System.Drawing.Point(440, 200)
$noteLabel.Size = New-Object System.Drawing.Size(120, 28)
$form.Controls.Add($noteLabel)

$NoteText = New-Object System.Windows.Forms.TextBox
$NoteText.Location = New-Object System.Drawing.Point(440, 230)
$NoteText.Size = New-Object System.Drawing.Size(380, 30)
$form.Controls.Add($NoteText)

$addButton = New-Object System.Windows.Forms.Button
$addButton.Text = "加入 / 恢復管理員"
$addButton.Location = New-Object System.Drawing.Point(32, 284)
$addButton.Size = New-Object System.Drawing.Size(180, 46)
$addButton.BackColor = [System.Drawing.Color]::FromArgb(31, 122, 140)
$addButton.ForeColor = [System.Drawing.Color]::White
$addButton.Add_Click({ Add-Admin })
$form.Controls.Add($addButton)

$disableButton = New-Object System.Windows.Forms.Button
$disableButton.Text = "停用管理員"
$disableButton.Location = New-Object System.Drawing.Point(228, 284)
$disableButton.Size = New-Object System.Drawing.Size(150, 46)
$disableButton.Add_Click({ Disable-Admin })
$form.Controls.Add($disableButton)

$deleteButton = New-Object System.Windows.Forms.Button
$deleteButton.Text = "刪除紀錄"
$deleteButton.Location = New-Object System.Drawing.Point(394, 284)
$deleteButton.Size = New-Object System.Drawing.Size(130, 46)
$deleteButton.ForeColor = [System.Drawing.Color]::Firebrick
$deleteButton.Add_Click({ Delete-Admin })
$form.Controls.Add($deleteButton)

$listButton = New-Object System.Windows.Forms.Button
$listButton.Text = "重新整理名單"
$listButton.Location = New-Object System.Drawing.Point(540, 284)
$listButton.Size = New-Object System.Drawing.Size(160, 46)
$listButton.Add_Click({ List-Admins })
$form.Controls.Add($listButton)

$ListBox = New-Object System.Windows.Forms.ListBox
$ListBox.Location = New-Object System.Drawing.Point(32, 350)
$ListBox.Size = New-Object System.Drawing.Size(788, 130)
$ListBox.Add_SelectedIndexChanged({
  if ($ListBox.SelectedItem) {
    $text = [string]$ListBox.SelectedItem
    if ($text -match "\]\s+([^\s]+@[^\s]+)") { $EmailText.Text = $Matches[1] }
  }
})
$form.Controls.Add($ListBox)

$Output = New-Object System.Windows.Forms.TextBox
$Output.Location = New-Object System.Drawing.Point(32, 500)
$Output.Size = New-Object System.Drawing.Size(788, 120)
$Output.Multiline = $true
$Output.ScrollBars = "Vertical"
$Output.ReadOnly = $true
$script:Output = $Output
$form.Controls.Add($Output)

$form.Add_Shown({ Write-Log "請確認已先執行 supabase/admin-users-v55.sql。"; List-Admins })
[void]$form.ShowDialog()
