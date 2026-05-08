# Fast Travel v2 — Figma Visual Spec

Extracted from PNG exports in `docs/figma/` (2026-04-13). Measurements are estimated from image ratios; mark `[AMBIGUOUS]` where uncertain. Compare to `2026-04-12-android-ui-redesign-design.md` (prior design doc).

## Summary of Required Changes vs Current Implementation / Prior Design Doc

Deltas from the prior redesign doc baseline:

1. **Background is pure white, not a gradient.** Prior doc specified `#F8FAFC → #F0F4F8` subtle blue-gray gradient. Figma shows flat white (`#FFFFFF`) in light mode on every main screen. Remove gradient.
2. **Search bar fill is light gray, not white-with-shadow.** Figma shows a filled pill in `~#EEF1F4` / `#ECEFF2` with NO visible drop shadow and NO border. Prior doc called for `#FFFFFF` with 3dp elevation. Drop elevation, switch fill.
3. **History rows use full-color brand favicons, not a single clock icon.** Prior doc said "Material clock icon + query". Figma shows per-query favicon (YouTube red play, Google G, GitHub cat, Webull purple, Reddit orange). The clock/history affordance is conveyed purely by the section label "Recent" + the NW-arrow on the right.
4. **Typing state shows an "app shortcuts" row** (Camera / Calendar / Calculator) as icon tiles between the matched-command chip and the text suggestions. Per user comment R7.3: this is on-device installed-app matching using launcher icon pack when available.
5. **Matched-command chip is a filled pill** (light green tinted `~#E8F5E9`, green text `~#2E7D32`) with the command favicon + trigger text, shown directly under the search bar while typing. Prior doc described "command badge" inside each suggestion row instead.
6. **Chips in unfocused state are pastel-tinted pills** with category color applied to both the fill (very light tint) AND the trigger text. Each chip = `[favicon] [trigger]`. Colors observed: blue (g, ddg), red (yt), green (gh), orange (r), amber/yellow ($). Per R7.2: color comes from each command's group, not keyword matching.
7. **No settings icon visible in focused state.** Only the unfocused state shows the gear (top-right, inline with the "Fast Travel" wordmark, NOT bottom-right as prior doc said). Move settings to top-right.
8. **Wordmark is larger/heavier than spec'd.** Appears ~32sp regular, not 26sp light. No visible letter-spacing tightening. `[AMBIGUOUS: could be Roboto 28–32sp regular]`
9. **Widget designs omit the at-a-glance row entirely.** All widget variants are a single-line pill search bar with icons — no date, no weather, no second row. Matches user's stated intent.
10. **Widgets ship as named style presets** (Classic Pill, Rounded Rectangle, Minimal Square, Soft Rounded, plus Gradient/Neumorphism/Glassmorphism/Transparent variants) rather than a single configurable widget with sliders. The prior doc's "radius slider + opacity slider" model is replaced by a picker of curated presets.

---

## Main Screen — Focused (On Launch)

**Overall layout.** Portrait phone frame. Status bar at top showing "9:41". Directly below status bar: search bar with ~16dp horizontal padding and ~8dp top padding. Immediately below: "Recent" section label, then a vertical list of 5 history rows. Rest of screen is empty white until the keyboard region. No wordmark, no top app bar, no settings icon, no FAB.

**Search bar.** Pill shape, corner radius ~28dp (full pill — radius = height/2). Fill `~#EEF1F4` (very light cool gray). No border. No visible shadow/elevation. Height ~48dp. Internal padding: magnifier icon ~16dp from left edge of pill, placeholder text "Search or type a command…" in medium gray `~#9AA0A6`. A thin blue text cursor is visible just before "Search" indicating focus. No trailing icons (no mic, no clear).

**Typography.** Placeholder: ~16sp, regular, gray `#9AA0A6`. "Recent" label: ~13sp, semi-bold, dark gray `~#5F6368`, with a hairline divider below it spanning full content width. Row query text: ~16sp, regular, near-black `~#202124`. No wordmark on this screen.

**Icons.** Leading magnifier inside search pill: ~20dp, stroke style, dark gray/near-black. Each history row has: leading 24dp full-color favicon, trailing 20dp NW-arrow (↖) in medium gray.

**Colors.** Background `#FFFFFF` (flat). Search bar fill `~#EEF1F4`. Text primary `~#202124`. Text secondary `~#5F6368`. Placeholder `~#9AA0A6`. Dividers `~#E8EAED` (hairline, very subtle).

**History rows.** Full-width rows, ~48dp tall, with ~16dp horizontal padding. Layout: `[24dp favicon] [12dp gap] [query text, flex] [NW-arrow 20dp]`. Hairline divider between rows (`~#E8EAED`). Long-press row → remove prompt (R7.1).

---

## Main Screen — Typing

**Overall layout.** Same frame as Focused. Search bar contains typed text "ca" with blue cursor. Below the search bar, three stacked sections:
1. A single matched-command chip row.
2. Hairline divider.
3. Horizontal row of 3 app-icon tiles with labels below (Camera, Calendar, Calculator).
4. Hairline divider.
5. Three text-suggestion rows (calendar, calculator, cash app).

**Search bar.** Same pill as Focused state. Typed text "ca" appears in near-black ~16sp regular.

**Matched-command chip.** Single pill, left-aligned under search bar, ~16dp from left edge. Fill: very light green `~#E8F5E9`. Content: `[Google Calendar favicon 20dp] [8dp gap] [trigger text "cal"]` in green bold `~#2E7D32`, ~14sp. Corner radius full pill. Padding ~8dp horizontal / ~6dp vertical.

**App-shortcut row (R7.3).** Three square app icon tiles in a horizontal row, ~16dp apart, left-aligned. Each tile: ~56dp rounded-square icon (Android adaptive-icon style — use launcher icon pack when available via `ROLE_HOME` detection, else `ApplicationInfo.loadIcon()`). Label below: ~11sp.

**Suggestion rows.** Three rows, same structure as history rows: `[favicon 24dp] [text] [NW-arrow]`. Favicon reflects the resolved command: default Google G when no command matched, or the command's `iconUrl` when a command was detected.

---

## Main Screen — Unfocused

**Overall layout.** Status bar at top. Below it, a header row with "Fast Travel" wordmark on the left and a settings gear icon on the right (both inline, ~16dp padding from frame edges). Below header: search bar (same pill). Below search bar: a wrap-grid of command chips (R7.2 — most-frequently-used commands, configurable rows).

**Wordmark.** "Fast Travel" in dark near-black, ~32sp, regular/medium weight. `[AMBIGUOUS: Roboto vs system font; weight estimate 400–500]`.

**Settings icon.** Top-right, gear outline (Material `settings` outline icon), ~24dp, dark gray `~#5F6368`. Vertically centered with the wordmark.

**Search bar.** Identical pill to other states. Placeholder "Search or type a command…" in gray. No cursor (unfocused).

**Command chips.** Wrap layout, left-aligned, configurable number of rows (1 / 2 / 3, default 2 — per R7.2). Row 1: `g` (blue), `yt` (red), `gh` (green), `ddg` (blue). Row 2: `r` (orange), `$` (amber/yellow). Each chip: full pill, ~32dp tall, padding ~12dp horizontal / ~6dp vertical. Structure: `[20dp favicon] [6dp gap] [trigger text, bold, ~14sp, colored]`. Fill is a very light tint of the command's group color (e.g. pale blue `~#E8F0FE`, pale red `~#FDECEA`, pale green `~#E8F5E9`, pale orange `~#FFF3E0`, pale yellow `~#FFF8E1`). No border. ~8dp gaps between chips horizontally, ~8dp between rows.

---

## Widget Examples — Light Mode

**Canvas.** Dark presentation background (`~#0F1419`) with 4 labeled widget previews arranged in a 2x2 grid. Labels: `Classic Pill`, `Rounded Rectangle`, `Minimal Square`, `Soft Rounded`. Size annotation `4 × 1`.

**All 4 variants share.** White fill (`#FFFFFF`), magnifier (or Google G) icon leading, placeholder "Search" in gray, trailing icons (mic + optional second icon). Single-line only — NO date, NO weather, NO second row.

**Classic Pill.** Full pill, radius = height/2 (~28dp). Google G favicon leading. Trailing: mic + second icon. Light subtle shadow.
**Rounded Rectangle.** Shorter/squarer, corner radius ~16dp. Magnifier leading. Trailing: mic only. No shadow.
**Minimal Square.** Corner radius ~8dp. Magnifier leading. Trailing: mic only. Flat.
**Soft Rounded.** Corner radius ~20dp. Google G leading. Trailing: mic + second icon. Subtle shadow.

---

## Widget Examples — Dark Mode

Same 2x2 grid, variants: `Dark Fill`, `Dark Rounded`, `Dark Square`, `Dark Soft`. Dark surface fill `~#1E293B` / `~#2A2F3A`, white search text/icons, same shapes as Light equivalents.

---

## Widget Examples — AMOLED (Pure Black)

2x2 grid: `AMOLED Pill`, `AMOLED Rounded`, `AMOLED Minimal`, `AMOLED Square`. Fill is true black `#000000`. Very thin light-gray border (~1dp) keeps shape visible against dark wallpapers.

---

## Widget Examples — Material You (Dynamic Colors)

2x2 grid: `Material You - Blue`, `Material You - Green`, `Material You - Purple`, `Material You - Orange`. All use Soft Rounded shape (~20dp radius). Fill is a pastel tint drawn from wallpaper-derived Material You accent:
- Blue: `~#D8E2F3`
- Green: `~#E0EBD4`
- Purple: `~#E8DEF8`
- Orange: `~#FFE8C2`

Bind to `primaryContainer` / `onPrimaryContainer` on Android 12+; don't hardcode.

---

## Widget Examples — Misc (Custom Shapes & Styles)

2x2 grid: `Gradient Blue`, `Gradient Purple`, `Glassmorphism`, `Neumorphism Light`.

**Gradient Blue.** Full pill, horizontal gradient cyan `~#3AB4FF` → deep blue `~#2563EB`. White icons/text.
**Gradient Purple.** Full pill, gradient pink `~#E74FC9` → purple `~#9333EA`. White icons/text.
**Glassmorphism.** Dark translucent pill with frosted-glass look. Thin light border.
**Neumorphism Light.** Pill on light gray surface with dual soft shadows (light top-left, dark bottom-right).

---

## Widget Examples — Transparent with Border

2x2 grid: `Halo Blue`, `Halo Green`, `Halo Purple`, `Halo Pink`. Transparent fill, ~1.5dp solid colored border + matching accent icons. Corner radius ~20–24dp.

---

## Widget Examples — Transparent (No Border)

2x2 grid: `Minimal Blue`, `Minimal Cyan`, `Minimal Amber`, `Minimal Rose`. Fully transparent — no border, no fill. Only icons and placeholder visible in accent color.

---

## Dark vs Light Parity Notes

- Main Screen PNGs: **light mode only.** Dark-mode main screens must be derived from the light mocks + dark color tokens.
- Widget PNGs: full coverage across Light / Dark / AMOLED / Material You / Transparent / Misc.
- No Settings screens in exports — settings UI follows prior redesign conventions + R2 reorganization.
