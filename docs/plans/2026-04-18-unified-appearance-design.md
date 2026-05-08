# Unified Appearance — Design

Date: 2026-04-18
Status: Approved, ready for implementation plan.

## Goal

Merge the separate "Appearance" and "Widget" settings so a single appearance choice drives both the in-app search bar and the home-screen widget. The two surfaces must align 100%. Android ships first; the browser extension gets feature parity after.

## Key decisions

1. Variant is a **full-app skin** — the selected variant (Glass, Gradient, AMOLED, etc.) applies to the entire app chrome plus the widget, not only the search bar.
2. Two independent axes: **Mode** (Light / Dark / System) × **Variant** (9 options). Every variant has a light flavor and a dark flavor; `System` follows the OS.
3. Settings live on a single **nested "Appearance" screen** with one live preview of the search bar. Since app and widget are identical by contract, one preview suffices.
4. **Opacity applies to the widget only.** The in-app bar is always fully opaque.
5. **No backwards compatibility / migration.** Old preferences are discarded; fresh defaults on upgrade.
6. Architecture uses a **hybrid** approach: one `Appearance` struct carries both a Material 3 `ColorScheme` (so text/icons inherit correctly) and surface overlays (brushes, borders, blur, shadows) consumed by both Compose and RemoteViews.

## Variant catalog (9)

| Variant | Look | Compose | Widget (RemoteViews) |
|---|---|---|---|
| Material | Default tonal palette from brand accent | `MaterialTheme` colors | Solid fill from `colorScheme.surfaceContainerHigh` |
| Material You | Full M3 dynamic tonal scheme (`dynamicLightColorScheme` / `dynamicDarkColorScheme`) | Native M3 dynamic | Same scheme, painted as solid fill |
| Material You Tint | Wallpaper accent tokens (`system_accent1_100` fill, `system_accent1_600` accent) | Custom color set inside `ColorScheme` | Same tokens as solid fill |
| Glass | Translucent fill + backdrop blur | `BlurEffect` via `graphicsLayer` on Android 12+ | Pre-rendered blurred-wallpaper bitmap |
| Gradient Blue | Denim linear gradient | `Brush.linearGradient` painted behind surfaces | Gradient bitmap |
| Gradient Purple | Purple → indigo gradient | Same | Same |
| Neumorphism | Soft mono palette, dual inner/outer shadows | Composable shadow modifiers | Approximated via baked bitmap |
| AMOLED | Pure `#000000` surfaces + saturated accent | Overrides mode to dark-dominant for surfaces | Black fill, grey border |
| Transparent | Inherits mode colors; bar gets transparent fill + accent border only | `searchBarBrush = transparent`, `searchBarBorder = 1.5dp accent` | Same |

**Mode × Variant interactions:**
- `AMOLED` ignores Mode for surfaces (always black) but respects Mode for text tint.
- `Material You` on Android <12 falls back to `Material`.
- `Material You Tint` on Android <12 falls back to the brand Light/Dark palette.

## Data model (Android)

**File:** `data/ThemePreferences.kt`

New enums (replace `ThemeMode`, `WidgetStyleVariant`, `WidgetShapePreset`):

```kotlin
enum class AppearanceMode { LIGHT, DARK, SYSTEM }

enum class AppearanceVariant {
    MATERIAL, MATERIAL_YOU, MATERIAL_YOU_TINT,
    GLASS, GRADIENT_BLUE, GRADIENT_PURPLE,
    NEUMORPHISM, AMOLED, TRANSPARENT
}

enum class AppearanceShape(val cornerRadiusDp: Int) {
    PILL(999), SOFT(20), ROUNDED(16), SQUARE(8)
}
```

**SharedPreferences keys (`fast_travel_theme`):**
- `appearance_mode`, `appearance_variant`, `appearance_shape` — string enum names
- `widget_opacity` — int, 0–100, default 100 (widget-only)
- `shortcut_rows` — int, 1–3, default 2

**Deleted keys:** `theme_mode`, `dynamic_colors`, `widget_style_variant`, `widget_shape_preset`, `widget_corner_radius`. No migration.

**Exposed API on `ThemePreferences`:** `mode`, `variant`, `shape`, `widgetOpacity`, `shortcutRows`.

## Resolver & integration (Android)

**New file:** `ui/appearance/Appearance.kt` (~300 lines)

```kotlin
data class ResolvedAppearance(
    val mode: AppearanceMode,            // SYSTEM collapsed to LIGHT or DARK
    val variant: AppearanceVariant,
    val shape: AppearanceShape,
    val colorScheme: ColorScheme,        // for MaterialTheme
    val surfaceBrush: Brush?,            // gradients / AMOLED / Glass tint; null = flat
    val searchBarBrush: Brush,
    val searchBarBorder: BorderStroke?,  // AMOLED, Transparent, Glass
    val applyBlur: Boolean,              // Glass on Android 12+
    val useNeumorphShadows: Boolean,
    // RemoteViews (bitmap) fields — ints, not Brush
    val widgetFill: Int,
    val widgetGradient: IntArray?,
    val widgetBorderColor: Int?,
    val widgetBorderDp: Float,
    val widgetTextColor: Int,
    val widgetIconColor: Int,
    val widgetAccentColor: Int,
)

fun resolveAppearance(
    context: Context,
    mode: AppearanceMode,
    variant: AppearanceVariant,
    shape: AppearanceShape,
): ResolvedAppearance
```

**Integration — Compose:**
- `ui/theme/Theme.kt::FastTravelTheme` takes `ResolvedAppearance`, uses `colorScheme` inside `MaterialTheme`, exposes `LocalAppearance` `CompositionLocal`.
- `ui/SearchActivity.kt::SearchBarPill` (line 591) reads `LocalAppearance.current` for brush, border, shape — replaces the hardcoded `RoundedCornerShape(28.dp)` and `surfaceContainerHigh` background.
- Top-level wrappers in `SearchActivity` + `SettingsActivity` paint `surfaceBrush` behind content; blur layer for Glass on Android 12+.
- `ui/SearchActivity.kt:274` and `SettingsActivity` theme calls switch from `(themeMode, dynamicColors)` → `(mode, variant, shape)`; `LaunchedEffect` observes all three.
- `ui/WidgetPreview.kt` renders through `LocalAppearance` — pixel-equivalent to the live widget.

**Integration — RemoteViews:**
- `ui/SearchWidgetProvider.kt::updateAppWidget` calls `resolveAppearance(...)` and uses the `widget*` fields. `resolveStyle`, `materialYouColors`, `materialYouAppStyle` (lines 161–329) are deleted — folded into the resolver.
- `widgetOpacity` applied in `renderBackgroundBitmap` as today.

## Settings UI (Android)

**Home screen (`ui/SettingsActivity.kt` lines 517–631):** delete inline APPEARANCE block and the WIDGET nav item. Replace with a single `NavigableListItem` → "Appearance" under an `APPEARANCE` category header.

**New `AppearanceScreen`** (replaces `WidgetAppearanceScreen` lines 712–888):
1. Live preview box (reuses `WidgetPreview`, now driven by `LocalAppearance`)
2. Mode segmented control (Light / Dark / System)
3. Variant picker — horizontal `LazyRow` of 9 thumbnails (each renders a mini preview in the user's current mode)
4. Shape picker — horizontal `LazyRow` of 4 thumbnails (Pill / Soft / Rounded / Square)
5. Opacity slider 0–100%, labeled "Widget opacity" with "Applies to the home-screen widget only."
6. Shortcut rows slider, 1–3, labeled "Shortcut rows on widget."

Single `AppearanceDraft` state `{mode, variant, shape, opacity, shortcutRows}`. `LaunchedEffect(draft)` persists and calls `SearchWidgetProvider.refreshAll` debounced 150ms for slider events.

## Extension feature parity

**Storage:** `chrome.storage.sync` key `fast-travel-appearance` = `{ mode, variant, shape, accent? }`. Deprecates `localStorage ft-theme` and the split `chrome.storage.local` shape key. Pre-paint flash avoidance via a `chrome.storage.session` mirror populated on install/update.

**Variant implementation:** `extension/src/ui/variants.css` — `[data-variant][data-mode]` attribute selectors set `--search-bar-bg`, `--search-bar-border`, `--search-shape-radius`, `--primary`, `--surface`, `--on-surface`. Backdrop-filter for Glass, CSS `linear-gradient` for gradients, dual `box-shadow` for Neumorphism, black for AMOLED.

**Material You in the browser:** no wallpaper API, so offer an accent-color picker (visible only when variant is Material You or Material You Tint) and generate the tonal palette via `@material/material-color-utilities` (~10KB gzipped, Google's MIT library).

**Settings UI (`options/screens/appearance.ts`):** Mode radios · Variant grid (9 thumbnails) · Shape grid (4) · Accent picker (conditional) · Live preview.

**Popup parity fix:** `popup/popup.ts` calls `applyAppearance()` on init and subscribes to `chrome.storage.onChanged`; `popup.css` replaces hardcoded `--radius-pill` with `var(--search-shape-radius)`.

**File changes:**
- Add: `ui/variants.css`, `ui/material-you.ts`
- Modify: `ui/appearance.ts`, `ui/apply-theme.ts`, `ui/tokens.css`, `options/screens/appearance.ts`, `popup/popup.ts`, `popup/popup.css`, `newtab/newtab.css`
- Delete: `ui/theme.ts` (absorbed)
- Dependency: `@material/material-color-utilities`

## Testing

### Android (AVD)

Build with `./gradlew :app:assembleDebug`; install via `adb install -r`. Write test prefs directly as XML via `run-as sh.kavi.fasttravel` (avoids `adb input text` silent-typo issues).

**Matrix (48 screenshots):**
- 9 variants × Mode=System, system light
- 9 variants × Mode=System, system dark (`adb shell cmd uimode night yes`)
- 3 representative variants × Mode=Light forced on dark system
- 3 representative variants × Mode=Dark forced on light system
- Both surfaces per combo: in-app search bar + widget pill

Capture via `adb exec-out screencap -p`. Subagent reviews batches of ~6 screenshots, reports: rendered? widget matches in-app bar? text contrast ok? render bugs?

**Memory plan:** emulator lives inside a short-lived subagent (build → capture → kill) to keep 14GB RAM viable. Fallback: run on physical device while Claude scripts pref-writes.

### Extension (Playwright)

New harness `extension/ft-pw-appearance.mjs`, extends existing `ft-pw-*` patterns.

**Matrix (~30 screenshots):** 9 variants × (light/dark) across newtab and popup surfaces.

**Flow:** set `chrome.storage.sync` via `chrome.scripting.executeScript`; navigate; wait for paint; screencap; repeat. Subagent reviews batches.

### Completion gate

- All variants render without crash on both platforms.
- No P0 issues in subagent reviews.
- Spot-check: `Material + System` in-app bar and widget pill are visually identical.

## Out of scope

- iOS (architecture already defers).
- Backwards-compatible preference migration.
- Custom user-defined variants / user-editable palettes beyond the Material You accent picker.
