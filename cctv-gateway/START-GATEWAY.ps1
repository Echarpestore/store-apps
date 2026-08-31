$ErrorActionPreference="Continue"
$Host.UI.RawUI.WindowTitle="ECHARPE CCTV Gateway v420"
Write-Host "ECHARPE CCTV Gateway v420" -ForegroundColor Cyan
Write-Host "NVR: 192.168.0.9:554"

$exe=Join-Path $PSScriptRoot "go2rtc.exe"
if(!(Test-Path $exe)){
  $downloads=Join-Path $env:USERPROFILE "Downloads"
  $old=@(
    (Join-Path $downloads "echarpe-cctv-gateway-v418\go2rtc.exe"),
    (Join-Path $downloads "echarpe-cctv-gateway-v415\go2rtc.exe")
  )
  foreach($x in $old){if(Test-Path $x){Copy-Item $x $exe -Force; break}}
}
if(!(Test-Path $exe)){
  Write-Host "Copy go2rtc.exe from v415/v418 into this folder, then run again." -ForegroundColor Red
  Read-Host "ENTER"; exit
}

$user=Read-Host "NVR/camera username"
$sec=Read-Host "NVR/camera password (hidden)" -AsSecureString
$ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pass=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
function E([string]$s){[uri]::EscapeDataString($s)}
$u=E $user; $p=E $pass

# Verified on this branch:
# D04 192.168.0.102 direct XM main works.
# D05 via NVR channel 4 works.
# D07 192.168.0.103 direct XM main works.
# D08 via NVR channel 7 works.
$yaml=@"
api:
  listen: "127.0.0.1:1984"
webrtc:
  listen: "127.0.0.1:8555"
streams:
  camera4: "rtsp://${u}:${p}@192.168.0.102:554/user=${u}&password=${p}&channel=0&stream=0.sdp?real_stream"
  camera5: "rtsp://${u}:${p}@192.168.0.9:554/user=${u}&password=${p}&channel=4&stream=1.sdp?real_stream"
  camera7: "rtsp://${u}:${p}@192.168.0.103:554/user=${u}&password=${p}&channel=0&stream=0.sdp?real_stream"
  camera8: "rtsp://${u}:${p}@192.168.0.9:554/user=${u}&password=${p}&channel=7&stream=1.sdp?real_stream"
"@
$cfg=Join-Path $env:TEMP "echarpe-go2rtc-v420.yaml"
Set-Content $cfg $yaml -Encoding UTF8
try{
  Write-Host ""
  Write-Host "Gateway ready. Open: http://127.0.0.1:1984" -ForegroundColor Green
  Write-Host "Office streams: camera4, camera5, camera7, camera8"
  & $exe -config $cfg
} finally {
  Remove-Item $cfg -Force -ErrorAction SilentlyContinue
  $pass=$null; $sec=$null
  Write-Host "Press ENTER to close..."
  Read-Host
}
