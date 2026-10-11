# ECHARPE Madinaty CCTV v711 - recorder patch on top of v711 (run as Administrator)
#  1) Record at a fixed low bitrate (cashier 500k, door 250k) so 7 days fit on the disk.
#  2) Serve new recordings by stream copy (no re-encode) even though ffprobe is missing.
# Backup first, verify after, automatic rollback if recording does not come back.
# -TestFile <path> : patch a copy only (no restart, no verify) - used for local tests.
# ASCII only on purpose (Windows PowerShell 5.1).

param([string]$TestFile = '', [string]$TestOut = '')

$ErrorActionPreference = 'Stop'
$Root   = 'C:\ProgramData\ECHARPE\MadinatyCCTV'
$Target = Join-Path $Root 'ECHARPE-MADINATY-RECORDER.ps1'
$Log    = Join-Path $Root 'logs\apply-v711.log'

function Say([string]$m, [string]$c = 'Gray') {
  Write-Host $m -ForegroundColor $c
  if (-not $TestFile) { try { Add-Content $Log ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding ASCII } catch {} }
}

# Each edit: exact text that must exist exactly $Count times, and its replacement.
$Edits = @(
  @{ Name = 'enc4'; Count = 1
     Old = "-map 0:v:0 -an -c:v copy -f segment -segment_time 6 -segment_format mpegts -reset_timestamps 1 -strftime 1 `"' + `$pattern + '`"'"
     New = "-map 0:v:0 -an -c:v h264_qsv -b:v 500k -maxrate 750k -bufsize 1500k -g 50 -bf 0 -f segment -segment_time 6 -segment_format mpegts -reset_timestamps 1 -strftime 1 `"' + `$pattern + '`"'" },
  @{ Name = 'enc8'; Count = 1
     Old = "-map 0:v:0 -an -c:v copy -f segment -segment_time 6 -segment_format mpegts -reset_timestamps 1 -strftime 1 `"'+`$pattern+'`"'"
     New = "-map 0:v:0 -an -c:v h264_qsv -b:v 250k -maxrate 400k -bufsize 800k -g 50 -bf 0 -f segment -segment_time 6 -segment_format mpegts -reset_timestamps 1 -strftime 1 `"'+`$pattern+'`"'" },
  @{ Name = 'copypath'; Count = 1
     Old = "if(`$inputCodec -eq 'h264'){"
     New = "if(`$inputCodec -eq 'h264' -or (`$inputCodec -eq '' -and `$picked[0].LastWriteTime -gt `$H264Since)){" },
  @{ Name = 'since'; Count = 1
     Old = "`$MinFreeGB = 15"
     New = "`$MinFreeGB = 15`r`n# Segments written after this moment are H264 (v711+); ffprobe is not installed on this PC.`r`n`$H264Since = [datetime]'2026-10-11T08:24:00'" },
  @{ Name = 'version'; Count = 1
     Old = "version=710;branch='madinaty'"
     New = "version=711;branch='madinaty'" }
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
if (-not $isAdmin) { Say 'Not Administrator. Right-click RUN-v711.cmd > Run as administrator.' 'Red'; exit 1 }
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
  Say 'Supervisor v700 did not restart the agent - starting it directly.' 'Yellow'
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

Say 'ECHARPE Madinaty CCTV v711' 'Cyan'
$src = [IO.File]::ReadAllText($Target)
if ($src -match "version=711;branch='madinaty'") { Say 'Already v711 - nothing to do.' 'Green'; exit 0 }

try { $patched = Apply-Edits $src } catch { Say ('Recorder is not the expected version - nothing changed. ' + $_.Exception.Message) 'Red'; exit 1 }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $Root ('backup-before-v711-' + $stamp)
New-Item -ItemType Directory -Force -Path $bk | Out-Null
Copy-Item $Target (Join-Path $bk 'ECHARPE-MADINATY-RECORDER.ps1') -Force
$new = $Target + '.v711.new'
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
Say 'Recorder restarted on v711. Waiting for real segments (up to 4 min; first run also frees disk space)...' 'Cyan'

if (-not (Wait-Recording $since 240)) {
  Say 'No fresh segments on v711 - ROLLING BACK.' 'Red'
  Stop-RecorderAgent
  Start-Sleep 2
  Copy-Item (Join-Path $bk 'ECHARPE-MADINATY-RECORDER.ps1') $Target -Force
  $since = Get-Date
  Start-RecorderAgent
  $back = Wait-Recording $since 180
  Say ('MADINATY_CCTV_V711=FAILED_ROLLED_BACK oldRecording=' + $back) 'Red'
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
Say ('MADINATY_CCTV_V711=OK CLIP=' + $(if ($clipOk) { 'OK' } else { 'CHECK' })) 'Green'
exit 0
