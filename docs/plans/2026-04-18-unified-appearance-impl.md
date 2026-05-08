# Unified Appearance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge Android's split "Appearance" and "Widget Appearance" settings into one unified Appearance surface that drives both the in-app search bar and the home-screen widget identically, then port the same model to the browser extension.

**Architecture:** Single `ResolvedAppearance` struct carries both a Material 3 `ColorScheme` (for MaterialTheme inheritance) and surface overlays (brushes, borders, blur, shadows). One `resolveAppearance(mode, variant, shape)` function is consumed by Compose (search bar, full-app skin, widget preview) AND RemoteViews (live widget), eliminating divergent rendering paths. Browser extension mirrors via `chrome.storage.sync`-backed appearance state and a `data-variant][data-mode]` CSS layer.

**Tech Stack:** Kotlin + Jetpack Compose (Android); TypeScript + CSS (extension, MV3); `@material/material-color-utilities` for extension Material You palette generation; `adb` + bash + subagents for screenshot testing; Playwright for extension testing.

**Design reference:** `docs/plans/2026-04-18-unified-appearance-design.md`

**Project note:** Not a git repo. "Commit" steps are replaced with compile/lint/test verification. The task list itself is the progress ledger.

---

## Phase A — Android: Data Model & Resolver Core

### Task A1: Create new appearance enums

**Files:**
- Create: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/appearance/Appearance.kt`

**Step 1: Write the enums**

```kotlin
package sh.kavi.fasttravel.ui.appearance

enum class AppearanceMode { LIGHT, DARK, SYSTEM;
    companion object {
        fun fromName(name: String?): AppearanceMode =
            entries.firstOrNull { it.name == name } ?: SYSTEM
    }
}

enum class AppearanceVariant(val displayName: String) {
    MATERIAL("Material"),
    MATERIAL_YOU("Material You"),
    MATERIAL_YOU_TINT("Material You — Tint"),
    GLASS("Glass"),
    GRADIENT_BLUE("Gradient Blue"),
    GRADIENT_PURPLE("Gradient Purple"),
    NEUMORPHISM("Neumorphism"),
    AMOLED("AMOLED"),
    TRANSPARENT("Transparent");
    companion object {
        fun fromName(name: String?): AppearanceVariant =
            entries.firstOrNull { it.name == name } ?: MATERIAL
    }
}

enum class AppearanceShape(val displayName: String, val cornerRadiusDp: Int) {
    PILL("Pill", 999),
    SOFT("Soft", 20),
    ROUNDED("Rounded", 16),
    SQUARE("Square", 8);
    companion object {
        fun fromName(name: String?): AppearanceShape =
            entries.firstOrNull { it.name == name } ?: PILL
    }
}
```

**Step 2: Verify compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL (the file is syntactically complete; no other files reference these yet).

---

### Task A2: Add ResolvedAppearance data class and resolver signature

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/appearance/Appearance.kt` (append)

**Step 1: Append the data class**

```kotlin
import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.ColorScheme
import androidx.compose.ui.graphics.Brush

data class ResolvedAppearance(
    val mode: AppearanceMode,            // resolved: never SYSTEM
    val variant: AppearanceVariant,
    val shape: AppearanceShape,
    val colorScheme: ColorScheme,
    val surfaceBrush: Brush?,
    val searchBarBrush: Brush,
    val searchBarBorder: BorderStroke?,
    val applyBlur: Boolean,
    val useNeumorphShadows: Boolean,
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
): ResolvedAppearance = TODO("filled in Task A4")
```

**Step 2: Verify compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

---

### Task A3: Write unit tests for resolver (TDD red)

**Files:**
- Create: `android/app/src/test/kotlin/sh/kavi/fasttravel/ui/appearance/AppearanceResolverTest.kt`

**Step 1: Write failing tests**

```kotlin
package sh.kavi.fasttravel.ui.appearance

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AppearanceResolverTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test fun `Material variant in light mode produces light color scheme`() {
        val r = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.MATERIAL, AppearanceShape.PILL)
        assertEquals(AppearanceMode.LIGHT, r.mode)
        assertNull(r.surfaceBrush)
    }

    @Test fun `SYSTEM mode resolves to LIGHT or DARK`() {
        val r = resolveAppearance(context, AppearanceMode.SYSTEM, AppearanceVariant.MATERIAL, AppearanceShape.PILL)
        assert(r.mode == AppearanceMode.LIGHT || r.mode == AppearanceMode.DARK)
    }

    @Test fun `AMOLED overrides surface to black regardless of mode`() {
        val light = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.AMOLED, AppearanceShape.PILL)
        val dark = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.AMOLED, AppearanceShape.PILL)
        assertEquals(0xFF000000.toInt(), light.widgetFill)
        assertEquals(0xFF000000.toInt(), dark.widgetFill)
    }

    @Test fun `Gradient variants produce a widget gradient array`() {
        val r = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.GRADIENT_BLUE, AppearanceShape.PILL)
        assertNotNull(r.widgetGradient)
        assertEquals(2, r.widgetGradient!!.size)
    }

    @Test fun `Transparent variant has a border and transparent fill`() {
        val r = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.TRANSPARENT, AppearanceShape.PILL)
        assertNotNull(r.searchBarBorder)
        assertEquals(0, r.widgetFill)
    }

    @Test fun `Glass variant sets applyBlur true on Android 12+`() {
        val r = resolveAppearance(context, AppearanceMode.DARK, AppearanceVariant.GLASS, AppearanceShape.PILL)
        // Robolectric defaults to recent SDK; blur expected true.
        assertEquals(true, r.applyBlur)
    }

    @Test fun `shape passes through unchanged`() {
        val r = resolveAppearance(context, AppearanceMode.LIGHT, AppearanceVariant.MATERIAL, AppearanceShape.SQUARE)
        assertEquals(AppearanceShape.SQUARE, r.shape)
    }
}
```

**Step 2: Verify tests fail**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*.AppearanceResolverTest"`
Expected: Compilation succeeds, but tests fail with `NotImplementedError` (from the `TODO` in resolver).

If robolectric dependency is missing, add `testImplementation("org.robolectric:robolectric:4.11.1")` and `testImplementation("androidx.test:core:1.5.0")` to `android/app/build.gradle.kts`. Re-run.

---

### Task A4: Implement resolver (TDD green)

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/appearance/Appearance.kt`

**Step 1: Implement the when statement**

Replace the `TODO` body with a full implementation. See design doc section "Variant catalog" for the color/brush mapping. Key points:
- Resolve `SYSTEM` via `context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK`.
- For `MATERIAL_YOU` on SDK ≥ S: call `dynamicLightColorScheme(context)` / `dynamicDarkColorScheme(context)`. Map scheme → both ColorScheme AND widget ints (`surfaceContainerHigh.toArgb()`, `onSurface.toArgb()`, `primary.toArgb()`).
- For `MATERIAL_YOU_TINT` on SDK ≥ S: read `android.R.color.system_accent1_100` (fill) and `system_accent1_600` (accent); build a `ColorScheme` overriding only primary/surface.
- For `GLASS`: fill = `0x99000000` dark / `0x99FFFFFF` light; border = 1dp `0xCCFFFFFF`; `applyBlur = true` on SDK ≥ S.
- For `GRADIENT_BLUE`: `Brush.linearGradient(listOf(denimLight, denim))`, widgetGradient = `intArrayOf(denimLight.toArgb(), denim.toArgb())`.
- For `GRADIENT_PURPLE`: purple → indigo analogously.
- For `NEUMORPHISM`: soft mono fill (`#E0E0E0` light / `#2A2A2A` dark); `useNeumorphShadows = true`.
- For `AMOLED`: fill = `Color.BLACK`, border = 1dp `#4A4A4A`, mode treated as DARK for onContent but light/dark input controls only text contrast (keep current mode in the resolved struct; surfaceBrush = SolidColor(Black) so full-app skin is black).
- For `TRANSPARENT`: fill = `Color.TRANSPARENT`, border = 1.5dp `primary`.
- Pre-S fallbacks for Material You and Material You Tint: use brand Light/Dark palette from `ui/theme/Color.kt`.

Pull the existing brand palette (`Night`, `Ink`, `Paper`, `Bone`, `Denim`, etc.) from `ui/theme/Color.kt` to stay consistent.

**Step 2: Verify tests pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*.AppearanceResolverTest"`
Expected: 7 tests PASS.

If any fail, read the failure message, adjust the specific branch of the `when`, re-run. Don't proceed until green.

---

### Task A5: Refactor `ThemePreferences` to new schema

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/data/ThemePreferences.kt`

**Step 1: Replace enums and keys**

- Delete the `WidgetShapePreset` and `WidgetStyleVariant` enums (lines 18–48).
- Delete the `KEY_THEME_MODE`, `KEY_DYNAMIC_COLORS`, `KEY_WIDGET_SHAPE_PRESET`, `KEY_WIDGET_STYLE_VARIANT`, `KEY_WIDGET_CORNER_RADIUS` constants.
- Add:
  ```kotlin
  private const val KEY_APPEARANCE_MODE = "appearance_mode"
  private const val KEY_APPEARANCE_VARIANT = "appearance_variant"
  private const val KEY_APPEARANCE_SHAPE = "appearance_shape"
  ```
- Delete the `themeMode`, `dynamicColors`, `widgetCornerRadius`, `widgetShapePreset`, `widgetStyleVariant` properties.
- Add:
  ```kotlin
  var mode: AppearanceMode
      get() = AppearanceMode.fromName(prefs.getString(KEY_APPEARANCE_MODE, null))
      set(value) { prefs.edit().putString(KEY_APPEARANCE_MODE, value.name).apply() }

  var variant: AppearanceVariant
      get() = AppearanceVariant.fromName(prefs.getString(KEY_APPEARANCE_VARIANT, null))
      set(value) { prefs.edit().putString(KEY_APPEARANCE_VARIANT, value.name).apply() }

  var shape: AppearanceShape
      get() = AppearanceShape.fromName(prefs.getString(KEY_APPEARANCE_SHAPE, null))
      set(value) { prefs.edit().putString(KEY_APPEARANCE_SHAPE, value.name).apply() }
  ```
- Keep `widgetOpacity`, `configUrl`, `configRefreshInterval`, `shortcutRows`, `autoIgnoreThreshold` untouched.
- Update imports: remove `sh.kavi.fasttravel.ui.theme.ThemeMode`, add `sh.kavi.fasttravel.ui.appearance.*`.

**Step 2: Verify compiles (will have cascading call-site breaks)**

Run: `cd android && ./gradlew :app:compileDebugKotlin`
Expected: Compilation FAILS in files that reference the deleted accessors — that's intentional; fixed in the next tasks.

Note the list of files with errors — they'll be updated in Phase B/C/D.

---

## Phase B — Android: Wire Compose side

### Task B1: Delete old `ThemeMode` enum, update `FastTravelTheme`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/theme/Theme.kt`

**Step 1: Replace `FastTravelTheme` signature**

- Delete the `enum class ThemeMode` at line 13 (now lives in `Appearance.kt` as `AppearanceMode`).
- Update `FastTravelTheme` signature:
  ```kotlin
  @Composable
  fun FastTravelTheme(
      appearance: ResolvedAppearance,
      content: @Composable () -> Unit,
  ) {
      CompositionLocalProvider(LocalAppearance provides appearance) {
          MaterialTheme(
              colorScheme = appearance.colorScheme,
              typography = Typography,
              content = content,
          )
      }
  }
  ```
- Add `LocalAppearance` CompositionLocal in the same file:
  ```kotlin
  val LocalAppearance = staticCompositionLocalOf<ResolvedAppearance> {
      error("No ResolvedAppearance provided")
  }
  ```
- Imports: `import sh.kavi.fasttravel.ui.appearance.*`.

**Step 2: Verify compiles against Theme.kt**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | rg "Theme.kt"`
Expected: No errors in `Theme.kt` itself (errors elsewhere are fine at this stage).

---

### Task B2: Update `SearchActivity` to use `ResolvedAppearance`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchActivity.kt` (around lines 270–285 and 591–672)

**Step 1: Update theme-wrapper call site**

Find the block that currently reads `themePrefs.themeMode` and `themePrefs.dynamicColors` (~lines 274–284). Replace with:

```kotlin
val appearance = remember { mutableStateOf(resolveFromPrefs(this, themePrefs)) }
LaunchedEffect(resume) {
    appearance.value = resolveFromPrefs(this@SearchActivity, themePrefs)
}
FastTravelTheme(appearance = appearance.value) {
    // existing content
}
```

Add helper in the same file or in `Appearance.kt`:

```kotlin
fun resolveFromPrefs(context: Context, prefs: ThemePreferences): ResolvedAppearance =
    resolveAppearance(context, prefs.mode, prefs.variant, prefs.shape)
```

**Step 2: Update `SearchBarPill` composable (around line 591)**

Replace hardcoded styling:
- `RoundedCornerShape(28.dp)` → `RoundedCornerShape(LocalAppearance.current.shape.cornerRadiusDp.dp)`
- Background `pillFill` parameter → `LocalAppearance.current.searchBarBrush` (change parameter type to `Brush` or drop the parameter and read locally).
- Add optional border: `LocalAppearance.current.searchBarBorder?.let { Modifier.border(it, shape) }`.

**Step 3: Add full-app skin wrapper**

Wrap the top-level `Scaffold` / `Box` in the activity's `setContent` with:

```kotlin
val skin = LocalAppearance.current
Box(
    modifier = Modifier
        .fillMaxSize()
        .then(if (skin.surfaceBrush != null) Modifier.background(skin.surfaceBrush) else Modifier)
        .then(if (skin.applyBlur && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Modifier.graphicsLayer { renderEffect = BlurEffect(20f, 20f) }
        } else Modifier)
) { /* existing content */ }
```

**Step 4: Verify compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | rg "SearchActivity.kt"`
Expected: No errors in `SearchActivity.kt`.

---

### Task B3: Update `SettingsActivity` theme-wrapper

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt` (only the top-level theme call, NOT the settings UI redesign — that's Phase D)

**Step 1: Find and update theme wrapper**

Find the `FastTravelTheme(...)` call at the top of the activity's `setContent`. Replace with the same `resolveFromPrefs(...)` pattern used in SearchActivity (Task B2 Step 1).

**Step 2: Wrap content with surfaceBrush/blur same as B2 Step 3.**

**Step 3: Delete temporary references**

If any code in this file still reads `themeMode` or `dynamicColors` directly, remove those reads — they're superseded by the appearance struct.

**Step 4: Verify compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | rg "SettingsActivity.kt" | head -20`
Expected: errors only in the settings-home/widget-appearance screen sections, not the theme wrapper. Those screens will be rewritten in Phase D.

---

## Phase C — Android: Wire Widget

### Task C1: Replace `resolveStyle` with `resolveAppearance` in widget provider

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchWidgetProvider.kt`

**Step 1: Delete old private functions**

Remove:
- `resolveStyle(context, variant)` (lines 161–263)
- `materialYouAppStyle(context)` (lines 277–317)
- `materialYouColors(context)` (lines 319–~330)
- The `ResolvedStyle` data class (lines 151–159)

**Step 2: Update `updateAppWidget`**

Find the body (around lines 51–139). Replace:
```kotlin
val variant = prefs.widgetStyleVariant
val preset = prefs.widgetShapePreset
val style = resolveStyle(context, variant)
```
with:
```kotlin
val appearance = resolveAppearance(context, prefs.mode, prefs.variant, prefs.shape)
```

Rename every downstream reference:
- `style.fillColor` → `appearance.widgetFill`
- `style.gradientColors` → `appearance.widgetGradient`
- `style.borderColor` → `appearance.widgetBorderColor`
- `style.borderWidthDp` → `appearance.widgetBorderDp`
- `style.textColor` → `appearance.widgetTextColor`
- `style.iconColor` → `appearance.widgetIconColor`
- `style.accentColor` → `appearance.widgetAccentColor`
- `preset.cornerRadiusDp` → `appearance.shape.cornerRadiusDp`

Keep the bitmap-vs-shape-drawable branch logic as-is — it reads the same fields now.

**Step 3: Verify compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | rg "SearchWidgetProvider.kt"`
Expected: No errors in SearchWidgetProvider.kt.

---

### Task C2: Update `WidgetPreview`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/WidgetPreview.kt`

**Step 1: Change state type and rendering**

Update `WidgetPreviewState` to hold `{mode, variant, shape, opacity}` (or just take a `ResolvedAppearance`). Replace the `SearchWidgetProvider.resolveStyle(...)` call with `LocalAppearance.current` or an explicit `resolveAppearance(ctx, state.mode, state.variant, state.shape)`.

**Step 2: Use the same brushes/borders as the real search bar**

Render the preview pill using `appearance.searchBarBrush` and `appearance.searchBarBorder`, with `RoundedCornerShape(appearance.shape.cornerRadiusDp.dp)`. This is the critical "align 100%" step — the preview must render through the same fields the live widget and live search bar both use.

**Step 3: Verify compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | rg "WidgetPreview.kt"`
Expected: No errors in WidgetPreview.kt.

---

### Task C3: Update `PinWidgetActivity` (debug helper)

**Files:**
- Modify: `android/app/src/debug/kotlin/sh/kavi/fasttravel/debug/PinWidgetActivity.kt`

**Step 1: Fix any direct references to deleted prefs accessors**

Search for `widgetStyleVariant`, `widgetShapePreset`, `themeMode`, `dynamicColors`. Replace with `mode`/`variant`/`shape` equivalents, or delete debug UI that no longer applies.

**Step 2: Verify compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | rg "PinWidgetActivity.kt"`
Expected: No errors.

---

## Phase D — Android: Settings UI Redesign

### Task D1: Remove inline APPEARANCE and WIDGET sections from Settings home

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt` (lines 517–631)

**Step 1: Delete the old APPEARANCE block**

Delete the inline Theme radios, Dynamic Colors switch, and Shortcut rows slider (approximately lines 517–621). These controls move to the new AppearanceScreen.

**Step 2: Delete the WIDGET section**

Delete the old "Widget Appearance" nav row (lines 623–631).

**Step 3: Insert a single unified APPEARANCE nav row**

```kotlin
SettingsCategoryHeader(text = "Appearance")
NavigableListItem(
    headline = "Appearance",
    supporting = "Theme, variant, shape",
    onClick = { navController.navigate(SettingsRoute.Appearance.route) },
)
```

**Step 4: Delete old route**

In `SettingsRoute` sealed class (lines 143–175), rename `WidgetAppearance` → `Appearance` (or delete the old and add a new `object Appearance : SettingsRoute("appearance")`).

**Step 5: Verify compiles up to the new screen**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | rg "SettingsActivity.kt" | head -20`
Expected: the only remaining errors point at the (not-yet-deleted) `WidgetAppearanceScreen` composable — handled next.

---

### Task D2: Replace `WidgetAppearanceScreen` with `AppearanceScreen`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt` (lines 712–888)

**Step 1: Delete `WidgetAppearanceScreen` entirely.**

**Step 2: Write `AppearanceScreen`**

Sections, top to bottom:

```kotlin
@Composable
fun AppearanceScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val prefs = remember { ThemePreferences(context) }
    var draft by remember {
        mutableStateOf(AppearanceDraft(prefs.mode, prefs.variant, prefs.shape, prefs.widgetOpacity, prefs.shortcutRows))
    }
    val appearance = remember(draft) { resolveAppearance(context, draft.mode, draft.variant, draft.shape) }

    // Debounced commit
    LaunchedEffect(draft) {
        delay(150)
        prefs.mode = draft.mode
        prefs.variant = draft.variant
        prefs.shape = draft.shape
        prefs.widgetOpacity = draft.opacity
        prefs.shortcutRows = draft.rows
        SearchWidgetProvider.refreshAll(context)
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Appearance") }, navigationIcon = { IconButton(onBack) { Icon(Icons.Default.ArrowBack, null) } }) }) { padding ->
        Column(Modifier.padding(padding).verticalScroll(rememberScrollState())) {
            // 1. Live preview
            PreviewBox(appearance)
            // 2. Mode segmented control
            ModePicker(draft.mode) { draft = draft.copy(mode = it) }
            // 3. Variant LazyRow (9 thumbnails)
            VariantPicker(draft.variant, draft.mode) { draft = draft.copy(variant = it) }
            // 4. Shape LazyRow (4 thumbnails)
            ShapePicker(draft.shape) { draft = draft.copy(shape = it) }
            // 5. Opacity slider
            OpacitySlider(draft.opacity) { draft = draft.copy(opacity = it) }
            // 6. Shortcut rows slider
            RowsSlider(draft.rows) { draft = draft.copy(rows = it) }
        }
    }
}

private data class AppearanceDraft(
    val mode: AppearanceMode,
    val variant: AppearanceVariant,
    val shape: AppearanceShape,
    val opacity: Int,
    val rows: Int,
)
```

Implement each sub-composable (`PreviewBox`, `ModePicker`, `VariantPicker`, `ShapePicker`, `OpacitySlider`, `RowsSlider`):
- `PreviewBox`: reuses `WidgetPreview` wrapped in `CompositionLocalProvider(LocalAppearance provides appearance)`.
- `ModePicker`: `SingleChoiceSegmentedButtonRow` with 3 buttons.
- `VariantPicker`: `LazyRow` iterating `AppearanceVariant.entries`, each item is a mini-pill rendered with `resolveAppearance(ctx, currentMode, entry, PILL)` — shows what that variant looks like at the current mode.
- `ShapePicker`: `LazyRow` iterating `AppearanceShape.entries`, each item is a pill rendered at that shape.
- `OpacitySlider`: `Slider(0..100)`, label "Widget opacity", helper "Applies to the home-screen widget only."
- `RowsSlider`: `Slider(1..3)`, label "Shortcut rows on widget."

**Step 3: Update `NavHost` destination**

In `SettingsNavHost`, replace the `WidgetAppearance` composable registration with:
```kotlin
composable(SettingsRoute.Appearance.route) {
    AppearanceScreen(onBack = { navController.popBackStack() })
}
```

**Step 4: Verify compiles**

Run: `cd android && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

---

### Task D3: Re-run unit tests end-to-end

Run: `cd android && ./gradlew :app:testDebugUnitTest`
Expected: all tests pass, including `AppearanceResolverTest` (7 tests) and any pre-existing tests (`DeepLinkQueryParserTest`).

If any pre-existing test referenced the deleted enums/accessors, update it to use the new API.

---

## Phase E — Android: Visual Testing on AVD

### Task E1: Build debug APK

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL. APK at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

### Task E2: Write screenshot harness script

**Files:**
- Create: `android/tools/capture-appearance-matrix.sh`

**Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Usage: capture-appearance-matrix.sh <output-dir>
# Requires: booted AVD/device with app installed, API 31+.

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
    # Force app to re-read prefs and widget to refresh
    adb shell am force-stop "${PKG}"
    adb shell am broadcast -a android.appwidget.action.APPWIDGET_UPDATE \
        -n "${PKG}/.ui.SearchWidgetProvider" || true
}

capture_app() {
    local tag="$1"
    adb shell am start -n "${PKG}/.ui.SearchActivity"
    sleep 1.2
    adb exec-out screencap -p > "${OUT}/app-${tag}.png"
}

capture_widget() {
    local tag="$1"
    adb shell am start -n "${PKG}/.debug.PinWidgetActivity"
    sleep 1.2
    adb exec-out screencap -p > "${OUT}/widget-${tag}.png"
}

# --- Matrix ---
VARIANTS=(MATERIAL MATERIAL_YOU MATERIAL_YOU_TINT GLASS GRADIENT_BLUE GRADIENT_PURPLE NEUMORPHISM AMOLED TRANSPARENT)
MODE=SYSTEM

# System light
adb shell "cmd uimode night no"
sleep 0.5
for v in "${VARIANTS[@]}"; do
    write_prefs "$MODE" "$v" "PILL"
    capture_app "syslight-${v}"
    capture_widget "syslight-${v}"
done

# System dark
adb shell "cmd uimode night yes"
sleep 0.5
for v in "${VARIANTS[@]}"; do
    write_prefs "$MODE" "$v" "PILL"
    capture_app "sysdark-${v}"
    capture_widget "sysdark-${v}"
done

# Forced LIGHT on dark system — 3 representative variants
for v in MATERIAL_YOU GLASS GRADIENT_BLUE; do
    write_prefs "LIGHT" "$v" "PILL"
    capture_app "forced-light-${v}"
    capture_widget "forced-light-${v}"
done

# Forced DARK on light system
adb shell "cmd uimode night no"
for v in MATERIAL_YOU GLASS GRADIENT_BLUE; do
    write_prefs "DARK" "$v" "PILL"
    capture_app "forced-dark-${v}"
    capture_widget "forced-dark-${v}"
done

echo "Done. Screenshots in ${OUT}"
```

Make executable: `chmod +x android/tools/capture-appearance-matrix.sh`

**Step 2: Boot the AVD**

User note: per prior workspace constraints, boot the AVD in a subagent. Main conversation dispatches one subagent to boot + capture + teardown. If physical device is available, skip.

---

### Task E3: Execute the matrix

Spawn a subagent (via the `Agent` tool, not inline) to:
1. Boot the AVD (if not already).
2. Install the APK: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
3. Run `android/tools/capture-appearance-matrix.sh docs/screenshots/appearance-matrix-2026-04-18/`.
4. Report success/fail counts and any app-crash logs (`adb logcat -d | rg -i fasttravel`).

Expected: 48 PNGs in the output directory. No app crashes in logcat for any variant.

---

### Task E4: Subagent screenshot review, batch 1 (System + Light)

Spawn a subagent with the 9 `docs/screenshots/appearance-matrix-2026-04-18/app-syslight-*.png` and 9 `widget-syslight-*.png` files. Prompt:

> Review these 18 screenshots (9 pairs of app + widget). For each variant:
> - Did both render without crash / white box?
> - Does the widget pill visually match the in-app search bar (same fill, same shape, same accent)?
> - Any text contrast issues?
> - Any render bugs (clipping, missing borders, artifacts)?
> Report a short punch list, grouped by variant. Under 300 words.

Act on P0 issues before proceeding.

---

### Task E5: Subagent screenshot review, batch 2 (System + Dark)

Same as E4 but for `*-sysdark-*.png` pairs.

---

### Task E6: Subagent screenshot review, batch 3 (Forced modes)

Same as E4 but for the 12 `forced-*` screenshots (6 pairs). Specifically verify:
- Forced LIGHT on dark system actually renders light.
- Forced DARK on light system actually renders dark.
- `Material + System` baseline spot-check: in-app bar and widget pill are visually identical.

---

## Phase F — Extension: Storage Unification

### Task F1: Expand `AppearancePrefs` schema

**Files:**
- Modify: `extension/src/ui/appearance.ts`

**Step 1: Replace schema**

```typescript
export type AppearanceMode = "light" | "dark" | "system";
export type AppearanceVariant =
    "material" | "material-you" | "material-you-tint"
  | "glass" | "gradient-blue" | "gradient-purple"
  | "neumorphism" | "amoled" | "transparent";
export type AppearanceShape = "pill" | "soft" | "rounded" | "square";

export interface AppearancePrefs {
    mode: AppearanceMode;
    variant: AppearanceVariant;
    shape: AppearanceShape;
    accent?: string;  // hex, only used when variant is material-you or material-you-tint
}

const STORAGE_KEY = "fast-travel-appearance";
const DEFAULTS: AppearancePrefs = { mode: "system", variant: "material", shape: "pill" };

export async function getAppearance(): Promise<AppearancePrefs> {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULTS, ...(stored[STORAGE_KEY] ?? {}) };
}

export async function setAppearance(prefs: AppearancePrefs): Promise<void> {
    await chrome.storage.sync.set({ [STORAGE_KEY]: prefs });
}

export function subscribe(listener: (prefs: AppearancePrefs) => void): () => void {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === "sync" && changes[STORAGE_KEY]) {
            listener({ ...DEFAULTS, ...(changes[STORAGE_KEY].newValue ?? {}) });
        }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
}

export function applyAppearance(prefs: AppearancePrefs) {
    const html = document.documentElement;
    html.dataset.mode = prefs.mode === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : prefs.mode;
    html.dataset.variant = prefs.variant;
    html.dataset.shape = prefs.shape;
    if (prefs.accent) html.style.setProperty("--custom-accent", prefs.accent);
    else html.style.removeProperty("--custom-accent");
}
```

**Step 2: Delete `extension/src/ui/theme.ts`** (absorbed).

**Step 3: Verify compiles**

Run: `cd extension && npm run build`
Expected: compilation errors only at old call sites of `ui/theme.ts` (newtab, popup, apply-theme) — fixed next.

---

### Task F2: Update `apply-theme.ts` (pre-paint script)

**Files:**
- Modify: `extension/src/ui/apply-theme.ts`

**Step 1: Replace body with synchronous read from `chrome.storage.session` mirror**

Because `chrome.storage.sync` is async and can cause flash-of-wrong-theme, mirror the prefs into `chrome.storage.session` (which has a synchronous in-memory read path). Background script keeps the session mirror in sync.

```typescript
// Pre-paint: applied as early as possible to avoid FOUC.
(async () => {
    try {
        const session = await chrome.storage.session.get("fast-travel-appearance");
        const prefs = session["fast-travel-appearance"] ?? { mode: "system", variant: "material", shape: "pill" };
        const { applyAppearance } = await import("./appearance.js");
        applyAppearance(prefs);
    } catch {
        // Fallback to defaults — applyAppearance has defaults
    }
})();
```

**Step 2: Add service-worker-side mirror**

**Files:**
- Modify: `extension/src/background.ts` (or the existing service worker file — find it via `rg "chrome.runtime.onInstalled" extension/src/`)

On install/startup and on `chrome.storage.onChanged` for key `fast-travel-appearance` in area `sync`, copy the value into `chrome.storage.session`.

**Step 3: Verify build**

Run: `cd extension && npm run build`
Expected: BUILD SUCCESS up to remaining callers of the removed `ui/theme.ts`.

---

### Task F3: Fix remaining import errors from removed `ui/theme.ts`

**Files:**
- Modify: `extension/src/newtab/newtab.ts`, `extension/src/popup/popup.ts`, `extension/src/options/*` — any file importing from `../ui/theme.ts`

**Step 1: Replace imports**

Use a subagent to do this mechanical fix. Prompt the subagent: "In `extension/src/`, find every file that imports from `../ui/theme` or `../ui/theme.ts` or `./theme` (within ui/). Replace those imports with equivalent functions from `../ui/appearance`. Specifically: `applyTheme()` calls → `applyAppearance(await getAppearance())`. Report each file changed and the diff."

**Step 2: Verify build**

Run: `cd extension && npm run build`
Expected: BUILD SUCCESSFUL.

---

## Phase G — Extension: Variants CSS

### Task G1: Carve out search-bar tokens in `tokens.css`

**Files:**
- Modify: `extension/src/ui/tokens.css`

**Step 1: Add new CSS variables**

At `:root` level:
```css
--search-bar-bg: var(--surface-container-high);
--search-bar-fg: var(--on-surface);
--search-bar-border: transparent;
--search-shape-radius: var(--radius-pill);
--search-bar-shadow: none;
--search-bar-backdrop-filter: none;
```

These get overridden by variant-specific rules in `variants.css`.

**Step 2: Verify build**

Run: `cd extension && npm run build`
Expected: no errors (CSS changes are opaque to TS compiler).

---

### Task G2: Create `variants.css`

**Files:**
- Create: `extension/src/ui/variants.css`

**Step 1: Write rule sets** — one block per variant, with `[data-mode="light"]` and `[data-mode="dark"]` sub-rules where needed.

```css
/* MATERIAL — default, no overrides needed */

/* MATERIAL YOU — uses --custom-accent if present, else derived palette */
[data-variant="material-you"] { /* palette-driven via material-color-utilities at runtime */ }

/* MATERIAL YOU TINT */
[data-variant="material-you-tint"][data-mode="light"] {
    --search-bar-bg: color-mix(in srgb, var(--custom-accent, #3E6098) 20%, white);
    --search-bar-fg: var(--custom-accent, #3E6098);
}
[data-variant="material-you-tint"][data-mode="dark"] {
    --search-bar-bg: color-mix(in srgb, var(--custom-accent, #7A8FB5) 30%, black);
    --search-bar-fg: #F5F2EC;
}

/* GLASS */
[data-variant="glass"] {
    --search-bar-backdrop-filter: blur(20px) saturate(1.2);
    --search-bar-border: 1px solid rgba(255,255,255,0.2);
}
[data-variant="glass"][data-mode="light"] { --search-bar-bg: rgba(255,255,255,0.55); }
[data-variant="glass"][data-mode="dark"]  { --search-bar-bg: rgba(0,0,0,0.45); }

/* GRADIENT BLUE */
[data-variant="gradient-blue"] {
    --search-bar-bg: linear-gradient(135deg, #7A8FB5, #3E6098);
    --search-bar-fg: #F5F2EC;
}
body[data-variant="gradient-blue"] { background: linear-gradient(135deg, #7A8FB5, #3E6098); }

/* GRADIENT PURPLE */
[data-variant="gradient-purple"] {
    --search-bar-bg: linear-gradient(135deg, #E74FC9, #9333EA);
    --search-bar-fg: #FFFFFF;
}
body[data-variant="gradient-purple"] { background: linear-gradient(135deg, #E74FC9, #9333EA); }

/* NEUMORPHISM */
[data-variant="neumorphism"][data-mode="light"] {
    --search-bar-bg: #E0E0E0;
    --search-bar-fg: #5F6368;
    --search-bar-shadow: inset 4px 4px 8px rgba(0,0,0,0.08), inset -4px -4px 8px rgba(255,255,255,0.8);
}
[data-variant="neumorphism"][data-mode="dark"] {
    --search-bar-bg: #2A2A2A;
    --search-bar-fg: #E0E0E0;
    --search-bar-shadow: inset 4px 4px 8px rgba(0,0,0,0.5), inset -4px -4px 8px rgba(255,255,255,0.05);
}

/* AMOLED — overrides mode */
[data-variant="amoled"] {
    --search-bar-bg: #000000;
    --search-bar-fg: #E2E8F0;
    --search-bar-border: 1px solid #4A4A4A;
}
body[data-variant="amoled"] { background: #000000; }

/* TRANSPARENT */
[data-variant="transparent"] {
    --search-bar-bg: transparent;
    --search-bar-border: 1.5px solid var(--primary);
    --search-bar-fg: var(--primary);
}

/* Shape overrides */
[data-shape="pill"]    { --search-shape-radius: var(--radius-pill); }
[data-shape="soft"]    { --search-shape-radius: var(--radius-lg); }
[data-shape="rounded"] { --search-shape-radius: var(--radius-md); }
[data-shape="square"]  { --search-shape-radius: var(--radius-xs); }
```

**Step 2: Import from entry points**

Add `@import "../ui/variants.css";` near the top of `newtab.css`, `popup.css`, `options.css`.

**Step 3: Update search-bar rules to consume the vars**

In `newtab.css` (search-bar rules around lines 149–176) and `popup.css` (around line 70), use:
```css
#search-container {
    background: var(--search-bar-bg);
    color: var(--search-bar-fg);
    border: var(--search-bar-border);
    border-radius: var(--search-shape-radius);
    box-shadow: var(--search-bar-shadow);
    backdrop-filter: var(--search-bar-backdrop-filter);
}
```

**Step 4: Verify build**

Run: `cd extension && npm run build`
Expected: BUILD SUCCESSFUL.

---

### Task G3: Material You palette generator

**Files:**
- Create: `extension/src/ui/material-you.ts`

**Step 1: Install dependency**

Run: `cd extension && npm install @material/material-color-utilities`
Expected: package added to `extension/package.json`.

**Step 2: Write the wrapper**

```typescript
import { argbFromHex, themeFromSourceColor, applyTheme } from "@material/material-color-utilities";

export function applyMaterialYouPalette(accentHex: string, mode: "light" | "dark"): void {
    const theme = themeFromSourceColor(argbFromHex(accentHex));
    applyTheme(theme, { target: document.documentElement, dark: mode === "dark" });
}
```

**Step 3: Hook into `applyAppearance`**

In `extension/src/ui/appearance.ts`, at the end of `applyAppearance`:
```typescript
if ((prefs.variant === "material-you" || prefs.variant === "material-you-tint") && prefs.accent) {
    const { applyMaterialYouPalette } = await import("./material-you.js");
    const resolved = html.dataset.mode === "dark" ? "dark" : "light";
    applyMaterialYouPalette(prefs.accent, resolved);
}
```

**Step 4: Verify build**

Run: `cd extension && npm run build`
Expected: BUILD SUCCESSFUL.

---

## Phase H — Extension: Settings UI

### Task H1: Rebuild `appearance.ts` settings screen

**Files:**
- Modify: `extension/src/options/screens/appearance.ts`

**Step 1: Rewrite screen** (currently 111 lines — end state ~250 lines)

Structure (mirrors Android AppearanceScreen):
1. Preview panel — renders a mini `<div class="search-preview">` styled with the live appearance.
2. Mode radio group — 3 options.
3. Variant grid — 9 cards, each renders a mini preview thumbnail (applies `data-variant`/`data-mode` to a scoped container).
4. Shape grid — 4 cards (current pattern).
5. Accent color picker — `<input type="color">`; visible only when variant is `material-you` or `material-you-tint`.

On any change: update local draft, debounce 150ms, call `setAppearance(draft)`; the storage listener propagates to newtab + popup.

**Step 2: Verify build**

Run: `cd extension && npm run build`
Expected: BUILD SUCCESSFUL.

---

### Task H2: Popup parity fix

**Files:**
- Modify: `extension/src/popup/popup.ts`, `extension/src/popup/popup.css`

**Step 1: `popup.ts`: call `applyAppearance` on load and subscribe**

```typescript
import { applyAppearance, getAppearance, subscribe } from "../ui/appearance";

async function init() {
    applyAppearance(await getAppearance());
    subscribe(applyAppearance);
    // ... existing popup logic
}
```

**Step 2: `popup.css`: replace hardcoded pill radius**

Find `border-radius: var(--radius-pill)` around line 70. Replace with `border-radius: var(--search-shape-radius)`.
Find the search-bar background — replace with `background: var(--search-bar-bg)`.

**Step 3: Verify build**

Run: `cd extension && npm run build`
Expected: BUILD SUCCESSFUL.

---

## Phase I — Extension: Visual Testing via Playwright

### Task I1: Write Playwright matrix harness

**Files:**
- Create: `extension/ft-pw-appearance.mjs`

**Step 1: Write script** — based on existing `extension/ft-pw-*.mjs` patterns (reference `ft-pw-e2e.mjs` for Chrome extension loading).

```javascript
import { chromium } from "@playwright/test";
import fs from "fs/promises";
import path from "path";

const EXT_PATH = path.resolve("dist");
const OUT_DIR = path.resolve("../docs/screenshots/extension-appearance-matrix-2026-04-18");

const VARIANTS = ["material", "material-you", "material-you-tint", "glass",
                  "gradient-blue", "gradient-purple", "neumorphism", "amoled", "transparent"];
const MODES = ["light", "dark"];

async function main() {
    await fs.mkdir(OUT_DIR, { recursive: true });
    const ctx = await chromium.launchPersistentContext("/tmp/ft-pw-profile", {
        headless: false,
        args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });

    // Find extension ID
    let [bg] = ctx.serviceWorkers();
    if (!bg) bg = await ctx.waitForEvent("serviceworker");
    const extId = bg.url().split("/")[2];

    const newtab = await ctx.newPage();
    const popup = await ctx.newPage();

    for (const mode of MODES) {
        for (const variant of VARIANTS) {
            await newtab.goto(`chrome-extension://${extId}/newtab/newtab.html`);
            await newtab.evaluate(([m, v]) => chrome.storage.sync.set({
                "fast-travel-appearance": { mode: m, variant: v, shape: "pill" }
            }), [mode, variant]);
            await newtab.reload();
            await newtab.waitForSelector("#search-container");
            await newtab.screenshot({ path: path.join(OUT_DIR, `newtab-${mode}-${variant}.png`) });

            await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
            await popup.waitForSelector("#popup-search-form");
            await popup.screenshot({ path: path.join(OUT_DIR, `popup-${mode}-${variant}.png`) });
        }
    }
    await ctx.close();
}
main().catch(e => { console.error(e); process.exit(1); });
```

**Step 2: Build dist**

Run: `cd extension && npm run build`
Expected: fresh `extension/dist/`.

---

### Task I2: Execute the matrix

Run: `cd extension && node ft-pw-appearance.mjs`
Expected: 36 PNGs in `docs/screenshots/extension-appearance-matrix-2026-04-18/` (9 variants × 2 modes × 2 surfaces).

---

### Task I3: Subagent review of extension screenshots

Spawn a subagent with the 18 newtab screenshots. Prompt: same rubric as Android batch review — rendered? pixel-match with Android equivalents? contrast? bugs? Report punch list.

Then repeat for the 18 popup screenshots — specifically verify popup pill matches newtab pill (the parity fix).

Act on P0 issues.

---

### Task I4: Cross-platform parity spot-check

Spawn a subagent with `docs/screenshots/appearance-matrix-2026-04-18/app-syslight-MATERIAL.png` (Android) and `docs/screenshots/extension-appearance-matrix-2026-04-18/newtab-light-material.png` (extension) side-by-side. Prompt:

> These two screenshots show the Fast Travel search bar at Material variant in light mode, one from Android, one from the browser extension. Does the search bar read as the same design language? Note any visible divergence in fill color, border, corner radius, or text color. Under 100 words.

Repeat for 3 more representative variants: Glass (dark), Gradient Blue (system), AMOLED. 4 comparisons total.

Act on divergences.

---

## Completion Gate

Before declaring done:
- [ ] All 7 unit tests in `AppearanceResolverTest` pass.
- [ ] `./gradlew :app:assembleDebug` succeeds.
- [ ] `npm run build` in extension succeeds.
- [ ] Android 48-screenshot matrix captured and reviewed, no P0 issues.
- [ ] Extension 36-screenshot matrix captured and reviewed, no P0 issues.
- [ ] Cross-platform parity spot-checks pass for 4 variants.

If any screenshot shows a crash, broken contrast, missing border, or obvious render glitch, fix before claiming completion. Fall back to `superpowers:systematic-debugging` for stuck issues.
