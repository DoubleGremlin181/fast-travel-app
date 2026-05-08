# Ignore list redesign — design

## Problem

The current Settings → Ignore List screen has one list that mixes permanent entries with auto-ignore candidates (ones counting up to the auto-ignore threshold). Per-row controls crowd the row; there's no way to distinguish auto from manual; there's no way to say "never auto-ignore this trigger"; and the threshold is a slider when it should be a discrete number.

## Concepts

- **Permanent ignore** — a trigger whose typos are always suppressed. No counter. Added either manually or by confirming a candidate.
- **Auto-ignore candidate** — a trigger being tracked. Has `count` (int ≥ 1) and `doNotIgnore` (bool).
- **Auto-ignore threshold** — user-configurable number N, range 1–20, default 3. Device-local.
- **Effective ignore list** (used by the typo parser) = permanent entries ∪ { candidate | `count ≥ threshold` AND `!doNotIgnore` }.

## Data

**Shared semantics, per-platform storage:**

- Permanent list — lives in `config.ignoreList`, shared through the existing config-sync mechanism (remote + local overrides).
- Auto-ignore candidates — device-local.
  - Android: `SharedPreferences("fast_travel_auto_ignore")`, keys `ignore_count_<trigger>` (int) and `ignore_dni_<trigger>` (bool).
  - Extension: single blob in `chrome.storage.local["fast-travel-auto-ignore"]` as `{ [trigger]: { count, doNotIgnore } }`.
- Threshold — device-local.
  - Android: `ThemePreferences.autoIgnoreThreshold`.
  - Extension: `chrome.storage.local["fast-travel-auto-ignore-threshold"]`.

The effective list is always computed at read time; it is never stored.

## Lifecycle

| Trigger event | Effect |
|---|---|
| "Search as typed" on typo card | Candidate `count++` (create with `count=1, doNotIgnore=false` if new). Flag preserved. |
| "Accept correction" on typo card | Candidate `count--`. If count reaches 0, delete candidate entry. Runs regardless of flag. |
| "Add to ignore list" on typo card | Add to `permanentIgnoreList`. Delete candidate entry if present (flag discarded). |
| "Confirm as permanent" in Settings | Same as above — move candidate → permanent. |
| "Toggle Do not ignore" in Settings | Flip `candidates[t].doNotIgnore`. Counter untouched. |
| "Remove from tracking" in Settings | Delete candidate entry (count + flag). |
| "Remove" on permanent row | Remove from `permanentIgnoreList`. No candidate side-effect. |
| "Reset all counts" button | Delete every candidate entry. Confirmation dialog first. |
| Threshold value changed | No data mutation. Re-render. |

Threshold changes are pure filter changes — below-threshold candidates may become active or vice versa, but counts are preserved. Permanent entries are never affected by threshold. Do-not-ignore candidates are never active regardless of threshold.

## Settings screen layout

**Layout: Approach C — two collapsible sections, both expanded on every open, no persisted collapse state.**

```
← Ignore List

▾ Permanent
   [ Add a term…              ] [ + ]

   cat
   fcb

────────────────────────────────────

▾ Auto-ignore tracking
   Threshold   [ − ] 3 [ + ]
   [ 🗑  Reset all counts ]   (red)

   uk    ×5              active
   sf    ×3              below threshold   (greyed)
   fcb   ×2              never ignored     (red)
```

### Permanent section

- Add-row: text field + "+" button. Enter submits. Blank input is ignored. Duplicate of a permanent entry is a no-op. If the trigger is currently a red-flagged candidate, manual add still wins (flag and counter discarded).
- Sorted alphabetically.
- Rows show only the trigger text (monospace). No count, no badges.

### Auto-ignore tracking section

- Threshold stepper: `[−] N [+]`, clamped to 1–20, disables `−` at 1 and `+` at 20.
- "Reset all counts" — full-width destructive button, matches `SearchHistoryScreen`'s "Clear All". Confirmation dialog. Disabled when the candidate map is empty.
- Candidate rows: trigger + `×count` badge + state pill on the right.
- Sorted by count desc, alphabetical tiebreak.
- Three visual states:
  - **Active** (`count ≥ threshold AND !doNotIgnore`): full opacity, default colors, pill reads "active".
  - **Below threshold** (`count < threshold AND !doNotIgnore`): row dimmed (~0.55 opacity), pill reads "below threshold". Changes to active automatically if threshold drops.
  - **Do not ignore** (`doNotIgnore = true`): error-color text + crossed-out icon, pill reads "never ignored". Not dimmed (user actively flagged it).

### Empty states

- Permanent section empty: "No permanent entries. Add one above, or confirm an auto-tracked trigger below."
- Auto-ignore section empty: "No tracked triggers yet. Dismiss a typo suggestion to start tracking."

## Interaction — actions behind a gesture

Rows stay visually clean; actions are gesture-revealed, per platform convention.

**Android:** Long-press a row → `ModalBottomSheet` with full-width action rows.
- Permanent row sheet: `Remove`.
- Candidate row sheet: `Confirm as permanent`, `Flag as 'Do not ignore'` / `Unflag 'Do not ignore'` (label reflects current state), `Remove from tracking`.
- Destructive items in error color.

**Extension:** Hover a row → action icons fade in on the right of the row.
- Permanent row: `×` remove.
- Candidate row: `✓` confirm, `⊘` toggle do-not-ignore, `×` remove.
- Buttons are `aria-label`'d for accessibility; keyboard tab order includes them whether visible or not.

Tap/click on the row body itself does nothing — prevents accidental edits.

"Reset all counts" asks for confirmation via `AlertDialog` (Android) / confirmation modal (extension).

## Typo card — unchanged

Three buttons (Accept correction / Search as typed / Add to ignore list) remain as today. The new lifecycle rules for increment/decrement simply replace what those three buttons do under the hood.

## Visual styling

Match existing patterns. No new design tokens.

- **Android**: section labels, row typography, count badges, buttons, stepper shape, and `Reset all counts` styling all anchor to the corresponding elements already in `SettingsActivity.kt` (main Settings screen section labels, `SearchHistoryScreen` clear-all button, Material 3 theme color roles).
- **Extension**: reuse existing classes and CSS variables from `options.css` — `.card`, `.card-header`, `.card-body`, `.inline-form`, `.tag-count`, `.stepper`, `.btn.danger`, `var(--font-mono)`, `var(--accent)`, `var(--danger)`, etc.

No new palette entries, no new typography scales. If a token isn't already in the app, the Material / existing-CSS default applies.

## Notifications

No snackbars or toasts for ignore-list actions. The list updates immediately, which is itself the feedback. Confirmation dialogs cover destructive actions.

## Typo card handler changes

**Both platforms:** the code for the three typo-card actions needs to honor the new lifecycle rules:

- "Accept correction" — currently does no counter work. Must now decrement `count` for the trigger, delete candidate if count hits 0.
- "Search as typed" — already increments count. Must now increment by 1 (not gated by flag). Must also check threshold: if `count >= threshold AND !doNotIgnore`, trigger becomes effectively ignored on the next parse (no explicit add needed — the effective list is derived).
- "Add to ignore list" — add to permanent list AND delete any candidate entry for the trigger (including red flag).

The old "auto-add at threshold crossing" logic (`autoIgnoreTrigger` / `persistIgnoreTrigger`) is removed — we no longer write to `permanentIgnoreList` from the typo path. The threshold is now a read-time filter over candidates.

## Migration

The current device state has two pre-existing stores we need to keep working:

- Persisted `config.ignoreList` (e.g., `['cat']`) — already the right shape for `permanentIgnoreList`. No migration needed.
- `SharedPreferences("fast_travel_auto_ignore")` with keys like `ignore_count_<trigger>` and no DNI flags — reads as candidates with `doNotIgnore=false`. Backward compatible because the new code treats a missing `ignore_dni_*` key as `false`.
- Extension `chrome.storage.local["fast-travel-typo-rejections"]` — existing `{ [trigger]: number }` shape. Migrate on first read: reshape to `{ [trigger]: { count: number, doNotIgnore: false } }` under the new key `"fast-travel-auto-ignore"`. Leave the old key in place temporarily for safety, delete after one successful write to the new key.

## Out of scope

- Syncing candidate data across devices.
- A way to fully disable auto-ignore (set threshold to 20 for near-disabled; explicit toggle not added).
- Per-entry creation-date metadata.
- A way to see *why* a trigger is ignored from the typo card itself.
- UI for editing multiple entries at once.
