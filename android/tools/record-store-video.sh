#!/usr/bin/env bash
# Records a store-listing demo video of the Android app's search bar by booting a
# headless AVD, driving it with StoreVideoDriverTest, capturing the screen with
# `adb shell screenrecord`, and post-processing into a 16:9 promo MP4 (+ a portrait MP4).
#
# Mirrors the adb + run-as SharedPrefs pattern from android/screenshot-themes.sh.
#
# Usage:
#   bash android/tools/record-store-video.sh
#
# Output: docs/store-assets/google-play/promo-video.mp4 (16:9) and promo-video-portrait.mp4
# Requires: Android SDK (emulator, adb, platform-tools), an installed AVD, gradle
# wrapper, and the system `ffmpeg`. Run from anywhere; paths are resolved relative
# to this script.
#
# APP-SETUP (one-time, for the native-app destinations yt/w/mp):
#   The demo opens YouTube, Wikipedia and Maps as real apps. Maps ships with the
#   google_apis image. YouTube and Wikipedia must be installed on the AVD beforehand:
#     - Wikipedia (open-source):  adb install org.wikipedia.apk   (from f-droid.org)
#     - YouTube (universal APK incl. x86_64, from apkmirror.com):
#         # the preinstalled YouTube is a system app signed with the image key and is
#         # update-locked, so remove it first (needs a writable-system boot):
#         emulator -avd <avd> -writable-system ... ; adb root; adb remount
#         adb shell rm -rf /product/app/YouTube ; adb reboot
#         adb install youtube-universal.apk
#   This script then points app-links at them and grants YouTube's notification
#   permission. If an app isn't installed, that command simply opens in Chrome instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ANDROID_DIR/.." && pwd)"

PKG="sh.kavi.fasttravel"
PREFS_FILE="fast_travel_theme.xml"
TEST_CLASS="sh.kavi.fasttravel.ui.StoreVideoDriverTest"
OUT_DIR="$REPO_ROOT/docs/store-assets/google-play"
OUT_FILE="$OUT_DIR/promo-video.mp4"
OUT_FILE_PORTRAIT="$OUT_DIR/promo-video-portrait.mp4"
DEVICE_MP4="/sdcard/ft-store-demo.mp4"
RAW_MP4="$(mktemp -t ft-store-raw-XXXX.mp4)"

mkdir -p "$OUT_DIR"

# --- preconditions ----------------------------------------------------------
command -v emulator >/dev/null || { echo "emulator not on PATH (install Android SDK + emulator)"; exit 1; }
command -v adb >/dev/null || { echo "adb not on PATH (install platform-tools)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not on PATH"; exit 1; }

AVD="$(emulator -list-avds | head -n1 || true)"
if [[ -z "$AVD" ]]; then
  echo "No AVD found. Create one (avdmanager create avd ...) before recording." >&2
  exit 1
fi
echo "Using AVD: $AVD"

# --- boot the emulator headless --------------------------------------------
# No /dev/kvm in CI/cloud containers, so allow software emulation. swiftshader
# keeps GPU load down; screenrecord still captures the framebuffer.
EMU_ACCEL=()
[[ -e /dev/kvm ]] || EMU_ACCEL=(-no-accel)
echo "Booting emulator (headless)..."
emulator -avd "$AVD" -no-window -no-audio -no-snapshot -no-boot-anim \
  -gpu swiftshader_indirect "${EMU_ACCEL[@]}" >/tmp/ft-emulator.log 2>&1 &
EMU_PID=$!
cleanup() {
  adb shell rm -f "$DEVICE_MP4" >/dev/null 2>&1 || true
  kill "$EMU_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

adb wait-for-device
echo "Waiting for boot to complete..."
until [[ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == "1" ]]; do
  sleep 2
done
adb shell input keyevent 82 >/dev/null 2>&1 || true # dismiss keyguard if present

# --- build + install --------------------------------------------------------
echo "Building and installing debug + test APKs..."
( cd "$ANDROID_DIR" && ./gradlew --console=plain installDebug installDebugAndroidTest )

# --- force light theme via run-as SharedPrefs (same shape as screenshot-themes.sh) ---
echo "Forcing light theme..."
XML="<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name=\"appearance_variant\">MATERIAL</string>
    <string name=\"appearance_mode\">LIGHT</string>
</map>"
echo "$XML" | adb shell "run-as $PKG sh -c 'cat > /data/data/$PKG/shared_prefs/$PREFS_FILE'"

# --- prep external apps so navigations land on clean pages ------------------
# The demo navigates out to real destinations: web commands open in Chrome, `mp` opens
# the Maps app. Skip Chrome's first-run via a command-line flag file (read on debuggable
# emulator builds — no root needed) and grant Maps location up front so it doesn't prompt.
# The driver test additionally clicks through any remaining one-time promos off-camera.
# Requires an emulator with Chrome + Maps preinstalled (the google_apis dev AVD has both).
echo "Preparing Chrome / Maps for clean navigations..."
adb shell "echo 'chrome --disable-fre --no-first-run --no-default-browser-check' > /data/local/tmp/chrome-command-line" || true
adb shell chmod 644 /data/local/tmp/chrome-command-line 2>/dev/null || true
adb shell pm grant com.google.android.apps.maps android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true
adb shell pm grant com.google.android.apps.maps android.permission.ACCESS_COARSE_LOCATION 2>/dev/null || true

# Point app-links at the installed native-app destinations so yt/w open in-app (not
# Chrome), and pre-grant YouTube's notification permission so no dialog appears on camera.
# Harmless if an app isn't installed — the command then just opens in Chrome.
echo "Pointing app-links at YouTube / Wikipedia (if installed)..."
adb shell pm set-app-links-user-selection --user 0 --package com.google.android.youtube true \
  youtube.com www.youtube.com m.youtube.com youtu.be 2>/dev/null || true
adb shell pm set-app-links-user-selection --user 0 --package org.wikipedia true \
  wikipedia.org en.wikipedia.org en.m.wikipedia.org m.wikipedia.org 2>/dev/null || true
adb shell pm grant com.google.android.youtube android.permission.POST_NOTIFICATIONS 2>/dev/null || true

# Clear the app's search history so the focused-empty state shows no stale "Recent"
# entries from a previous run (the driver also clears it before every scenario).
adb shell "run-as $PKG rm -f /data/data/$PKG/shared_prefs/fast_travel_history.xml" 2>/dev/null || true

# --- record while the driver test drives the UI -----------------------------
# Launch the instrumentation directly (the APKs are already installed above) in the
# background, wait until SearchActivity is the foreground window, *then* start
# screenrecord. The driver's first phase warms up Chrome/Maps (dismissing first-run
# promos) while our app is NOT foreground, so that warm-up stays off-camera and only the
# real demo — starting on our empty search bar — is recorded.
INSTR="$PKG.test/androidx.test.runner.AndroidJUnitRunner"
INSTR_LOG="$(mktemp -t ft-store-instr-XXXX.log)"
adb shell am force-stop "$PKG" >/dev/null 2>&1 || true

echo "Launching driver test ($TEST_CLASS)..."
adb shell am instrument -w -e class "$TEST_CLASS" "$INSTR" >"$INSTR_LOG" 2>&1 &
INSTR_PID=$!

echo "Waiting for the app to reach the foreground (after off-camera warm-up)..."
for _ in $(seq 1 300); do
  if adb shell dumpsys window 2>/dev/null | grep -E 'mCurrentFocus|mFocusedApp' | grep -q "$PKG"; then
    break
  fi
  sleep 0.2
done

echo "Starting screenrecord..."
adb shell screenrecord --bit-rate 8000000 --time-limit 180 "$DEVICE_MP4" &
REC_PID=$!

wait "$INSTR_PID" 2>/dev/null || true   # block until the demo finishes
echo "Stopping screenrecord..."
adb shell pkill -INT screenrecord >/dev/null 2>&1 || true
wait "$REC_PID" 2>/dev/null || true
sleep 2 # let the file flush on device

if grep -qE 'FAILURES!!!|INSTRUMENTATION_(RESULT|STATUS): .*Error|^Error' "$INSTR_LOG"; then
  echo "WARNING: the driver test reported a failure — the video may be incomplete:" >&2
  sed 's/^/  /' "$INSTR_LOG" >&2 || true
fi

echo "Pulling recording..."
adb pull "$DEVICE_MP4" "$RAW_MP4"

# --- post-process: speed up, gentle pan/zoom, portrait -> 16:9 w/ blurred bg --
# SPEED  — footage is sped up for a punchy, fast-paced feel (the driver's holds are
#          sized assuming this). HEAD_TRIM drops the brief compose-settle frames at
#          launch. The blurred, scaled copy of the frame is the background; the sharp
#          portrait is overlaid centred (the standard phone-in-landscape promo look),
#          with a slow zoom toward the search bar to draw the eye. zoompan needs a
#          concrete size, so derive it from the actual recording resolution.
SPEED=2.7
HEAD_TRIM=0.6
RAW_W="$(ffprobe -v error -select_streams v:0 -show_entries stream=width  -of csv=p=0 "$RAW_MP4")"
RAW_H="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$RAW_MP4")"
echo "Post-processing -> $OUT_FILE"
ffmpeg -y -ss "$HEAD_TRIM" -i "$RAW_MP4" -filter_complex "\
[0:v]setpts=PTS/${SPEED},fps=30[s];\
[s]split=2[bg][fg];\
[bg]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=20:2[bgb];\
[fg]zoompan=z='min(zoom+0.00012,1.15)':d=1:x='iw/2-(iw/2)/zoom':y='ih*0.12-(ih*0.12)/zoom':s=${RAW_W}x${RAW_H},scale=-2:720[fgs];\
[bgb][fgs]overlay=(W-w)/2:0,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -an "$OUT_FILE"

SIZE_KB=$(( $(stat -c%s "$OUT_FILE" 2>/dev/null || stat -f%z "$OUT_FILE") / 1024 ))
echo "Done -> ${OUT_FILE#"$REPO_ROOT/"} (${SIZE_KB} KB)"

# --- portrait version: native phone aspect, no blur/letterbox -----------------
# Same speed-up + gentle zoom, but kept full-frame portrait and scaled to 1280 tall
# (so a phone mockup / portrait placement isn't stretched or padded).
echo "Post-processing -> $OUT_FILE_PORTRAIT"
ffmpeg -y -ss "$HEAD_TRIM" -i "$RAW_MP4" -vf "\
setpts=PTS/${SPEED},fps=30,\
zoompan=z='min(zoom+0.00012,1.15)':d=1:x='iw/2-(iw/2)/zoom':y='ih*0.12-(ih*0.12)/zoom':s=${RAW_W}x${RAW_H},\
scale=-2:1280,format=yuv420p" \
  -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -an "$OUT_FILE_PORTRAIT"
SIZE_KB_P=$(( $(stat -c%s "$OUT_FILE_PORTRAIT" 2>/dev/null || stat -f%z "$OUT_FILE_PORTRAIT") / 1024 ))
echo "Done -> ${OUT_FILE_PORTRAIT#"$REPO_ROOT/"} (${SIZE_KB_P} KB)"

rm -f "$RAW_MP4" "$INSTR_LOG"
