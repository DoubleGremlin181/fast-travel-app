# Fast Travel Android UI Redesign

## Context

The current Android app has functional core features but a generic "undergrad project" UI. It uses a standard top app bar + outlined text field pattern that reads as a form, not a search engine. Competitive research against Google, DuckDuckGo, Kagi, and Arc Search shows professional search apps treat the search bar as the hero element with no chrome above it, use filled containers instead of outlines, and transition to full-screen search on focus.

## Design Direction

**Style A (Google-like, minimal)** with keyboard-first interaction. The app opens directly into focused search mode with keyboard up. No top bar. Settings hidden as a small icon when keyboard is dismissed.

---

## Screen 1: Search (Two States)

### State A: Keyboard Focused (Default on Launch)

- No wordmark, no header, no top spacing (search bar immediately below status bar with 8dp padding)
- Search bar: pill-shaped filled container, 28dp corner radius, subtle elevation + shadow
- Background: subtle warm gradient (not plain white) — e.g. very light gray-blue (#F8FAFC → #F0F4F8)
- Below search bar: recent search history as inline list
  - Each item: Material clock icon + query text + NW-arrow icon (to populate bar without submitting)
  - "Clear history" link at bottom
- As user types: history replaced by API suggestions
  - Each suggestion: command favicon/icon (if available, else magnifier) + command badge + display text + arrow
  - Bold matching on the typed portion of suggestions
  - When a known command is detected (e.g. "yt"), show that command's icon instead of magnifier

### State B: Keyboard Dismissed

- No top spacing — "Fast Travel" wordmark just below status bar
- Search bar below wordmark with shadow
- Background: same subtle gradient
- Below search bar: row of command shortcut chips
  - Each chip shows: command favicon/icon (if available) + trigger text, tinted by category color
  - Horizontally scrollable if more than fit
- Settings: small gear icon only, bottom-right corner, no text label
- Tapping search bar transitions back to State A with animation

### Command Icons/Favicons (Config-level Feature)

Commands can optionally define an `iconUrl` field pointing to an icon/favicon:
```json
{
  "id": "youtube",
  "triggers": ["yt"],
  "name": "YouTube",
  "iconUrl": "https://www.youtube.com/favicon.ico",
  ...
}
```

- Icons are cached locally after first fetch
- Used in: suggestion rows (replaces magnifier), command chips, command list in settings
- Fallback: colored circle with first letter of trigger if no iconUrl defined
- Config schema updated to include optional `iconUrl` field

### Transition Animation

- Search bar smoothly animates between State A and State B positions
- Wordmark fades in/out
- History/suggestions cross-fade with chips
- Settings icon fades in on dismiss

---

## Screen 2: Settings (Multi-Screen Navigation)

### Settings Home

Standard Android settings list pattern with grouped items navigating to detail screens.
Surface cards on a slightly tinted background for depth.

**Categories:**

1. **Appearance**
   - Theme: Light / Dark / System
   - Dynamic Colors: toggle (Android 12+)

2. **Widget**
   - Widget Appearance → sub-screen
     - Live preview at top
     - Corner radius slider (8-28dp)
     - Background opacity slider (0-100%)
     - Color mode: Light / Dark / System
   - At-a-Glance Info → sub-screen
     - Show date: toggle
     - Date format: picker (Mon, Apr 12 / Apr 12 / 4/12/26 / 12 Apr 2026)
     - Show weather: toggle
     - Location: text field with type-ahead city suggestions (blank = auto-detect by IP)
     - Units: °F / °C toggle
     - Weather shows icon (Material weather icons mapped from wttr.in codes) + temp

3. **Configuration**
   - Config Source → sub-screen
     - Config URL: text field (default: GitHub raw URL)
     - Auto-refresh interval: 1hr / 6hr / 12hr / 24hr / Manual
     - Last synced: timestamp
     - Refresh Now: button
     - Local Overrides:
       - Quick Add Command → form
       - Raw JSON Editor → syntax-validated editor
       - Reset Overrides: button with confirmation
   - Commands → sub-screen
     - Search/filter bar
     - Grouped by category with counts
     - Each row: favicon/icon + trigger + name
     - Tap for command details
   - Ignore List → tag chips with remove
   - Search History → list with clear all

4. **About**
   - Fast Travel v2.0.0
   - Created by Kavish
   - github.com/DoubleGremlin181/fast-travel

---

## Screen 3: Widget (Multiple Styles)

### Base Layout
```
+--------------------------------------------------+
|  Mon, Apr 12                    72°F [sun icon]   |  date left, weather icon+temp right
|  [magnifier] Fast Travel search...                |  pill search bar
+--------------------------------------------------+
```

### Widget Variants to Mock Up

1. **Light + Full info** — White bg, date + weather with sun icon, rounded corners
2. **Dark + Full info** — Dark surface bg, same info, adjusted colors
3. **Light + Date only** — No weather, date left-aligned
4. **Dark + Minimal** — No at-a-glance, just search bar
5. **Transparent + Full info** — Semi-transparent bg over wallpaper
6. **AMOLED Dark** — Pure black bg, minimal accent

### Weather Icons (mapped from wttr.in condition codes)
- Clear/Sunny → sun icon (filled)
- Partly cloudy → cloud-sun icon
- Cloudy → cloud icon
- Rain → cloud-rain icon
- Snow → snowflake icon
- Thunderstorm → cloud-lightning icon
- Fog → cloud-fog icon

### Customization Options
- Corner radius: 8-28dp
- Background opacity: 0-100%
- Color mode: Light / Dark / System / Dynamic
- Date format: 4 options
- Weather units: °F / °C
- Location: configurable with suggestions

---

## Visual Design Tokens

### Colors (Light)
- Background gradient: #F8FAFC → #F0F4F8 (subtle blue-gray)
- Surface/Search bar fill: #FFFFFF with 3dp elevation shadow
- Surface cards: #FFFFFF
- Primary accent: #2563EB
- Text primary: #1A1A1A
- Text secondary: #5F6368
- Dividers: #E8EAED (not harsh gray)

### Colors (Dark)
- Background: #0F172A
- Surface/Search bar fill: #1E293B with subtle border (#2D3748)
- Surface cards: #1E293B
- Primary accent: #60A5FA
- Text primary: #E2E8F0
- Text secondary: #94A3B8

### Typography
- Wordmark: 26sp, weight 300 (light), -0.5 letter-spacing
- Search placeholder: 16sp, regular
- Suggestion text: 15sp, regular (bold on matched portion)
- Command badge: 11sp, bold
- Hint/caption: 12sp, regular
- Settings category: 12sp, semi-bold, uppercase, 0.5 letter-spacing
- Settings item: 16sp, regular

### Shape
- Search bar: 28dp corner radius (pill)
- Suggestion card: 12dp
- Command chips: 20dp (pill)
- Settings cards: 12dp
- Widget: configurable 8-28dp

### Elevation
- Search bar: 3dp shadow
- Suggestion list: 2dp
- Settings cards: 1dp
- Widget: 2dp

---

## Key Changes from Current Implementation

| Current | New |
|---------|-----|
| TopAppBar with title | No top bar at all |
| Settings gear in top bar | Small gear icon bottom-right on unfocused |
| OutlinedTextField with border | Filled pill with elevation, no border |
| Plain white background | Subtle gradient background |
| Search bar centered at 50% | Hugs top (below status bar) |
| Magnifier icon always | Command favicon when command detected |
| No command icons | Optional iconUrl in config, cached locally |
| Suggestions in floating Card | Inline list below search bar |
| Single-page settings | Multi-screen navigation |
| Hardcoded config URL | User-configurable URL with auto-sync |
| Widget text weather | Weather Material icons + temp |
| Widget no customization | Full customization (radius, opacity, colors, format) |
| Opens unfocused | Opens with keyboard up, focused |

---

## Figma Mockups

File: https://www.figma.com/design/1qdUZ3dPrz63N1G7nUarji

Screens created:
- Search State A (Focused with history)
- Search State B (Unfocused with chips)
- [Planned] Search with suggestions
- [Planned] Dark mode variants
- [Planned] Settings home
- [Planned] Widget variants (6 styles)
