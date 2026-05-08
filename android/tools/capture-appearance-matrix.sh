#!/usr/bin/env bash
set -euo pipefail

# Usage: capture-appearance-matrix.sh [output-dir]
# Requires: booted AVD/device with app installed, API 31+.
#
# For widget screenshots the widget must be pinned to the launcher home screen
# BEFORE running this script. Use:
#   adb shell am start -n sh.kavi.fasttravel/sh.kavi.fasttravel.debug.PinWidgetActivity
# and tap "Add" in the launcher dialog. Then `adb shell input keyevent KEYCODE_HOME`.

OUT="${1:-docs/screenshots/appearance-matrix-$(date +%Y-%m-%d)}"
PKG="sh.kavi.fasttravel"
PREFS_FILE="/data/data/${PKG}/shared_prefs/fast_travel_theme.xml"

mkdir -p "$OUT"

write_prefs() {
    local mode="$1" variant="$2" shape="$3"
    adb shell "run-as ${PKG} sh -c 'cat > ${PREFS_FILE}'" <<EOF
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="appearance_mode">${mode}</string>
    <string name="appearance_variant">${variant}</string>
    <string name="appearance_shape">${shape}</string>
    <int name="widget_opacity" value="100" />
    <int name="shortcut_rows" value="2" />
</map>
EOF
    # Force app to re-read prefs on next launch.
    adb shell am force-stop "${PKG}"
    # Refresh pinned widgets.
    adb shell am broadcast -a android.appwidget.action.APPWIDGET_UPDATE \
        -n "${PKG}/.ui.SearchWidgetProvider" >/dev/null 2>&1 || true
    sleep 0.4
}

capture_app() {
    local tag="$1"
    # -W blocks until the activity finishes launching. Without it, screencap
    # grabs the splash theme before SearchActivity has drawn content.
    adb shell am start -W -n "${PKG}/.ui.SearchActivity" >/dev/null
    # Poll until SearchActivity owns the focused window (handles post-start frame draw).
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        if adb shell dumpsys window windows 2>/dev/null \
            | grep -E "mCurrentFocus|mFocusedApp" | grep -q "SearchActivity"; then
            break
        fi
        sleep 0.2
    done
    sleep 0.5  # let first-frame composition settle
    adb exec-out screencap -p > "${OUT}/app-${tag}.png"
}

capture_widget() {
    local tag="$1"
    # Go home so the pinned widget is visible.
    adb shell input keyevent KEYCODE_HOME
    sleep 0.8
    # Pixel launcher places new widgets on a secondary page; swipe left to reach it.
    adb shell input swipe 900 1200 100 1200 150
    sleep 0.8
    adb exec-out screencap -p > "${OUT}/widget-${tag}.png"
}

# --- Matrix ---
VARIANTS=(MATERIAL MATERIAL_YOU MATERIAL_YOU_TINT GLASS GRADIENT_BLUE GRADIENT_PURPLE NEUMORPHISM AMOLED TRANSPARENT)
MODE=SYSTEM

# System light
echo "== System light =="
adb shell "cmd uimode night no"
sleep 0.5
for v in "${VARIANTS[@]}"; do
    write_prefs "$MODE" "$v" "PILL"
    capture_app "syslight-${v}"
    capture_widget "syslight-${v}"
done

# System dark
echo "== System dark =="
adb shell "cmd uimode night yes"
sleep 0.5
for v in "${VARIANTS[@]}"; do
    write_prefs "$MODE" "$v" "PILL"
    capture_app "sysdark-${v}"
    capture_widget "sysdark-${v}"
done

# Forced LIGHT on dark system
echo "== Forced light on dark =="
for v in MATERIAL_YOU GLASS GRADIENT_BLUE; do
    write_prefs "LIGHT" "$v" "PILL"
    capture_app "forced-light-${v}"
    capture_widget "forced-light-${v}"
done

# Forced DARK on light system
echo "== Forced dark on light =="
adb shell "cmd uimode night no"
for v in MATERIAL_YOU GLASS GRADIENT_BLUE; do
    write_prefs "DARK" "$v" "PILL"
    capture_app "forced-dark-${v}"
    capture_widget "forced-dark-${v}"
done

# Reset system to auto.
adb shell "cmd uimode night auto" >/dev/null 2>&1 || true

echo "Done. Screenshots in ${OUT}"
ls "$OUT" | wc -l | xargs echo "Files captured:"
