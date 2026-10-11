# ECHARPE Madinaty CCTV v710 - recorder patch (run as Administrator)
#
# What it changes in ECHARPE-MADINATY-RECORDER.ps1 (and nothing else):
#  1) Record the H264 sub-stream (cameraN_live) instead of the HEVC main stream.
#     Small files, and playback becomes a copy instead of a transcode.
#  2) Honour mode=fast (it was hard-coded off, so every clip was re-encoded).
#  3) Find segments by hour prefix instead of listing every file per request.
#  4) Disk guard: delete oldest segments whenever free space drops below 15 GB.
#  5) 6-second segments instead of 2-second (3x fewer files to scan).
# Backup first, verify after, automatic rollback if recording does not come back.
# -TestFile <path> : patch a copy only (no restart, no verify) - used for local tests.
# ASCII only on purpose (Windows PowerShell 5.1).

param([string]$TestFile = '', [string]$TestOut = '')

$ErrorActionPreference = 'Stop'
$Root   = 'C:\ProgramData\ECHARPE\MadinatyCCTV'
$Target = Join-Path $Root 'ECHARPE-MADINATY-RECORDER.ps1'
$Log    = Join-Path $Root 'logs\apply-v710.log'

function Say([string]$m, [string]$c = 'Gray') {
  Write-Host $m -ForegroundColor $c
  if (-not $TestFile) { try { Add-Content $Log ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding ASCII } catch {} }
}

# Each edit: exact text that must exist exactly $Count times, and its replacement.
$Edits = @(
  @{ Name = 'stream4'; Count = 1
     Old = "`$Stream = 'rtsp://127.0.0.1:8554/camera4'"
     New = "`$Stream = 'rtsp://127.0.0.1:8554/camera4_live'" },
  @{ Name = 'stream8'; Count = 1
     Old = "`$Stream8 = 'rtsp://127.0.0.1:8554/camera8'"
     New = "`$Stream8 = 'rtsp://127.0.0.1:8554/camera8_live'" },
  @{ Name = 'minfree'; Count = 1
     Old = "`$RetentionHours = 168"
     New = "`$RetentionHours = 168`r`n`$MinFreeGB = 15" },
  @{ Name = 'segtime4'; Count = 1
     Old = "-map 0:v:0 -an -c:v copy -f segment -segment_time 2 -segment_format mpegts -reset_timestamps 1 -strftime 1 `"' + `$pattern + '`"'"
     New = "-map 0:v:0 -an -c:v copy -f segment -segment_time 6 -segment_format mpegts -reset_timestamps 1 -strftime 1 `"' + `$pattern + '`"'" },
  @{ Name = 'segtime8'; Count = 1
     Old = "-map 0:v:0 -an -c:v copy -f segment -segment_time 2 -segment_format mpegts -reset_timestamps 1 -strftime 1 `"'+`$pattern+'`"'"
     New = "-map 0:v:0 -an -c:v copy -f segment -segment_time 6 -segment_format mpegts -reset_timestamps 1 -strftime 1 `"'+`$pattern+'`"'" },
  @{ Name = 'fastmode'; Count = 1
     Old = "`$fast=`$false; `$clip=Build-Clip"
     New = "`$fast=([string]`$ctx.Request.QueryString['mode'] -ne 'exact'); `$clip=Build-Clip" },
  @{ Name = 'cliplist'; Count = 1
     Old = "  `$all = @(Get-ChildItem -LiteralPath `$folder -Filter `$filter -File -ErrorAction SilentlyContinue | Where-Object { `$PSItem.Length -gt `$MinimumSegmentBytes } | Sort-Object Name)"
     New = "  `$all = @(Get-SegmentsForWindow `$folder `$Camera (`$StartMs - 6000) (`$endMs + 4000))" },
  @{ Name = 'waitwin'; Count = 1
     Old = "`$newest = Get-ChildItem -LiteralPath `$folder -Filter `$filter -File -ErrorAction SilentlyContinue | Where-Object { `$PSItem.Length -gt `$MinimumSegmentBytes } | Sort-Object Name -Descending | Select-Object -First 1"
     New = "`$newest = Get-RecentSegment `$folder `$Camera" },
  @{ Name = 'latest4'; Count = 1
     Old = "function Get-LatestValidSegment {`r`n  return Get-ChildItem"
     New = "function Get-LatestValidSegment {`r`n  `$quick = Get-RecentSegment `$Segments 4; if (`$quick) { return `$quick }`r`n  return Get-ChildItem" },
  @{ Name = 'latest8'; Count = 1
     Old = "function Get-LatestValidSegment8 {Get-ChildItem"
     New = "function Get-LatestValidSegment8 {`$quick=Get-RecentSegment `$Segments8 8;if(`$quick){return `$quick};Get-ChildItem" },
  @{ Name = 'cleanup'; Count = 1
     Old = "function Cleanup-OldFiles {`r`n  `$cut = (Get-Date).AddHours(-`$RetentionHours)"
     New = "function Cleanup-OldFiles {`r`n  Invoke-DiskGuard`r`n  `$cut = (Get-Date).AddHours(-`$RetentionHours)" },
  @{ Name = 'version'; Count = 1
     Old = "version=690;branch='madinaty'"
     New = "version=710;branch='madinaty'" },
  @{ Name = 'helpers'; Count = 1
     Old = "function Cleanup-OldFiles {"
     New = @'
# ---- v710 helpers -----------------------------------------------------------
# Newest valid segment, looking only at the current and previous hour.
function Get-RecentSegment([string]$Folder,[int]$Camera) {
  try {
    $now = Get-Date
    foreach ($h in @($now, $now.AddHours(-1))) {
      $f = Get-ChildItem -LiteralPath $Folder -Filter ('cam' + [string]$Camera + '-' + $h.ToString('yyyyMMdd-HH') + '*.ts') -File -ErrorAction SilentlyContinue |
        Where-Object { $PSItem.Length -gt $MinimumSegmentBytes } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($f) { return $f }
    }
  } catch {}
  return $null
}
# Segments whose name falls in the hours covered by [FromMs, ToMs], sorted by name.
function Get-SegmentsForWindow([string]$Folder,[int]$Camera,[long]$FromMs,[long]$ToMs) {
  $t0 = [DateTimeOffset]::FromUnixTimeMilliseconds($FromMs).LocalDateTime
  $t1 = [DateTimeOffset]::FromUnixTimeMilliseconds($ToMs).LocalDateTime
  $h = $t0.Date.AddHours($t0.Hour)
  $found = New-Object System.Collections.Generic.List[object]
  $guard = 0
  while ($h -le $t1 -and $guard -lt 48) {
    $part = @(Get-ChildItem -LiteralPath $Folder -Filter ('cam' + [string]$Camera + '-' + $h.ToString('yyyyMMdd-HH') + '*.ts') -File -ErrorAction SilentlyContinue |
      Where-Object { $PSItem.Length -gt $MinimumSegmentBytes })
    foreach ($x in $part) { $found.Add($x) }
    $h = $h.AddHours(1); $guard++
  }
  return @($found | Sort-Object Name)
}
# Never let recordings fill the disk: drop the oldest segments until MinFreeGB is free.
function Invoke-DiskGuard {
  try {
    $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($SegmentsRoot))
    $rounds = 0
    while (($drive.AvailableFreeSpace / 1GB) -lt $MinFreeGB -and $rounds -lt 300) {
      $old = @(Get-ChildItem -LiteralPath $SegmentsRoot -Recurse -Filter '*.ts' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -First 3000)
      if ($old.Count -eq 0) { break }
      $old | Remove-Item -Force -ErrorAction SilentlyContinue
      $rounds++
    }
    if ($rounds -gt 0) { Write-Log ('disk_guard rounds=' + $rounds + ' freeGB=' + [Math]::Round($drive.AvailableFreeSpace / 1GB, 1)) }
  } catch { Write-Log ('disk_guard_error=' + $_.Exception.Message) }
}

function Cleanup-OldFiles {
'@ }
)

function Apply-Edits([string]$text) {
  # 'cleanup' must run before 'helpers' (helpers re-inserts the function header).
  foreach ($e in $Edits) {
    $old = $e.Old; $new = $e.New
    if ($text.IndexOf("`r`n") -lt 0) { $old = $old.Replace("`r`n", "`n"); $new = $new.Replace("`r`n", "`n") }
    $n = ([regex]::Matches($text, [regex]::Escape($old))).Count
    if ($n -ne $e.Count) { throw ('edit ' + $e.Name + ': expected ' + $e.Count + ' match, found ' + $n) }
    $text = $text.Replace($old, $new)
  }
  return $text
}
function Test-Syntax([string]$path) {
  $t = $null; $errs = $null
  [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$t, [ref]$errs) | Out-Null
  return @($errs).Count
}

# ---------------- local test mode ----------------
if ($TestFile) {
  $src = [IO.File]::ReadAllText($TestFile)
  $out = Apply-Edits $src
  [IO.File]::WriteAllText($TestOut, $out, (New-Object Text.UTF8Encoding($false)))
  $bad = Test-Syntax $TestOut
  Say ('TEST edits=' + $Edits.Count + ' syntaxErrors=' + $bad)
  if ($bad) { exit 1 } else { exit 0 }
}

# ---------------- live install ----------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Say 'Not Administrator. Right-click RUN-v710.cmd > Run as administrator.' 'Red'; exit 1 }
if (-not (Test-Path $Target)) { Say ('Missing ' + $Target) 'Red'; exit 1 }

function Port([int]$p) { $c = New-Object Net.Sockets.TcpClient; try { $a = $c.BeginConnect('127.0.0.1', $p, $null, $null); if (-not $a.AsyncWaitHandle.WaitOne(1500, $false)) { return $false }; $c.EndConnect($a); return $true } catch { return $false } finally { $c.Close() } }
function Newest([int]$cam) {
  Get-ChildItem (Join-Path $Root ('segments\camera' + $cam)) -Filter ('cam' + $cam + '-' + (Get-Date).ToString('yyyyMMdd-HH') + '*.ts') -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 4096 } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
function Stop-RecorderAgent {
  Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -match '(?i)ECHARPE-MADINATY-RECORDER\.ps1' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ffmpeg.exe' -and $_.CommandLine -match '(?i)segments\\camera[48]' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Start-RecorderAgent {
  # Prefer the SYSTEM supervisor (v700) to bring the agent back; start it ourselves only if it does not.
  $deadline = (Get-Date).AddSeconds(100)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 5
    $running = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -match '(?i)ECHARPE-MADINATY-RECORDER\.ps1' }).Count
    if ($running -gt 0) { Say 'Agent restarted by supervisor v700.'; return }
  }
  Say 'Supervisor did not restart the agent - starting it directly.' 'Yellow'
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$Target) | Out-Null
}
# Recording is "back" only when both cameras wrote a fresh segment after $since.
function Wait-Recording([datetime]$since, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 5
    $a = Newest 4; $b = Newest 8
    if ($a -and $b -and $a.LastWriteTime -gt $since -and $b.LastWriteTime -gt $since -and (Port 1985)) { return $true }
  }
  return $false
}

Say 'ECHARPE Madinaty CCTV v710' 'Cyan'
$src = [IO.File]::ReadAllText($Target)
if ($src -match "version=710;branch='madinaty'") { Say 'Already v710 - nothing to do.' 'Green'; exit 0 }

try { $patched = Apply-Edits $src } catch { Say ('Recorder is not the expected version - nothing changed. ' + $_.Exception.Message) 'Red'; exit 1 }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $Root ('backup-before-v710-' + $stamp)
New-Item -ItemType Directory -Force -Path $bk | Out-Null
Copy-Item $Target (Join-Path $bk 'ECHARPE-MADINATY-RECORDER.ps1') -Force
$new = $Target + '.v710.new'
[IO.File]::WriteAllText($new, $patched, (New-Object Text.UTF8Encoding($false)))
if (Test-Syntax $new) { Remove-Item $new -Force; Say 'Patched file has syntax errors - nothing changed.' 'Red'; exit 1 }
Say ('Backup: ' + $bk)

$drive = New-Object IO.DriveInfo 'C'
Say ('Free before: ' + [Math]::Round($drive.AvailableFreeSpace / 1GB, 1) + ' GB')

Stop-RecorderAgent
Start-Sleep 2
Move-Item $new $Target -Force
$since = Get-Date
Start-RecorderAgent
Say 'Recorder restarted on v710. Waiting for real segments (up to 4 min; first run also frees disk space)...' 'Cyan'

if (-not (Wait-Recording $since 240)) {
  Say 'No fresh segments on v710 - ROLLING BACK.' 'Red'
  Stop-RecorderAgent
  Start-Sleep 2
  Copy-Item (Join-Path $bk 'ECHARPE-MADINATY-RECORDER.ps1') $Target -Force
  $since = Get-Date
  Start-RecorderAgent
  $back = Wait-Recording $since 180
  Say ('MADINATY_CCTV_V710=FAILED_ROLLED_BACK oldRecording=' + $back) 'Red'
  exit 2
}

# ---- proof, not just "port open" ----
$a = Newest 4; $b = Newest 8
$codec = ''
try { $codec = (& (Join-Path $Root 'ffprobe.exe') -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 $a.FullName) } catch {}
Say ('camera4 segment: ' + $a.Name + ' ' + [int]($a.Length / 1KB) + ' KB  codec/size=' + $codec)
Say ('camera8 segment: ' + $b.Name + ' ' + [int]($b.Length / 1KB) + ' KB')
Start-Sleep 45
$sw = [Diagnostics.Stopwatch]::StartNew(); $clipOk = $false; $clipBytes = 0
try {
  $at = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() - 40000
  $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 120 -Uri ('http://127.0.0.1:1985/echarpe-playback/video?camera=4&atMs=' + $at + '&durationSec=30&quality=480&mode=fast')
  $clipBytes = $resp.RawContentLength; $clipOk = ($resp.StatusCode -eq 200 -and $clipBytes -gt 4096)
} catch { Say ('clip error: ' + $_.Exception.Message) 'Yellow' }
Say ('30s clip: ok=' + $clipOk + ' bytes=' + $clipBytes + ' ms=' + $sw.ElapsedMilliseconds)
Say ('Free after: ' + [Math]::Round($drive.AvailableFreeSpace / 1GB, 1) + ' GB')
Say ('MADINATY_CCTV_V710=OK CLIP=' + $(if ($clipOk) { 'OK' } else { 'CHECK' })) 'Green'
exit 0
