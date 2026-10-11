# ECHARPE Madinaty CCTV Supervisor v700
# Replaces Self-Heal v6861. Runs as SYSTEM (scheduled task, at startup).
#
# Why v700:
#  v6861 treated "one camera down" as "gateway broken" and restarted go2rtc
#  every ~2 minutes (428 restarts in 16 hours on 2026-10-08/09 while camera 4
#  at 192.168.0.102 was off the network). Every restart dropped ALL cameras.
#  It also skipped the recorder check whenever any camera was down, so the
#  recorder (port 1985) stayed stopped since 2026-10-02.
#
# v700 rules:
#  1) A camera whose device is unreachable is reported as CAMERA_OFFLINE.
#     It never causes a gateway restart.
#  2) The gateway is restarted only when its own ports are dead, or when a
#     camera that IS reachable fails to stream for 3 probe rounds.
#     Max 3 gateway restarts per hour, at least 10 minutes apart.
#  3) Recorder/agent (1985) and the tunnel are checked independently of cameras.
# ASCII only on purpose (Windows PowerShell 5.1).

$ErrorActionPreference = 'SilentlyContinue'

$Root        = 'C:\ProgramData\ECHARPE\MadinatyCCTV'
$Recorder    = Join-Path $Root 'ECHARPE-MADINATY-RECORDER.ps1'
$GatewayTask = 'ECHARPE CCTV Gateway'
$LogDir      = Join-Path $Root 'logs'
$Log         = Join-Path $LogDir 'supervisor-v700.log'
$StatusFile  = Join-Path $Root 'cctv-status-v700.json'
$PublicUrl   = 'https://cctv-madinaty.echarpe.store/echarpe-playback/range?camera=8'

$CycleSec              = 20
$ProbeEveryCycles      = 3        # live probes every 60 s
$GatewayPortFailLimit  = 3        # 3 cycles = 60 s
$GatewaySuspectRounds  = 3        # 3 probe rounds = 3 min, camera reachable but no video
$GatewayCooldownMs     = 600000   # 10 min between gateway restarts
$GatewayMaxPerHour     = 3
$RecorderFailLimit     = 2        # 40 s with 1985 closed
$RecorderCooldownMs    = 120000
$StaleSegmentSec       = 300      # recorder running but no new segment for 5 min
$StaleCooldownMs       = 600000
$PublicFailLimit       = 4
$TunnelCooldownMs      = 300000

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$m) {
  try {
    if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 3145728) {
      Get-Content $Log -Tail 1500 | Set-Content ($Log + '.tmp') -Encoding ASCII
      Move-Item ($Log + '.tmp') $Log -Force
    }
    Add-Content $Log ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding ASCII
  } catch {}
}
function NowMs { [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }

function Test-Tcp([string]$hostName, [int]$port, [int]$ms) {
  $c = New-Object Net.Sockets.TcpClient
  try {
    $a = $c.BeginConnect($hostName, $port, $null, $null)
    if (-not $a.AsyncWaitHandle.WaitOne($ms, $false)) { return $false }
    $c.EndConnect($a); return $true
  } catch { return $false } finally { $c.Close() }
}
# A device counts as reachable if it answers on 554 twice out of three tries.
function Test-Device([string]$ip) {
  $ok = 0
  for ($i = 0; $i -lt 3; $i++) { if (Test-Tcp $ip 554 1200) { $ok++ }; if ($ok -ge 2) { return $true } }
  return $false
}

# --- go2rtc ---------------------------------------------------------------
# Returns @{ name = host } for every *_live stream (host taken from the producer URL).
function Get-LiveStreams {
  $map = [ordered]@{}
  try {
    $raw = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:1984/api/streams' -TimeoutSec 6).Content
    $obj = $raw | ConvertFrom-Json
    foreach ($p in $obj.PSObject.Properties) {
      if ($p.Name -notmatch '_live$') { continue }
      $url = ''
      try { $url = [string]$p.Value.producers[0].url } catch {}
      $m = [regex]::Match($url, '@(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):')
      $map[$p.Name] = $(if ($m.Success) { $m.Groups[1].Value } else { '' })
    }
  } catch {}
  return $map
}
function Probe-Stream([string]$name) {
  try {
    $u = 'http://127.0.0.1:1984/api/streams?src=' + [uri]::EscapeDataString($name) + '&video=all'
    $raw = (Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 10).Content
    return [bool]($raw -match '(?i)H264|H265|HEVC')
  } catch { return $false }
}

# --- pure decision logic (unit-tested) ------------------------------------
# camState values: 'ok' | 'offline' (device unreachable) | 'nostream' (device reachable, no video)
# Returns 'restart' | 'suppressed' | 'none'
function Get-GatewayDecision([bool]$portsOk, [int]$portFails, [hashtable]$suspectRounds, [long]$now, [long]$lastRestart, [long[]]$recentRestarts) {
  $need = $false
  if (-not $portsOk -and $portFails -ge $GatewayPortFailLimit) { $need = $true }
  foreach ($k in @($suspectRounds.Keys)) { if ([int]$suspectRounds[$k] -ge $GatewaySuspectRounds) { $need = $true } }
  if (-not $need) { return 'none' }
  $inHour = @($recentRestarts | Where-Object { ($now - $_) -lt 3600000 }).Count
  if (($now - $lastRestart) -lt $GatewayCooldownMs) { return 'suppressed' }
  if ($inHour -ge $GatewayMaxPerHour) { return 'suppressed' }
  return 'restart'
}

# Classify one camera. Unreachable device = 'offline' (never a gateway problem).
function Get-CameraState([bool]$probeOk, [string]$ip, [bool]$reachable) {
  if ($probeOk) { return 'ok' }
  if ($ip -and -not $reachable) { return 'offline' }
  return 'nostream'
}
# Next suspect-round count for one camera (only 'nostream' accumulates).
function Get-NextSuspect([string]$state, [int]$current) { if ($state -eq 'nostream') { return $current + 1 } else { return 0 } }

# --- actions ----------------------------------------------------------------
function Restart-Gateway {
  Log 'ACTION=RESTART_GATEWAY'
  schtasks.exe /End /TN $GatewayTask 2>$null | Out-Null
  Get-Process go2rtc -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep 2
  schtasks.exe /Run /TN $GatewayTask 2>$null | Out-Null
}
function Get-RecorderProcs {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'powershell.exe' -and $_.CommandLine -match '(?i)ECHARPE-MADINATY-RECORDER\.ps1'
  })
}
function Start-RecorderAgent([string]$why) {
  Log ('ACTION=START_RECORDER reason=' + $why)
  foreach ($p in (Get-RecorderProcs)) { Stop-Process -Id $p.ProcessId -Force }
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'ffmpeg.exe' -and $_.CommandLine -match '(?i)segments\\camera[48]'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep 2
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$Recorder
  ) | Out-Null
}
function Get-SegmentAgeSec([int]$cam) {
  $f = Get-ChildItem (Join-Path $Root ('segments\camera' + $cam)) -Filter '*.ts' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -ge 4096 } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $f) { return 999999 }
  return [int]((Get-Date) - $f.LastWriteTime).TotalSeconds
}
function Test-Public {
  try {
    $req = [System.Net.HttpWebRequest]::Create($PublicUrl)
    $req.Method = 'GET'; $req.Timeout = 12000; $req.ReadWriteTimeout = 12000
    $req.UserAgent = 'ECHARPE-CCTV-Supervisor-v700'
    try { $req.AddRange(0, 0) } catch {}
    $resp = $req.GetResponse(); $code = [int]$resp.StatusCode; $resp.Close()
    return ($code -ge 200 -and $code -lt 500)
  } catch [System.Net.WebException] {
    try { if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode; $_.Exception.Response.Close(); return ($code -ge 200 -and $code -lt 500) } } catch {}
    return $false
  } catch { return $false }
}
function Restart-Tunnel {
  $svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '(?i)cloudflared' -or $_.DisplayName -match '(?i)cloudflared' } | Select-Object -First 1
  if ($svc) { Log ('ACTION=RESTART_TUNNEL service=' + $svc.Name); Restart-Service -Name $svc.Name -Force }
  else { Log 'ACTION=RESTART_TUNNEL skipped_no_service' }
}
function Write-Status($obj) {
  try { ($obj | ConvertTo-Json -Depth 5 -Compress) | Set-Content ($StatusFile + '.tmp') -Encoding ASCII; Move-Item ($StatusFile + '.tmp') $StatusFile -Force } catch {}
}

# Test hook: dot-sourcing with ECHARPE_V700_TEST=1 loads functions only.
if ($env:ECHARPE_V700_TEST -eq '1') { return }

$Mutex = New-Object Threading.Mutex($false, 'Global\ECHARPE_MADINATY_CCTV_SUPERVISOR_V700')
$locked = $false
try { $locked = $Mutex.WaitOne(0, $false) } catch { $locked = $true }
if (-not $locked) { exit 0 }

try {
  Log 'START v700'
  $cycle = 0
  $portFails = 0; $lastGatewayRestart = 0L; $recentRestarts = @()
  $suspect = @{}; $camState = @{}; $camSince = @{}; $lastReminder = @{}
  $recFails = 0; $lastRecorderStart = 0L; $lastStaleRestart = 0L
  $pubFails = 0; $lastTunnelRestart = 0L

  while ($true) {
   try {
    $now = NowMs

    # 1) gateway process ports
    $portsOk = (Test-Tcp '127.0.0.1' 1984 1500) -and (Test-Tcp '127.0.0.1' 8554 1500)
    if ($portsOk) { if ($portFails -gt 0) { Log 'GATEWAY_PORTS_RECOVERED' }; $portFails = 0 }
    else { $portFails++; Log ('GATEWAY_PORTS_DOWN n=' + $portFails) }

    # 2) cameras, one by one (every 60 s)
    if ($portsOk -and ($cycle % $ProbeEveryCycles -eq 0)) {
      $streams = Get-LiveStreams
      foreach ($name in @($streams.Keys)) {
        $ip = [string]$streams[$name]
        $probeOk = Probe-Stream $name
        $reach = $true
        if (-not $probeOk -and $ip) { $reach = Test-Device $ip }
        $state = Get-CameraState $probeOk $ip $reach
        $prev = [string]$camState[$name]
        if ($state -ne $prev) {
          $camSince[$name] = $now; $lastReminder[$name] = $now
          if ($state -eq 'ok')       { Log ('CAMERA_OK ' + $name + ' ip=' + $ip) }
          if ($state -eq 'offline')  { Log ('CAMERA_OFFLINE ' + $name + ' ip=' + $ip + ' device_not_on_network NO_GATEWAY_RESTART') }
          if ($state -eq 'nostream') { Log ('CAMERA_NO_VIDEO ' + $name + ' ip=' + $ip + ' device_reachable') }
        } elseif ($state -eq 'offline' -and ($now - [long]$lastReminder[$name]) -ge 1800000) {
          Log ('CAMERA_STILL_OFFLINE ' + $name + ' ip=' + $ip + ' minutes=' + [int](($now - [long]$camSince[$name]) / 60000))
          $lastReminder[$name] = $now
        }
        $camState[$name] = $state
        $suspect[$name] = Get-NextSuspect $state ([int]$suspect[$name])
      }
    }

    $decision = Get-GatewayDecision $portsOk $portFails $suspect $now $lastGatewayRestart ([long[]]$recentRestarts)
    if ($decision -eq 'restart') {
      # State first, action second: a failing action can never bypass the cooldown.
      $lastGatewayRestart = $now; $recentRestarts = @(@($recentRestarts) + $now | Where-Object { ($now - $_) -lt 3600000 })
      $portFails = 0; foreach ($k in @($suspect.Keys)) { $suspect[$k] = 0 }
      try { Restart-Gateway } catch { Log ('RESTART_GATEWAY_ERROR ' + $_.Exception.Message) }
      Start-Sleep 15; $cycle++; continue
    } elseif ($decision -eq 'suppressed' -and ($cycle % 15 -eq 0)) {
      Log 'GATEWAY_RESTART_SUPPRESSED cooldown_or_hourly_limit'
    }

    # 3) recorder / local agent 1985 - independent of camera state
    $agentUp = Test-Tcp '127.0.0.1' 1985 1500
    if ($agentUp) { if ($recFails -gt 0) { Log 'RECORDER_AGENT_RECOVERED' }; $recFails = 0 }
    else { $recFails++; if ($recFails -eq 1 -or $recFails % 15 -eq 0) { Log ('RECORDER_AGENT_DOWN n=' + $recFails) } }
    if (-not $agentUp -and $recFails -ge $RecorderFailLimit -and ($now - $lastRecorderStart) -ge $RecorderCooldownMs) {
      $lastRecorderStart = $now; $recFails = 0
      try { Start-RecorderAgent 'port_1985_closed' } catch { Log ('START_RECORDER_ERROR ' + $_.Exception.Message) }
    }
    # Grace: never judge segments within 5 min of any recorder start (old files are still the newest).
    if ($agentUp -and $portsOk -and ($now - $lastRecorderStart) -ge ($StaleSegmentSec * 1000)) {
      # Only judge segments for cameras that are streaming right now.
      $stale = @()
      if ([string]$camState['camera8_live'] -eq 'ok' -and (Get-SegmentAgeSec 8) -gt $StaleSegmentSec) { $stale += 'camera8' }
      if ([string]$camState['camera4_live'] -eq 'ok' -and (Get-SegmentAgeSec 4) -gt $StaleSegmentSec) { $stale += 'camera4' }
      if ($stale.Count -gt 0 -and ($now - $lastStaleRestart) -ge $StaleCooldownMs) {
        $lastStaleRestart = $now; $lastRecorderStart = $now
        try { Start-RecorderAgent ('stale_segments ' + ($stale -join ',')) } catch { Log ('START_RECORDER_ERROR ' + $_.Exception.Message) }
      }
    }

    # 4) public tunnel (needs 1985 up, because the public check goes through it)
    if ($agentUp) {
      if (Test-Public) { if ($pubFails -gt 0) { Log 'PUBLIC_RECOVERED' }; $pubFails = 0 }
      else { $pubFails++; Log ('PUBLIC_BAD n=' + $pubFails) }
      if ($pubFails -ge $PublicFailLimit -and ($now - $lastTunnelRestart) -ge $TunnelCooldownMs) {
        $lastTunnelRestart = $now; $pubFails = 0
        try { Restart-Tunnel } catch { Log ('RESTART_TUNNEL_ERROR ' + $_.Exception.Message) }
      }
    }

    # 5) status file (for diagnostics / Office later)
    if ($cycle % $ProbeEveryCycles -eq 0) {
      $cams = @{}
      foreach ($k in @($camState.Keys)) { $cams[$k] = @{ state = [string]$camState[$k]; sinceMs = [long]$camSince[$k] } }
      Write-Status @{ version = 700; atMs = $now; gatewayPorts = $portsOk; recorderAgent = $agentUp; publicFails = $pubFails;
                      seg4AgeSec = (Get-SegmentAgeSec 4); seg8AgeSec = (Get-SegmentAgeSec 8);
                      gatewayRestartsLastHour = @($recentRestarts | Where-Object { ($now - $_) -lt 3600000 }).Count; cameras = $cams }
    }

   } catch {
    Log ('LOOP_ERROR ' + $_.Exception.Message)
   }
    $cycle++
    Start-Sleep $CycleSec
  }
} finally {
  if ($locked) { try { $Mutex.ReleaseMutex() } catch {} }
  $Mutex.Dispose()
}
