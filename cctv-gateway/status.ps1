# ECHARPE CCTV gateway - status (read-only, no admin needed)
# Prints the real state of every part: go2rtc, agent, recording, disk, tunnel.
# "Healthy" here means proven: a fresh segment on disk and a real answer from the agent,
# not just an open port.
# Usage:  powershell -ExecutionPolicy Bypass -File status.ps1 [-Root <install folder>] [-PublicUrl https://cctv-<branch>.example.com]
# ASCII only on purpose (Windows PowerShell 5.1).

param(
  [string]$Root = 'C:\ProgramData\ECHARPE\MadinatyCCTV',
  [string]$PublicUrl = ''
)
$ErrorActionPreference = 'SilentlyContinue'
$bad = 0
function Row([string]$name, [bool]$ok, [string]$detail) {
  if (-not $ok) { $script:bad++ }
  $mark = 'OK  '; $color = 'Green'
  if (-not $ok) { $mark = 'FAIL'; $color = 'Red' }
  Write-Host ('[' + $mark + '] ' + $name.PadRight(22) + $detail) -ForegroundColor $color
}
function Port([int]$p) { $c = New-Object Net.Sockets.TcpClient; try { $a = $c.BeginConnect('127.0.0.1', $p, $null, $null); if (-not $a.AsyncWaitHandle.WaitOne(1500, $false)) { return $false }; $c.EndConnect($a); return $true } catch { return $false } finally { $c.Close() } }
function Get-Json([string]$url, [int]$sec) { try { return (Invoke-WebRequest -UseBasicParsing -TimeoutSec $sec -Uri $url).Content | ConvertFrom-Json } catch { return $null } }

Write-Host ('ECHARPE CCTV status  ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $env:COMPUTERNAME) -ForegroundColor Cyan

# --- go2rtc -------------------------------------------------------------
$api = Port 1984
Row 'go2rtc api 1984' $api ''
Row 'go2rtc rtsp 8554' (Port 8554) ''
if ($api) {
  $streams = Get-Json 'http://127.0.0.1:1984/api/streams' 6
  foreach ($p in $streams.PSObject.Properties) {
    if ($p.Name -notmatch '_live$') { continue }
    $raw = ''
    try { $raw = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 12 -Uri ('http://127.0.0.1:1984/api/streams?src=' + [uri]::EscapeDataString($p.Name) + '&video=all')).Content } catch {}
    Row ('camera ' + $p.Name) ([bool]($raw -match '(?i)H264|H265|HEVC')) ''
  }
}

# --- agent / recorder ---------------------------------------------------
$agent = Port 1985
Row 'agent 1985' $agent ''
if ($agent) {
  $h = Get-Json 'http://127.0.0.1:1985/health' 20
  if ($h) {
    Row 'agent /health' ([bool]$h.ok) ('version=' + $h.version + ' staff=' + $h.activeStaffCount + ' detector=' + $h.detector)
  } else {
    Row 'agent /health' $false 'no answer in 20s'
  }
}
$segRoot = Join-Path $Root 'segments'
foreach ($dir in @(Get-ChildItem $segRoot -Directory)) {
  $cam = $dir.Name -replace '\D', ''
  $pattern = 'cam' + $cam + '-' + (Get-Date).ToString('yyyyMMdd-HH') + '*.ts'
  $last = Get-ChildItem $dir.FullName -Filter $pattern -File | Where-Object { $_.Length -gt 4096 } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($last) {
    $age = [int]((Get-Date) - $last.LastWriteTime).TotalSeconds
    Row ('recording ' + $dir.Name) ($age -le 60) ('last segment ' + $age + 's ago, ' + [int]($last.Length / 1KB) + ' KB')
  } else {
    Row ('recording ' + $dir.Name) $false 'no segment in the current hour'
  }
}

# --- disk ---------------------------------------------------------------
try {
  $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($Root))
  $free = [Math]::Round($drive.AvailableFreeSpace / 1GB, 1)
  Row 'disk free' ($free -ge 10) ($free.ToString() + ' GB free of ' + [Math]::Round($drive.TotalSize / 1GB) + ' GB')
} catch {}

# --- tunnel -------------------------------------------------------------
$svc = Get-Service | Where-Object { $_.Name -match '(?i)cloudflared' } | Select-Object -First 1
if ($svc) { Row 'cloudflared service' ($svc.Status -eq 'Running') ([string]$svc.Status + ' / ' + [string]$svc.StartType) }
else { Row 'cloudflared service' $false 'not installed as a service' }
if ($PublicUrl) {
  $r = Get-Json ($PublicUrl.TrimEnd('/') + '/echarpe-playback/alerts') 15
  Row 'public tunnel' ([bool]($r -and $r.ok)) $PublicUrl
}

Write-Host ''
if ($bad -eq 0) { Write-Host 'ALL OK' -ForegroundColor Green; exit 0 }
Write-Host ([string]$bad + ' problem(s) - see FAIL rows above') -ForegroundColor Red
exit 1
