#!/usr/bin/env bash
# Builds the 30s vertical (1080x1920) ad for the ezisite restaurant theme.
#
# Put these in input/:
#   person1.mp4  restaurant owner, line 1   (first 4s are used)
#   screen.mp4   real screen recording, 15s: new order -> prep with notes/add-ons -> assign driver
#   person2.mp4  owner, line 2              (first 5s are used)
#   music.mp3    optional background music
#
# Zoom focus for each of the 3 steps (fractions of the screen recording, 0..1):
#   Z1="0.5,0.3" Z2="0.5,0.5" Z3="0.5,0.7"  ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
IN=input; B=build; mkdir -p "$B"
Z1=${Z1:-0.5,0.4}; Z2=${Z2:-0.5,0.5}; Z3=${Z3:-0.5,0.6}
ENC="-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -r 30"
AUD="-c:a aac -b:a 192k -ar 48000 -ac 2"

node render.js "${SITE_URL:-ezisite.com}"

# Person clip: fill the vertical frame, burn caption on top.
person () { # src seconds caption out
  ffmpeg -y -v error -t "$2" -i "$1" -loop 1 -i "$B/$3.png" -filter_complex \
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[v];[v][1:v]overlay=0:0:shortest=1,format=yuv420p" \
    -af "aresample=48000" -t "$2" $ENC $AUD "$4"
}
person "$IN/person1.mp4" 4 cap1 "$B/p1.mp4"
person "$IN/person2.mp4" 5 cap2 "$B/p2.mp4"

# Screen recording: 3 steps x 5s, each slowly zooms into its focus point, with a step label.
step () { # start focus label out
  fx=${2%,*}; fy=${2#*,}
  ffmpeg -y -v error -ss "$1" -t 5 -i "$IN/screen.mp4" -loop 1 -i "$B/$3.png" \
    -f lavfi -t 5 -i anullsrc=r=48000:cl=stereo -filter_complex \
    "[0:v]fps=30,split[a][b];
     [a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.15[bg];
     [b]scale=1000:1700:force_original_aspect_ratio=decrease,scale=iw*2:ih*2,
        zoompan=z='min(1+0.006*on,1.8)':x='(iw-iw/zoom)*$fx':y='(ih-ih/zoom)*$fy':d=1:fps=30:s=1000x1700:fps=30,
        scale=1000:1700:force_original_aspect_ratio=decrease[fg];
     [bg][fg]overlay=(W-w)/2:(H-h)/2-60[s];[s][1:v]overlay=0:0:shortest=1,format=yuv420p" \
    -map 2:a -t 5 $ENC $AUD "$4"
}
step 0  "$Z1" step1 "$B/s1.mp4"
step 5  "$Z2" step2 "$B/s2.mp4"
step 10 "$Z3" step3 "$B/s3.mp4"

# End card (6s).
ffmpeg -y -v error -framerate 30 -i "$B/end/f%04d.png" -f lavfi -t 6 -i anullsrc=r=48000:cl=stereo \
  -t 6 $ENC $AUD "$B/end.mp4"

# Join everything, optional music under it.
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
