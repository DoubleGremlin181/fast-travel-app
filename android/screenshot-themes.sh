#!/usr/bin/env bash
# Takes screenshots of all 9 appearance variants on the connected Android device.
# Usage: bash screenshot-themes.sh
set -e

PKG="sh.kavi.fasttravel"
PREFS_FILE="fast_travel_theme.xml"
OUT_DIR="$(dirname "$0")/screenshots/themes"
mkdir -p "$OUT_DIR"

VARIANTS=(MATERIAL MATERIAL_YOU MATERIAL_YOU_TINT GLASS GRADIENT_BLUE GRADIENT_PURPLE NEUMORPHISM AMOLED TRANSPARENT)
MODES=(LIGHT DARK)

write_prefs() {
  local variant="$1"
  local mode="$2"
  local xml="<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name=\"appearance_variant\">$variant</string>
    <string name=\"appearance_mode\">$mode</string>
</map>"
  # Write via run-as into app's private prefs directory
  echo "$xml" | adb shell "run-as $PKG sh -c 'cat > /data/data/$PKG/shared_prefs/$PREFS_FILE'"
}

launch_activity() {
  adb shell am start -n "$PKG/.ui.SearchActivity" --activity-clear-top >/dev/null 2>&1
  sleep 1.5
}

take_screenshot() {
  local name="$1"
  adb exec-out screencap -p > "$OUT_DIR/${name}.png"
  echo "saved ${name}.png"
}

for variant in "${VARIANTS[@]}"; do
  for mode in "${MODES[@]}"; do
    name="${variant,,}-${mode,,}"
    name="${name//_/-}"
    echo "Capturing $name..."
    write_prefs "$variant" "$mode"
    launch_activity
    take_screenshot "$name"
  done
done

echo "Done — screenshots in $OUT_DIR"
