#!/usr/bin/env bash
# Builds the 30s vertical (1080x1920) ad for the ezisite restaurant theme.
#
#  0-4s   hook: owner line        (input/person1.mp4 if present, else animated text scene)
#  4-19s  3 real screens, 5s each, zoom + step label (input/screens/1-orders.png, 2-detail.png, 3-board.png)
#  19-24s owner line 2            (input/person2.mp4 if present, else animated text scene)
#  24-30s price end card
# Optional: input/music.mp3
# Zoom focus (x,y as fractions of each screenshot):  Z1="0.5,0.38" Z2="0.5,0.57" Z3="0.8,0.83" ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
IN=input; B=build; mkdir -p "$B"
Z1=${Z1:-0.5,0.38}; Z2=${Z2:-0.5,0.57}; Z3=${Z3:-0.8,0.83}
ENC="-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -r 30"
AUD="-c:a aac -b:a 192k -ar 48000 -ac 2"
SIL="-f lavfi -i anullsrc=r=48000:cl=stereo"

node render.js "${SITE_URL:-ezisite.com}"

person () { # src seconds caption hookdir out
  if [ -f "$1" ]; then
    ffmpeg -y -v error -t "$2" -i "$1" -loop 1 -i "$B/$3.png" -filter_complex \
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v];[v][1:v]overlay=0:0:shortest=1,format=yuv420p" \
      -af "aresample=48000" -t "$2" $ENC $AUD "$5"
  else
    ffmpeg -y -v error -framerate 30 -i "$B/$4/f%04d.png" $SIL -t "$2" $ENC $AUD "$5"
  fi
}
person "$IN/person1.mp4" 4 cap1 hook1 "$B/p1.mp4"
person "$IN/person2.mp4" 5 cap2 hook2 "$B/p2.mp4"

step () { # image focus label out
  fx=${2%,*}; fy=${2#*,}
  ffmpeg -y -v error -loop 1 -t 5 -framerate 30 -i "$1" -loop 1 -t 5 -framerate 30 -i "$B/$3.png" $SIL -filter_complex \
    "[0:v]split[a][b];
     [a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.15[bg];
     [b]scale=-2:3400,zoompan=z='min(1+0.005*on,1.75)':x='(iw-iw/zoom)*$fx':y='(ih-ih/zoom)*$fy':d=150:fps=30:s=786x1700,setsar=1[fg];
     [bg][fg]overlay=(W-w)/2:(H-h)/2-40[s];[s][1:v]overlay=0:0:shortest=1,format=yuv420p" \
    -map '[s]' -map 2:a -shortest -t 5 $ENC $AUD "$4" 2>/dev/null || \
  ffmpeg -y -v error -loop 1 -t 5 -framerate 30 -i "$1" -loop 1 -t 5 -framerate 30 -i "$B/$3.png" $SIL -filter_complex \
    "[0:v]split[a][b];
     [a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.15[bg];
     [b]scale=-2:3400,zoompan=z='min(1+0.005*on,1.75)':x='(iw-iw/zoom)*$fx':y='(ih-ih/zoom)*$fy':d=150:fps=30:s=786x1700,setsar=1[fg];
     [bg][fg]overlay=(W-w)/2:(H-h)/2-40,format=yuv420p[s0];[s0][1:v]overlay=0:0:shortest=1,format=yuv420p[s]" \
    -map '[s]' -map 2:a -shortest -t 5 $ENC $AUD "$4"
}
step "$IN/screens/1-orders.png" "$Z1" step1 "$B/s1.mp4"
step "$IN/screens/2-detail.png" "$Z2" step2 "$B/s2.mp4"
step "$IN/screens/3-board.png"  "$Z3" step3 "$B/s3.mp4"

ffmpeg -y -v error -framerate 30 -i "$B/end/f%04d.png" $SIL -t 6 $ENC $AUD "$B/end.mp4"

printf "file '%s'\n" p1.mp4 s1.mp4 s2.mp4 s3.mp4 p2.mp4 end.mp4 > "$B/list.txt"
ffmpeg -y -v error -f concat -safe 0 -i "$B/list.txt" -c copy "$B/joined.mp4"
if [ -f "$IN/music.mp3" ]; then
  ffmpeg -y -v error -i "$B/joined.mp4" -stream_loop -1 -i "$IN/music.mp3" -filter_complex \
    "[1:a]volume=0.18,afade=t=out:st=28:d=2[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]" \
    -map 0:v -map "[a]" -c:v copy $AUD -t 30 ezisite-restaurant-ad.mp4
else
  cp "$B/joined.mp4" ezisite-restaurant-ad.mp4
fi
echo "done -> $(pwd)/ezisite-restaurant-ad.mp4"
