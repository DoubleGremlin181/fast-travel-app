# Per-device icon overrides — design

## Problem

Commands in Fast Travel v2 currently have a single `iconUrl` at the command level, but a command's routes can target different destinations per device. The `app-stores` command, for example, routes to Play Store on Android, App Store on iOS, and Steam on desktop — yet a single Play Store favicon represents all three. Users on desktop see a Play Store icon for a pill that actually opens Steam.

The same mismatch applies to any command whose routes differ meaningfully per device.

## Shape

Keep the single default icon at the command level; add an optional `iconOverrides` array that lets one override cover multiple devices. Icon resolution is independent of routes.

```json
{
  "id": "app-stores",
  "iconUrl": "https://www.google.com/s2/favicons?domain=play.google.com&sz=128",
  "iconOverrides": [
    {
      "devices": ["iOS"],
      "iconUrl": "https://www.google.com/s2/favicons?domain=apps.apple.com&sz=128"
    },
    {
      "devices": ["Windows", "MacOS", "Linux", "Unknown"],
      "iconUrl": "https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=128"
    }
  ]
}
```

**Resolution rule:** `resolveIconUrl(cmd, device)` returns the first override whose `devices` array contains `device`, else `cmd.iconUrl`, else `undefined`/`null` (callers fall back to the existing colored-circle placeholder).

## Schema change

Additive to `shared/config/config.schema.json`, inside the `command` definition:

```json
"iconOverrides": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["devices", "iconUrl"],
    "properties": {
      "devices": {
        "type": "array",
        "minItems": 1,
        "items": { "enum": ["Windows", "MacOS", "Linux", "Android", "iOS", "Unknown"] }
      },
      "iconUrl": { "type": "string", "pattern": "^https?://" }
    },
    "additionalProperties": false
  },
  "description": "Optional per-device icon overrides. Each device may appear in at most one entry."
}
```

No schema version bump — existing configs validate unchanged.

## Cross-entry validation

JSON Schema can't easily express "a device appears in at most one override," so this becomes a semantic check:

- `tools/validate-config.mjs` — iterate `command.iconOverrides`, collect every device, error on duplicate (`Command '<id>': device '<device>' appears in multiple iconOverrides`).
- `android/.../data/ConfigValidator.kt` — mirror the same check alongside the existing `iconUrl` URL validation.
- Each override's `iconUrl` also runs through the existing `validateUrl` helper.

If the check is bypassed at runtime, the resolver picks the first match deterministically — no crash.

## Resolver helper

One pure function per platform, called by every icon-rendering site.

**TypeScript** (`extension/src/core/icon.ts`):
```ts
import type { Command, Device } from "./types";

export function resolveIconUrl(cmd: Command, device: Device): string | undefined {
  const override = cmd.iconOverrides?.find(o => o.devices.includes(device));
  return override?.iconUrl ?? cmd.iconUrl;
}
```

**Kotlin** (`android/.../core/IconResolver.kt`):
```kotlin
fun resolveIconUrl(cmd: Command, device: Device): String? =
    cmd.iconOverrides.firstOrNull { device in it.devices }?.iconUrl ?: cmd.iconUrl
```

## Type & parser updates

- `extension/src/core/types.ts` — add `iconOverrides?: IconOverride[]` to `Command`; define `IconOverride = { devices: Device[]; iconUrl: string }`.
- `android/.../core/Models.kt` — add `val iconOverrides: List<IconOverride> = emptyList()` to `Command`; define `data class IconOverride(val devices: List<Device>, val iconUrl: String)`.
- `android/.../core/ConfigParser.kt` — parse the array (empty list when absent).
- `android/.../core/ConfigWriter.kt` — serialize `iconOverrides` when non-empty.

## Editor UI (consistent across platforms)

Below the existing "Icon URL" field in the command editor, add a collapsible **"Per-device icons"** section:

- Starts empty; a subtle **"+ Add per-device icon"** button adds a row.
- Each row: a multi-select chip picker for devices (`Windows / MacOS / Linux / Android / iOS / Unknown`), a URL text field, a small preview thumbnail, and a delete button.
- Live validation: a device already used in another row is disabled in that row's picker (grey chip with tooltip "already set in another override"), enforcing uniqueness at entry time.
- Extension: rendered in `extension/src/options/screens/command-editor.ts` directly after the `iconUrl` field.
- Android: rendered in `android/.../ui/ConfigEditorScreens.kt` directly after the `iconUrl` `OutlinedTextField`, same chip + text + thumbnail pattern.

## Call-site updates

Every rendering path that currently reads `cmd.iconUrl` must switch to `resolveIconUrl(cmd, currentDevice)`:

**Extension:**
- `extension/src/newtab/newtab.ts` (grid card, suggestion rows, pill rendering — multiple sites)
- `extension/src/options/screens/commands.ts` (list-view favicon)
- Any other surface that renders a command icon in a user-visible context (but **not** the command editor's own iconUrl input, which still edits the default)

**Android:**
- `android/.../ui/SearchActivity.kt` (search result, typo suggestion, etc. — multiple sites)
- `android/.../core/SuggestionProvider.kt`
- `android/.../ui/ConfigEditorScreens.kt` (command card preview)

The editor's icon-URL input field still binds to `command.iconUrl` directly — it's editing the default, not displaying it.

## Default config update

Edit both copies:
- `shared/config/default-config.json`
- `android/app/src/main/assets/default-config.json`

On the `app-stores` command, add the `iconOverrides` block shown in "Shape" above. Keep `iconUrl` pointing at Play Store as the default (covers Android).

## Test fixtures

New `shared/test-fixtures/icon-resolution.fixtures.json`, consumed by both TS and Kotlin tests:

- No overrides → command default returned
- Override matches device → override URL returned
- Override's `devices` array contains multiple entries, one matches → override URL returned
- No override matches and no default set → null/undefined
- Duplicate device across overrides → validation fails (separate validator fixture)

## Verification plan

- **Unit**: TS + Kotlin resolver parity tests run over the shared fixture.
- **Validator**: add a failing-case fixture for duplicate device across overrides.
- **Playwright** (Linux Chromium):
  - Open the newtab grid → `apps` pill shows Steam favicon (screenshot).
  - Open options → edit `apps` → per-device override rows render with correct devices and URLs (screenshot).
- **Android AVD**:
  - Open the app → type to surface `apps` suggestion → Play Store icon shown (screenshot).
  - Open command editor → override rows render; adding a new row with a used device disables that chip (screenshot).

## Out of scope

- No route-level icon field (routes stay unchanged).
- No browser-level override (device-only, matches the per-device request).
- No schema version bump.
- No migration tooling — additive, optional, existing configs are valid.
