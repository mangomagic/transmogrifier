#!/usr/bin/env bash
# Regenerate synthetic test fixtures using FFmpeg. Requires ffmpeg on PATH.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

# 2-second 320x240 video with audio
ffmpeg -y -f lavfi -i "testsrc=duration=2:size=320x240:rate=30" \
       -f lavfi -i "sine=frequency=440:duration=2" \
       -c:v libx264 -crf 28 -preset ultrafast \
       -c:a aac -b:a 64k \
       "$DIR/sample.mov"

ffmpeg -y -f lavfi -i "testsrc=duration=2:size=320x240:rate=30" \
       -f lavfi -i "sine=frequency=440:duration=2" \
       -c:v libx264 -crf 28 -preset ultrafast \
       -c:a aac -b:a 64k \
       "$DIR/sample.avi"

ffmpeg -y -f lavfi -i "testsrc=duration=2:size=320x240:rate=30" \
       -f lavfi -i "sine=frequency=440:duration=2" \
       -c:v libx264 -crf 28 -preset ultrafast \
       -c:a aac -b:a 64k \
       "$DIR/sample.mkv"

# Audio-only
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=2" \
       -c:a libmp3lame -q:a 9 \
       "$DIR/sample.mp3"

# Rotated clip (portrait, 90° rotation metadata)
ffmpeg -y -f lavfi -i "testsrc=duration=2:size=240x320:rate=30" \
       -f lavfi -i "sine=frequency=440:duration=2" \
       -c:v libx264 -crf 28 -preset ultrafast \
       -c:a aac -b:a 64k \
       -metadata:s:v rotate=90 \
       "$DIR/rotated.mov"

# VFR clip
ffmpeg -y -f lavfi -i "testsrc=duration=2:size=320x240:rate=30" \
       -f lavfi -i "sine=frequency=440:duration=2" \
       -c:v libx264 -crf 28 -preset ultrafast \
       -c:a aac -b:a 64k \
       -vsync vfr \
       "$DIR/vfr.mkv"

# Keyframe-dense clip (keyframe every 0.5 s) for stream-copy trim tests
ffmpeg -y -f lavfi -i "testsrc=duration=4:size=320x240:rate=30" \
       -f lavfi -i "sine=frequency=440:duration=4" \
       -c:v libx264 -crf 28 -preset ultrafast -g 15 \
       -c:a aac -b:a 64k \
       "$DIR/keyframes.mp4"

# Corrupt file (truncated)
head -c 512 "$DIR/sample.mov" > "$DIR/corrupt.mov"

echo "Fixtures generated in $DIR"
