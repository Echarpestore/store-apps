# ECHARPE Madinaty CCTV - take camera 7 from the NVR instead of its own IP (run as Administrator)
# Camera 7 was the only stream read directly from the camera (192.168.0.103). That address stopped
# answering while the NVR still shows the camera on channel 7, so the stream is re-pointed at the NVR,
# the same way camera 4 was moved earlier. The new lines are built from the working camera5 lines
# (same NVR, same credentials), so no password is typed, printed or logged anywhere.
# Backup first; proof afterwards (a real frame from camera 7 and from the cashier/door cameras);
# automatic rollback if any of them fails.
# ASCII only on purpose (Windows PowerShell 5.1).

$ErrorActionPreference = 'Stop'
$Root        = 'C:\ProgramData\ECHARPE\MadinatyCCTV'
$Log         = Join-Path $Root 'logs\fix-camera7.log'
$GatewayTask = 'ECHARPE CCTV Gateway'
$Channel     = 7

function Say([string]$m, [string]$c = 'Gray') {
  Write-Host $m -ForegroundColor $c
  try { Add-Content $Log ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding ASCII } catch {}
}
function Mask([string]$t) { ($t -replace '(rtsp://)[^@]+@', '$1***@') -replace 'password=[^&"#]+', 'password=***' }
function Frame-Bytes([string]$src) {
  try { return [int](Invoke-WebRequest -UseBasicParsing -TimeoutSec 25 -Uri ('http://127.0.0.1:1984/api/frame.jpeg?src=' + $src)).RawContentLength } catch { return 0 }
}
function Restart-Gateway {
  schtasks.exe /End /TN $GatewayTask 2>$null | Out-Null
  Get-Process go2rtc -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep 2
  schtasks.exe /Run /TN $GatewayTask 2>$null | Out-Null
}
# True when camera 7 AND the recorded cameras all deliver a real picture.
function Wait-Cameras([int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds); $last = ''
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 6
    $c7 = Frame-Bytes 'camera7'; $c4 = Frame-Bytes 'camera4'; $c8 = Frame-Bytes 'camera8'
    $last = 'camera7=' + $c7 + ' camera4=' + $c4 + ' camera8=' + $c8
    if ($c7 -gt 5000 -and $c4 -gt 5000 -and $c8 -gt 5000) { Say ('frames: ' + $last); return $true }
  }
  Say ('frames (last try): ' + $last) 'Yellow'
  return $false
}

Say 'ECHARPE Madinaty - camera 7 via NVR' 'Cyan'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Say 'Not Administrator.' 'Red'; exit 1 }

$cfg = Get-ChildItem $Root -Recurse -Filter 'go2rtc.runtime.yaml' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $cfg) { Say 'go2rtc.runtime.yaml not found - nothing changed.' 'Red'; exit 1 }
Say ('Config: ' + $cfg.FullName)
$bytes = [IO.File]::ReadAllBytes($cfg.FullName)
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
$text = [IO.File]::ReadAllText($cfg.FullName)
$nl = "`n"; if ($text.Contains("`r`n")) { $nl = "`r`n" }
$lines = $text -split "`r?`n"

function Find-Line([string]$name) { for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match ('^\s+' + $name + ':\s')) { return $i } }; return -1 }
$i5 = Find-Line 'camera5'; $i5l = Find-Line 'camera5_live'; $i7 = Find-Line 'camera7'; $i7l = Find-Line 'camera7_live'
if ($i5 -lt 0 -or $i5l -lt 0 -or $i7 -lt 0 -or $i7l -lt 0) { Say 'camera5 / camera7 lines not found in the config - nothing changed.' 'Red'; exit 1 }
if ($lines[$i5] -notmatch 'channel=5&' -or $lines[$i5l] -notmatch 'channel=5&') { Say 'camera5 is not an NVR channel=5 line - nothing changed.' 'Red'; exit 1 }
Say ('camera7 now      : ' + (Mask $lines[$i7]))
if ($lines[$i7] -match ('channel=' + $Channel + '&') -and $lines[$i7] -notmatch '192\.168\.0\.103') { Say 'camera7 already comes from the NVR - nothing to do.' 'Green'; exit 0 }

# Build the two camera7 lines from the camera5 lines: same NVR, same credentials, other channel.
$new7  = ($lines[$i5]  -replace '^(\s+)camera5:', '${1}camera7:')           -replace 'channel=5&', ('channel=' + $Channel + '&')
$new7l = ($lines[$i5l] -replace '^(\s+)camera5_live:', '${1}camera7_live:') -replace 'channel=5&', ('channel=' + $Channel + '&')
if ($new7 -notmatch '^\s+camera7:\s' -or $new7l -notmatch '^\s+camera7_live:\s') { Say 'Could not build the new lines - nothing changed.' 'Red'; exit 1 }
Say ('camera7 will be  : ' + (Mask $new7))

$before7 = Frame-Bytes 'camera7'
Say ('camera7 frame before: ' + $before7 + ' bytes')

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = $cfg.FullName + '.bak-camera7-' + $stamp
Copy-Item $cfg.FullName $bk -Force
Say ('Backup: ' + $bk)

$lines[$i7] = $new7; $lines[$i7l] = $new7l
[IO.File]::WriteAllText($cfg.FullName, ($lines -join $nl), (New-Object Text.UTF8Encoding($hasBom)))
Restart-Gateway
Say 'Gateway restarted. Waiting for real frames from camera 7, the cashier and the door (up to 90 s)...' 'Cyan'

if (-not (Wait-Cameras 90)) {
  Say 'Cameras did not all come back - ROLLING BACK.' 'Red'
  Copy-Item $bk $cfg.FullName -Force
  Restart-Gateway
  Start-Sleep 20
  Say ('after rollback: camera4=' + (Frame-Bytes 'camera4') + ' camera8=' + (Frame-Bytes 'camera8') + ' camera7=' + (Frame-Bytes 'camera7'))
  Say 'CAMERA7_VIA_NVR=FAILED_ROLLED_BACK' 'Red'
  exit 2
}
Say 'CAMERA7_VIA_NVR=OK' 'Green'
exit 0
