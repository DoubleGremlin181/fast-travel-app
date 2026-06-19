#!/usr/bin/env bash
# Records a store-listing demo video of the Android app's search bar by booting a
# headless AVD, driving it with StoreVideoDriverTest, capturing the screen with
# `adb shell screenrecord`, and post-processing into a 16:9 promo MP4.
#
# Mirrors the adb + run-as SharedPrefs pattern from android/screenshot-themes.sh.
#
# Usage:
#   bash android/tools/record-store-video.sh
#
# Output: docs/store-video/android.mp4
# Requires: Android SDK (emulator, adb, platform-tools), an installed AVD, gradle
# wrapper, and the system `ffmpeg`. Run from anywhere; paths are resolved relative
# to this script.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANDROID_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ANDROID_DIR/.." && pwd)"

PKG="sh.kavi.fasttravel"
PREFS_FILE="fast_travel_theme.xml"
TEST_CLASS="sh.kavi.fasttravel.ui.StoreVideoDriverTest"
OUT_DIR="$REPO_ROOT/docs/store-video"
OUT_FILE="$OUT_DIR/android.mp4"
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

# --- record while the driver test runs --------------------------------------
echo "Starting screenrecord..."
adb shell screenrecord --bit-rate 8000000 --time-limit 180 "$DEVICE_MP4" &
REC_PID=$!
sleep 1

echo "Running driver test ($TEST_CLASS)..."
( cd "$ANDROID_DIR" && ./gradlew --console=plain connectedDebugAndroidTest \
    -Pandroid.testInstrumentationRunnerArguments.class="$TEST_CLASS" ) || true

echo "Stopping screenrecord..."
adb shell pkill -INT screenrecord >/dev/null 2>&1 || true
wait "$REC_PID" 2>/dev/null || true
sleep 2 # let the file flush on device

echo "Pulling recording..."
adb pull "$DEVICE_MP4" "$RAW_MP4"

# --- post-process: trim, gentle pan/zoom, portrait -> 16:9 with blurred bg ---
# Composite a blurred, scaled copy of the frame as the background and overlay the
# sharp portrait centred — the standard phone-in-landscape promo look.
echo "Post-processing -> $OUT_FILE"
ffmpeg -y -i "$RAW_MP4" -filter_complex "\
[0:v]split=2[bg][fg];\
[bg]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=20:2[bgb];\
[fg]scale=-2:720[fgs];\
[bgb][fgs]overlay=(W-w)/2:0,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -an "$OUT_FILE"

SIZE_KB=$(( $(stat -c%s "$OUT_FILE" 2>/dev/null || stat -f%z "$OUT_FILE") / 1024 ))
echo "Done -> ${OUT_FILE#"$REPO_ROOT/"} (${SIZE_KB} KB)"
rm -f "$RAW_MP4"
