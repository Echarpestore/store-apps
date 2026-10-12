# ECHARPE Madinaty CCTV - run the person detector without a console window (run as Administrator)
# The detector task starts python.exe, which opens a black console on the cashier's screen
# whenever it is (re)started. This switches the task to pythonw.exe (same interpreter, no window).
# Proof: the detector must publish a fresh state afterwards; otherwise the task is put back.
# ASCII only on purpose (Windows PowerShell 5.1).

$ErrorActionPreference = 'Stop'
$Root     = 'C:\ProgramData\ECHARPE\MadinatyCCTV'
$State    = Join-Path $Root 'activity\detector-state.json'
$Log      = Join-Path $Root 'logs\fix-detector-hidden.log'
$TaskName = 'ECHARPE Madinaty Person Detector'

function Say([string]$m, [string]$c = 'Gray') {
  Write-Host $m -ForegroundColor $c
  try { Add-Content $Log ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding ASCII } catch {}
}
function NowMs { [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }
function Stop-Detector {
  try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch {}
  Get-CimInstance Win32_Process | Where-Object { $_.Name -match '(?i)^pythonw?\.exe$' -and $_.CommandLine -match '(?i)PERSON-DETECTOR' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Wait-FreshState([long]$sinceMs, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep 5
    try { $s = Get-Content -LiteralPath $State -Raw | ConvertFrom-Json; if ([long]$s.generatedAtMs -gt $sinceMs) { return $s } } catch {}
  }
  return $null
}

Say 'ECHARPE Madinaty detector - hidden window' 'Cyan'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Say 'Not Administrator.' 'Red'; exit 1 }
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) { Say 'Detector task not found - nothing changed.' 'Red'; exit 1 }
$old = $task.Actions[0]
$exe = [string]$old.Execute
Say ('Current action: ' + $exe + ' ' + $old.Arguments)
if ($exe -match '(?i)pythonw\.exe"?$') { Say 'Already pythonw - nothing to do.' 'Green'; exit 0 }
if ($exe -notmatch '(?i)python\.exe"?$') { Say 'Task does not start python.exe - nothing changed.' 'Red'; exit 1 }
$newExe = ($exe.Trim('"') -replace '(?i)python\.exe$', 'pythonw.exe')
if (-not (Test-Path -LiteralPath $newExe)) { Say ('pythonw.exe not found next to python.exe: ' + $newExe + ' - nothing changed.') 'Red'; exit 1 }

$newAction = New-ScheduledTaskAction -Execute $newExe -Argument $old.Arguments
if ($old.WorkingDirectory) { $newAction = New-ScheduledTaskAction -Execute $newExe -Argument $old.Arguments -WorkingDirectory $old.WorkingDirectory }

Stop-Detector
Start-Sleep 2
Set-ScheduledTask -TaskName $TaskName -Action $newAction | Out-Null
$since = NowMs
Start-ScheduledTask -TaskName $TaskName
Say 'Task switched to pythonw. Waiting for a fresh detector state (up to 2 min)...' 'Cyan'

$s = Wait-FreshState $since 120
if (-not $s) {
  Say 'No fresh state with pythonw - putting python.exe back.' 'Red'
  Stop-Detector
  Start-Sleep 2
  Set-ScheduledTask -TaskName $TaskName -Action $old | Out-Null
  $since = NowMs
  Start-ScheduledTask -TaskName $TaskName
  $back = Wait-FreshState $since 120
  Say ('DETECTOR_HIDDEN=FAILED_ROLLED_BACK oldBack=' + [bool]$back) 'Red'
  exit 2
}
$visible = @(Get-Process | Where-Object { $_.ProcessName -match '(?i)^python$' -and $_.MainWindowHandle -ne 0 }).Count
Say ('Fresh state: liveness=' + $s.livenessVersion + ' customersInside=' + $s.customersInside + ' online=' + (@($s.onlineCameras) -join ',') + ' consoleWindows=' + $visible)
Say 'DETECTOR_HIDDEN=OK' 'Green'
exit 0
