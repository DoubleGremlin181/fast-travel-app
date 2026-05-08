# Per-Device Icon Overrides Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an optional `iconOverrides` array on commands so authors can pick different icons per device without duplicating routes; keep `iconUrl` as the command default.

**Architecture:** Additive schema change + a small `resolveIconUrl(cmd, device)` helper in each client. Every icon-rendering call site swaps `cmd.iconUrl` → `resolveIconUrl(cmd, currentDevice)`. Editor UIs gain a "Per-device icons" section under the existing iconUrl field, using the same chip-multiselect + URL + preview pattern on both clients. Cross-entry validator rejects any device appearing in more than one override.

**Tech Stack:** TypeScript (extension, Manifest V3), Kotlin + Compose (Android), shared JSON fixtures for parser parity, Playwright + AVD for end-to-end verification.

**Design reference:** `docs/plans/2026-04-15-per-device-icon-overrides-design.md`

---

## Phase 1 — Shared schema, fixtures, validator

### Task 1: Extend `config.schema.json` with `iconOverrides`

**Files:**
- Modify: `shared/config/config.schema.json` (inside `$defs.command.properties`, after `iconUrl`)

**Step 1: Add the `iconOverrides` property**

In `shared/config/config.schema.json`, inside the `command` definition's `properties` object, directly after the `iconUrl` property, insert:

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
        "items": {
          "enum": ["Windows", "MacOS", "Linux", "Android", "iOS", "Unknown"]
        }
      },
      "iconUrl": {
        "type": "string",
        "pattern": "^https?://"
      }
    },
    "additionalProperties": false
  },
  "description": "Optional per-device icon overrides. Each device may appear in at most one entry (semantic check, not enforced by JSON Schema)."
}
```

**Step 2: Verify existing configs still validate**

Run: `node tools/validate-config.mjs`
Expected: `OK shared/config/default-config.json`

**Step 3: Commit**

```bash
git add shared/config/config.schema.json
git commit -m "schema: add optional iconOverrides array on commands"
```

---

### Task 2: Add fixtures for resolver parity

**Files:**
- Create: `shared/test-fixtures/icon-resolution.fixtures.json`

**Step 1: Write the fixtures**

```json
{
  "cases": [
    {
      "name": "no overrides — returns command default",
      "command": {
        "iconUrl": "https://example.com/default.png",
        "iconOverrides": []
      },
      "device": "Linux",
      "expected": "https://example.com/default.png"
    },
    {
      "name": "override matches device",
      "command": {
        "iconUrl": "https://example.com/default.png",
        "iconOverrides": [
          { "devices": ["iOS"], "iconUrl": "https://example.com/ios.png" }
        ]
      },
      "device": "iOS",
      "expected": "https://example.com/ios.png"
    },
    {
      "name": "override covers multiple devices — one matches",
      "command": {
        "iconUrl": "https://example.com/default.png",
        "iconOverrides": [
          {
            "devices": ["Windows", "MacOS", "Linux", "Unknown"],
            "iconUrl": "https://example.com/steam.png"
          }
        ]
      },
      "device": "MacOS",
      "expected": "https://example.com/steam.png"
    },
    {
      "name": "override does not match — falls back to default",
      "command": {
        "iconUrl": "https://example.com/default.png",
        "iconOverrides": [
          { "devices": ["iOS"], "iconUrl": "https://example.com/ios.png" }
        ]
      },
      "device": "Android",
      "expected": "https://example.com/default.png"
    },
    {
      "name": "no default, no matching override — returns null",
      "command": {
        "iconOverrides": [
          { "devices": ["iOS"], "iconUrl": "https://example.com/ios.png" }
        ]
      },
      "device": "Linux",
      "expected": null
    },
    {
      "name": "no default, no overrides — returns null",
      "command": {
        "iconOverrides": []
      },
      "device": "Linux",
      "expected": null
    },
    {
      "name": "first matching override wins",
      "command": {
        "iconUrl": "https://example.com/default.png",
        "iconOverrides": [
          { "devices": ["Linux"], "iconUrl": "https://example.com/first.png" },
          { "devices": ["Linux"], "iconUrl": "https://example.com/second.png" }
        ]
      },
      "device": "Linux",
      "expected": "https://example.com/first.png"
    }
  ]
}
```

(The last case documents determinism when validation is bypassed — first match wins.)

**Step 2: Commit**

```bash
git add shared/test-fixtures/icon-resolution.fixtures.json
git commit -m "test: add icon-resolution fixtures for TS/Kotlin parity"
```

---

### Task 3: Extend `validate-config.mjs` with iconOverrides check

**Files:**
- Modify: `tools/validate-config.mjs:35-41` (ALLOWED_KEYS.command — add `"iconOverrides"`)
- Modify: `tools/validate-config.mjs:145-211` (validateCommand — new block after iconUrl check)

**Step 1: Write a failing test — add a broken override to a scratch config**

Create `/tmp/bad-overrides.json` copying `shared/config/default-config.json` and add to the `app-stores` command:

```json
"iconOverrides": [
  { "devices": ["Android"], "iconUrl": "https://example.com/a.png" },
  { "devices": ["Android"], "iconUrl": "https://example.com/b.png" }
]
```

Run: `node tools/validate-config.mjs /tmp/bad-overrides.json`
Expected (today): `FAIL` — but probably with `unexpected property "iconOverrides"`, not the duplicate-device error. We'll make it surface the right error.

**Step 2: Allow `iconOverrides` in ALLOWED_KEYS.command**

Update the set at line 38:

```js
command: new Set(["id", "triggers", "name", "type", "description", "color", "iconUrl", "iconOverrides", "suggestionsApi", "normalize", "routes"]),
```

**Step 3: Add validation logic in `validateCommand`**

After the `iconUrl` check (line 187-189), add:

```js
if (c.iconOverrides !== undefined) {
  if (!Array.isArray(c.iconOverrides)) {
    errors.push(`${path}.iconOverrides: must be an array`);
  } else {
    const seenDevices = new Map(); // device -> overrideIndex
    c.iconOverrides.forEach((ov, i) => {
      const ovPath = `${path}.iconOverrides[${i}]`;
      if (!ov || typeof ov !== "object") {
        errors.push(`${ovPath}: not an object`);
        return;
      }
      for (const key of Object.keys(ov)) {
        if (key !== "devices" && key !== "iconUrl") {
          errors.push(`${ovPath}: unexpected property "${key}"`);
        }
      }
      if (!Array.isArray(ov.devices) || ov.devices.length === 0) {
        errors.push(`${ovPath}.devices: must be a non-empty array`);
      } else {
        for (const d of ov.devices) {
          if (!DEVICES.has(d)) {
            errors.push(`${ovPath}.devices: "${d}" is not a known device`);
            continue;
          }
          const prev = seenDevices.get(d);
          if (prev !== undefined) {
            errors.push(`${path}.iconOverrides: device "${d}" appears in entries [${prev}] and [${i}] — each device may appear in at most one override`);
          } else {
            seenDevices.set(d, i);
          }
        }
      }
      if (!isPlainString(ov.iconUrl) || !HTTPS_RE.test(ov.iconUrl)) {
        errors.push(`${ovPath}.iconUrl: must be http(s) URL — got "${ov.iconUrl}"`);
      }
    });
  }
}
```

**Step 4: Verify the duplicate-device case fails with the right error**

Run: `node tools/validate-config.mjs /tmp/bad-overrides.json`
Expected: `FAIL` with `config.groups[...].commands[...].iconOverrides: device "Android" appears in entries [0] and [1]`

Run on the unchanged default config: `node tools/validate-config.mjs`
Expected: `OK shared/config/default-config.json`

**Step 5: Commit**

```bash
git add tools/validate-config.mjs
git commit -m "validator: enforce iconOverrides shape and per-device uniqueness"
```

---

## Phase 2 — Extension (TypeScript)

### Task 4: Extend types

**Files:**
- Modify: `extension/src/core/types.ts:38-47`

**Step 1: Add the interface and field**

In `extension/src/core/types.ts`, above the `Command` interface, add:

```ts
export interface IconOverride {
  devices: DeviceType[];
  iconUrl: string;
}
```

Inside the `Command` interface (between `iconUrl?: string;` and `suggestionsApi?: string;`), add:

```ts
iconOverrides?: IconOverride[];
```

**Step 2: Type-check**

Run: `npx tsc --noEmit -p extension/tsconfig.json` (or whatever TS config the project uses — check `package.json` scripts first)
Expected: exits 0 with no errors.

**Step 3: Commit**

```bash
git add extension/src/core/types.ts
git commit -m "types: add IconOverride and Command.iconOverrides"
```

---

### Task 5: Write the TS resolver with tests (TDD)

**Files:**
- Create: `extension/src/core/icon.ts`
- Create: `extension/tests/unit/icon.test.ts` (match the project's existing unit-test convention — adjust filename/location if different; run `ls extension/tests/unit` first)

**Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";  // or whatever the project uses
import { resolveIconUrl } from "../../src/core/icon";
import type { Command, DeviceType } from "../../src/core/types";

const FIXTURES = JSON.parse(
  readFileSync(resolve(__dirname, "../../../shared/test-fixtures/icon-resolution.fixtures.json"), "utf8"),
);

describe("resolveIconUrl", () => {
  for (const c of FIXTURES.cases) {
    it(c.name, () => {
      // Minimal Command stub — only the fields the resolver reads
      const cmd = c.command as Partial<Command> as Command;
      const result = resolveIconUrl(cmd, c.device as DeviceType);
      expect(result ?? null).toBe(c.expected);
    });
  }
});
```

Note: first check what test runner the project uses — `grep -l "vitest\|jest\|mocha" package.json`. Match it exactly.

**Step 2: Run — should fail because `icon.ts` does not exist**

Run: `npx vitest run extension/tests/unit/icon.test.ts` (or project-equivalent command)
Expected: FAIL with "Cannot find module .../core/icon"

**Step 3: Implement the resolver**

Create `extension/src/core/icon.ts`:

```ts
import type { Command, DeviceType } from "./types";

export function resolveIconUrl(cmd: Command, device: DeviceType): string | undefined {
  const override = cmd.iconOverrides?.find((o) => o.devices.includes(device));
  return override?.iconUrl ?? cmd.iconUrl;
}
```

**Step 4: Run — should pass**

Run: `npx vitest run extension/tests/unit/icon.test.ts`
Expected: all 7 cases pass.

**Step 5: Commit**

```bash
git add extension/src/core/icon.ts extension/tests/unit/icon.test.ts
git commit -m "feat(ext): add resolveIconUrl helper with fixture-parity tests"
```

---

### Task 6: Swap call sites in the extension

**Files:**
- Modify: `extension/src/newtab/newtab.ts` (lines 228, 360, 396, 431, 456, 524 — see below for how to treat each)
- Modify: `extension/src/options/screens/commands.ts:165`

**Step 1: Identify each call site and what device to use**

Run: `grep -n 'iconUrl' extension/src/newtab/newtab.ts extension/src/options/screens/commands.ts`

For each site, determine which `device` variable is in scope:
- In `newtab.ts`, the current device is available as the same `device` variable already passed into `parse()` calls nearby (look above the iconUrl line for `const device = ...`).
- In `options/screens/commands.ts:165`, introduce a helper parameter: the options screen should use the "current device" at time of render — call `getCurrentDevice()` / import from wherever the parser imports it (same import as `newtab.ts`).

**Step 2: Import the resolver**

In each file, add:

```ts
import { resolveIconUrl } from "../core/icon";
```

(Adjust relative path per file location.)

**Step 3: Replace each `cmd.iconUrl` in a *render* context**

Example — `extension/src/newtab/newtab.ts:228`:

Before:
```ts
renderFavicon(faviconEl, { iconUrl: cmd.iconUrl, trigger: cmd.triggers[0], groupColor, size: 16 });
```

After:
```ts
renderFavicon(faviconEl, { iconUrl: resolveIconUrl(cmd, device), trigger: cmd.triggers[0], groupColor, size: 16 });
```

Repeat for every line listed in "Files". Two important cases to **leave alone**:
- `extension/src/options/screens/command-editor.ts:120-122` — this is the editor *input* bound to `draft.iconUrl` (the default). Keep it as-is.
- Any type-level / serialization code.

**Step 4: Type-check and run unit tests**

Run: `npx tsc --noEmit -p extension/tsconfig.json && npx vitest run`
Expected: no type errors, all existing tests still pass.

**Step 5: Smoke-build the extension**

Run: `npm run build` (or the project's build script — check `package.json`)
Expected: build succeeds.

**Step 6: Commit**

```bash
git add extension/src/newtab/newtab.ts extension/src/options/screens/commands.ts
git commit -m "feat(ext): resolve icons per device at every render site"
```

---

### Task 7: Add the "Per-device icons" section to the extension command editor

**Files:**
- Modify: `extension/src/options/screens/command-editor.ts:116-126` (after the existing `Icon URL` formRow, still inside the same `wrapCard`)

**Step 1: Read the existing `command-editor.ts` around line 126 to understand the patterns**

Run: `sed -n '1,200p' extension/src/options/screens/command-editor.ts`

Identify the utilities in use: `formRow`, `textField`, `selectField`, `el`, `wrapCard`. Any chip/multi-select util already in the file or imported helpers? If not, we'll build a minimal one inline.

**Step 2: Write the override-editor UI**

Below the existing `Icon URL` `formRow` (around line 126), add a new `formRow` that renders a list of override rows plus an "Add" button. All state changes write through to `draft.iconOverrides`.

```ts
// After the existing "Icon URL" formRow, still inside the same wrapCard:
formRow(
  "Per-device icons (optional)",
  iconOverridesField(draft),
  "Override the icon for specific devices. Each device can appear in at most one row.",
),
```

Then at module scope (below the other field helpers), add:

```ts
const ALL_DEVICES: DeviceType[] = ["Windows", "MacOS", "Linux", "Android", "iOS", "Unknown"];

function iconOverridesField(draft: Command): HTMLElement {
  const container = el("div", { class: "icon-overrides" });

  function render() {
    container.replaceChildren();
    const overrides = draft.iconOverrides ?? [];

    // Gather devices already used in *other* rows for disable-state
    const usedByRow = overrides.map(o => new Set(o.devices));

    overrides.forEach((ov, idx) => {
      const row = el("div", { class: "icon-override-row" });

      // Device chips
      const chipWrap = el("div", { class: "device-chips" });
      for (const d of ALL_DEVICES) {
        const usedElsewhere = usedByRow.some((set, i) => i !== idx && set.has(d));
        const selected = ov.devices.includes(d);
        const chip = el("button", {
          type: "button",
          class: `chip${selected ? " chip-on" : ""}${usedElsewhere ? " chip-disabled" : ""}`,
          title: usedElsewhere ? "Already set in another override" : "",
          disabled: usedElsewhere && !selected ? "" : null,
        }, d);
        chip.addEventListener("click", () => {
          if (usedElsewhere && !selected) return;
          if (selected) ov.devices = ov.devices.filter(x => x !== d);
          else ov.devices = [...ov.devices, d];
          render();
        });
        chipWrap.appendChild(chip);
      }
      row.appendChild(chipWrap);

      // URL field + preview
      const urlInput = textField({
        placeholder: "https://…/favicon.png",
        value: ov.iconUrl,
        onInput: (v) => {
          ov.iconUrl = v.trim();
          preview.src = ov.iconUrl;
        },
      });
      row.appendChild(urlInput);

      const preview = el("img", { class: "icon-preview", src: ov.iconUrl, alt: "" }) as HTMLImageElement;
      row.appendChild(preview);

      const del = el("button", { type: "button", class: "icon-del" }, "Remove");
      del.addEventListener("click", () => {
        draft.iconOverrides = overrides.filter((_, i) => i !== idx);
        if (draft.iconOverrides.length === 0) draft.iconOverrides = undefined;
        render();
      });
      row.appendChild(del);

      container.appendChild(row);
    });

    const add = el("button", { type: "button", class: "icon-add" }, "+ Add per-device icon");
    add.addEventListener("click", () => {
      draft.iconOverrides = [...(draft.iconOverrides ?? []), { devices: [], iconUrl: "" }];
      render();
    });
    container.appendChild(add);
  }

  render();
  return container;
}
```

Import `DeviceType` from `../../core/types` at the top of the file if not already imported.

**Step 3: Add the minimal CSS**

Find the options stylesheet (probably `extension/src/options/options.css` — check with `ls extension/src/options`). Append:

```css
.icon-overrides { display: flex; flex-direction: column; gap: 12px; }
.icon-override-row { display: grid; grid-template-columns: auto 1fr 32px auto; gap: 8px; align-items: center; padding: 8px; background: var(--surface-subtle, #f7f7f7); border-radius: 6px; }
.device-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { padding: 4px 10px; border-radius: 12px; border: 1px solid var(--border, #ccc); background: transparent; font-size: 12px; cursor: pointer; }
.chip-on { background: var(--accent, #2563eb); color: white; border-color: var(--accent, #2563eb); }
.chip-disabled { opacity: 0.4; cursor: not-allowed; }
.icon-preview { width: 24px; height: 24px; border-radius: 4px; background: #eee; object-fit: contain; }
.icon-add { align-self: flex-start; border: 1px dashed var(--border, #ccc); background: transparent; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
.icon-del { background: transparent; border: 0; color: var(--text-subtle, #666); cursor: pointer; text-decoration: underline; }
```

If the project uses CSS-in-TS or a different file, adapt — read the existing editor styles first to match conventions.

**Step 4: Type-check + build**

Run: `npx tsc --noEmit -p extension/tsconfig.json && npm run build`
Expected: success.

**Step 5: Commit**

```bash
git add extension/src/options/screens/command-editor.ts extension/src/options/options.css
git commit -m "feat(ext): add per-device icon overrides editor UI"
```

---

## Phase 3 — Android (Kotlin)

### Task 8: Extend Models with IconOverride

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/Models.kt:30-39`

**Step 1: Add the data class and field**

Above the `Command` data class, add:

```kotlin
data class IconOverride(
    val devices: List<DeviceType>,
    val iconUrl: String,
)
```

Inside `Command`, add (between `iconUrl` and `suggestionsApi`):

```kotlin
val iconOverrides: List<IconOverride> = emptyList(),
```

**Step 2: Build**

Run: `cd android && ./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

**Step 3: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/core/Models.kt
git commit -m "models(android): add IconOverride and Command.iconOverrides"
```

---

### Task 9: Parse `iconOverrides`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/ConfigParser.kt:62-73`

**Step 1: Add parser logic**

Add a helper function in `ConfigParser`:

```kotlin
private fun parseIconOverrides(arr: JSONArray?): List<IconOverride> {
    if (arr == null) return emptyList()
    val out = mutableListOf<IconOverride>()
    for (i in 0 until arr.length()) {
        val obj = arr.getJSONObject(i)
        val devicesArr = obj.getJSONArray("devices")
        val devices = mutableListOf<DeviceType>()
        for (j in 0 until devicesArr.length()) {
            devices.add(DeviceType.fromString(devicesArr.getString(j)))
        }
        out.add(IconOverride(devices = devices, iconUrl = obj.getString("iconUrl")))
    }
    return out
}
```

Extend `parseCommand` to read it:

```kotlin
private fun parseCommand(obj: JSONObject): Command {
    return Command(
        id = obj.getString("id"),
        triggers = parseStringList(obj.getJSONArray("triggers")),
        name = obj.getString("name"),
        type = CommandType.fromString(obj.getString("type")),
        iconUrl = obj.optStringOrNull("iconUrl"),
        iconOverrides = parseIconOverrides(obj.optJSONArray("iconOverrides")),
        suggestionsApi = obj.optStringOrNull("suggestionsApi"),
        normalize = parseNormalize(obj.optJSONArray("normalize")),
        routes = parseRoutes(obj.getJSONArray("routes")),
    )
}
```

**Step 2: Build + run existing parser unit tests**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*ConfigParser*"`
Expected: existing tests pass (iconOverrides default to empty list when absent).

**Step 3: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/core/ConfigParser.kt
git commit -m "parser(android): read command.iconOverrides"
```

---

### Task 10: Serialize `iconOverrides`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/ConfigWriter.kt:49-64`

**Step 1: Update `writeCommand`**

After the `iconUrl` write (line 55), add:

```kotlin
if (c.iconOverrides.isNotEmpty()) {
    val arr = JSONArray()
    for (ov in c.iconOverrides) {
        val ovObj = JSONObject()
        val devicesArr = JSONArray()
        for (d in ov.devices) devicesArr.put(d.name)
        ovObj.put("devices", devicesArr)
        ovObj.put("iconUrl", ov.iconUrl)
        arr.put(ovObj)
    }
    obj.put("iconOverrides", arr)
}
```

**Step 2: Build + run existing writer tests**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*ConfigWriter*"`
Expected: existing tests pass.

**Step 3: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/core/ConfigWriter.kt
git commit -m "writer(android): serialize command.iconOverrides"
```

---

### Task 11: Validate `iconOverrides` in ConfigValidator

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/data/ConfigValidator.kt:99-101`

**Step 1: Add logic after the iconUrl validation**

```kotlin
// Each device may appear in at most one override.
val seenDevices = mutableMapOf<DeviceType, Int>()
cmd.iconOverrides.forEachIndexed { i, ov ->
    if (ov.devices.isEmpty()) {
        errors += "Command '${cmd.id}' iconOverrides[$i]: devices must be non-empty."
    }
    for (d in ov.devices) {
        val prev = seenDevices[d]
        if (prev != null) {
            errors += "Command '${cmd.id}' iconOverrides: device '${d.name}' appears in entries [$prev] and [$i]."
        } else {
            seenDevices[d] = i
        }
    }
    if (ov.iconUrl.isBlank()) {
        errors += "Command '${cmd.id}' iconOverrides[$i]: iconUrl must not be blank."
    } else {
        validateUrl(ov.iconUrl, "Command '${cmd.id}' iconOverrides[$i] iconUrl", errors)
    }
}
```

Add the `DeviceType` import at the top if not already imported.

**Step 2: Add a unit test (TDD)**

Find the existing validator test file (likely `android/app/src/test/.../ConfigValidatorTest.kt` — run `find android/app/src/test -name "ConfigValidator*"`). Add:

```kotlin
@Test
fun `iconOverrides rejects duplicate devices`() {
    val cmd = Command(
        id = "x", triggers = listOf("x"), name = "X", type = CommandType.Standard,
        iconOverrides = listOf(
            IconOverride(devices = listOf(DeviceType.Android), iconUrl = "https://a"),
            IconOverride(devices = listOf(DeviceType.Android), iconUrl = "https://b"),
        ),
        routes = listOf(Route(devices = RouteDevices.Wildcard, defaultUrl = "https://x")),
    )
    val errors = ConfigValidator.validateCommand(cmd)
    assertTrue(errors.any { it.contains("iconOverrides") && it.contains("Android") })
}
```

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*ConfigValidator*"`
Expected: new test passes.

**Step 3: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/data/ConfigValidator.kt android/app/src/test/kotlin/.../ConfigValidatorTest.kt
git commit -m "validator(android): reject duplicate devices across iconOverrides"
```

---

### Task 12: Write the Kotlin resolver with fixture parity test

**Files:**
- Create: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/IconResolver.kt`
- Create: `android/app/src/test/kotlin/sh/kavi/fasttravel/core/IconResolverTest.kt`

**Step 1: Write the failing test**

```kotlin
package sh.kavi.fasttravel.core

import org.json.JSONObject
import org.junit.Test
import java.io.File
import kotlin.test.assertEquals

class IconResolverTest {
    @Test
    fun `resolver matches shared fixtures`() {
        // The shared fixtures are in the repo at ../../shared/test-fixtures/
        val fixtureFile = File("../shared/test-fixtures/icon-resolution.fixtures.json")
        val cases = JSONObject(fixtureFile.readText()).getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val case = cases.getJSONObject(i)
            val name = case.getString("name")
            val cmdJson = case.getJSONObject("command")
            val device = DeviceType.fromString(case.getString("device"))
            val expected = if (case.isNull("expected")) null else case.getString("expected")

            // Build a minimal Command from the JSON stub
            val overridesJson = cmdJson.optJSONArray("iconOverrides")
            val overrides = mutableListOf<IconOverride>()
            if (overridesJson != null) {
                for (j in 0 until overridesJson.length()) {
                    val ov = overridesJson.getJSONObject(j)
                    val devs = ov.getJSONArray("devices").let { arr ->
                        (0 until arr.length()).map { DeviceType.fromString(arr.getString(it)) }
                    }
                    overrides.add(IconOverride(devices = devs, iconUrl = ov.getString("iconUrl")))
                }
            }
            val cmd = Command(
                id = "fixture", triggers = listOf("x"), name = "X",
                type = CommandType.Standard,
                iconUrl = if (cmdJson.has("iconUrl")) cmdJson.getString("iconUrl") else null,
                iconOverrides = overrides,
                routes = listOf(Route(devices = RouteDevices.Wildcard, defaultUrl = "https://x")),
            )
            assertEquals(expected, resolveIconUrl(cmd, device), "case: $name")
        }
    }
}
```

Check the fixture path: the Gradle working directory may be `android/` (so `../shared/...` is right) or `android/app/` (so `../../shared/...`). Run the test once to see which it is and adjust.

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*IconResolver*"`
Expected: FAIL — `resolveIconUrl` unresolved reference.

**Step 2: Write the resolver**

```kotlin
package sh.kavi.fasttravel.core

fun resolveIconUrl(cmd: Command, device: DeviceType): String? =
    cmd.iconOverrides.firstOrNull { device in it.devices }?.iconUrl ?: cmd.iconUrl
```

**Step 3: Run — should pass all fixture cases**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "*IconResolver*"`
Expected: all 7 cases pass.

**Step 4: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/core/IconResolver.kt android/app/src/test/kotlin/sh/kavi/fasttravel/core/IconResolverTest.kt
git commit -m "feat(android): add resolveIconUrl with shared-fixture parity test"
```

---

### Task 13: Swap Android call sites

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchActivity.kt` (lines 738, 777, 880, 942, 1038, 1097)
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchViewModel.kt:306`
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/SuggestionProvider.kt:76,103`
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/ConfigEditorScreens.kt:343-347` (command card preview — keep the editor *input* fields unchanged)

**Step 1: Identify the current device in each context**

For each call site, determine the device variable in scope. Android always runs on `DeviceType.Android` except when simulating from the editor — but existing code already has a `currentDevice` / `deviceType` in these classes. Run:

```
grep -n 'DeviceType\|currentDevice\|device' android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SearchActivity.kt | head -40
```

If there's a central `currentDevice` already (e.g., `val device = DeviceType.Android`), reuse it. If not, use the literal `DeviceType.Android` — this is an Android app; that's always correct.

**Step 2: Replace each site**

Example (`SearchActivity.kt:738`):

Before:
```kotlin
iconUrl = command.iconUrl,
```

After:
```kotlin
iconUrl = resolveIconUrl(command, DeviceType.Android),
```

Add the import at the top of each file:
```kotlin
import sh.kavi.fasttravel.core.resolveIconUrl
```

**Leave these untouched** (they're editor inputs binding to the default):
- `ConfigEditorScreens.kt:464,584,585,590,592,730` — these bind `iconUrl` to the text field and use it as a preview directly below the field. It represents the *default* icon being edited, not a resolved display.
- `ConfigEditorScreens.kt:446` — drafts the default into the editor state.

For the **command card preview** (`ConfigEditorScreens.kt:343-347`, displayed in the command list *row*), replace `command.iconUrl` with `resolveIconUrl(command, DeviceType.Android)`.

**Step 3: Build + run all tests**

Run: `cd android && ./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL, all tests pass.

**Step 4: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel
git commit -m "feat(android): resolve icons per device at every render site"
```

---

### Task 14: Add Per-device icons editor section in Android

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/ConfigEditorScreens.kt`

**Step 1: Extend `CommandEditorDraft`**

Near `CommandEditorDraft` (line ~106), add:

```kotlin
var iconOverrides: MutableList<IconOverrideDraft> = mutableListOf()
```

And on the reset (line ~117):

```kotlin
iconOverrides = mutableListOf()
```

At module scope:

```kotlin
data class IconOverrideDraft(
    var devices: MutableList<DeviceType> = mutableListOf(),
    var iconUrl: String = "",
)
```

**Step 2: Load existing overrides into the draft**

Near line ~446 (where other fields are drafted from `c`):

```kotlin
CommandEditorDraft.iconOverrides = c.iconOverrides
    .map { IconOverrideDraft(devices = it.devices.toMutableList(), iconUrl = it.iconUrl) }
    .toMutableList()
```

**Step 3: Render the editor section**

Below the existing iconUrl `OutlinedTextField` block (line ~583-594), add a new Composable section:

```kotlin
var iconOverrides by remember {
    mutableStateOf(CommandEditorDraft.iconOverrides.toList())
}

Spacer(Modifier.height(16.dp))
Text("Per-device icons (optional)", style = MaterialTheme.typography.labelLarge)
Text(
    "Override the icon for specific devices. Each device can appear in at most one row.",
    style = MaterialTheme.typography.bodySmall,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
)

iconOverrides.forEachIndexed { idx, ov ->
    val usedElsewhere = iconOverrides
        .filterIndexed { i, _ -> i != idx }
        .flatMap { it.devices }
        .toSet()

    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(Modifier.padding(12.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                DeviceType.entries.forEach { d ->
                    val selected = d in ov.devices
                    val disabled = !selected && d in usedElsewhere
                    FilterChip(
                        selected = selected,
                        enabled = !disabled,
                        onClick = {
                            val newOv = ov.copy(
                                devices = if (selected) ov.devices - d else ov.devices + d
                            )
                            iconOverrides = iconOverrides.toMutableList().also { it[idx] = newOv }
                            CommandEditorDraft.iconOverrides = iconOverrides
                                .map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
                                .toMutableList()
                        },
                        label = { Text(d.name) },
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = ov.iconUrl,
                    onValueChange = { v ->
                        val newOv = ov.copy(iconUrl = v)
                        iconOverrides = iconOverrides.toMutableList().also { it[idx] = newOv }
                        CommandEditorDraft.iconOverrides = iconOverrides
                            .map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
                            .toMutableList()
                    },
                    label = { Text("Icon URL") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                if (ov.iconUrl.isNotBlank()) {
                    AsyncImage(
                        model = ov.iconUrl,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                    )
                }
                Spacer(Modifier.width(4.dp))
                IconButton(onClick = {
                    iconOverrides = iconOverrides.filterIndexed { i, _ -> i != idx }
                    CommandEditorDraft.iconOverrides = iconOverrides
                        .map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
                        .toMutableList()
                }) {
                    Icon(Icons.Default.Delete, contentDescription = "Remove override")
                }
            }
        }
    }
}

OutlinedButton(
    onClick = {
        iconOverrides = iconOverrides + IconOverrideDraft()
        CommandEditorDraft.iconOverrides = iconOverrides
            .map { IconOverrideDraft(it.devices.toMutableList(), it.iconUrl) }
            .toMutableList()
    },
    modifier = Modifier.padding(top = 4.dp),
) {
    Icon(Icons.Default.Add, contentDescription = null)
    Spacer(Modifier.width(4.dp))
    Text("Add per-device icon")
}
```

Adjust imports as needed (`FlowRow`, `FilterChip`, `AsyncImage`, `Icons.Default.Delete`, `Icons.Default.Add`, etc.). Check what's already imported in the file before adding.

**Step 4: Wire the draft into the save path**

At the save site (around line ~730 where the Command is constructed), add:

```kotlin
iconOverrides = CommandEditorDraft.iconOverrides
    .filter { it.devices.isNotEmpty() && it.iconUrl.isNotBlank() }
    .map { IconOverride(devices = it.devices.toList(), iconUrl = it.iconUrl.trim()) },
```

**Step 5: Build**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL.

**Step 6: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/ui/ConfigEditorScreens.kt
git commit -m "feat(android): add per-device icon overrides editor UI"
```

---

## Phase 4 — Default config

### Task 15: Update the `app-stores` command

**Files:**
- Modify: `shared/config/default-config.json:334-386`
- Modify: `android/app/src/main/assets/default-config.json` (find the same `app-stores` block)

**Step 1: Add `iconOverrides` to both copies**

Inside the `app-stores` command (after the existing `iconUrl` line in both files), add:

```json
"iconOverrides": [
  {
    "devices": ["iOS"],
    "iconUrl": "https://www.google.com/s2/favicons?domain=apps.apple.com&sz=128"
  },
  {
    "devices": ["Windows", "MacOS", "Linux", "Unknown"],
    "iconUrl": "https://www.google.com/s2/favicons?domain=store.steampowered.com&sz=128"
  }
],
```

Keep the existing `iconUrl` (Play Store) as the default for Android.

**Step 2: Verify both files match**

Run: `diff <(jq '.groups[].commands[]?, .groups[].groups[]?.commands[]?' shared/config/default-config.json) <(jq '.groups[].commands[]?, .groups[].groups[]?.commands[]?' android/app/src/main/assets/default-config.json)`
Expected: no output (identical content).

**Step 3: Validate**

Run: `node tools/validate-config.mjs`
Expected: `OK shared/config/default-config.json`

Run: `node tools/validate-config.mjs android/app/src/main/assets/default-config.json`
Expected: `OK ...`

**Step 4: Commit**

```bash
git add shared/config/default-config.json android/app/src/main/assets/default-config.json
git commit -m "config: add per-device icon overrides to app-stores command"
```

---

## Phase 5 — Verification

### Task 16: Playwright end-to-end — extension

**Files:**
- Modify or Create: check `test-extension.mjs` in project root (already exists) or `extension/tests/e2e/` for existing Playwright scripts.

**Step 1: Read the existing Playwright entry point**

Run: `cat test-extension.mjs` to see how the extension is launched.

**Step 2: Add a smoke scenario**

Extend (or create a sibling of) the existing script to:
1. Launch Chromium with the extension loaded.
2. Open the new-tab page.
3. Locate the `apps` command pill.
4. Assert its `<img>` / favicon element's src contains `store.steampowered.com` (Linux is the current device).
5. Take a screenshot to `docs/screenshots/2026-04-15-extension-apps-steam-icon.png`.
6. Open the options page at `chrome-extension://<id>/options.html`.
7. Click the `apps` command to enter the editor.
8. Assert the override rows render, with an "iOS" override and a "Windows/MacOS/Linux/Unknown" override.
9. Take a screenshot to `docs/screenshots/2026-04-15-extension-overrides-editor.png`.

**Step 3: Run**

Run: `node test-extension.mjs` (or whatever script name applies)
Expected: exits 0, screenshots written.

**Step 4: Manually review the screenshots**

Check both screenshots display correctly — Steam icon in the pill, override rows legible and showing the expected devices/URLs.

**Step 5: Commit**

```bash
git add test-extension.mjs docs/screenshots/2026-04-15-extension-*.png
git commit -m "test(ext): e2e coverage + screenshots for per-device icon overrides"
```

---

### Task 17: Android AVD verification

**Files:**
- New screenshots under `docs/screenshots/`

**Note:** The user's 14 GB machine can't run an emulator + Claude Code simultaneously (memory constraint). If the AVD isn't already running, *ask the user* to start one and confirm — do not try to launch one. Alternative: run on a physical device via USB.

**Step 1: Confirm AVD / device is reachable**

Run: `adb devices`
Expected: at least one `device` line.

**Step 2: Install the debug build**

Run: `cd android && ./gradlew :app:installDebug`
Expected: `Installed on 1 device`.

**Step 3: Launch and capture the home screen**

Run: `adb shell am start -n sh.kavi.fasttravel/.ui.SearchActivity`

Type `apps` in the search field (via `adb shell input text apps`). The `apps` suggestion should appear with the **Play Store** favicon (device is Android → command default applies).

Capture: `adb exec-out screencap -p > docs/screenshots/2026-04-15-android-apps-play-icon.png`

**Step 4: Open command editor**

Navigate in-app to Settings → Commands → `apps`.

Scroll to the "Per-device icons" section. Assert two override rows are visible: one for iOS showing the Apple favicon preview, one for Windows/MacOS/Linux/Unknown showing the Steam favicon preview.

Capture: `adb exec-out screencap -p > docs/screenshots/2026-04-15-android-overrides-editor.png`

**Step 5: Tap "Add per-device icon" and verify disabled chips**

Tap the add button to insert an empty third row. Confirm that the chips for iOS, Windows, MacOS, Linux, Unknown are rendered grey / disabled (already used elsewhere), while Android is enabled.

Capture: `docs/screenshots/2026-04-15-android-overrides-disabled-chips.png`

**Step 6: Commit**

```bash
git add docs/screenshots/2026-04-15-android-*.png
git commit -m "test(android): screenshots verifying per-device icon overrides"
```

---

### Task 18: Final sweep — linters, full test suite, visual diff

**Step 1: Run every check**

Run in parallel:
- `node tools/validate-config.mjs`
- `node tools/validate-config.mjs android/app/src/main/assets/default-config.json`
- `npm run build` (extension)
- `npx vitest run` (extension tests)
- `cd android && ./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug`

**Step 2: Visual diff the screenshots against expectation**

Review every screenshot taken in tasks 16-17. Confirm:
- Extension pill on Linux: Steam favicon (not Play Store)
- Extension editor: both override rows render cleanly, disabled-chip affordance visible
- Android suggestion: Play Store icon
- Android editor: both override rows render, delete/add buttons work
- Android empty row: correct chips disabled

**Step 3: If anything is off, iterate**

Fix, rebuild, re-capture, re-commit. Do not claim complete until every screenshot matches expectation.

**Step 4: Final commit (if any loose ends)**

```bash
git commit -m "polish: final adjustments from visual verification"
```

---

## Done criteria

- Every test suite passes (TS + Kotlin + validator).
- The 7 shared fixture cases pass in both resolvers.
- Validator rejects duplicate device across overrides (both TS and Kotlin).
- `app-stores` shows the correct icon per platform in both clients, verified by screenshot.
- Command editor on both clients allows adding/removing overrides and disables already-used devices in new rows.
- Default config updates committed to both `shared/config/default-config.json` and `android/app/src/main/assets/default-config.json`.
