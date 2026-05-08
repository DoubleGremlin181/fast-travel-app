# Android UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Android app from a generic form-style UI to a polished, Google-like search experience with no top bar, keyboard-first interaction, command favicons, multi-screen settings, and enhanced widget customization.

**Architecture:** Complete rewrite of SearchActivity (two-state focused/unfocused with animations), SettingsActivity (multi-screen Jetpack Navigation), and widget layouts. Config schema extended with optional `iconUrl` per command. ConfigRepository gains user-configurable source URL with auto-sync interval.

**Tech Stack:** Kotlin, Jetpack Compose + Material 3, AndroidX Navigation Compose, SharedPreferences, RemoteViews (widget), Coil (favicon loading)

---

### Task 1: Add Coil dependency and iconUrl to config schema

**Files:**
- Modify: `android/app/build.gradle.kts` (add Coil dependency)
- Modify: `shared/config/config.schema.json` (add optional iconUrl to command schema)
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/Models.kt` (add iconUrl field)
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/ConfigParser.kt` (parse iconUrl)

**Step 1: Add Coil to build.gradle.kts**

Add to dependencies block:
```kotlin
implementation("io.coil-kt:coil-compose:2.6.0")
```

**Step 2: Add iconUrl to config schema**

In `config.schema.json`, add to command properties:
```json
"iconUrl": {
  "type": "string",
  "format": "uri",
  "description": "Optional URL to a favicon/icon for this command"
}
```

**Step 3: Add iconUrl to Models.kt Command data class**

```kotlin
data class Command(
    val id: String,
    val triggers: List<String>,
    val name: String,
    val type: CommandType,
    val suggestionsApi: String? = null,
    val iconUrl: String? = null,  // NEW
    val routes: List<Route>,
)
```

**Step 4: Parse iconUrl in ConfigParser.kt**

In the command parsing block, add:
```kotlin
val iconUrl = if (cmdObj.has("iconUrl")) cmdObj.getString("iconUrl") else null
```
And pass it to the Command constructor.

**Step 5: Add sample iconUrls to default-config.json**

Add `iconUrl` to a few popular commands (google, youtube, github, reddit, etc.) using their favicon URLs.

**Step 6: Verify build**

Run: `cd android && ./gradlew assembleDebug`
Expected: BUILD SUCCESSFUL

**Step 7: Commit**

```
feat: add iconUrl support to config schema and models
```

---

### Task 2: Expand ThemePreferences and ConfigRepository

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/data/ThemePreferences.kt`
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/data/ConfigRepository.kt`

**Step 1: Expand ThemePreferences**

Add new preferences:
```kotlin
// Config source
var configUrl: String
    get() = prefs.getString("config_url", DEFAULT_CONFIG_URL) ?: DEFAULT_CONFIG_URL
    set(value) = prefs.edit().putString("config_url", value).apply()

var syncIntervalHours: Int
    get() = prefs.getInt("sync_interval_hours", 24)
    set(value) = prefs.edit().putInt("sync_interval_hours", value).apply()

// Weather
var weatherUnits: String  // "F" or "C"
    get() = prefs.getString("weather_units", "F") ?: "F"
    set(value) = prefs.edit().putString("weather_units", value).apply()

var weatherLocation: String
    get() = prefs.getString("weather_location", "") ?: ""
    set(value) = prefs.edit().putString("weather_location", value).apply()

// Date
var dateFormat: String  // "EEE, MMM d" / "MMM d" / "M/d/yy" / "d MMM yyyy"
    get() = prefs.getString("date_format", "EEE, MMM d") ?: "EEE, MMM d"
    set(value) = prefs.edit().putString("date_format", value).apply()

companion object {
    const val DEFAULT_CONFIG_URL = "https://raw.githubusercontent.com/DoubleGremlin181/fast-travel/main/shared/config/default-config.json"
}
```

**Step 2: Update ConfigRepository to use configurable URL**

Replace hardcoded GitHub URL with `ThemePreferences(context).configUrl`. Use `syncIntervalHours` for cache TTL instead of hardcoded 24h.

**Step 3: Verify build**

Run: `cd android && ./gradlew assembleDebug`

**Step 4: Commit**

```
feat: configurable config URL and sync interval
```

---

### Task 3: Rewrite SearchActivity — Two-State Layout

This is the biggest task. Complete rewrite of the search screen.

**Files:**
- Rewrite: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchActivity.kt`
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchViewModel.kt` (expose command chips data)

**Step 1: Update SearchViewModel to expose chip commands**

Add a StateFlow for the top 6 commands to show as chips:
```kotlin
val chipCommands: StateFlow<List<Command>> = // derived from config, top 6 by trigger frequency or order
```

**Step 2: Rewrite SearchActivity with two-state design**

The complete new layout structure:

```kotlin
@Composable
fun SearchScreen(...) {
    // Track keyboard/focus state
    var isSearchFocused by remember { mutableStateOf(true) } // starts focused
    
    // Gradient background
    Box(modifier = Modifier
        .fillMaxSize()
        .background(brush = Brush.verticalGradient(
            colors = listOf(Color(0xFFF8FAFC), Color(0xFFF0F4F8))
        ))
    ) {
        Column {
            Spacer(Modifier.statusBarsPadding())
            
            // Wordmark - only visible when NOT focused
            AnimatedVisibility(visible = !isSearchFocused) {
                Text("Fast Travel", fontSize = 26.sp, fontWeight = FontWeight.Light, ...)
            }
            
            // Search bar - pill shaped, white, elevated
            // No top spacing in State A, just below status bar
            SearchBar(...)
            
            // Content below search bar
            if (isSearchFocused) {
                // State A: History or suggestions
                HistoryOrSuggestions(...)
            } else {
                // State B: Command chips
                CommandChips(...)
            }
        }
        
        // Settings icon - bottom right, only when unfocused
        AnimatedVisibility(visible = !isSearchFocused, modifier = Modifier.align(BottomEnd)) {
            IconButton { Icon(Icons.Default.Settings) }
        }
    }
}
```

Key composables to build:
- `SearchBarPill` — White filled, 28dp radius, shadow, search icon, text, clear button
- `HistoryList` — Clock icons, query text, NW-arrow populate buttons
- `SuggestionList` — Command favicon/badge, suggestion text with bold matching, arrow
- `CommandChips` — Horizontal scrollable row of tinted chips with optional favicons
- `TypoCard` — Did-you-mean card

**Step 3: Handle keyboard focus detection**

Use `WindowInsets.isImeVisible` to detect keyboard state:
```kotlin
val isImeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
```

When keyboard shows → State A. When keyboard hides → State B.

**Step 4: Command favicon in suggestions**

When a suggestion has a `commandTrigger` matching a command with `iconUrl`:
- Load icon with `AsyncImage` (Coil)
- Replace the magnifier icon with the command's favicon
- Fallback: colored circle with first letter of trigger

**Step 5: Auto-focus on launch**

```kotlin
LaunchedEffect(Unit) {
    focusRequester.requestFocus()
    // Keyboard will show automatically
}
```

**Step 6: Bold matching in suggestions**

Use `AnnotatedString` to bold the portion of suggestion text that matches user input.

**Step 7: Verify build, install on emulator, screenshot**

Run: `cd android && ./gradlew assembleDebug`
Run: `adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk`
Screenshot and critique.

**Step 8: Commit**

```
feat: redesign search screen with two-state focused/unfocused layout
```

---

### Task 4: Rewrite SettingsActivity — Multi-Screen Navigation

**Files:**
- Rewrite: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt`

**Step 1: Add Navigation Compose dependency**

In `build.gradle.kts`:
```kotlin
implementation("androidx.navigation:navigation-compose:2.8.9")
```

**Step 2: Create navigation structure**

```kotlin
sealed class SettingsRoute(val route: String) {
    object Home : SettingsRoute("settings_home")
    object WidgetAppearance : SettingsRoute("widget_appearance")
    object AtAGlance : SettingsRoute("at_a_glance")
    object ConfigSource : SettingsRoute("config_source")
    object Commands : SettingsRoute("commands")
    object IgnoreList : SettingsRoute("ignore_list")
    object SearchHistory : SettingsRoute("search_history")
    object QuickAddCommand : SettingsRoute("quick_add")
    object JsonEditor : SettingsRoute("json_editor")
    object About : SettingsRoute("about")
}
```

**Step 3: Build Settings Home screen**

Four category groups (Appearance, Widget, Configuration, About) with list items that navigate to detail screens. Use `ListItem` composable with trailing chevron icons. Surface cards on tinted background for depth.

**Step 4: Build each detail screen**

- `WidgetAppearanceScreen` — Live preview + sliders + color mode picker
- `AtAGlanceScreen` — Date toggle/format, weather toggle/location/units
- `ConfigSourceScreen` — URL field, sync interval dropdown, refresh button, last synced, local overrides section
- `CommandsScreen` — Searchable grouped list with favicons
- `IgnoreListScreen` — Chips with add/remove
- `SearchHistoryScreen` — List with clear all
- `QuickAddScreen` — Form with trigger/name/url fields
- `JsonEditorScreen` — TextArea with save/reset/validation
- `AboutScreen` — Version, author, GitHub link

**Step 5: Verify build, install, screenshot settings**

**Step 6: Commit**

```
feat: multi-screen settings with navigation
```

---

### Task 5: Widget Enhancements

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchWidgetProvider.kt`
- Modify: `android/app/src/main/res/layout/widget_search.xml`
- Modify: `android/app/src/main/res/layout/widget_search_dark.xml`
- Modify: `android/app/src/main/res/xml/search_widget_info.xml`

**Step 1: Weather icons mapping**

Map wttr.in condition codes to drawable resource names:
```kotlin
fun getWeatherIcon(condition: String): Int {
    val lower = condition.lowercase()
    return when {
        "sunny" in lower || "clear" in lower -> R.drawable.ic_weather_sunny
        "partly" in lower -> R.drawable.ic_weather_partly_cloudy
        "cloudy" in lower || "overcast" in lower -> R.drawable.ic_weather_cloudy
        "rain" in lower || "drizzle" in lower -> R.drawable.ic_weather_rainy
        "snow" in lower || "sleet" in lower -> R.drawable.ic_weather_snowy
        "thunder" in lower -> R.drawable.ic_weather_thunderstorm
        "fog" in lower || "mist" in lower -> R.drawable.ic_weather_foggy
        else -> R.drawable.ic_weather_cloudy
    }
}
```

**Step 2: Create weather icon drawables**

Create vector drawables for each weather type in `res/drawable/`:
- `ic_weather_sunny.xml`
- `ic_weather_partly_cloudy.xml`
- `ic_weather_cloudy.xml`
- `ic_weather_rainy.xml`
- `ic_weather_snowy.xml`
- `ic_weather_thunderstorm.xml`
- `ic_weather_foggy.xml`

**Step 3: Update widget layouts**

- Weather text replaced with icon (ImageView) + temperature text
- Use configurable date format from ThemePreferences
- Use weather units preference for °F/°C
- Use weather location preference for wttr.in query

**Step 4: Update SearchWidgetProvider**

- Read weather units and location from ThemePreferences
- Parse wttr.in response for condition code + temperature
- Set weather icon drawable based on condition
- Format date with user's preferred format

**Step 5: Verify build, add widget to emulator home screen, screenshot**

**Step 6: Commit**

```
feat: widget weather icons and enhanced customization
```

---

### Task 6: Screenshot-Driven QA

**No code files — this is validation.**

**Step 1: Light mode screenshots**

Capture on emulator:
1. Search focused (State A) — empty with history
2. Search focused — typing "yt cats" with suggestions
3. Search unfocused (State B) — wordmark, chips, settings icon
4. Search — typo detection card
5. Settings home
6. Settings > Config Source
7. Settings > Commands
8. Settings > At-a-Glance
9. Widget on home screen (light)

**Step 2: Dark mode screenshots**

Switch to dark: `adb shell cmd uimode night yes`
Repeat screenshots 1-5, 9.

**Step 3: Critique each screenshot**

Check for:
- Gradient background visible (not plain white)
- No top bar
- Search bar pill shape with shadow
- Proper spacing (no top gap in State A)
- Command favicons loading
- Bold matching in suggestions
- Settings gear icon bottom-right in State B
- Multi-screen settings navigation working
- Widget weather icons showing
- Dark mode colors correct

**Step 4: Fix issues, re-screenshot, iterate**

**Step 5: Install on phone**

```bash
adb -s $DEVICE_IP:$PORT install -r app/build/outputs/apk/debug/app-debug.apk
```

**Step 6: Final commit**

```
fix: UI polish from screenshot QA
```

---

## Execution Order & Dependencies

```
Task 1 (config schema) → Task 2 (preferences) → Task 3 (search UI) → Task 4 (settings UI) → Task 5 (widget) → Task 6 (QA)
```

Tasks 3, 4, 5 can be partially parallelized since they touch different files, but Task 3 is the critical path and should be done first as it's the most complex and most visible change.

## Risk Areas

- **Coil image loading** — favicons may be slow or CORS-blocked. Fallback to colored initial circle is essential.
- **Keyboard detection** — `WindowInsets.ime` requires proper `enableEdgeToEdge()` and window insets handling.
- **Widget RemoteViews** — Limited to basic views, can't use Compose. Weather icons must be VectorDrawables set via `setImageViewResource`.
- **Navigation Compose** — Need to handle back stack properly so hardware back button works through settings sub-screens.
