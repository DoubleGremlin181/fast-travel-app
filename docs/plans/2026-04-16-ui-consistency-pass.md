# UI Consistency & Polish Pass Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix verified UI consistency and polish issues across the Fast Travel extension and Android app so that the two surfaces feel like the same product and pass a standards audit.

**Architecture:** Two independent codebases (TypeScript extension + Kotlin Compose Android). Most fixes are local file edits; two require small additions of existing capabilities to the other platform.

**Tech Stack:** TypeScript/HTML/CSS (extension), Kotlin + Jetpack Compose + Material 3 (Android).

---

## Findings summary

Captured 42 screenshots (ext + Android), ran two review passes (consistency + red-team), and verified findings against code. Distilled to the fixable issues below. Every item listed is verified against code; items that were surmised but turned out to be false (auto-ignore missing from ext, default command missing from ext) are dropped.

## Task priorities

**P0 — Cross-platform parity (things that feel like different apps)**

- Task 1: Android — swap search bar leading icon to command favicon when a command is matched (ext already does this)
- Task 2: Extension Config Source — add "Clear icon cache" and "Reset to remote default" (Android has both)
- Task 3: Pluralization — `1 item` vs `N items` on settings/config-source + ignore list (both platforms)

**P1 — Red-team fixes (discoverability & clarity)**

- Task 4: Extension popup — replace settings-shortcut menu with a usable quick command input
- Task 5: Settings appearance — rename shape presets so names reflect corner radius ordering and unify Android widget shape preset names with extension
- Task 6: Settings section casing — pick one convention (use Material 3 Title Case on both) and apply
- Task 7: Shape preset live preview on extension — make the appearance screen preview update when a shape is selected (currently static)

**P2 — Polish**

- Task 8: Extension history dropdown readability — audit that the input remains full opacity and text remains AA contrast when dropdown is open (flagged in red-team review on `ext-newtab-light.png`)
- Task 9: Android — vertical centering adjustment for main search (currently top-weighted with empty bottom half)
- Task 10: Settings section order alignment — both platforms present Commands → Groups → Ignore List → Config Source (Android currently has Config Source first in Configuration)

**P3 — Documentation-only (leave in plan for reference)**

- Group color rendering reconciliation (circles vs squares) — see notes at end of plan
- Search bar height match (ext 52px / Android 48dp) — see notes at end of plan
- Default command / additional UX items — defer

---

## Task 1: Android — swap search bar leading icon to command favicon on match

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchActivity.kt` around line 543–612 (`SearchBarPill` composable)
- Reference: `extension/src/newtab/newtab.ts:361` for the extension's behavior

**What:** When the current query parses to a recognized command (i.e. `viewModel.matchCommandForQuery(query)` returns non-null), the leading icon in `SearchBarPill` should render the command's favicon instead of the generic search glass. On clear / unmatch, revert to the magnifier.

**Step 1: Read current `SearchBarPill` signature and call site.**
- The composable currently receives `query` and renders `Icon(Icons.Default.Search, …)` at the leading position
- Calling site in `SearchScreen()` has access to `viewModel` and `chipCommands` / `matchedCommand` state

**Step 2: Add a `leadingCommand: Command?` parameter to `SearchBarPill`.**
When non-null, replace the `Icon` call with a `CommandFavicon(command = leadingCommand, size = 24.dp)` wrapped in a small padding box to match the search-icon dimensions.

**Step 3: Wire the parameter at call site.**
In `SearchScreen`, compute the matched command (use the same state path the existing chip uses — look for `matchedCommand` or equivalent in `SearchViewModel`). Pass it into `SearchBarPill`.

**Step 4: Build and verify.**
Run:
```
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Launch, type `yt`, capture screen, confirm leading icon changed.

**Step 5: Commit** (single commit per task unless scope requires splitting).

---

## Task 2: Extension Config Source — add "Clear icon cache" and "Reset to remote default"

**Files:**
- Modify: `extension/src/options/screens/config-source.ts`
- Likely add helper in: `extension/src/options/data.ts` (or wherever icon-cache + config-write helpers live)
- Reference for expected UX: Android `SettingsActivity.kt:1046–1097`

**What:** Add two rows (or a new card section) below the existing refresh section:
1. "Clear icon cache" — invalidates favicon storage so the next render re-fetches
2. "Reset to remote default" — wipes local overrides and re-syncs from the source URL. Confirm with a dialog before destructive action.

**Step 1:** Find where icon/favicon caching lives. Likely `extension/src/ui/favicon.ts` plus a storage key in `extension/src/background/`. Use Grep to locate: `ft-favicon-cache`, `faviconCache`, `icon-cache`.

**Step 2:** Find where local config overrides are stored. Likely `extension/src/core/local-overrides.ts` or similar. Locate a clear/reset function.

**Step 3:** Add two new `<section class="card">` blocks to `renderConfigSource`. Each with one clickable row. Use `btn-row` / existing styling. For "Reset to remote default", use a native `confirm()` or a small dialog.

**Step 4:** Rebuild extension:
```
cd extension && npm run build
```

**Step 5:** Re-run screenshot harness:
```
node dev-harness/screenshot.mjs
```
Verify `opt-config-source.png` now shows the two new sections.

**Step 6:** Commit.

---

## Task 3: Pluralization — `1 item` vs `N items`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt:668`
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt:659` (`"$groupCount groups"`)
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt:649` (`"$commandCount commands"`)
- Scan for other instances across the codebase

**What:** Wrap count strings in a `pluralize` helper. Keep the helper local to the file — no new resource files needed.

**Step 1:** Add a small local helper in `SettingsActivity.kt`:
```kotlin
private fun pluralize(count: Int, singular: String, plural: String = "${singular}s"): String =
    if (count == 1) "1 $singular" else "$count $plural"
```

**Step 2:** Replace the three call sites on lines 649, 659, 668.

**Step 3:** Grep the whole Android module for other `"${'$'}...count.*items"` / `"${'$'}...size"` patterns:
```
Grep(pattern = '\\$\\{?[a-zA-Z_.]+\\}? (items|commands|groups|triggers|devices)', path = 'android/')
```

**Step 4:** Extension: repeat the audit in `extension/src/`. Add a TS helper in `extension/src/ui/pluralize.ts` and import where needed.

**Step 5:** Rebuild, re-screenshot. Verify `android-10-settings-home.png` shows `1 item` not `1 items`.

**Step 6:** Commit.

---

## Task 4: Extension popup — make it a usable search input

**Files:**
- Modify: `extension/src/popup/popup.html`, `extension/src/popup/popup.ts`, `extension/src/popup/popup.css`
- Reference: `extension/src/newtab/newtab.ts` (input handling + dropdown patterns to reuse)

**What:** Replace the popup content with a search input that behaves like a miniaturized newtab — type a command, Enter submits, Tab accepts suggestion.

**Design:**
- Keep the top header (logo + title + subtitle + version)
- Replace the "Open settings" button with a pill-shaped text input styled to match the newtab input (scaled down to ~40px height)
- Below the input, show up to 5 suggestion rows (command autocompletes) — reuse the `renderFavicon` + row layout from newtab
- Below suggestions, keep the "Open settings" link as a smaller footer action (e.g., gear icon + "Settings")
- On submit, open a new tab with the matched command's URL and close the popup

**Step 1:** Grep `extension/src/newtab/newtab.ts` for the autocomplete / dropdown logic. Identify what can be re-exported as a shared helper.

**Step 2:** Extract shared helpers (e.g. `resolveTriggerCommand(query, config)`) into `extension/src/ui/command-match.ts` if not already there.

**Step 3:** Rewrite `popup.html` with a search input + suggestions container.

**Step 4:** Rewrite `popup.ts` to wire input → debounce → render suggestions → Enter to submit.

**Step 5:** Adjust `popup.css` — widen popup to 340px, cap height at 400px, match newtab input styling.

**Step 6:** Rebuild extension, open chrome with extension, screenshot popup manually via the icon in toolbar (or update dev-harness popup-preview.html to include input behavior). Verify.

**Step 7:** Commit.

---

## Task 5: Shape preset naming

**Files:**
- Modify: `extension/src/options/screens/appearance.ts` (4 preset labels)
- Modify: `extension/src/ui/appearance.ts` (if labels are there)
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt` (WidgetAppearance shape preset names — currently "Classic Pill / Rounded Rectangle / Minimal Square / Soft Rounded")

**What:** Normalize preset naming across both platforms, ordered from most rounded → most square so the names hint at the visual order.

Target names (apply to both):
- `Pill` (fully rounded)
- `Soft` (large radius)
- `Rounded` (medium radius)
- `Square` (small radius, near-right-angle)

**Step 1:** Update extension labels in `appearance.ts`. Change `Minimal 8 px` → `Square`; change `Rounded 16 px` → `Rounded`; keep `Pill`; change `Soft 20 px` → `Soft`. Drop the "8 px / 16 px" suffixes — they're noise.

**Step 2:** Update Android labels in `SettingsActivity.kt` WidgetAppearanceScreen. Same four names.

**Step 3:** If enum names are used for persistence, DO NOT change the enum internal names — only the user-facing display string.

**Step 4:** Rebuild both, screenshot, verify labels changed.

**Step 5:** Commit.

---

## Task 6: Settings section casing consistency

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt` — find `SettingsCategoryHeader(title = "APPEARANCE")` etc.

**What:** Android currently uses `ALL CAPS` for category headers (`APPEARANCE`, `CONFIGURATION`, `WIDGET`, `HISTORY`, `ABOUT`), while Material 3 convention uses Title Case for visible headers and reserves caps for "overlines" (tiny labels inside card). Extension uses Title Case. Unify on Title Case.

**Step 1:** Locate `SettingsCategoryHeader` composable definition. If it applies `.uppercase()` or uses `letterSpacing` with all-caps styling, remove the `.uppercase()` transformation. Keep the small size / medium weight.

**Step 2:** Update any hardcoded call sites to pass Title Case strings.

**Step 3:** Rebuild, screenshot, verify.

**Step 4:** Commit.

---

## Task 7: Appearance shape preset — live preview on extension

**Files:**
- Modify: `extension/src/options/screens/appearance.ts`

**What:** The shape preset cards in `ext-opt-appearance-light.png` each show the shape, but selecting a card doesn't update the "preview" at the top of the section. Wire the preview to react.

**Step 1:** Locate the preview element in `appearance.ts` (it's a small search-bar mock at the top of the appearance section — or it may not exist yet; red-team flagged the static behavior).

**Step 2:** If a preview doesn't exist, add a small one at the top of the Appearance screen. Give it class `appearance-preview` and bind its `--radius` custom property to the selected shape.

**Step 3:** On shape-card click, update the preview's inline style.

**Step 4:** Rebuild, re-run screenshot harness, verify `opt-appearance-*.png` reflects change.

**Step 5:** Commit.

---

## Task 8: Extension history dropdown readability

**Files:**
- Modify: `extension/src/newtab/newtab.css` (suggestion dropdown / history overlay rules)
- Reference: `ext-newtab-light.png` — red-team flagged that the input appears "near-invisible" when history dropdown is open in light mode

**What:** Audit stacking / opacity on the suggestions dropdown. Ensure:
- Input retains `opacity: 1` and fully contrasts when dropdown open
- Dropdown background is opaque (no `backdrop-filter` dropping effective contrast below AA)
- Dropdown and input visually connect (input bottom corners square when dropdown shows) — this was an earlier NFR too

**Step 1:** Run the screenshot harness, open `ext-newtab-light.png` in feh / image viewer, then intentionally trigger the dropdown (modify the harness to add `type: "a"` to a new light variant and a `dropdown-open` version). Identify the visual defect.

**Step 2:** Read `newtab.css`. Look for `.suggestions`, `.suggestion-item`, `.search-wrap`, `input`. Find any rule that reduces opacity when `[data-dropdown-open]` or similar.

**Step 3:** Fix — likely: remove any `opacity: 0.x` on the container when dropdown is open; ensure `.suggestions` uses `background: var(--surface)` with no alpha; ensure input border/text stays fully opaque.

**Step 4:** Rebuild, re-screenshot, verify.

**Step 5:** Commit.

---

## Task 9: Android main search — vertical centering

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchActivity.kt` (`UnfocusedContent` or the root Column inside `SearchScreen`)

**What:** Currently the title + search bar + chip row all hug the top ~40% of the screen, leaving the bottom ~60% empty and awkward. Push the content toward vertical center when unfocused.

**Step 1:** In the root Column for unfocused layout, wrap the title+bar+chips block in a Column with `modifier = Modifier.weight(1f)` pushed to center with spacers above and below. Use `verticalArrangement = Arrangement.Center` on an outer Box, or add a `Spacer(weight=0.3f)` top / `Spacer(weight=0.7f)` bottom to bias slightly toward upper third (ergonomic for thumb reach).

**Step 2:** Rebuild, install, screenshot unfocused state. Verify content sits closer to vertical center but still allows for the eventual history/suggestions when focused.

**Step 3:** Make sure the focus transition (keyboard popping up, transitioning to `FocusedContent`) still works smoothly and content doesn't jump awkwardly. Re-capture focused-empty and suggestions states.

**Step 4:** Commit.

---

## Task 10: Settings section order

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt` — inside `SettingsHomeScreen`, the `CONFIGURATION` card currently lists Config Source → Commands → Groups → Ignore List → Default Command.

**What:** Reorder to Commands → Groups → Ignore List → Config Source → Default Command so it matches the extension sidebar order and mirrors how users think about their data (their content first, administration second).

**Step 1:** Locate the `SettingsCategoryHeader(title = "Configuration")` block in `SettingsActivity.kt` (around line 625).

**Step 2:** Reorder the `NavigableListItem` calls inside that SettingsCard.

**Step 3:** Rebuild, screenshot, verify.

**Step 4:** Commit.

---

## Notes (not in task list, documented for followup)

### Group color rendering reconciliation (decide, don't implement here)

- Extension: 24×24 rounded rectangles with `--tint-*-fill` (pastel) + `--tint-*-fg` border at 25% alpha
- Android: 32dp circles filled with saturated color (light-mode derived from Google palette)

**Recommendation (needs separate decision):** adopt the Android approach (saturated circles) on both platforms at 16dp/px size. Saturated circles scan faster and the pastel pill approach already exists on ext for command-trigger chips — using it for both dilutes the signal.

### Search bar height (keep as-is)

Ext 52px vs Android 48dp read as different. Android 48dp is the Material minimum for touch targets. Ext could drop to 48px for parity, or Android could bump to 52dp. Both feel "right" for their platform. Recommend: leave as-is.

### Widget appearance complexity

Red-team flagged 11 variants as feature creep. This is a power-user surface and changing it affects existing users' pinned widgets. Defer until there's data on usage.

### Command editor field ordering

Ext and Android have slightly different field orderings. Both expose the right fields. Aligning would be nice-to-have. Defer until Task 4 (popup rewrite) — any shared component extraction can inform this too.

### Onboarding

Red-team flagged no first-run coach mark. Adding one is a medium-scope task on its own (first-run detection, coach-mark component, dismissal persistence per-platform). Defer to dedicated plan.
