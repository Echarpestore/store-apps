param([int]$Port = 1985)

$ErrorActionPreference = 'Stop'
$Root = 'C:\ProgramData\ECHARPE\MadinatyCCTV'
$SegmentsRoot = Join-Path $Root 'segments'
$Segments = Join-Path $SegmentsRoot 'camera4'
$Segments8 = Join-Path $SegmentsRoot 'camera8'
$Cache = Join-Path $Root 'cache'
$Logs = Join-Path $Root 'logs'
$Data = Join-Path $Root 'activity'
$Ffmpeg = Join-Path $Root 'ffmpeg.exe'
$Ffprobe = Join-Path $Root 'ffprobe.exe'
$RecorderPid = Join-Path $Root 'recorder.pid'
$RecorderPid8 = Join-Path $Root 'recorder8.pid'
$DetectorPid = Join-Path $Root 'detector.pid'
$SalesFile = Join-Path $Data 'sales.json'
$PendingFile = Join-Path $Data 'pending.json'
$AlertsFile = Join-Path $Data 'alerts.json'
$DetectorStateFile = Join-Path $Data 'detector-state.json'
$StaffStateFile = Join-Path $Data 'staff-state.json'
$StaffSourcesFile = Join-Path $Data 'staff-sources.json'
$SignalsFile = Join-Path $Data 'signals.json'
$Stream = 'rtsp://127.0.0.1:8554/camera4_live'
$Stream8 = 'rtsp://127.0.0.1:8554/camera8_live'
$RetentionHours = 168
$MinFreeGB = 15
# Segments written after this moment are H264 (v711+); ffprobe is not installed on this PC.
$H264Since = [datetime]'2026-10-11T08:24:00'
$MinimumSegmentBytes = 4096
$FreshSegmentSeconds = 60
$RecorderStartupGraceSeconds = 45
$RecorderRestartCooldownSeconds = 20
$script:LastRecorderStartAttempt = [datetime]::MinValue
$script:LastRecorder8StartAttempt = [datetime]::MinValue

New-Item -ItemType Directory -Force -Path $Segments,$Segments8,$Cache,$Logs,$Data | Out-Null

function Load-JsonArray([string]$Path) {
  try { if(Test-Path -LiteralPath $Path){$x=Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json;return @($x)} } catch {}
  return @()
}
function Save-JsonArray([string]$Path,$Items) { $json=ConvertTo-Json -InputObject @($Items) -Compress -Depth 8;Set-Content -LiteralPath $Path -Value $json -Encoding UTF8 }
function Save-StaffSource($Body) {
  $source=[string]$Body.source;if(-not $source){$source='sales_fallback'}
  if($source -notin @('pos_firestore','sales_fallback')){throw 'invalid_staff_source'}
  $now=[DateTimeOffset]::Now.ToUnixTimeMilliseconds();$generated=[long]$Body.generatedAtMs
  if($generated -le 0 -or [Math]::Abs($now-$generated) -gt 300000L){throw 'invalid_staff_timestamp'}
  $rows=@(Load-JsonArray $StaffSourcesFile|Where-Object{[string]$_.source -ne $source -and [long]$_.generatedAtMs -gt ($now-600000L)})
  $rows+=@{source=$source;sourceHealthy=($Body.sourceHealthy -ne $false);branch='madinaty';generatedAtMs=$generated;clockedInCount=[int]$Body.clockedInCount;openBreakCount=[int]$Body.openBreakCount;activeStaffCount=[int]$Body.activeStaffCount;employeeIds=@($Body.employeeIds);employees=@($Body.employees)}
  Save-JsonArray $StaffSourcesFile $rows
  $selected=Get-StaffState
  $selected|ConvertTo-Json -Compress -Depth 6|Set-Content -LiteralPath $StaffStateFile -Encoding UTF8
}
function Get-StaffState {
  $now=[DateTimeOffset]::Now.ToUnixTimeMilliseconds();$fresh=@(Load-JsonArray $StaffSourcesFile|Where-Object{$_.sourceHealthy -ne $false -and [long]$_.generatedAtMs -le ($now+30000L) -and [long]$_.generatedAtMs -ge ($now-90000L)})
  $selected=$fresh|Where-Object{[string]$_.source -eq 'pos_firestore'}|Sort-Object generatedAtMs -Descending|Select-Object -First 1
  if(-not $selected){$selected=$fresh|Where-Object{[string]$_.source -eq 'sales_fallback'}|Sort-Object generatedAtMs -Descending|Select-Object -First 1}
  if(-not $selected){return [pscustomobject]@{source='none';sourceHealthy=$false;generatedAtMs=0;activeStaffCount=0;clockedInCount=0;openBreakCount=0;employeeIds=@();employees=@()}}
  return $selected
}
function Read-JsonBody($Context) { $reader=New-Object IO.StreamReader($Context.Request.InputStream,$Context.Request.ContentEncoding);try{$raw=$reader.ReadToEnd();if(-not $raw){return $null};return $raw|ConvertFrom-Json}finally{$reader.Dispose()} }
function Get-DetectorProcess {
  try { if(-not(Test-Path -LiteralPath $DetectorPid)){return $null};$id=[int](Get-Content -LiteralPath $DetectorPid -Raw);$p=Get-Process -Id $id -ErrorAction Stop;if($p.HasExited){return $null};return $p } catch{return $null}
}
function Add-SaleEvent($Body) {
  $at=[long]$Body.atMs;if($at -le 0){$at=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()}
  $rows=@(Load-JsonArray $SalesFile|Where-Object{[long]$_.atMs -gt ([DateTimeOffset]::Now.AddDays(-8).ToUnixTimeMilliseconds())})
  if(-not($rows|Where-Object{[string]$_.invoiceCode -eq [string]$Body.invoiceCode -and [long]$_.atMs -eq $at})){$rows+=@{atMs=$at;invoiceCode=[string]$Body.invoiceCode}}
  Save-JsonArray $SalesFile $rows
  # A sale/return with no recently qualified customer is itself a strong review event.
  try {
    $state=$null;if(Test-Path -LiteralPath $DetectorStateFile){$state=Get-Content -LiteralPath $DetectorStateFile -Raw|ConvertFrom-Json}
    $fresh=$state -and ([Math]::Abs($at-[long]$state.generatedAtMs) -le 15000) -and $state.attendanceFresh -and $state.camera4Online -and $state.camera8Online
    $customerRecent=$state -and [long]$state.lastCustomerAtMs -gt 0 -and ($at-[long]$state.lastCustomerAtMs) -le 45000
    if($fresh -and -not $customerRecent){
      $alerts=@(Load-JsonArray $AlertsFile);$id='sale_no_customer_'+[string]$at
      if(-not($alerts|Where-Object{[string]$_.id -eq $id})){
        $kind=[string]$Body.transactionKind;if(-not $kind){$kind='sale'}
        $marker=@{atMs=$at;kind='sale_without_customer';label=$(if($kind -eq 'return_or_exchange'){'Return or exchange without visible customer'}else{'Sale without visible customer'});severity='high';cart=@()}
        $alerts+=@{id=$id;type='sale_without_customer';severity='high';atMs=$at;startMs=[Math]::Max(1,$at-30000);durationSec=90;cameras=@(4,8);audioCamera=0;invoiceCode=[string]$Body.invoiceCode;invoiceNo=[string]$Body.invoiceNo;transactionKind=$kind;events=@($marker);createdAtMs=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()}
        Save-JsonArray $AlertsFile @($alerts|Sort-Object atMs -Descending|Select-Object -First 200)
      }
    }
  } catch { Write-Log ('sale_presence_check_failed '+$_.Exception.Message) }
}
function Add-SessionSignal($Body) {
  $at=[long]$Body.atMs;if($at -le 0){$at=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()}
  $rows=@(Load-JsonArray $SignalsFile|Where-Object{[long]$_.atMs -gt ([DateTimeOffset]::Now.AddHours(-12).ToUnixTimeMilliseconds())})
  $rows+=@{atMs=$at;sessionId=[string]$Body.sessionId;sid=[string]$Body.sid;kind=[string]$Body.kind;qty=[double]$Body.qty;cart=@($Body.cart);total=[double]$Body.total}
  Save-JsonArray $SignalsFile @($rows|Sort-Object atMs|Select-Object -Last 1000)
}
function Add-ActivityCandidate($Body) {
  $start=[long]$Body.startMs;$end=[long]$Body.endMs;if($start -le 0 -or $end -lt $start){throw 'invalid_activity_window'}
  $id=[string]$Body.id;if(-not $id){$id='cashier_'+[string]$start}
  $rows=@(Load-JsonArray $PendingFile);if(-not($rows|Where-Object{[string]$_.id -eq $id})){$rows+=@{id=$id;startMs=$start;endMs=$end;reviewAfterMs=$end+180000L;staffCount=[int]$Body.staffCount;camera4Count=[int]$Body.camera4Count;camera8Count=[int]$Body.camera8Count;confidence=[double]$Body.confidence;createdAtMs=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()};Save-JsonArray $PendingFile $rows}
}
function Process-ActivityCandidates {
  $now=[DateTimeOffset]::Now.ToUnixTimeMilliseconds();$pending=@(Load-JsonArray $PendingFile);if(-not $pending.Count){return}
  $sales=@(Load-JsonArray $SalesFile);$signals=@(Load-JsonArray $SignalsFile);$alerts=@(Load-JsonArray $AlertsFile);$keep=@()
  foreach($item in $pending){
    if([long]$item.reviewAfterMs -gt $now){$keep+=$item;continue}
    $matched=@($sales|Where-Object{[long]$_.atMs -ge [long]$item.startMs -and [long]$_.atMs -le ([long]$item.endMs+180000L)}).Count -gt 0
    $sessionSignals=@($signals|Where-Object{[long]$_.atMs -ge ([long]$item.startMs-5000) -and [long]$_.atMs -le ([long]$item.endMs+180000)})
    $strong=@($sessionSignals|Where-Object{[string]$_.kind -in @('item_removed','qty_decreased','remove','drawer')})
    $cartMoves=@($sessionSignals|Where-Object{[string]$_.kind -in @('item_added','qty_increased','qty_decreased','item_removed','cart_edited','remove')}).Count
    if(-not $matched -and ($strong.Count -gt 0 -or $cartMoves -ge 3) -and -not($alerts|Where-Object{[string]$_.id -eq [string]$item.id})){
      $events=@();foreach($sig in $sessionSignals){$signalKind=[string]$sig.kind;$label='Cart activity';if($signalKind -in @('item_removed','remove')){$label='Item removed'}elseif($signalKind -eq 'qty_decreased'){$label='Quantity decreased'}elseif($signalKind -eq 'drawer'){$label='Manual drawer open'};$severity=$(if($signalKind -in @('item_removed','qty_decreased','remove','drawer')){'high'}else{'context'});$events+=@{atMs=[long]$sig.atMs;kind=$signalKind;label=$label;severity=$severity;cart=@($sig.cart);total=[double]$sig.total}}
      $dur=[Math]::Min(900,[Math]::Max(60,[Math]::Ceiling(([long]$item.endMs-[long]$item.startMs)/1000)+60));$alerts+=@{id=[string]$item.id;type='strong_activity_no_sale';severity='high';atMs=[long]$item.startMs;startMs=[Math]::Max(1,[long]$item.startMs-30000L);durationSec=[int]$dur;cameras=@(4,8);audioCamera=0;staffCount=[int]$item.staffCount;camera4Count=[int]$item.camera4Count;camera8Count=[int]$item.camera8Count;confidence=[double]$item.confidence;events=@($events);createdAtMs=$now}
    }
  }
  $cut=[DateTimeOffset]::Now.AddDays(-7).ToUnixTimeMilliseconds();$alerts=@($alerts|Where-Object{[long]$_.atMs -gt $cut}|Sort-Object atMs -Descending|Select-Object -First 200);Save-JsonArray $PendingFile $keep;Save-JsonArray $AlertsFile $alerts
}

function Write-Log([string]$Message) {
  try { Add-Content -LiteralPath (Join-Path $Logs 'agent.log') -Value ((Get-Date).ToString('s') + ' ' + $Message) -Encoding UTF8 } catch {}
}

function Get-RecorderProcess {
  try {
    if (-not (Test-Path -LiteralPath $RecorderPid)) { return $null }
    $id = [int](Get-Content -LiteralPath $RecorderPid -Raw)
    $p = Get-Process -Id $id -ErrorAction Stop
    if ($p.HasExited) { return $null }
    $details = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id) -ErrorAction Stop
    $commandLine=[string]$details.CommandLine
    if (-not $details -or $details.Name -ine 'ffmpeg.exe' -or $commandLine -notlike '*cam4-%Y%m%d-%H%M%S.ts*') { return $null }
    if($commandLine -notmatch '(?i)(^|\s)-an(\s|$)' -or $commandLine -match '(?i)-map\s+0:a\?'){
      Write-Log ('recorder_incompatible_video_only_mode pid='+$id+' action=kill_and_replace')
      Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
      Remove-Item -LiteralPath $RecorderPid -Force -ErrorAction SilentlyContinue
      return $null
    }
    return $p
  } catch { return $null }
}

function Get-LatestValidSegment {
  $quick = Get-RecentSegment $Segments 4; if ($quick) { return $quick }
  return Get-ChildItem -LiteralPath $Segments -Filter 'cam4-*.ts' -File -ErrorAction SilentlyContinue |
    Where-Object { $PSItem.Length -gt $MinimumSegmentBytes } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Get-RecorderState {
  $p = Get-RecorderProcess
  $last = Get-LatestValidSegment
  $ageSec = $null
  $bytes = 0L
  if ($last) {
    $ageSec = [Math]::Max(0,[Math]::Round(((Get-Date) - $last.LastWriteTime).TotalSeconds,1))
    $bytes = [long]$last.Length
  }
  $processAgeSec = $null
  if ($p) {
    try { $processAgeSec = [Math]::Max(0,[Math]::Round(((Get-Date) - $p.StartTime).TotalSeconds,1)) } catch {}
  }
  $startupGrace = ($p -and $null -ne $processAgeSec -and $processAgeSec -le $RecorderStartupGraceSeconds)
  $fresh = ($last -and $null -ne $ageSec -and $ageSec -le $FreshSegmentSeconds)
  return [pscustomobject]@{
    Process = $p
    Healthy = [bool]($p -and ($startupGrace -or $fresh))
    LastSegment = $last
    LastSegmentAgeSec = $ageSec
    LastSegmentBytes = $bytes
    ProcessAgeSec = $processAgeSec
  }
}

function Start-Recorder {
  $state = Get-RecorderState
  if ($state.Healthy) { return }
  if ($state.Process) {
    Write-Log ('recorder_stale pid=' + $state.Process.Id + ' lastSegmentAgeSec=' + [string]$state.LastSegmentAgeSec + ' action=kill_and_restart')
    Stop-Process -Id $state.Process.Id -Force -ErrorAction SilentlyContinue
    try { $state.Process.WaitForExit(5000) } catch {}
  }
  Remove-Item -LiteralPath $RecorderPid -Force -ErrorAction SilentlyContinue
  if (((Get-Date) - $script:LastRecorderStartAttempt).TotalSeconds -lt $RecorderRestartCooldownSeconds) { return }
  $script:LastRecorderStartAttempt = Get-Date
  if (-not (Test-Path -LiteralPath $Ffmpeg)) { throw 'ffmpeg_missing' }
  $pattern = Join-Path $Segments 'cam4-%Y%m%d-%H%M%S.ts'
  $stderr = Join-Path $Logs 'ffmpeg-error.log'
  # DVR audio is PCMU/G.711. MPEG-TS exposes copied PCMU as private data, so
  # transcode audio only to AAC while keeping H264 video byte-for-byte.
  $args = '-hide_banner -loglevel warning -rtsp_transport tcp -i "' + $Stream + '" -map 0:v:0 -an -c:v h264_qsv -b:v 500k -maxrate 750k -bufsize 1500k -g 50 -bf 0 -f segment -segment_time 6 -segment_format mpegts -reset_timestamps 1 -strftime 1 "' + $pattern + '"'
  $p = Start-Process -FilePath $Ffmpeg -ArgumentList $args -WindowStyle Hidden -RedirectStandardError $stderr -PassThru
  Set-Content -LiteralPath $RecorderPid -Value $p.Id -Encoding ASCII
  Write-Log ('recorder_started pid=' + $p.Id)
}

function Get-Recorder8Process {
  try {if(-not(Test-Path -LiteralPath $RecorderPid8)){return $null};$id=[int](Get-Content -LiteralPath $RecorderPid8 -Raw);$p=Get-Process -Id $id -ErrorAction Stop;$d=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id) -ErrorAction Stop;if($p.HasExited -or $d.Name -ine 'ffmpeg.exe' -or [string]$d.CommandLine -notlike '*cam8-%Y%m%d-%H%M%S.ts*'){return $null};return $p}catch{return $null}
}
function Get-LatestValidSegment8 {$quick=Get-RecentSegment $Segments8 8;if($quick){return $quick};Get-ChildItem -LiteralPath $Segments8 -Filter 'cam8-*.ts' -File -ErrorAction SilentlyContinue|Where-Object{$PSItem.Length -gt $MinimumSegmentBytes}|Sort-Object LastWriteTime -Descending|Select-Object -First 1}
function Start-Recorder8 {
  $p=Get-Recorder8Process;$last=Get-LatestValidSegment8;$fresh=$last -and ((Get-Date)-$last.LastWriteTime).TotalSeconds -le $FreshSegmentSeconds
  $processAge=$null;if($p){try{$processAge=((Get-Date)-$p.StartTime).TotalSeconds}catch{}}
  $starting=$p -and $null -ne $processAge -and $processAge -le $RecorderStartupGraceSeconds
  if($p -and ($fresh -or $starting)){return};if($p){Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue};Remove-Item -LiteralPath $RecorderPid8 -Force -ErrorAction SilentlyContinue
  if(((Get-Date)-$script:LastRecorder8StartAttempt).TotalSeconds -lt $RecorderRestartCooldownSeconds){return}
  $script:LastRecorder8StartAttempt=Get-Date
  $pattern=Join-Path $Segments8 'cam8-%Y%m%d-%H%M%S.ts';$stderr=Join-Path $Logs 'ffmpeg8-error.log'
  $args='-hide_banner -loglevel warning -rtsp_transport tcp -i "'+$Stream8+'" -map 0:v:0 -an -c:v h264_qsv -b:v 250k -maxrate 400k -bufsize 800k -g 50 -bf 0 -f segment -segment_time 6 -segment_format mpegts -reset_timestamps 1 -strftime 1 "'+$pattern+'"'
  $next=Start-Process -FilePath $Ffmpeg -ArgumentList $args -WindowStyle Hidden -RedirectStandardError $stderr -PassThru;Set-Content -LiteralPath $RecorderPid8 -Value $next.Id -Encoding ASCII;Write-Log ('recorder8_started pid='+$next.Id)
}
function Get-Recorder8State {
  $p=Get-Recorder8Process;$last=Get-LatestValidSegment8;$age=$null;if($last){$age=[Math]::Max(0,[Math]::Round(((Get-Date)-$last.LastWriteTime).TotalSeconds,1))}
  $processAge=$null;if($p){try{$processAge=[Math]::Max(0,[Math]::Round(((Get-Date)-$p.StartTime).TotalSeconds,1))}catch{}}
  $starting=$p -and $null -ne $processAge -and $processAge -le $RecorderStartupGraceSeconds
  return [pscustomobject]@{Process=$p;LastSegment=$last;LastSegmentAgeSec=$age;ProcessAgeSec=$processAge;Healthy=[bool]($p -and ($starting -or ($last -and $age -le $FreshSegmentSeconds)))}
}

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
  Invoke-DiskGuard
  $cut = (Get-Date).AddHours(-$RetentionHours)
  Get-ChildItem -LiteralPath $Segments -Filter '*.ts' -File -ErrorAction SilentlyContinue | Where-Object LastWriteTime -lt $cut | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $Segments8 -Filter '*.ts' -File -ErrorAction SilentlyContinue | Where-Object LastWriteTime -lt $cut | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $Cache -Filter '*.mp4' -File -ErrorAction SilentlyContinue | Where-Object LastWriteTime -lt (Get-Date).AddHours(-24) | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $Cache -Filter '*.txt' -File -ErrorAction SilentlyContinue | Where-Object LastWriteTime -lt (Get-Date).AddHours(-24) | Remove-Item -Force -ErrorAction SilentlyContinue
}

function Segment-TimeMs([System.IO.FileInfo]$File) {
  $m = [regex]::Match($File.BaseName, '^cam[48]-(\d{8})-(\d{6})$')
  if (-not $m.Success) { return 0L }
  try {
    $dt = [datetime]::ParseExact(($m.Groups[1].Value + $m.Groups[2].Value), 'yyyyMMddHHmmss', [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeLocal)
    return ([DateTimeOffset]$dt).ToUnixTimeMilliseconds()
  } catch { return 0L }
}

function Get-MediaCodec([string]$Path,[string]$Selector) {
  if(-not(Test-Path -LiteralPath $Ffprobe)){
    try{$script:Ffprobe=(Get-Command ffprobe.exe -ErrorAction Stop).Source}catch{return ''}
  }
  $tag=[guid]::NewGuid().ToString('N');$stdout=Join-Path $Cache ('probe-'+$tag+'.out');$stderr=Join-Path $Cache ('probe-'+$tag+'.err')
  try{
    $args='-v error -select_streams '+$Selector+' -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "'+$Path+'"'
    $probe=Start-Process -FilePath $Ffprobe -ArgumentList $args -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if($probe.ExitCode -ne 0 -or -not(Test-Path -LiteralPath $stdout)){return ''}
    return ([string](Get-Content -LiteralPath $stdout -ErrorAction SilentlyContinue|Select-Object -First 1)).Trim()
  }catch{return ''}finally{Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue}
}

function Wait-ForWindow([long]$EndMs,[int]$Camera) {
  $folder=$(if($Camera -eq 8){$Segments8}else{$Segments});$filter='cam'+[string]$Camera+'-*.ts'
  if ([DateTimeOffset]::Now.ToUnixTimeMilliseconds() -gt ($EndMs + 5000)) { return }
  $deadline = (Get-Date).AddSeconds(42)
  while ((Get-Date) -lt $deadline) {
    $newest = Get-RecentSegment $folder $Camera
    if ($newest -and (Segment-TimeMs $newest) -gt ($EndMs + 1000)) { return }
    Start-Sleep -Milliseconds 500
  }
}


# v688: fallback to clips exported by the NVR/VideoPlayTool.
# VideoPlayTool stores historical exports here as:
#   04_2026-09-26_204503_204533.h265x
# The .h265x payload is a raw HEVC elementary stream; ffmpeg must be forced to -f hevc.
function Build-NvrDownloadedClip([long]$StartMs,[int]$DurationSec,[int]$Quality,[int]$Camera) {
  $down='C:\Program Files (x86)\VideoPlayTool\Bin\Device\Download'
  if(-not (Test-Path -LiteralPath $down)){return $null}
  if($Quality -ne 720){$Quality=480}
  $eventMs=$StartMs
  $wantedEnd=$StartMs+([long]$DurationSec*1000L)
  $prefix=('{0:d2}_' -f $Camera)
  $hits=New-Object System.Collections.Generic.List[object]
  $files=@(Get-ChildItem -LiteralPath $down -Recurse -File -Filter ($prefix+'*.h265x') -ErrorAction SilentlyContinue)
  foreach($f in $files){
    if($f.Name -notmatch '^(?<cam>\d{2})_(?<d>\d{4}-\d{2}-\d{2})_(?<a>\d{6})_(?<b>\d{6})\.h265x$'){continue}
    try{
      $s=[datetime]::ParseExact(($Matches.d+' '+$Matches.a),'yyyy-MM-dd HHmmss',[Globalization.CultureInfo]::InvariantCulture)
      $e=[datetime]::ParseExact(($Matches.d+' '+$Matches.b),'yyyy-MM-dd HHmmss',[Globalization.CultureInfo]::InvariantCulture)
      if($e -lt $s){$e=$e.AddDays(1)}
      $sm=[DateTimeOffset]$s;$em=[DateTimeOffset]$e
      $sms=$sm.ToUnixTimeMilliseconds();$ems=$em.ToUnixTimeMilliseconds()
      # Accept a file containing the requested event, or any overlap with the requested window.
      if(($eventMs -ge $sms -and $eventMs -le $ems) -or ($sms -le $wantedEnd -and $ems -ge $StartMs)){
        $hits.Add([pscustomobject]@{File=$f;StartMs=$sms;EndMs=$ems})
      }
    }catch{}
  }
  if($hits.Count -eq 0){
    # v690: ask the isolated NVR bridge to fetch the historical segment automatically,
    # then rescan VideoPlayTool's Download directory. Only Camera 4 is enabled because
    # its verified NVR mapping is Office camera 4 -> NVR channel 3.
    if($Camera -eq 4){
      try{
        $bridge='http://127.0.0.1:1986/fetch?camera=4&atMs='+[string]$StartMs+'&durationSec='+[string]$DurationSec
        $r=Invoke-RestMethod -Uri $bridge -Method Get -TimeoutSec 120
        if($r.ok){
          Start-Sleep -Milliseconds 400
          return Build-NvrDownloadedClip $StartMs $DurationSec $Quality $Camera
        }
      }catch{
        Write-Log ('nvr_bridge_error='+$_.Exception.Message)
      }
    }
    return $null
  }
  $hit=$hits|Sort-Object @{Expression={if($eventMs -ge $_.StartMs -and $eventMs -le $_.EndMs){0}else{1}}},StartMs|Select-Object -First 1
  $clipStart=[Math]::Max([long]$StartMs,[long]$hit.StartMs)
  $available=[Math]::Max(1,[Math]::Floor(([long]$hit.EndMs-$clipStart)/1000))
  $seconds=[Math]::Min([Math]::Max(1,$DurationSec),[int]$available)
  $skip=[Math]::Max(0,($clipStart-[long]$hit.StartMs)/1000.0).ToString('0.000',[Globalization.CultureInfo]::InvariantCulture)
  $key='v688-nvr-cam'+[string]$Camera+'-'+[string]$hit.StartMs+'-'+[string]$clipStart+'-'+[string]$seconds+'-'+[string]$Quality
  $out=Join-Path $Cache ($key+'.mp4')
  if((Test-Path -LiteralPath $out)-and(Get-Item -LiteralPath $out).Length -gt 4096){return $out}
  $tmp=$out+'.part.mp4';Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  $vf='scale=-2:'+([string]$Quality)
  # Browser-safe H264. Try Intel QSV first; fall back to libx264.
  $args='-hide_banner -loglevel error -f hevc -i "'+$hit.File.FullName+'" -ss '+$skip+' -t '+[string]$seconds+' -an -vf "'+$vf+'" -c:v h264_qsv -global_quality 25 -look_ahead 0 -pix_fmt nv12 -movflags +faststart "'+$tmp+'"'
  $p=Start-Process -FilePath $Ffmpeg -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
  if($p.ExitCode -ne 0 -or -not(Test-Path -LiteralPath $tmp)-or(Get-Item -LiteralPath $tmp).Length -lt 4096){
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    $args='-hide_banner -loglevel error -f hevc -i "'+$hit.File.FullName+'" -ss '+$skip+' -t '+[string]$seconds+' -an -vf "'+$vf+'" -c:v libx264 -preset ultrafast -crf 25 -pix_fmt yuv420p -movflags +faststart "'+$tmp+'"'
    $p=Start-Process -FilePath $Ffmpeg -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
  }
  if($p.ExitCode -ne 0 -or -not(Test-Path -LiteralPath $tmp)-or(Get-Item -LiteralPath $tmp).Length -lt 4096){return $null}
  Move-Item -LiteralPath $tmp -Destination $out -Force
  Write-Log ('playback_source=nvr_download camera='+$Camera+' file='+$hit.File.Name+' seconds='+$seconds)
  return $out
}

function Build-Clip([long]$StartMs,[int]$DurationSec,[int]$Quality,[bool]$Fast,[int]$Camera) {
  if($Camera -ne 8){$Camera=4};$folder=$(if($Camera -eq 8){$Segments8}else{$Segments});$filter='cam'+[string]$Camera+'-*.ts'
  if ($DurationSec -lt 30) { $DurationSec = 30 }
  if ($DurationSec -gt 3600) { $DurationSec = 3600 }
  if ($Quality -ne 720) { $Quality = 480 }
  $endMs = $StartMs + ([long]$DurationSec * 1000L)
  Wait-ForWindow $endMs $Camera
  # v538 cache namespace also prevents clips assembled from incomplete segments.
  # mobile browsers after the browser-compatible H264 playback upgrade.
  $key = 'v712-cam' + [string]$Camera + '-' + [string]$StartMs + '-' + [string]$DurationSec + '-' + [string]$Quality + '-' + $(if($Fast){'fast'}else{'exact'})
  $out = Join-Path $Cache ($key + '.mp4')
  if ((Test-Path -LiteralPath $out) -and (Get-Item -LiteralPath $out).Length -gt 4096) { return $out }

  $all = @(Get-SegmentsForWindow $folder $Camera ($StartMs - 6000) ($endMs + 4000))
  $picked = New-Object System.Collections.Generic.List[object]
  $firstMs = 0L
  foreach ($f in $all) {
    $ms = Segment-TimeMs $f
    if ($ms -gt 0 -and $ms -le ($endMs + 4000) -and $ms -ge ($StartMs - 6000)) {
      if ($firstMs -eq 0) { $firstMs = $ms }
      $picked.Add($f)
    }
  }
  # v712: a start that is exactly a segment boundary plays from that segment with no seek.
  $exactIdx = -1
  for ($pi = 0; $pi -lt $picked.Count; $pi++) { if ((Segment-TimeMs $picked[$pi]) -eq $StartMs) { $exactIdx = $pi; break } }
  if ($exactIdx -gt 0) { $picked.RemoveRange(0, $exactIdx); $firstMs = $StartMs }
  if ($picked.Count -lt 2) {
    $nvr=Build-NvrDownloadedClip $StartMs $DurationSec $Quality $Camera
    if($nvr){return $nvr}
    throw 'recording_window_not_ready'
  }

  $list = Join-Path $Cache ($key + '.txt')
  $lines = @($picked | ForEach-Object { "file '$($_.FullName.Replace("'", "''"))'" })
  Set-Content -LiteralPath $list -Value $lines -Encoding ASCII
  $skip = [Math]::Max(0, ($StartMs - $firstMs) / 1000.0).ToString('0.000', [Globalization.CultureInfo]::InvariantCulture)
  $vf = 'scale=-2:' + [string]$Quality
  $tmp = $out + '.part.mp4'
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  if($Fast){
    # New DVR recordings are H264. Repack them without video transcoding so a
    # one-minute review is available in seconds and CPU stays free for live/AI.
    $inputCodec=Get-MediaCodec $picked[0].FullName 'v:0';$copyReady=$false
    if($inputCodec -eq 'h264' -or ($inputCodec -eq '' -and $picked[0].LastWriteTime -gt $H264Since)){
      $args='-hide_banner -loglevel error -fflags +genpts -f concat -safe 0 -i "'+$list+'" -ss '+$skip+' -t '+[string]$DurationSec+' -map 0:v:0 -an -c:v copy -avoid_negative_ts make_zero -movflags +faststart "'+$tmp+'"'
      $p=Start-Process -FilePath $Ffmpeg -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
      $copyReady=$p.ExitCode -eq 0 -and (Test-Path -LiteralPath $tmp) -and (Get-Item -LiteralPath $tmp).Length -ge 4096
      if($copyReady){Write-Log ('playback_h264_repack camera='+$Camera+' seconds='+$DurationSec)}else{Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue}
    }
    if(-not $copyReady){
      # Historical HEVC remains viewable through Intel QSV with software fallback.
      $args = '-hide_banner -loglevel error -fflags +genpts -f concat -safe 0 -i "' + $list + '" -ss ' + $skip + ' -t ' + [string]$DurationSec + ' -map 0:v:0 -an -vf "' + $vf + '" -c:v h264_qsv -global_quality 25 -look_ahead 0 -pix_fmt nv12 -avoid_negative_ts make_zero -movflags +faststart "' + $tmp + '"'
      $p = Start-Process -FilePath $Ffmpeg -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
      if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $tmp) -or (Get-Item -LiteralPath $tmp).Length -lt 4096) {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        Write-Log 'playback_qsv_failed fallback=libx264'
        $args = '-hide_banner -loglevel error -fflags +genpts -f concat -safe 0 -i "' + $list + '" -ss ' + $skip + ' -t ' + [string]$DurationSec + ' -map 0:v:0 -an -vf "' + $vf + '" -c:v libx264 -preset ultrafast -crf 25 -pix_fmt yuv420p -avoid_negative_ts make_zero -movflags +faststart "' + $tmp + '"'
        $p = Start-Process -FilePath $Ffmpeg -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
      }
    }
  }else{
    $args = '-hide_banner -loglevel error -fflags +genpts -f concat -safe 0 -i "' + $list + '" -ss ' + $skip + ' -t ' + [string]$DurationSec + ' -map 0:v:0 -an -vf "' + $vf + '" -c:v libx264 -preset ultrafast -crf 24 -pix_fmt yuv420p -avoid_negative_ts make_zero -movflags +faststart "' + $tmp + '"'
    $p = Start-Process -FilePath $Ffmpeg -ArgumentList $args -WindowStyle Hidden -Wait -PassThru
  }
  if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $tmp) -or (Get-Item -LiteralPath $tmp).Length -lt 4096) { throw ('clip_build_failed_' + $p.ExitCode) }
  Move-Item -LiteralPath $tmp -Destination $out -Force
  return $out
}

function Send-Json($Context,[int]$Status,$Object) {
  $json = ConvertTo-Json $Object -Compress -Depth 10
  $bridge = [string]$Context.Request.QueryString['bridge']
  $bridgeId = [string]$Context.Request.QueryString['bridgeId']
  $callback = [string]$Context.Request.QueryString['callback']
  if ($bridge -eq '1' -and $bridgeId -match '^[A-Za-z0-9_-]{1,100}$') {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    $json = '<!doctype html><meta charset="utf-8"><script>(function(){var b=atob("' + $encoded + '");var a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);parent.postMessage({source:"echarpe-cctv-bridge",id:"' + $bridgeId + '",data:JSON.parse(new TextDecoder().decode(a))},"*");})();</script>'
    $Context.Response.ContentType = 'text/html; charset=utf-8'
  } elseif ($callback -and $callback -match '^[A-Za-z_$][A-Za-z0-9_.$]{0,100}$') {
    $json = $callback + '(' + $json + ');'
    $Context.Response.ContentType = 'application/javascript; charset=utf-8'
  } else {
    $Context.Response.ContentType = 'application/json; charset=utf-8'
  }
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $Status
  $Context.Response.ContentLength64 = $bytes.Length
  $Context.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $Context.Response.Close()
}

function Send-Html($Context,[string]$Html) {
  $bytes=[Text.Encoding]::UTF8.GetBytes($Html)
  $Context.Response.StatusCode=200;$Context.Response.ContentType='text/html; charset=utf-8';$Context.Response.ContentLength64=$bytes.Length
  $Context.Response.OutputStream.Write($bytes,0,$bytes.Length);$Context.Response.Close()
}

function Send-Video($Context,[string]$Path) {
  $file = [IO.File]::Open($Path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try {
    $length = $file.Length; $from = 0L; $to = $length - 1L
    $range = $Context.Request.Headers['Range']
    if ($range -and $range -match '^bytes=(\d*)-(\d*)') {
      if ($matches[1]) { $from = [long]$matches[1] }
      if ($matches[2]) { $to = [Math]::Min([long]$matches[2],$length-1) }
      if ($from -ge $length -or $to -lt $from) { $Context.Response.StatusCode=416; $Context.Response.Close(); return }
      $Context.Response.StatusCode = 206
      $Context.Response.AddHeader('Content-Range',('bytes ' + $from + '-' + $to + '/' + $length))
    } else { $Context.Response.StatusCode = 200 }
    $count = $to - $from + 1L
    $Context.Response.ContentType = 'video/mp4'
    $Context.Response.AddHeader('Accept-Ranges','bytes')
    $Context.Response.AddHeader('Cache-Control','private, max-age=3600')
    $Context.Response.ContentLength64 = $count
    $file.Position = $from
    $buf = New-Object byte[] 65536
    while ($count -gt 0) {
      $read = $file.Read($buf,0,[int][Math]::Min($buf.Length,$count))
      if ($read -le 0) { break }
      $Context.Response.OutputStream.Write($buf,0,$read); $count -= $read
    }
  } finally { $file.Dispose(); try { $Context.Response.Close() } catch {} }
}

Start-Recorder
Start-Recorder8
Cleanup-OldFiles
$listener = New-Object Net.HttpListener
$listener.Prefixes.Add(('http://127.0.0.1:' + $Port + '/'))
$listener.Start()
Write-Log ('agent_listening port=' + $Port)
$lastMaintenance = Get-Date

while ($listener.IsListening) {
  try {
    $pending = $listener.GetContextAsync()
    while (-not $pending.AsyncWaitHandle.WaitOne(5000)) {
      Start-Recorder
      Start-Recorder8
      Process-ActivityCandidates
      if (((Get-Date)-$lastMaintenance).TotalMinutes -ge 10) { Cleanup-OldFiles; $lastMaintenance=Get-Date }
    }
    $ctx = $pending.GetAwaiter().GetResult()
    $ctx.Response.AddHeader('Access-Control-Allow-Origin','*')
    $ctx.Response.AddHeader('Access-Control-Allow-Headers','Range, Content-Type')
    $ctx.Response.AddHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
    $ctx.Response.AddHeader('Access-Control-Allow-Private-Network','true')
    if ($ctx.Request.HttpMethod -eq 'OPTIONS') { $ctx.Response.StatusCode=204; $ctx.Response.Close(); continue }
    $path = $ctx.Request.Url.AbsolutePath
    $requestHost=[string]$ctx.Request.UserHostName
    if($ctx.Request.HttpMethod -eq 'POST' -and $requestHost -notmatch '^(127\.0\.0\.1|localhost)(:\d+)?$'){
      Send-Json $ctx 403 @{ok=$false;error='local_write_only'};continue
    }
    if($ctx.Request.HttpMethod -eq 'POST' -and $path -eq '/echarpe-events/event'){
      $body=Read-JsonBody $ctx;if($body -and [string]$body.type -eq 'sale_saved'){Add-SaleEvent $body};Send-Json $ctx 200 @{ok=$true};continue
    } elseif($ctx.Request.HttpMethod -eq 'POST' -and $path -eq '/echarpe-playback/activity-candidate'){
      $body=Read-JsonBody $ctx;Add-ActivityCandidate $body;Send-Json $ctx 200 @{ok=$true};continue
    } elseif($ctx.Request.HttpMethod -eq 'POST' -and $path -eq '/echarpe-playback/activity-state'){
      $body=Read-JsonBody $ctx;$body|ConvertTo-Json -Compress -Depth 5|Set-Content -LiteralPath $DetectorStateFile -Encoding UTF8;Send-Json $ctx 200 @{ok=$true};continue
    } elseif($ctx.Request.HttpMethod -eq 'POST' -and $path -eq '/echarpe-playback/staff-state'){
      $body=Read-JsonBody $ctx;if(-not $body -or [string]$body.branch -ne 'madinaty'){throw 'invalid_staff_state'};Save-StaffSource $body;$selectedStaff=Get-StaffState;Send-Json $ctx 200 @{ok=$true;selectedSource=[string]$selectedStaff.source};continue
    } elseif($ctx.Request.HttpMethod -eq 'POST' -and $path -eq '/echarpe-playback/session-signal'){
      $body=Read-JsonBody $ctx;Add-SessionSignal $body;Send-Json $ctx 200 @{ok=$true};continue
    } elseif($path -eq '/echarpe-playback/staff-state'){
      $staff=Get-StaffState;Send-Json $ctx 200 @{ok=[bool]$staff.sourceHealthy;source=[string]$staff.source;generatedAtMs=[long]$staff.generatedAtMs;activeStaffCount=[int]$staff.activeStaffCount;clockedInCount=[int]$staff.clockedInCount;openBreakCount=[int]$staff.openBreakCount;employeeIds=@($staff.employeeIds);employees=@($staff.employees)}
    } elseif($path -eq '/echarpe-presence/status'){
      $state=$null;try{if(Test-Path -LiteralPath $DetectorStateFile){$state=Get-Content -LiteralPath $DetectorStateFile -Raw|ConvertFrom-Json}}catch{};$current=$null;if($state){$current=$state.current};Send-Json $ctx 200 @{ok=[bool]$state;generatedAtMs=$(if($state){[long]$state.generatedAtMs}else{0});configuredCameras=@(4,8);current=$current;recent=@()}
    } elseif ($path -eq '/health' -or $path -eq '/echarpe-playback/health') {
      $recorderState=Get-RecorderState;$recorder8State=Get-Recorder8State;$lastStamp=$null;if($recorderState.LastSegment){$lastStamp=$recorderState.LastSegment.LastWriteTime.ToString('s')}
      $recorderPidValue=$null;if($recorderState.Process){$recorderPidValue=$recorderState.Process.Id}
      $staff=Get-StaffState;Send-Json $ctx 200 @{ok=[bool]($recorderState.Healthy -and $recorder8State.Healthy -and (Get-DetectorProcess));version=712;branch='madinaty';cameras=@(4,8);audioCamera=0;clockSource='pos_pc';recorder=[bool]($recorderState.Healthy -and $recorder8State.Healthy);camera4Recorder=[bool]$recorderState.Healthy;camera8Recorder=[bool]$recorder8State.Healthy;camera4SegmentAgeSec=$recorderState.LastSegmentAgeSec;camera8SegmentAgeSec=$recorder8State.LastSegmentAgeSec;recorderPid=$recorderPidValue;recorderProcessAgeSec=$recorderState.ProcessAgeSec;detector=[bool](Get-DetectorProcess);lastSegment=$lastStamp;lastSegmentAgeSec=$recorderState.LastSegmentAgeSec;lastSegmentBytes=$recorderState.LastSegmentBytes;staffSource=[string]$staff.source;activeStaffCount=[int]$staff.activeStaffCount;retentionHours=$RetentionHours;playback=$true;playbackCodec='h264';audio=$false;recordingAudioCodec='none'}
    } elseif ($path -eq '/echarpe-playback/view') {
      $camera=[int]($ctx.Request.QueryString['camera']);if($camera -notin @(4,8)){$camera=4};$atMs=[long]($ctx.Request.QueryString['atMs']);if($atMs -le 0){$atMs=[DateTimeOffset]::Now.ToUnixTimeMilliseconds()-1800000};$mins=[int]($ctx.Request.QueryString['durationMin']);if($mins -lt 1){$mins=1};if($mins -gt 60){$mins=60};$seconds=$mins*60
      $src='/echarpe-playback/video?camera='+[string]$camera+'&amp;atMs='+$atMs+'&amp;durationSec='+$seconds+'&amp;quality=480&amp;mode=fast'
      $html='<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Madinaty recording</title><style>html,body{margin:0;height:100%;background:#05070b;color:#fff;font-family:Arial}body{display:flex;flex-direction:column}header{padding:10px;background:#111827;font-weight:bold}video{width:100%;flex:1;min-height:0;background:#000}</style><header>Madinaty recording - branch PC clock</header><video controls autoplay playsinline src="'+$src+'"></video></html>'
      Send-Html $ctx $html
    } elseif ($path -eq '/echarpe-playback/clip-start') {
      # v712: the latest segment that starts at or before atMs. A clip requested from exactly
      # that moment starts on the segment keyframe, so the player clock is exact.
      $camera=[int]($ctx.Request.QueryString['camera']);if($camera -notin @(4,8)){$camera=4};$folder=$(if($camera -eq 8){$Segments8}else{$Segments});$atMs=[long]($ctx.Request.QueryString['atMs'])
      $startMs=0L;foreach($seg in @(Get-SegmentsForWindow $folder $camera ($atMs - 40000) $atMs)){$sm=Segment-TimeMs $seg;if($sm -gt 0 -and $sm -le $atMs){$startMs=$sm}}
      Send-Json $ctx 200 @{ok=[bool]($startMs -gt 0);camera=$camera;requestedAtMs=$atMs;startMs=$startMs;clockSource='pos_pc'}
    } elseif ($path -eq '/echarpe-playback/range') {
      $camera=[int]($ctx.Request.QueryString['camera']);if($camera -notin @(4,8)){$camera=4};$folder=$(if($camera -eq 8){$Segments8}else{$Segments});$filter='cam'+[string]$camera+'-*.ts';$files=@(Get-ChildItem -LiteralPath $folder -Filter $filter -File -ErrorAction SilentlyContinue | Where-Object { $PSItem.Length -gt $MinimumSegmentBytes } | Sort-Object Name)
      $first=0L;$last=0L;if($files.Count){$first=Segment-TimeMs $files[0];$last=(Segment-TimeMs $files[$files.Count-1])+10000L}
      Send-Json $ctx 200 @{ok=$true;camera=$camera;clockSource='pos_pc';startMs=$first;endMs=$last;segmentCount=$files.Count}
    } elseif ($path -eq '/echarpe-playback/activity-status') {
      $state=$null;try{if(Test-Path -LiteralPath $DetectorStateFile){$state=Get-Content -LiteralPath $DetectorStateFile -Raw|ConvertFrom-Json}}catch{};Send-Json $ctx 200 @{ok=$true;detector=[bool](Get-DetectorProcess);state=$state}
    } elseif ($path -eq '/echarpe-playback/alerts') {
      Process-ActivityCandidates;$items=@(Load-JsonArray $AlertsFile|Where-Object{[string]$_.severity -eq 'high' -and [string]$_.type -in @('strong_activity_no_sale','sale_without_customer')}|Sort-Object atMs -Descending|Select-Object -First 100);Send-Json $ctx 200 @{ok=$true;items=@($items)}
    } elseif ($path -eq '/echarpe-playback/video') {
      Start-Recorder
      Start-Recorder8
      $camera=[int]($ctx.Request.QueryString['camera']); if($camera -notin @(4,8)){throw 'camera_not_recorded'}
      $atMs=[long]($ctx.Request.QueryString['atMs']); if($atMs -le 0){throw 'atMs_required'}
      $duration=[int]($ctx.Request.QueryString['durationSec']); if($duration -le 0){$duration=60}
      $quality=[int]($ctx.Request.QueryString['quality']);$fast=([string]$ctx.Request.QueryString['mode'] -ne 'exact'); $clip=Build-Clip $atMs $duration $quality $fast $camera
      Send-Video $ctx $clip
    } else { Send-Json $ctx 404 @{ok=$false;error='not_found'} }
  } catch {
    Write-Log ('request_error ' + $_.Exception.Message)
    try { Send-Json $ctx 500 @{ok=$false;error=$_.Exception.Message} } catch { try{$ctx.Response.Abort()}catch{} }
  }
}




