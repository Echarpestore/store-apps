# ECHARPE - collect branch CCTV setup for review (v1)
# Run on the branch PC:  right-click > Run with PowerShell
# Output: one ZIP on the Desktop  ->  send it to Claude.
#
# Read-only: changes NOTHING on this PC. It only copies and reports.
# Passwords / tokens are masked in everything it copies.
# Never copied: videos, images, exe/dll, tunnel credentials (*.pem, tunnel json),
# service-account keys, .env files.
# ASCII only on purpose (Windows PowerShell 5.1).

$ErrorActionPreference = "Continue"
try { $Host.UI.RawUI.WindowTitle = "ECHARPE collect CCTV v1" } catch {}

$Stamp   = Get-Date -Format "yyyyMMdd-HHmmss"
$PcName  = $env:COMPUTERNAME
$Desk    = Join-Path $env:USERPROFILE "Desktop"
if (!(Test-Path $Desk)) { $Desk = $env:USERPROFILE }
$Work    = Join-Path $env:TEMP ("echarpe-collect-" + $Stamp)
$OutZip  = Join-Path $Desk ("BRANCH-CCTV-" + $PcName + "-" + $Stamp + ".zip")
New-Item -ItemType Directory -Path $Work -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Work "files") -Force | Out-Null

$NameRx  = "(?i)echarpe|cctv|go2rtc|madinaty|glow|rehab|branch-tools|recorder|frigate|cloudflared|nvr"
$TextExt = @(".ps1",".psm1",".py",".js",".mjs",".json",".yaml",".yml",".bat",".cmd",".txt",".md",".ini",".cfg",".conf",".toml",".xml",".log",".csv",".html",".vbs")
$SkipName = "(?i)\.pem$|\.key$|\.pfx$|\.p12$|service.?account|credentials|firebase-adminsdk|^\.env|cert\.pem|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$"
$MaxFile = 3MB
$MaxLogLines = 3000

function Mask([string]$t) {
  if ($null -eq $t) { return "" }
  $t = [regex]::Replace($t, "(?i)(rtsp|rtsps|http|https)://[^/\s:@""']+:[^@\s""']+@", '$1://***:***@')
  $t = [regex]::Replace($t, "(?i)(password|passwd|pwd|pass|secret|token|apikey|api_key|key)=([^&\s""'<>]+)", '$1=***')
  $t = [regex]::Replace($t, "(?i)(""(password|passwd|pass|secret|token|apiKey|api_key|private_key|privateKey|TunnelSecret|AccountTag)""\s*:\s*)""[^""]*""", '$1"***"')
  $t = [regex]::Replace($t, "(?i)((password|passwd|secret|token)\s*[:=]\s*)['""][^'""]+['""]", '$1"***"')
  $t = [regex]::Replace($t, "-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----", "***PEM-REMOVED***")
  $t = [regex]::Replace($t, "eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}", "***JWT***")
  return $t
}

function W([string]$file, [string]$text) {
  $p = Join-Path $Work $file
  [System.IO.File]::AppendAllText($p, (Mask $text) + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
}

function Section([string]$file, [string]$title, [scriptblock]$body) {
  Write-Host ("  - " + $title) -ForegroundColor Gray
  W $file ("===== " + $title + " =====")
  try { $r = & $body 2>&1 | Out-String -Width 400; W $file $r }
  catch { W $file ("ERROR: " + $_.Exception.Message) }
  W $file ""
}

Write-Host "ECHARPE collect CCTV v1 - read only, nothing will be changed" -ForegroundColor Cyan

# ---------- 1) system ----------
Section "01-system.txt" "computer" { Get-CimInstance Win32_ComputerSystem | Select-Object Name,Manufacturer,Model,TotalPhysicalMemory | Format-List }
Section "01-system.txt" "windows" { Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture,LastBootUpTime,LocalDateTime | Format-List }
Section "01-system.txt" "cpu" { Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,LoadPercentage | Format-List }
Section "01-system.txt" "disks" { Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{n="SizeGB";e={[math]::Round($_.Size/1GB,1)}},@{n="FreeGB";e={[math]::Round($_.FreeSpace/1GB,1)}} | Format-Table -AutoSize }
Section "01-system.txt" "time zone / clock" { Get-TimeZone | Format-List; w32tm /query /status }
Section "01-system.txt" "power plan" { powercfg /getactivescheme; powercfg /query SCHEME_CURRENT SUB_SLEEP }
Section "01-system.txt" "windows update active hours / pending reboot" {
  Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" -ErrorAction SilentlyContinue | Select-Object ActiveHoursStart,ActiveHoursEnd | Format-List
  "RebootRequired key present: " + (Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired")
}
Section "01-system.txt" "unexpected shutdowns / restarts (last 30 days)" {
  Get-WinEvent -FilterHashtable @{LogName="System"; Id=41,6008,1074,6005,6006; StartTime=(Get-Date).AddDays(-30)} -ErrorAction SilentlyContinue |
    Select-Object TimeCreated,Id,@{n="Msg";e={($_.Message -split "`n")[0]}} | Format-Table -AutoSize -Wrap
}

# ---------- 2) network / cameras ----------
Section "02-network.txt" "ipconfig" { ipconfig /all }
Section "02-network.txt" "arp (camera MAC <-> IP)" { arp -a }
Section "02-network.txt" "routes" { route print -4 }
Section "02-network.txt" "port checks" {
  $targets = @("192.168.0.9:554","192.168.0.9:80","192.168.0.9:34567","192.168.0.102:554","192.168.0.103:554","192.168.0.1:80","127.0.0.1:1984","127.0.0.1:1985","127.0.0.1:8554","127.0.0.1:8555")
  foreach ($t in $targets) {
    $h,$p = $t -split ":"; $c = New-Object System.Net.Sockets.TcpClient; $ok = $false
    try { $iar = $c.BeginConnect($h,[int]$p,$null,$null); $ok = $iar.AsyncWaitHandle.WaitOne(2000,$false); if ($ok) { $c.EndConnect($iar) } } catch { $ok = $false } finally { $c.Close() }
    "{0,-22} {1}" -f $t, $(if ($ok) {"OPEN"} else {"closed"})
  }
}
Section "02-network.txt" "LAN scan 192.168.0.1-254 port 554 (cameras/NVR)" {
  $found = @()
  for ($i = 1; $i -le 254; $i++) {
    $ip = "192.168.0." + $i; $c = New-Object System.Net.Sockets.TcpClient
    try { $iar = $c.BeginConnect($ip,554,$null,$null); if ($iar.AsyncWaitHandle.WaitOne(150,$false)) { $c.EndConnect($iar); $found += $ip } } catch {} finally { $c.Close() }
  }
  "RTSP open on: " + ($found -join ", ")
}
Section "02-network.txt" "listening ports" { netstat -ano | Select-String "LISTENING" }

# ---------- 3) processes / services / tasks / startup ----------
Section "03-runtime.txt" "relevant processes (command lines masked)" {
  Get-CimInstance Win32_Process | Where-Object { $_.Name -match "(?i)go2rtc|ffmpeg|ffprobe|python|pythonw|powershell|pwsh|cloudflared|node|electron|nssm|frigate|mediamtx|echarpe" } |
    Select-Object ProcessId,ParentProcessId,Name,@{n="Started";e={$_.CreationDate}},@{n="MB";e={[math]::Round($_.WorkingSetSize/1MB)}},CommandLine | Format-List
}
Section "03-runtime.txt" "relevant services" {
  Get-CimInstance Win32_Service | Where-Object { ($_.Name + " " + $_.DisplayName + " " + $_.PathName) -match $NameRx } |
    Select-Object Name,DisplayName,State,StartMode,StartName,PathName | Format-List
}
Section "03-runtime.txt" "nssm service parameters" {
  $nssm = Get-Command nssm -ErrorAction SilentlyContinue
  if ($nssm) {
    Get-CimInstance Win32_Service | Where-Object { ($_.Name + " " + $_.PathName) -match $NameRx } | ForEach-Object {
      "--- " + $_.Name; foreach ($k in @("Application","AppDirectory","AppParameters","AppExit","AppRestartDelay","AppStdout")) { "{0}: {1}" -f $k, (& $nssm.Source get $_.Name $k 2>$null) }
    }
  } else { "nssm not found" }
}
Section "03-runtime.txt" "scheduled tasks (summary)" {
  Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { ($_.TaskName + " " + $_.TaskPath + " " + (($_.Actions | ForEach-Object { $_.Execute + " " + $_.Arguments }) -join " ")) -match $NameRx } | ForEach-Object {
    $i = $_ | Get-ScheduledTaskInfo -ErrorAction SilentlyContinue
    "--- " + $_.TaskPath + $_.TaskName + "  state=" + $_.State + "  lastRun=" + $i.LastRunTime + "  lastResult=" + $i.LastTaskResult
    $_.Actions | ForEach-Object { "    run: " + $_.Execute + " " + $_.Arguments + "  (in " + $_.WorkingDirectory + ")" }
    $_.Triggers | ForEach-Object { "    trigger: " + $_.CimClass.CimClassName + " " + $_.StartBoundary }
    "    user: " + $_.Principal.UserId + "  runLevel=" + $_.Principal.RunLevel
  }
}
$taskDir = Join-Path $Work "tasks"; New-Item -ItemType Directory -Path $taskDir -Force | Out-Null
try {
  Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { ($_.TaskName + " " + $_.TaskPath + " " + (($_.Actions | ForEach-Object { $_.Execute + " " + $_.Arguments }) -join " ")) -match $NameRx } | ForEach-Object {
    $x = Export-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath
    $fn = ($_.TaskPath + $_.TaskName) -replace "[\\/:*?""<>|]", "_"
    [System.IO.File]::WriteAllText((Join-Path $taskDir ($fn + ".xml")), (Mask $x), (New-Object System.Text.UTF8Encoding($false)))
  }
} catch {}
Section "03-runtime.txt" "startup folders" {
  $sh = New-Object -ComObject WScript.Shell
  foreach ($d in @([Environment]::GetFolderPath("Startup"), [Environment]::GetFolderPath("CommonStartup"))) {
    "--- " + $d
    Get-ChildItem $d -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_.Extension -eq ".lnk") { $l = $sh.CreateShortcut($_.FullName); $_.Name + " -> " + $l.TargetPath + " " + $l.Arguments + "  (in " + $l.WorkingDirectory + ")" } else { $_.Name }
    }
  }
}
Section "03-runtime.txt" "registry Run keys" {
  foreach ($k in @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Run","HKLM:\Software\Microsoft\Windows\CurrentVersion\Run","HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run")) {
    "--- " + $k; Get-ItemProperty $k -ErrorAction SilentlyContinue | Format-List
  }
}
Section "03-runtime.txt" "auto logon" {
  $w = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -ErrorAction SilentlyContinue
  "AutoAdminLogon=" + $w.AutoAdminLogon + "  DefaultUserName=" + $w.DefaultUserName
}

# ---------- 4) live gateway state ----------
Section "04-gateway-live.txt" "go2rtc /api/streams (masked)" { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:1984/api/streams").Content }
Section "04-gateway-live.txt" "go2rtc /api (version)" { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:1984/api").Content }
Section "04-gateway-live.txt" "active probe of every go2rtc stream (which camera is down now)" {
  try { $names = ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:1984/api/streams").Content | ConvertFrom-Json).PSObject.Properties.Name } catch { $names = @() }
  foreach ($n in $names) {
    $ok = "FAIL"
    try { $raw = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 12 ("http://127.0.0.1:1984/api/streams?src=" + [uri]::EscapeDataString($n) + "&video=all")).Content; if ($raw -match "(?i)h264|h265|hevc") { $ok = "OK" } } catch { $ok = "FAIL " + $_.Exception.Message }
    "{0,-16} {1}" -f $n, $ok
  }
}
Section "04-gateway-live.txt" "ping cameras" { foreach ($ip in @("192.168.0.9","192.168.0.102","192.168.0.103","192.168.0.106")) { "{0,-15} {1}" -f $ip, (Test-Connection -ComputerName $ip -Count 2 -Quiet -ErrorAction SilentlyContinue) } }
Section "04-gateway-live.txt" "local agent 1985 /health" { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:1985/health").Content }
Section "04-gateway-live.txt" "tool versions" {
  foreach ($n in @("go2rtc","ffmpeg","python","py","cloudflared","node","nssm")) {
    $c = Get-Command $n -ErrorAction SilentlyContinue
    if ($c) { "--- " + $n + " : " + $c.Source; try { if ($n -eq "go2rtc") { & $c.Source -version 2>&1 | Select-Object -First 2 } elseif ($n -eq "nssm") { "" } else { & $c.Source --version 2>&1 | Select-Object -First 1 } } catch {} } else { "--- " + $n + " : not on PATH" }
  }
  Get-CimInstance Win32_Process | Where-Object { $_.Name -match "(?i)go2rtc|cloudflared|ffmpeg|python" } | Select-Object -ExpandProperty ExecutablePath -Unique | ForEach-Object { "exe in use: " + $_ }
}
Section "04-gateway-live.txt" "cloudflared config (credentials NOT copied)" {
  foreach ($d in @((Join-Path $env:USERPROFILE ".cloudflared"), "C:\Windows\System32\config\systemprofile\.cloudflared", (Join-Path $env:ProgramData "cloudflared"), "C:\cloudflared")) {
    if (Test-Path $d) { "--- " + $d; Get-ChildItem $d -File | ForEach-Object { $_.Name + "  " + $_.Length + " bytes" }; Get-ChildItem $d -File -Include *.yml,*.yaml -Recurse | ForEach-Object { "### " + $_.FullName; Get-Content $_.FullName -Raw } }
  }
}

# ---------- 5) source files ----------
Write-Host "  - copying scripts / configs (no videos, no secrets)" -ForegroundColor Gray
$roots = @()
foreach ($base in @($env:USERPROFILE, $env:LOCALAPPDATA, (Join-Path $env:USERPROFILE "Desktop"), (Join-Path $env:USERPROFILE "Documents"), (Join-Path $env:USERPROFILE "Downloads"), (Join-Path $env:USERPROFILE "OneDrive\Desktop"), "C:\", "D:\", $env:ProgramData, ${env:ProgramFiles}, (Join-Path $env:LOCALAPPDATA "Programs"))) {
  if ($base -and (Test-Path $base)) {
    Get-ChildItem -Path $base -Directory -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $NameRx -and $_.Name -ne "AppData" } | ForEach-Object { $roots += $_.FullName }
  }
}
$roots = $roots | Select-Object -Unique
$index = @()
$copied = 0
foreach ($r in $roots) {
  Get-ChildItem -Path $r -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $f = $_
    $rel = ($r -replace "[:\\]", "_") + "\" + $f.FullName.Substring($r.Length).TrimStart("\")
    if ($f.FullName -match "(?i)\\node_modules\\|\\\.git\\|\\__pycache__\\|\\venv\\|\\site-packages\\") { return }
    $line = "{0,12}  {1:yyyy-MM-dd HH:mm}  {2}" -f $f.Length, $f.LastWriteTime, $f.FullName
    $ext = $f.Extension.ToLower()
    if (($TextExt -contains $ext) -and ($f.Name -notmatch $SkipName) -and ($f.Length -le $MaxFile)) {
      try {
        $dest = Join-Path (Join-Path $Work "files") $rel
        New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
        if ($ext -eq ".log") { $txt = (Get-Content $f.FullName -Tail $MaxLogLines -ErrorAction Stop) -join "`r`n" }
        else { $txt = [System.IO.File]::ReadAllText($f.FullName) }
        [System.IO.File]::WriteAllText($dest, (Mask $txt), (New-Object System.Text.UTF8Encoding($false)))
        $copied++; $line = "[copied] " + $line
      } catch { $line = "[error ] " + $line }
    } else { $line = "[listed] " + $line }
    $index += $line
  }
}
W "05-file-index.txt" ("Roots:`r`n" + ($roots -join "`r`n") + "`r`n`r`n" + ($index -join "`r`n"))

# ---------- 6) zip ----------
W "00-README.txt" ("ECHARPE collect CCTV v1`r`nPC: " + $PcName + "`r`nUser: " + $env:USERNAME + "`r`nTime: " + (Get-Date) + "`r`nRoots found: " + $roots.Count + "`r`nFiles copied: " + $copied + "`r`nAll text was passed through the password mask.")
try {
  Compress-Archive -Path (Join-Path $Work "*") -DestinationPath $OutZip -Force
  Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host ("DONE. Send this file to Claude:  " + $OutZip) -ForegroundColor Green
} catch {
  Write-Host ("ZIP failed: " + $_.Exception.Message) -ForegroundColor Red
  Write-Host ("The collected folder is here instead: " + $Work) -ForegroundColor Yellow
}
Write-Host ("Folders found: " + $roots.Count + "   files copied: " + $copied)
Read-Host "ENTER to close"
