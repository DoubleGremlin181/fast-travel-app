# Settings Simplification & Config Import/Export — Design

**Date:** 2026-04-24

## Overview

Simplify the settings navigation on both the Android app and browser extension so they share the same conceptual structure. Replace the split override model on the extension with a single full-document config model matching Android. Add a dedicated Import/Export page inside the Configuration section.

---

## 1. Settings Navigation Structure

### Android (flat, no category headers)

| Item | Navigates to |
|---|---|
| Appearance | Appearance screen |
| Configuration | Configuration sub-page |
| Ignore list | Ignore list screen |
| History | Search history screen |
| About | About screen |

### Extension sidebar

| Item | Navigates to |
|---|---|
| Appearance | Appearance screen |
| Configuration | Configuration sub-page |
| Ignore list | Ignore list screen |
| History | History screen |
| Set as default | Search engine screen (browser-specific) |
| About | About screen |

### Configuration Sub-page (both platforms)

| Item | Notes |
|---|---|
| Commands | Existing commands list screen |
| Groups | Existing groups list screen |
| Default command | Inline picker (existing) |
| Import / Export | New sub-page (replaces Config source) |

---

## 2. Config Model

### Unified full-document model

Both platforms store exactly one full `FastTravelConfig` JSON. The extension's local overrides model is removed entirely — no migration (internal testing only).

### Dirty flag

A boolean `configSourceDirty` flag tracks whether the stored config has been locally edited since the last URL import.

**Sets dirty = true (disables auto-refresh):**
- Any write to the config JSON: add/edit/delete command, group, ignore word, default command

**Clears dirty (re-enables auto-refresh):**
- Import from URL with a non-manual interval
- "Reset to remote" action

### Storage

**Extension (`chrome.storage.local`):**
- `fast-travel-config` — full config JSON (existing)
- `fast-travel-config-url` — last imported URL (existing)
- `fast-travel-refresh-interval` — interval: `"manual" | "daily" | "weekly"` (existing)
- `fast-travel-config-dirty` — new boolean flag

**Android (`ThemePreferences` SharedPreferences):**
- `configSourceUrl` — last imported URL (existing)
- `configRefreshInterval` — interval (existing)
- `configSourceDirty` — new boolean field

Background refresh workers check the dirty flag before fetching; if dirty, they skip silently.

---

## 3. Import/Export Sub-page

### Layout (both platforms)

```
Import
  [Choose file]  or  [URL field]  [Fetch & Import]
  Auto-refresh:  ○ Manual  ○ Daily  ○ Weekly
  (interval selector only active when URL is filled)

Export
  [Export config]

Source status
  "Synced from <url> · X hours ago"   ← when auto-refresh active
  "Local config · auto-refresh paused"  ← when dirty or no URL

  [Reset to remote]  (destructive, only shown when URL is stored)
```

### Import from file

1. User picks a `.json` file
2. Validated against schema (version field + required structure)
3. On success: replace stored config, set dirty = true
4. On failure: show error, existing config unchanged

### Import from URL

1. User enters URL, taps "Fetch & Import"
2. Fetch + validate (same schema check)
3. On success: replace stored config
4. If interval is non-manual: clear dirty flag, save URL, schedule background refresh
5. If interval is manual: set dirty = true (no background refresh), save URL for manual re-fetch

### Export

- Serialise current `FastTravelConfig` to JSON
- Extension: browser file download
- Android: system share sheet (`.json` MIME type)

### Background refresh guard

On each scheduled refresh tick:
1. Check dirty flag — if true, skip and clear the alarm (safety guard; should not normally be reached since edits clear the alarm immediately)
2. Fetch URL → validate → on success replace config, update last-synced timestamp

---

## 4. Testing Plan

### Android (AVD `fast_travel_dev`, API 34)

Boot sequence: `./gradlew --stop` → cold-boot with `-no-snapshot -gpu swiftshader_indirect -memory 3072 -cores 2 -no-boot-anim -no-audio`

**Config editing — all paths save and export correctly:**
- Add command → export → command in JSON
- Edit command (name, trigger, route, pattern) → export → changes reflected
- Delete command → export → command absent
- Add/edit/delete group → export → groups correct
- Change default command → export → `defaultCommand` updated
- Add/remove ignore word → export → `ignoreList` updated

**Dirty tracking:**
- Import from URL with daily interval → status shows "Synced from …"
- Edit any command → status shows "Local config · auto-refresh paused"
- Verify background worker skips when dirty
- Reset to remote → config replaced, status back to "Synced from …"

**Import validation:**
- Valid file → accepted
- Malformed JSON → rejected, existing config unchanged
- Wrong schema version → rejected, existing config unchanged
- Valid URL → accepted
- URL returning 404 / invalid JSON → rejected

**Export round-trip:**
- Export → re-import → config identical

### Extension (Playwright, headless Chrome with extension loaded)

Same test matrix as Android, exercised through the extension options page.

---

## 5. Out of Scope

- Migration of existing extension overrides (dropped; internal testing only)
- Per-field conflict resolution between remote and local config
- Multi-source config (more than one URL)
