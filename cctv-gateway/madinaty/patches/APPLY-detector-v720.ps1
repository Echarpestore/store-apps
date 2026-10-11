# ECHARPE Madinaty CCTV - person detector v720 (run as Administrator)
# Installs the liveness correction: ECHARPE-MADINATY-PERSON-DETECTOR.py + echarpe_liveness.py.
# - Refuses to run unless the installed detector is the exact v662/v664 file this was built on.
# - Backs up first, restarts only the detector (not the recorder, gateway, tunnel or POS).
# - Proof, not "process is running": the detector must publish a fresh state that carries
#   livenessVersion=720. If it does not within 2 minutes, the old file is restored.
# ASCII only on purpose (Windows PowerShell 5.1).

$ErrorActionPreference = 'Stop'
$Root     = 'C:\ProgramData\ECHARPE\MadinatyCCTV'
$Target   = Join-Path $Root 'ECHARPE-MADINATY-PERSON-DETECTOR.py'
$Module   = Join-Path $Root 'echarpe_liveness.py'
$State    = Join-Path $Root 'activity\detector-state.json'
$Log      = Join-Path $Root 'logs\apply-detector-v720.log'
$TaskName = 'ECHARPE Madinaty Person Detector'
$BaseHash = '8AB1582CB212DA365EB0C3ADF68BA3545D9392DFBC03783EE68169ED2275B800'
$NewHash  = '52B862138A7D7241BFB42099566831B8E4CCB63966BE4726A33612B87FA7182E'
$SrcDet   = Join-Path $PSScriptRoot 'ECHARPE-MADINATY-PERSON-DETECTOR.py'
$SrcMod   = Join-Path $PSScriptRoot 'echarpe_liveness.py'

function Say([string]$m, [string]$c = 'Gray') {
  Write-Host $m -ForegroundColor $c
  try { Add-Content $Log ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding ASCII } catch {}
}
function Hash([string]$p) { (Get-FileHash $p -Algorithm SHA256).Hash }
function Stop-Detector {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
  Get-CimInstance Win32_Process | Where-Object { $_.Name -match '(?i)^python' -and $_.CommandLine -match '(?i)PERSON-DETECTOR' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Start-Detector { try { Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch { Say ('start task failed: ' + $_.Exception.Message) 'Yellow' } }
function Read-State {
  try { return (Get-Content -LiteralPath $State -Raw | ConvertFrom-Json) } catch { return $null }
}
# True when the detector published a state newer than $sinceMs. $needLiveness also requires v720.
function Wait-State([long]$sinceMs, [bool]$needLiveness, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 5
    $s = Read-State
    if ($s -and [long]$s.generatedAtMs -gt $sinceMs) {
      if (-not $needLiveness) { return $s }
      if ([int]$s.livenessVersion -eq 720) { return $s }
    }
  }
  return $null
}
function NowMs { [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }

Say 'ECHARPE Madinaty detector v720' 'Cyan'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Say 'Not Administrator.' 'Red'; exit 1 }
foreach ($p in @($Target, $SrcDet, $SrcMod)) { if (-not (Test-Path $p)) { Say ('Missing ' + $p) 'Red'; exit 1 } }
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) { Say ('Task not found: ' + $TaskName + ' - nothing changed.') 'Red'; exit 1 }
if ((Hash $SrcDet) -ne $NewHash) { Say 'Package detector file is not the tested one - nothing changed.' 'Red'; exit 1 }
$cur = Hash $Target
if ($cur -eq $NewHash) { Say 'Already v720 - nothing to do.' 'Green'; exit 0 }
if ($cur -ne $BaseHash) { Say ('Installed detector is not the expected version - nothing changed. hash=' + $cur.Substring(0, 12)) 'Red'; exit 1 }

$before = Read-State
if ($before) { Say ('Before: customersInside=' + $before.customersInside + ' doorEntries=' + $before.doorEntries + ' doorExits=' + $before.doorExits) }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $Root ('backup-before-detector-v720-' + $stamp)
New-Item -ItemType Directory -Force -Path $bk | Out-Null
Copy-Item $Target (Join-Path $bk 'ECHARPE-MADINATY-PERSON-DETECTOR.py') -Force
Say ('Backup: ' + $bk)

Stop-Detector
Start-Sleep 2
Copy-Item $SrcMod $Module -Force
Copy-Item $SrcDet $Target -Force
$since = NowMs
Start-Detector
Say 'Detector restarted on v720. Waiting for a fresh state with livenessVersion=720 (up to 2 min)...' 'Cyan'

$s = Wait-State $since $true 120
if (-not $s) {
  Say 'No v720 state published - ROLLING BACK.' 'Red'
  Stop-Detector
  Start-Sleep 2
  Copy-Item (Join-Path $bk 'ECHARPE-MADINATY-PERSON-DETECTOR.py') $Target -Force
  $since = NowMs
  Start-Detector
  $old = Wait-State $since $false 120
  Get-Content (Join-Path $Root 'logs\detector.log') -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { Say ('detector.log: ' + $_) }
  Say ('MADINATY_DETECTOR_V720=FAILED_ROLLED_BACK oldDetectorBack=' + [bool]$old) 'Red'
  exit 2
}
Say ('After: customersInside=' + $s.customersInside + ' alivePeople=' + $s.alivePeople + ' emptyHeldSeconds=' + $s.emptyHeldSeconds + ' cameraPeople=' + ($s.cameraPeople | ConvertTo-Json -Compress))
Say 'MADINATY_DETECTOR_V720=OK' 'Green'
exit 0
