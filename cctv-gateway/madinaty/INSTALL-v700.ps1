# ECHARPE Madinaty CCTV v700 - installer
# Run as Administrator (use 1-INSTALL-v700.cmd).
# - Copies the v700 supervisor, registers it as SYSTEM at startup.
# - Stops/disables the old self-heal tasks (v685, v686, v6861) so they do not fight.
# - Verifies v700 is running and the recorder (1985) comes back.
# - If v700 does not stay running, re-enables v6861 automatically.
# Does NOT touch: go2rtc config, gateway task, cloudflared, detector, POS, Office.
# ASCII only on purpose (Windows PowerShell 5.1).

$ErrorActionPreference = 'Stop'
$Root    = 'C:\ProgramData\ECHARPE\MadinatyCCTV'
$Source  = Join-Path $PSScriptRoot 'MADINATY-CCTV-SUPERVISOR-v700.ps1'
$Target  = Join-Path $Root 'MADINATY-CCTV-SUPERVISOR-v700.ps1'
$TaskNew = 'ECHARPE Madinaty CCTV Supervisor v700'
$OldTasks = @('ECHARPE Madinaty CCTV Self Heal v6861','ECHARPE Madinaty CCTV Self Heal v686','ECHARPE Madinaty CCTV Self Heal v685')
$Log     = Join-Path $Root 'logs\supervisor-v700.log'

function Line([string]$m, [string]$c = 'Gray') { Write-Host $m -ForegroundColor $c }
function Port([int]$p) { $c = New-Object Net.Sockets.TcpClient; try { $a = $c.BeginConnect('127.0.0.1', $p, $null, $null); if (-not $a.AsyncWaitHandle.WaitOne(1500, $false)) { return $false }; $c.EndConnect($a); return $true } catch { return $false } finally { $c.Close() } }
function Done([int]$code) { Write-Host ''; Read-Host 'ENTER to close'; exit $code }

Line 'ECHARPE Madinaty CCTV v700 installer' 'Cyan'

# ---- preflight ----
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Line 'Not running as Administrator. Right-click 1-INSTALL-v700.cmd > Run as administrator.' 'Red'; Done 1 }
if (-not (Test-Path $Root))   { Line ('Missing ' + $Root + ' - this is not the Madinaty CCTV PC.') 'Red'; Done 1 }
if (-not (Test-Path $Source)) { Line 'MADINATY-CCTV-SUPERVISOR-v700.ps1 is missing next to this installer.' 'Red'; Done 1 }
if (-not (Test-Path (Join-Path $Root 'ECHARPE-MADINATY-RECORDER.ps1'))) { Line 'Recorder script missing in ProgramData - stopping, nothing changed.' 'Red'; Done 1 }
$gw = Get-ScheduledTask -TaskName 'ECHARPE CCTV Gateway' -ErrorAction SilentlyContinue
if (-not $gw) { $gw = (cmd.exe /c 'schtasks.exe /Query /TN "ECHARPE CCTV Gateway" >nul 2>&1 && echo found') -eq 'found' }
if (-not $gw) { Line 'Gateway task "ECHARPE CCTV Gateway" not found - stopping, nothing changed.' 'Red'; Done 1 }

$tokens = $null; $errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($Source, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count) { $errors | Format-List; Line 'Syntax check failed - nothing changed.' 'Red'; Done 1 }

Line ('Gateway ports 1984/8554: ' + (Port 1984) + '/' + (Port 8554))
Line ('Recorder 1985 before: ' + (Port 1985))

# ---- install ----
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$bk = Join-Path $Root ('backup-before-v700-' + $stamp)
New-Item -ItemType Directory -Force -Path $bk | Out-Null
foreach ($t in $OldTasks) { try { Export-ScheduledTask -TaskName $t -ErrorAction Stop | Set-Content (Join-Path $bk ($t + '.xml')) -Encoding Unicode } catch {} }
Copy-Item $Source $Target -Force
Line ('Backup of old task definitions: ' + $bk)

$action    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Target + '"')
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskNew -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

# Stop the old self-heal BEFORE starting v700 so they never run together.
foreach ($t in $OldTasks) {
  try { Stop-ScheduledTask -TaskName $t -ErrorAction Stop } catch {}
  try { Disable-ScheduledTask -TaskName $t -ErrorAction Stop | Out-Null; Line ('Disabled old task: ' + $t) } catch {}
}
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -match '(?i)MADINATY-CCTV-SELF-HEAL-v68' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Line ('Stopped old self-heal process ' + $_.ProcessId) }

Start-ScheduledTask -TaskName $TaskNew
Line 'v700 started. Checking for 100 seconds...' 'Cyan'

$ok = $false; $rec = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep 5
  $state = (Get-ScheduledTask -TaskName $TaskNew).State
  $rec = Port 1985
  if ($state -eq 'Running' -and $rec) { $ok = $true; break }
}
$state = (Get-ScheduledTask -TaskName $TaskNew).State

if ($state -ne 'Running') {
  Line 'v700 did NOT stay running - restoring v6861.' 'Red'
  try { Stop-ScheduledTask -TaskName $TaskNew } catch {}
  try { Disable-ScheduledTask -TaskName $TaskNew | Out-Null } catch {}
  try { Enable-ScheduledTask -TaskName $OldTasks[0] | Out-Null; Start-ScheduledTask -TaskName $OldTasks[0]; Line 'v6861 restored.' 'Yellow' } catch {}
  Get-Content $Log -Tail 30 -ErrorAction SilentlyContinue
  Line 'MADINATY_CCTV_V700=FAILED_ROLLED_BACK' 'Red'
  Done 2
}

Write-Host ''
Line '=== v700 log ===' 'Cyan'
Get-Content $Log -Tail 25 -ErrorAction SilentlyContinue
Write-Host ''
Line ('Supervisor v700: ' + $state) 'Green'
Line ('Recorder 1985:   ' + $(if ($rec) { 'UP' } else { 'not up yet (v700 keeps trying every 2 min)' })) $(if ($rec) { 'Green' } else { 'Yellow' })
Line ('Gateway:         ' + $(if ((Port 1984) -and (Port 8554)) { 'UP' } else { 'DOWN' }))
$off = Get-Content $Log -ErrorAction SilentlyContinue | Select-String 'CAMERA_OFFLINE' | Select-Object -Last 4
if ($off) { Write-Host ''; Line 'Cameras not on the network (no longer restart the whole gateway):' 'Yellow'; $off | ForEach-Object { Line ('  ' + $_.Line) 'Yellow' } }
Write-Host ''
Line ('MADINATY_CCTV_V700=OK RECORDER=' + $(if ($rec) { 'UP' } else { 'PENDING' })) 'Green'
Line 'Next: run 2-FIX-CASHIER-CAMERA-v700.cmd to bring the cashier camera back.' 'Cyan'
Done 0
