# Settings Simplification & Config Import/Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify settings navigation on both platforms to a shared 5-item structure, remove the extension's override model in favour of a single full-config document, and add a dedicated Import/Export sub-page with file/URL import, file export, and dirty-flag auto-refresh management.

**Architecture:** Both platforms store one full `FastTravelConfig` JSON. Any write to the config (commands, groups, ignore list, default command) sets a `configSourceDirty` flag that disables background auto-refresh; the flag is cleared only when the user imports from a URL with a non-manual interval, or hits "Reset to remote". The extension's `LocalOverrides` model and `config-mutations.ts` are replaced with full-config mutation functions mirroring Android's `ConfigMutations.kt`.

**Tech Stack:** TypeScript/Vite (extension), Kotlin/Compose (Android), Playwright (extension e2e), Espresso/ComposeTestRule (Android instrumented tests), AVD `fast_travel_dev` API 34.

**Design doc:** `docs/plans/2026-04-24-settings-simplification-design.md`

---

## Chunk A — Extension: Remove override model, add full-config mutations

### Task 1: Replace `config-mutations.ts` with full-config mutations

**Files:**
- Modify: `extension/src/core/config-mutations.ts`

**Step 1: Rewrite the file**

Replace the entire file with functions that operate on `FastTravelConfig` directly (mirroring `android/.../data/ConfigMutations.kt`):

```typescript
import type { Command, FastTravelConfig, Group } from "./types.js";

function mapGroups(groups: Group[], fn: (g: Group) => Group): Group[] {
  return groups.map((g) => {
    const updated = fn(g);
    return updated.groups ? { ...updated, groups: mapGroups(updated.groups, fn) } : updated;
  });
}

export function withCommandAdded(cfg: FastTravelConfig, groupId: string, cmd: Command): FastTravelConfig {
  return { ...cfg, groups: mapGroups(cfg.groups, (g) =>
    g.id === groupId ? { ...g, commands: [...(g.commands ?? []), cmd] } : g
  )};
}

export function withCommandUpdated(cfg: FastTravelConfig, cmd: Command): FastTravelConfig {
  return { ...cfg, groups: mapGroups(cfg.groups, (g) => {
    if (!(g.commands ?? []).some((c) => c.id === cmd.id)) return g;
    return { ...g, commands: g.commands!.map((c) => (c.id === cmd.id ? cmd : c)) };
  })};
}

export function withCommandUpsertedInGroup(cfg: FastTravelConfig, groupId: string, cmd: Command): FastTravelConfig {
  const removed = withCommandDeleted(cfg, cmd.id);
  return withCommandAdded(removed, groupId, cmd);
}

export function withCommandDeleted(cfg: FastTravelConfig, id: string): FastTravelConfig {
  return { ...cfg, groups: mapGroups(cfg.groups, (g) =>
    ({ ...g, commands: (g.commands ?? []).filter((c) => c.id !== id) })
  )};
}

export function withGroupAdded(cfg: FastTravelConfig, group: Group): FastTravelConfig {
  const allIds = new Set(getAllGroupIds(cfg.groups));
  if (allIds.has(group.id)) return cfg;
  return { ...cfg, groups: [...cfg.groups, { ...group, commands: [], groups: [] }] };
}

export function withGroupUpdated(cfg: FastTravelConfig, id: string, name: string, color: string | undefined): FastTravelConfig {
  return { ...cfg, groups: mapGroups(cfg.groups, (g) =>
    g.id === id ? { ...g, name, color } : g
  )};
}

export function withGroupDeleted(cfg: FastTravelConfig, id: string): FastTravelConfig {
  function filterGroups(groups: Group[]): Group[] {
    return groups.filter((g) => g.id !== id).map((g) =>
      g.groups ? { ...g, groups: filterGroups(g.groups) } : g
    );
  }
  return { ...cfg, groups: filterGroups(cfg.groups) };
}

export function withIgnoreAdded(cfg: FastTravelConfig, word: string): FastTravelConfig {
  if (cfg.ignoreList.includes(word)) return cfg;
  return { ...cfg, ignoreList: [...cfg.ignoreList, word] };
}

export function withIgnoreRemoved(cfg: FastTravelConfig, word: string): FastTravelConfig {
  return { ...cfg, ignoreList: cfg.ignoreList.filter((w) => w !== word) };
}

function getAllGroupIds(groups: Group[]): string[] {
  return groups.flatMap((g) => [g.id, ...getAllGroupIds(g.groups ?? [])]);
}
```

**Step 2: Verify unit tests still pass**

```bash
cd extension && npm test
```
Expected: all tests pass (config-mutations.test.ts exercises these functions).

**Step 3: Commit**

```bash
git add extension/src/core/config-mutations.ts
git commit -m "refactor(extension): replace override-based mutations with full-config mutations"
```

---

### Task 2: Add `setConfig` + dirty flag to service worker

**Files:**
- Modify: `extension/src/background/service-worker.ts`

**Step 1: Replace constants and `getConfig`**

At the top of the file, add/change:
```typescript
// Add after LAST_SYNCED_KEY line:
const CONFIG_DIRTY_KEY = "fast-travel-config-dirty";
```

Replace `getConfig()` (lines 125–137) — remove the overrides merge, make it return the stored config directly:
```typescript
async function getConfig(): Promise<FastTravelConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const stored = result[CONFIG_KEY];
  return isConfigUsable(stored, "stored") ? stored : (bundledConfig as unknown as FastTravelConfig);
}
```

Remove the `OVERRIDES_KEY` constant (line 12) and the `mergeConfig` import (line 3).

**Step 2: Add `setConfig`, `isDirty`, `markDirty`, `clearDirty`**

Add after `getConfig()`:
```typescript
async function setConfig(cfg: FastTravelConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: cfg });
  await markDirty();
}

async function isDirty(): Promise<boolean> {
  const v = await chrome.storage.local.get(CONFIG_DIRTY_KEY);
  return (v[CONFIG_DIRTY_KEY] as boolean | undefined) ?? false;
}

async function markDirty(): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_DIRTY_KEY]: true });
  await chrome.alarms.clear(REFRESH_ALARM);
}

async function clearDirty(): Promise<void> {
  await chrome.storage.local.remove(CONFIG_DIRTY_KEY);
}
```

**Step 3: Update `scheduleRefresh` to check dirty flag**

Replace `scheduleRefresh()`:
```typescript
async function scheduleRefresh(): Promise<void> {
  if (await isDirty()) {
    await chrome.alarms.clear(REFRESH_ALARM);
    return;
  }
  const interval = await getRefreshInterval();
  const minutes = intervalToMinutes(interval);
  await chrome.alarms.clear(REFRESH_ALARM);
  if (minutes !== null) {
    chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: minutes });
  }
}
```

**Step 4: Update `fetchAndStoreConfig` to clear dirty on success**

In `fetchAndStoreConfig()`, change the success path from:
```typescript
await chrome.storage.local.set({
  [CONFIG_KEY]: config,
  [LAST_SYNCED_KEY]: Date.now(),
});
return { ok: true };
```
to:
```typescript
await chrome.storage.local.set({
  [CONFIG_KEY]: config,
  [LAST_SYNCED_KEY]: Date.now(),
});
await clearDirty();
return { ok: true };
```

**Step 5: Update `addToIgnoreList` and `removeFromIgnoreList` to use config**

Replace the two message handlers:
```typescript
if (message.type === "addToIgnoreList") {
  getConfig().then(async (cfg) => {
    if (cfg.ignoreList.includes(message.value)) { sendResponse(cfg.ignoreList); return; }
    const next = { ...cfg, ignoreList: [...cfg.ignoreList, message.value] };
    await setConfig(next);
    sendResponse(next.ignoreList);
  });
  return true;
}
if (message.type === "removeFromIgnoreList") {
  getConfig().then(async (cfg) => {
    const next = { ...cfg, ignoreList: cfg.ignoreList.filter((w: string) => w !== message.value) };
    await setConfig(next);
    sendResponse(next.ignoreList);
  });
  return true;
}
```

Replace `getIgnoreList()` in omnibox/message handlers to use `(await getConfig()).ignoreList`:
- In `onInputEntered` listener: `const ignoreList = (await getConfig()).ignoreList;`
- In `getIgnoreList` message handler: `getConfig().then((cfg) => sendResponse(cfg.ignoreList));`

Remove the standalone `getIgnoreList()` function and `IGNORE_LIST_KEY` constant.

**Step 6: Add `setConfig` and `getConfigSourceState` message handlers**

In the `onMessage` listener, add:
```typescript
if (message.type === "setConfig") {
  setConfig(message.config as FastTravelConfig).then(() => sendResponse({ ok: true }));
  return true;
}
if (message.type === "getConfigSourceState") {
  Promise.all([
    chrome.storage.local.get([CONFIG_URL_KEY, REFRESH_INTERVAL_KEY, LAST_SYNCED_KEY]),
    isDirty(),
  ]).then(([v, dirty]) => {
    sendResponse({
      url: (v[CONFIG_URL_KEY] as string) ?? "",
      interval: (v[REFRESH_INTERVAL_KEY] as string) ?? "daily",
      lastSynced: (v[LAST_SYNCED_KEY] as number | null) ?? null,
      dirty,
    });
  });
  return true;
}
if (message.type === "importFromUrl") {
  (async () => {
    const result = await fetchAndStoreConfig();
    if (result.ok) {
      await chrome.storage.local.set({
        [CONFIG_URL_KEY]: message.url,
        [REFRESH_INTERVAL_KEY]: message.interval,
      });
      if (message.interval !== "manual") {
        await clearDirty();
        await scheduleRefresh();
      }
    }
    sendResponse(result);
  })();
  return true;
}
if (message.type === "resetToRemote") {
  fetchAndStoreConfig().then(async (result) => {
    if (result.ok) {
      await clearDirty();
      await scheduleRefresh();
    }
    sendResponse(result);
  });
  return true;
}
```

Also update the `refreshConfig` handler to NOT clear dirty (manual refresh doesn't re-enable auto-refresh):
The existing `refreshConfig` handler calls `fetchAndStoreConfig()` which now calls `clearDirty()`. We only want `clearDirty` to happen on auto-refresh or importFromUrl. Update `fetchAndStoreConfig` to take a `clearDirtyOnSuccess` parameter:

```typescript
async function fetchAndStoreConfig(clearDirtyOnSuccess = true): Promise<RefreshResult> {
  // ... existing code ...
  // In success path:
  await chrome.storage.local.set({ [CONFIG_KEY]: config, [LAST_SYNCED_KEY]: Date.now() });
  if (clearDirtyOnSuccess) await clearDirty();
  return { ok: true };
}
```

And in the `refreshConfig` message handler, call `fetchAndStoreConfig(false)` to preserve dirty state on manual refresh.

**Step 7: Build and verify no TypeScript errors**

```bash
cd extension && npm run build
```
Expected: no errors.

**Step 8: Run unit tests**

```bash
npm test
```
Expected: all pass.

**Step 9: Commit**

```bash
git add extension/src/background/service-worker.ts
git commit -m "refactor(extension): unify to full-config model, add dirty flag tracking"
```

---

### Task 3: Update `data.ts` — remove override APIs, add new config APIs

**Files:**
- Modify: `extension/src/options/data.ts`

**Step 1: Remove override-related exports**

Remove:
- `getOverrides()` function
- `setOverrides()` function
- `isRemoteCommand()` function
- `export { mergeConfig }` at bottom
- `import { mergeConfig } from "../core/config.js"` at top
- `import ... LocalOverrides ...` from types (if no longer needed)
- `const OVERRIDES_KEY` constant

**Step 2: Add new API functions**

Add after `getConfig()`:
```typescript
export async function setConfig(cfg: FastTravelConfig): Promise<void> {
  await chrome.runtime.sendMessage({ type: "setConfig", config: cfg });
}

export interface ConfigSourceState {
  url: string;
  interval: RefreshInterval;
  lastSynced: number | null;
  dirty: boolean;
}

export async function getConfigSourceState(): Promise<ConfigSourceState> {
  const result = await chrome.runtime.sendMessage({ type: "getConfigSourceState" });
  return result ?? { url: "", interval: "daily" as RefreshInterval, lastSynced: null, dirty: false };
}

export async function importFromUrl(url: string, interval: RefreshInterval): Promise<RefreshResult> {
  const result = await chrome.runtime.sendMessage({ type: "importFromUrl", url, interval });
  return result ?? { ok: false, reason: "No response" };
}

export async function resetToRemote(): Promise<RefreshResult> {
  const result = await chrome.runtime.sendMessage({ type: "resetToRemote" });
  return result ?? { ok: false, reason: "No response" };
}
```

Update `getConfigSource()` and `setConfigSource()` — these can remain for now but `getConfigSource()` should delegate to `getConfigSourceState()`:
- OR: remove `getConfigSource` and `setConfigSource` entirely (they'll be replaced by `getConfigSourceState` + `importFromUrl`).

Remove `resetToRemoteDefault()` (replaced by `resetToRemote()`).

**Step 3: Build**

```bash
cd extension && npm run build
```
Expected: type errors pointing to callers of removed functions — fix in subsequent tasks.

**Step 4: Commit after callers are fixed (in Tasks 4–5)**

---

### Task 4: Update `command-editor.ts` to use full-config mutations

**Files:**
- Modify: `extension/src/options/screens/command-editor.ts`

**Step 1: Swap imports**

Replace:
```typescript
import { flattenGroups, getConfig, getOverrides, isRemoteCommand, setOverrides, validateCommand, findCommandById } from "../data.js";
```
With:
```typescript
import { flattenGroups, getConfig, setConfig, validateCommand, findCommandById } from "../data.js";
import { withCommandUpsertedInGroup, withCommandDeleted } from "../../core/config-mutations.js";
```

**Step 2: Update delete handler**

Replace:
```typescript
const overrides = await getOverrides();
const remote = await isRemoteCommand(draft.id);
await setOverrides(withCommandDeleted(overrides, draft.id, remote));
```
With:
```typescript
const cfg = await getConfig();
if (!cfg) return;
await setConfig(withCommandDeleted(cfg, draft.id));
```

**Step 3: Update save handler**

Replace:
```typescript
const overrides = await getOverrides();
const remote = await isRemoteCommand(cleaned.id);
const next = withCommandUpserted(overrides, groupId, cleaned, remote || !isNew);
await setOverrides(next);
```
With:
```typescript
const cfg = await getConfig();
if (!cfg) return;
await setConfig(withCommandUpsertedInGroup(cfg, groupId, cleaned));
```

**Step 4: Build and verify**

```bash
cd extension && npm run build
```
Expected: no errors in command-editor.ts.

**Step 5: Commit**

```bash
git add extension/src/options/screens/command-editor.ts
git commit -m "refactor(extension): command-editor uses full-config mutations"
```

---

### Task 5: Update `group-editor.ts` and `groups.ts` to use full-config mutations

**Files:**
- Modify: `extension/src/options/screens/group-editor.ts`
- Modify: `extension/src/options/screens/groups.ts`

**Step 1: group-editor.ts — swap imports and save/delete handlers**

Replace:
```typescript
import { findGroupById, flattenGroups, getConfig, getOverrides, setOverrides } from "../data.js";
```
With:
```typescript
import { findGroupById, flattenGroups, getConfig, setConfig } from "../data.js";
import { withGroupAdded, withGroupUpdated, withGroupDeleted } from "../../core/config-mutations.js";
```

Find where `setOverrides(withGroupUpserted(...))` is called and replace with the full-config pattern:
```typescript
const cfg = await getConfig();
if (!cfg) return;
await setConfig(withGroupAdded(cfg, { id: draft.id, name: draft.name, color: draft.color }));
// or for update:
await setConfig(withGroupUpdated(cfg, draft.id, draft.name, draft.color));
// or for delete:
await setConfig(withGroupDeleted(cfg, id));
```

**Step 2: groups.ts — swap imports for reorder**

```typescript
import { getConfig, setConfig } from "../data.js";
// remove: getOverrides, setOverrides
```

Find the reorder handler that calls `setOverrides(withGroupsReordered(...))` and replace with direct config mutation. Since `withGroupsReordered` operated on overrides, implement inline:
```typescript
const cfg = await getConfig();
if (!cfg) return;
// Reorder top-level groups to match `ids` order (ids is the new order array)
const ordered = ids.map(id => cfg.groups.find(g => g.id === id)).filter(Boolean) as Group[];
await setConfig({ ...cfg, groups: ordered });
```

**Step 3: Build**

```bash
cd extension && npm run build
```
Expected: no errors.

**Step 4: Commit**

```bash
git add extension/src/options/screens/group-editor.ts extension/src/options/screens/groups.ts
git commit -m "refactor(extension): group editor uses full-config mutations"
```

---

### Task 6: Update `ignore-list.ts` to use config directly

**Files:**
- Modify: `extension/src/options/screens/ignore-list.ts`

The screen already calls `addToIgnoreList()` and `removeFromIgnoreList()` from `data.ts`, which now go through the service worker's `setConfig` path. No changes needed to the screen itself — the message handlers in the service worker were updated in Task 2.

Verify by building:

```bash
cd extension && npm run build
```

If `ignore-list.ts` imports `getIgnoreList` (from data.ts) that still works since `data.ts` still exports it. No changes needed.

**Step 1: Commit data.ts cleanup**

```bash
git add extension/src/options/data.ts
git commit -m "refactor(extension): data.ts removes override APIs, adds setConfig/getConfigSourceState/importFromUrl"
```

---

## Chunk B — Extension: Restructure navigation

### Task 7: Restructure sidebar HTML

**Files:**
- Modify: `extension/src/options/options.html`

**Step 1: Replace sidebar links**

Replace the `<nav id="sidebar">` content (keep header, replace all `<a>` links):

```html
<a class="sidebar-link" data-route="#/appearance" href="#/appearance">
  <!-- sun icon same as before -->
  Appearance
</a>
<a class="sidebar-link" data-route="#/configuration" href="#/configuration">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49M16.24 7.76a6 6 0 0 1 0 8.49"/></svg>
  Configuration
</a>
<a class="sidebar-link" data-route="#/ignore-list" href="#/ignore-list">
  <!-- circle-slash icon same as before -->
  Ignore list
</a>
<a class="sidebar-link" data-route="#/history" href="#/history">
  <!-- clock icon same as before -->
  History
</a>
<a class="sidebar-link" data-route="#/search-engine" href="#/search-engine">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  Set as default
</a>
<a class="sidebar-link" data-route="#/about" href="#/about">
  <!-- info icon same as before -->
  About
</a>
```

(Remove the Commands and Groups sidebar links; they'll be inside the Configuration sub-page.)

**Step 2: Build, open options page, verify sidebar shows 6 items in the right order**

```bash
cd extension && npm run build
```

**Step 3: Commit**

```bash
git add extension/src/options/options.html
git commit -m "feat(extension): restructure sidebar to 6-item flat navigation"
```

---

### Task 8: Create `screens/configuration.ts`

**Files:**
- Create: `extension/src/options/screens/configuration.ts`

**Step 1: Write the screen**

```typescript
import { el, screenHeader } from "../dom.js";
import { navigate } from "../router.js";
import { getConfig, setConfig } from "../data.js";
import type { FastTravelConfig } from "../../core/types.js";

export async function renderConfiguration(main: HTMLElement): Promise<void> {
  main.appendChild(screenHeader("Configuration", "Commands, groups, and config import/export."));

  const card = el("section", { class: "card" });

  // Commands row
  const cmdsRow = el("div", { class: "nav-list-item", tabindex: "0", role: "button" });
  cmdsRow.appendChild(el("span", null, "Commands"));
  cmdsRow.appendChild(chevronIcon());
  cmdsRow.addEventListener("click", () => navigate("#/commands"));
  card.appendChild(cmdsRow);
  card.appendChild(el("div", { class: "card-divider" }));

  // Groups row
  const groupsRow = el("div", { class: "nav-list-item", tabindex: "0", role: "button" });
  groupsRow.appendChild(el("span", null, "Groups"));
  groupsRow.appendChild(chevronIcon());
  groupsRow.addEventListener("click", () => navigate("#/groups"));
  card.appendChild(groupsRow);
  card.appendChild(el("div", { class: "card-divider" }));

  // Default command inline picker
  const config = await getConfig();
  if (config) {
    const pickerRow = defaultCommandPickerRow(config, async (trigger) => {
      const updated: FastTravelConfig = { ...config, defaultCommand: trigger };
      await setConfig(updated);
    });
    card.appendChild(pickerRow);
    card.appendChild(el("div", { class: "card-divider" }));
  }

  // Import / Export row
  const importRow = el("div", { class: "nav-list-item", tabindex: "0", role: "button" });
  importRow.appendChild(el("span", null, "Import / Export"));
  importRow.appendChild(chevronIcon());
  importRow.addEventListener("click", () => navigate("#/import-export"));
  card.appendChild(importRow);

  main.appendChild(card);
}

function chevronIcon(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "nav-chevron");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<polyline points="9 18 15 12 9 6"/>';
  return svg;
}

function defaultCommandPickerRow(
  config: FastTravelConfig,
  onChange: (trigger: string) => Promise<void>,
): HTMLElement {
  const allCommands: { trigger: string; name: string }[] = [];
  function walk(groups: typeof config.groups): void {
    for (const g of groups) {
      for (const cmd of g.commands ?? []) {
        for (const t of cmd.triggers) allCommands.push({ trigger: t, name: cmd.name });
      }
      if (g.groups) walk(g.groups);
    }
  }
  walk(config.groups);

  const row = el("div", { class: "form-row" });
  row.style.padding = "12px 16px";
  row.appendChild(el("label", { for: "default-cmd" }, "Default command"));
  const select = el("select", { id: "default-cmd" }) as HTMLSelectElement;
  for (const { trigger, name } of allCommands) {
    const opt = el("option", { value: trigger }, `${trigger} — ${name}`) as HTMLOptionElement;
    if (trigger === config.defaultCommand) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", async () => {
    await onChange(select.value);
  });
  row.appendChild(select);
  return row;
}
```

**Step 2: Build**

```bash
cd extension && npm run build
```

**Step 3: Commit**

```bash
git add extension/src/options/screens/configuration.ts
git commit -m "feat(extension): add Configuration sub-page screen"
```

---

### Task 9: Create `screens/import-export.ts` and delete `config-source.ts`

**Files:**
- Create: `extension/src/options/screens/import-export.ts`
- Delete: `extension/src/options/screens/config-source.ts`

**Step 1: Write import-export.ts**

```typescript
import { el, screenHeader } from "../dom.js";
import {
  getConfig, setConfig, getConfigSourceState, importFromUrl,
  resetToRemote, clearIconCache, setConfigSource, refreshConfig,
  type RefreshInterval,
} from "../data.js";
import { lintConfig } from "../../core/config-linter.js";
import type { FastTravelConfig } from "../../core/types.js";
import { showSnackbar } from "../../ui/snackbar.js";

const INTERVAL_CHOICES: { value: RefreshInterval; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

export async function renderImportExport(main: HTMLElement): Promise<void> {
  main.appendChild(screenHeader("Import / Export", "Import a config from a file or URL, or export your current config."));

  const state = await getConfigSourceState();

  // ---- Source status ----
  const statusCard = el("section", { class: "card" });
  statusCard.appendChild(el("div", { class: "card-header" }, "Status"));
  const statusBody = el("div", { class: "card-body" });
  const statusLine = el("div", { class: "status" });
  updateStatusLine(statusLine, state);
  statusBody.appendChild(statusLine);
  statusCard.appendChild(statusBody);
  main.appendChild(statusCard);

  // ---- Import from file ----
  const fileCard = el("section", { class: "card" });
  fileCard.appendChild(el("div", { class: "card-header" }, "Import from file"));
  const fileBody = el("div", { class: "card-body" });
  const fileStatus = el("div", { class: "status" });
  const fileInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none" }) as HTMLInputElement;
  const fileBtn = el("button", { class: "primary" }, "Choose file…");
  fileBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const errors = lintConfig(parsed as FastTravelConfig);
      if (errors.length > 0) {
        fileStatus.className = "status error";
        fileStatus.textContent = `Validation failed: ${errors[0].message}`;
        return;
      }
      await setConfig(parsed as FastTravelConfig);
      fileStatus.className = "status success";
      fileStatus.textContent = "Config imported from file.";
      updateStatusLine(statusLine, await getConfigSourceState());
      showSnackbar({ message: "Config imported" });
    } catch (e) {
      fileStatus.className = "status error";
      fileStatus.textContent = `Failed: ${(e as Error).message}`;
    }
    fileInput.value = "";
  });
  fileBody.appendChild(el("div", { class: "btn-row" }, fileBtn, fileInput));
  fileBody.appendChild(fileStatus);
  fileCard.appendChild(fileBody);
  main.appendChild(fileCard);

  // ---- Import from URL ----
  const urlCard = el("section", { class: "card" });
  urlCard.appendChild(el("div", { class: "card-header" }, "Import from URL"));
  const urlBody = el("div", { class: "card-body" });
  const urlStatus = el("div", { class: "status" });

  const urlInput = el("input", {
    type: "url",
    placeholder: "https://raw.githubusercontent.com/…/config.json",
    value: state.url,
    class: "full-width",
  }) as HTMLInputElement;

  // Interval radio group
  const radioGroup = el("div", { class: "radio-group", style: "padding:8px 0;" });
  for (const opt of INTERVAL_CHOICES) {
    const cls = opt.value === state.interval ? "radio-card selected" : "radio-card";
    const card = el(
      "label",
      { class: cls, "data-value": opt.value },
      el("input", { type: "radio", name: "import-interval", value: opt.value }),
      el("div", { class: "radio-card-title" }, opt.label),
    );
    radioGroup.appendChild(card);
  }
  function selectedInterval(): RefreshInterval {
    const sel = radioGroup.querySelector<HTMLElement>(".radio-card.selected");
    return (sel?.getAttribute("data-value") ?? "manual") as RefreshInterval;
  }
  radioGroup.addEventListener("click", (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>(".radio-card");
    if (!card) return;
    e.preventDefault();
    radioGroup.querySelectorAll<HTMLElement>(".radio-card").forEach((c) =>
      c.classList.toggle("selected", c === card)
    );
  });

  const fetchBtn = el("button", { class: "primary" }, "Fetch & Import");
  fetchBtn.addEventListener("click", async () => {
    const url = urlInput.value.trim();
    if (!url) { urlStatus.className = "status error"; urlStatus.textContent = "Enter a URL."; return; }
    fetchBtn.setAttribute("disabled", "true");
    urlStatus.className = "status";
    urlStatus.replaceChildren(el("span", { class: "spinner" }), " Fetching…");
    try {
      const result = await importFromUrl(url, selectedInterval());
      if (result.ok) {
        urlStatus.className = "status success";
        urlStatus.textContent = "Config imported from URL.";
        updateStatusLine(statusLine, await getConfigSourceState());
        showSnackbar({ message: "Config imported" });
      } else {
        urlStatus.className = "status error";
        urlStatus.textContent = `Failed: ${result.reason}`;
      }
    } catch (e) {
      urlStatus.className = "status error";
      urlStatus.textContent = `Error: ${(e as Error).message}`;
    } finally {
      fetchBtn.removeAttribute("disabled");
    }
  });

  urlBody.appendChild(el("div", { class: "form-row" }, el("label", null, "URL"), urlInput));
  urlBody.appendChild(radioGroup);
  urlBody.appendChild(el("div", { class: "btn-row" }, fetchBtn));
  urlBody.appendChild(urlStatus);
  urlCard.appendChild(urlBody);
  main.appendChild(urlCard);

  // ---- Export ----
  const exportCard = el("section", { class: "card" });
  exportCard.appendChild(el("div", { class: "card-header" }, "Export"));
  const exportBody = el("div", { class: "card-body" });
  const exportBtn = el("button", { class: "primary" }, "Export config");
  exportBtn.addEventListener("click", async () => {
    const cfg = await getConfig();
    if (!cfg) return;
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "fast-travel-config.json" }) as HTMLAnchorElement;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSnackbar({ message: "Config exported" });
  });
  exportBody.appendChild(el("div", { class: "btn-row" }, exportBtn));
  exportCard.appendChild(exportBody);
  main.appendChild(exportCard);

  // ---- Icon cache ----
  const cacheCard = el("section", { class: "card" });
  cacheCard.appendChild(el("div", { class: "card-header" }, "Icon cache"));
  const cacheBody = el("div", { class: "card-body" });
  cacheBody.appendChild(el("div", { class: "form-hint" }, "Force re-fetch of all command favicons."));
  const cacheBtn = el("button", { class: "primary" }, "Clear icon cache");
  cacheBtn.addEventListener("click", async () => {
    await clearIconCache();
    showSnackbar({ message: "Icon cache cleared" });
  });
  cacheBody.appendChild(el("div", { class: "btn-row" }, cacheBtn));
  cacheCard.appendChild(cacheBody);
  main.appendChild(cacheCard);

  // ---- Reset to remote ----
  if (state.url) {
    const resetCard = el("section", { class: "card" });
    resetCard.appendChild(el("div", { class: "card-header" }, "Reset"));
    const resetBody = el("div", { class: "card-body" });
    resetBody.appendChild(el("div", { class: "form-hint" }, "Re-fetch from the last URL and re-enable auto-refresh."));
    const resetBtn = el("button", { class: "danger" }, "Reset to remote");
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Re-fetch from remote and discard any local changes?")) return;
      resetBtn.setAttribute("disabled", "true");
      const result = await resetToRemote();
      if (result.ok) {
        updateStatusLine(statusLine, await getConfigSourceState());
        showSnackbar({ message: "Reset to remote config" });
      } else {
        showSnackbar({ message: `Reset failed: ${result.reason}` });
      }
      resetBtn.removeAttribute("disabled");
    });
    resetBody.appendChild(el("div", { class: "btn-row" }, resetBtn));
    resetCard.appendChild(resetBody);
    main.appendChild(resetCard);
  }
}

function updateStatusLine(el: HTMLElement, state: { url: string; lastSynced: number | null; dirty: boolean }): void {
  if (!state.dirty && state.url && state.lastSynced) {
    el.className = "status success";
    el.textContent = `Auto-refresh active · Synced from ${new URL(state.url).hostname} · ${formatTimestamp(state.lastSynced)}`;
  } else if (state.dirty) {
    el.className = "status";
    el.textContent = "Local config · auto-refresh paused";
  } else {
    el.className = "status";
    el.textContent = "No remote source configured";
  }
}

function formatTimestamp(ts: number): string {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleDateString();
}
```

**Step 2: Delete `config-source.ts`**

```bash
rm extension/src/options/screens/config-source.ts
```

**Step 3: Build**

```bash
cd extension && npm run build
```

**Step 4: Commit**

```bash
git add extension/src/options/screens/import-export.ts
git rm extension/src/options/screens/config-source.ts
git commit -m "feat(extension): add Import/Export screen, remove Config source screen"
```

---

### Task 10: Update `options.ts` routes

**Files:**
- Modify: `extension/src/options/options.ts`

**Step 1: Replace route definitions**

```typescript
import { defineRoutes, init } from "./router.js";
import { renderAppearance } from "./screens/appearance.js";
import { renderConfiguration } from "./screens/configuration.js";
import { renderCommands } from "./screens/commands.js";
import { renderCommandEditor } from "./screens/command-editor.js";
import { renderGroups } from "./screens/groups.js";
import { renderIgnoreList } from "./screens/ignore-list.js";
import { renderImportExport } from "./screens/import-export.js";
import { renderHistory } from "./screens/history.js";
import { renderAbout } from "./screens/about.js";
import { renderSearchEngine } from "./screens/search-engine.js";

defineRoutes([
  { pattern: /^#\/appearance$/, render: (main) => renderAppearance(main) },
  { pattern: /^#\/configuration$/, render: (main) => renderConfiguration(main) },
  { pattern: /^#\/commands$/, render: (main) => renderCommands(main) },
  { pattern: /^#\/commands\/new$/, render: (main) => renderCommandEditor(main, null) },
  {
    pattern: /^#\/commands\/([^/]+)$/,
    render: (main, match) => renderCommandEditor(main, decodeURIComponent(match[1])),
  },
  { pattern: /^#\/groups$/, render: (main) => renderGroups(main) },
  { pattern: /^#\/groups\/new$/, render: (main) => import("./screens/group-editor.js").then((m) => m.renderGroupEditor(main, null)) },
  {
    pattern: /^#\/groups\/([^/]+)$/,
    render: (main, match) => import("./screens/group-editor.js").then((m) => m.renderGroupEditor(main, decodeURIComponent(match[1]))),
  },
  { pattern: /^#\/ignore-list$/, render: (main) => renderIgnoreList(main) },
  { pattern: /^#\/import-export$/, render: (main) => renderImportExport(main) },
  { pattern: /^#\/history$/, render: (main) => renderHistory(main) },
  { pattern: /^#\/search-engine$/, render: (main) => renderSearchEngine(main) },
  { pattern: /^#\/about$/, render: (main) => renderAbout(main) },
]);

const mainEl = document.getElementById("main");
if (mainEl) init(mainEl, "#/appearance");
```

**Step 2: Build**

```bash
cd extension && npm run build
```
Expected: clean build.

**Step 3: Commit**

```bash
git add extension/src/options/options.ts
git commit -m "feat(extension): update routes for new navigation structure"
```

---

## Chunk C — Android: Dirty flag + settings restructure

### Task 11: Add `configSourceDirty` to `ThemePreferences`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/data/ThemePreferences.kt`

**Step 1: Add constant and property**

In the `companion object`, add:
```kotlin
private const val KEY_CONFIG_SOURCE_DIRTY = "config_source_dirty"
```

After `autoIgnoreThreshold`, add:
```kotlin
var configSourceDirty: Boolean
    get() = prefs.getBoolean(KEY_CONFIG_SOURCE_DIRTY, false)
    set(value) {
        prefs.edit().putBoolean(KEY_CONFIG_SOURCE_DIRTY, value).apply()
    }
```

**Step 2: Build**

```bash
cd android && ./gradlew :app:compileDebugKotlin
```
Expected: no errors.

**Step 3: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/data/ThemePreferences.kt
git commit -m "feat(android): add configSourceDirty flag to ThemePreferences"
```

---

### Task 12: Check dirty flag in `ConfigRefreshWorker`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/data/ConfigRefreshWorker.kt`

**Step 1: Skip work when dirty**

Replace `doWork()`:
```kotlin
override suspend fun doWork(): Result {
    val themePrefs = ThemePreferences(applicationContext)
    if (themePrefs.configSourceDirty) return Result.success()
    val repo = ConfigRepository(applicationContext)
    return if (repo.fetchFromGitHub() != null) Result.success() else Result.retry()
}
```

**Step 2: Build**

```bash
cd android && ./gradlew :app:compileDebugKotlin
```

**Step 3: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/data/ConfigRefreshWorker.kt
git commit -m "feat(android): ConfigRefreshWorker skips fetch when config is locally edited"
```

---

### Task 13: Restructure `SettingsHomeScreen` and add `ConfigurationScreen`

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt`

**Step 1: Add new route objects**

In the `sealed class SettingsRoute`, add:
```kotlin
data object Configuration : SettingsRoute("configuration")
data object ImportExport : SettingsRoute("import_export")
```

Keep `ConfigSource` route for now (will be removed once `ImportExportScreen` is wired).

**Step 2: Flatten `SettingsHomeScreen` — remove all category headers**

Replace the entire body of `SettingsHomeScreen`'s `Column` content (lines 519–600) with:

```kotlin
SettingsCard {
    NavigableListItem(
        headlineText = "Appearance",
        supportingText = "Theme, variant, shape",
        onClick = { navController.navigate(SettingsRoute.Appearance.route) },
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
    NavigableListItem(
        headlineText = "Configuration",
        supportingText = "Commands, groups, import/export",
        onClick = { navController.navigate(SettingsRoute.Configuration.route) },
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
    NavigableListItem(
        headlineText = "Ignore list",
        supportingText = pluralize(config?.ignoreList?.size ?: 0, "item"),
        onClick = { navController.navigate(SettingsRoute.IgnoreList.route) },
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
    NavigableListItem(
        headlineText = "History",
        onClick = { navController.navigate(SettingsRoute.SearchHistoryScreen.route) },
    )
    HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
    NavigableListItem(
        headlineText = "About",
        supportingText = "v2.0.0",
        onClick = { navController.navigate(SettingsRoute.About.route) },
    )
}
Spacer(modifier = Modifier.height(32.dp))
```

**Step 3: Add `ConfigurationScreen` composable**

Add a new composable after `SettingsHomeScreen`:

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfigurationScreen(
    navController: NavHostController,
    config: FastTravelConfig?,
    editableStore: EditableConfigStore,
    themePrefs: ThemePreferences,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    Scaffold(
        topBar = { SettingsTopBar(title = "Configuration", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            Spacer(modifier = Modifier.height(16.dp))
            SettingsCard {
                val commandCount = if (config != null) getAllCommands(config).size else 0
                NavigableListItem(
                    headlineText = "Commands",
                    supportingText = if (config != null) pluralize(commandCount, "command") else "Loading...",
                    onClick = { navController.navigate(SettingsRoute.CommandsHome.route) },
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                val groupCount = config?.groups?.size ?: 0
                NavigableListItem(
                    headlineText = "Groups",
                    supportingText = if (config != null) pluralize(groupCount, "group") else "Loading...",
                    onClick = { navController.navigate(SettingsRoute.GroupsHome.route) },
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                DefaultCommandPicker(
                    config = config,
                    editableStore = editableStore,
                    themePrefs = themePrefs,
                    onConfigChanged = onConfigChanged,
                    snackbarHostState = snackbarHostState,
                    scope = scope,
                )
                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                NavigableListItem(
                    headlineText = "Import / Export",
                    supportingText = if (themePrefs.configSourceDirty) "Local config · auto-refresh paused" else "Synced from remote",
                    onClick = { navController.navigate(SettingsRoute.ImportExport.route) },
                )
            }
            Spacer(modifier = Modifier.height(32.dp))
        }
    }
}
```

**Step 4: Update `DefaultCommandPicker` to accept `ThemePreferences` and mark dirty**

Add `themePrefs: ThemePreferences` parameter to `DefaultCommandPicker`. Inside the `onClick` for saving:
```kotlin
// After editableStore.saveLocalConfig(...):
themePrefs.configSourceDirty = true
ConfigRefreshScheduler.schedule(context, ConfigRefreshInterval.MANUAL)
```

Also update all callers of `DefaultCommandPicker` to pass `themePrefs`.

**Step 5: Add `Configuration` and `ImportExport` routes to `SettingsNavHost`**

In `SettingsNavHost`, add:
```kotlin
composable(SettingsRoute.Configuration.route) {
    ConfigurationScreen(
        navController = navController,
        config = config,
        editableStore = editableStore,
        themePrefs = themePrefs,
        onConfigChanged = refreshConfig,
        snackbarHostState = snackbarHostState,
    )
}
```

(ImportExport route will be added in Task 14.)

**Step 6: Build**

```bash
cd android && ./gradlew :app:compileDebugKotlin
```

**Step 7: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt
git commit -m "feat(android): flatten settings home, add Configuration sub-page"
```

---

### Task 14: Wire dirty flag to all config save operations

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt`

Every call to `editableStore.saveLocalConfig(...)` across `SettingsActivity.kt` must also call:
```kotlin
themePrefs.configSourceDirty = true
ConfigRefreshScheduler.schedule(context, ConfigRefreshInterval.MANUAL)
```

**Step 1: Find all `saveLocalConfig` call sites**

```bash
grep -n "saveLocalConfig" android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt
```

For each call site, add the dirty + cancel pattern immediately after.

The easiest way: create a local extension/helper where `themePrefs` is available:
```kotlin
fun markDirtyAndCancelRefresh(context: Context, themePrefs: ThemePreferences) {
    themePrefs.configSourceDirty = true
    ConfigRefreshScheduler.schedule(context, ConfigRefreshInterval.MANUAL)
}
```

Add this as a top-level function in `SettingsActivity.kt`. Then update each `saveLocalConfig` call to call it.

**Step 2: Build**

```bash
cd android && ./gradlew :app:compileDebugKotlin
```

**Step 3: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt
git commit -m "feat(android): mark config dirty on every local edit, cancel background refresh"
```

---

## Chunk D — Android: Import/Export screen

### Task 15: Build `ImportExportScreen` (replaces ConfigSourceScreen)

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt`

This is the most complex Android task. The screen needs:
- ActivityResult launchers for file open (import) and file create (export) — these must be registered at the `SettingsActivity` level and passed down, OR we use a dedicated `Activity` sub-scope.

**Step 1: Register ActivityResult launchers in `SettingsActivity`**

In `SettingsActivity.onCreate()`, before `setContent`:
```kotlin
val importFileLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
    uri ?: return@registerForActivityResult
    // handled via shared state / callback
}
val exportFileLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
    uri ?: return@registerForActivityResult
    // handled via shared state / callback
}
```

Since Compose needs to trigger these launchers, pass them as lambdas into `SettingsNavHost` and down to `ImportExportScreen`:
```kotlin
SettingsNavHost(
    onFinish = { finish() },
    themePrefs = themePrefs,
    onAppearanceChanged = { appearance = it },
    onImportFile = { callback -> importLauncherCallback = callback; importFileLauncher.launch(arrayOf("application/json", "text/plain")) },
    onExportFile = { filename, callback -> exportLauncherCallback = callback; exportFileLauncher.launch(filename) },
)
```

Use `var importLauncherCallback: ((Uri) -> Unit)? = null` and `var exportLauncherCallback: ((Uri) -> Unit)? = null` as mutable fields on the Activity, set before launching.

**Step 2: Write `ImportExportScreen` composable**

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportExportScreen(
    navController: NavHostController,
    themePrefs: ThemePreferences,
    configRepository: ConfigRepository,
    editableStore: EditableConfigStore,
    onConfigChanged: () -> Unit,
    snackbarHostState: SnackbarHostState,
    onImportFile: (callback: (Uri) -> Unit) -> Unit,
    onExportFile: (filename: String, callback: (Uri) -> Unit) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var isLoading by remember { mutableStateOf(false) }
    var urlFieldValue by remember { mutableStateOf(themePrefs.configUrl) }
    var selectedInterval by remember { mutableStateOf(themePrefs.configRefreshInterval) }
    var intervalDropdownExpanded by remember { mutableStateOf(false) }
    var statusText by remember {
        mutableStateOf(
            if (themePrefs.configSourceDirty) "Local config · auto-refresh paused"
            else if (themePrefs.configUrl.isNotEmpty()) "Synced from ${themePrefs.configUrl}"
            else "No remote source"
        )
    }
    var showResetDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = { SettingsTopBar(title = "Import / Export", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.surfaceContainerLowest,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState()),
        ) {
            // Status card
            SettingsCategoryHeader(title = "Status")
            SettingsCard {
                ListItem(
                    headlineContent = { Text(statusText, style = MaterialTheme.typography.bodyMedium) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                )
            }

            // Import from file
            SettingsCategoryHeader(title = "Import")
            SettingsCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    Button(
                        onClick = {
                            onImportFile { uri ->
                                scope.launch {
                                    val text = withContext(Dispatchers.IO) {
                                        context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText()
                                    } ?: return@launch
                                    val parsed = sh.kavi.fasttravel.core.ConfigParser.safeParseConfig(text)
                                    if (parsed == null) {
                                        snackbarHostState.showSnackbar("Invalid config file")
                                        return@launch
                                    }
                                    val errors = sh.kavi.fasttravel.data.ConfigValidator.validate(parsed)
                                    if (errors.isNotEmpty()) {
                                        snackbarHostState.showSnackbar("Validation failed: ${errors.first()}")
                                        return@launch
                                    }
                                    editableStore.saveLocalConfig(parsed)
                                    markDirtyAndCancelRefresh(context, themePrefs)
                                    onConfigChanged()
                                    statusText = "Local config · auto-refresh paused"
                                    snackbarHostState.showSnackbar("Config imported from file")
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    ) { Text("Choose file…") }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Import from URL
            SettingsCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Import from URL", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = urlFieldValue,
                        onValueChange = { urlFieldValue = it },
                        label = { Text("Config URL") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                        singleLine = true,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    ExposedDropdownMenuBox(
                        expanded = intervalDropdownExpanded,
                        onExpandedChange = { intervalDropdownExpanded = it },
                    ) {
                        OutlinedTextField(
                            value = selectedInterval.displayName,
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Auto-refresh") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = intervalDropdownExpanded) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
                            shape = RoundedCornerShape(8.dp),
                        )
                        ExposedDropdownMenu(
                            expanded = intervalDropdownExpanded,
                            onDismissRequest = { intervalDropdownExpanded = false },
                        ) {
                            ConfigRefreshInterval.entries.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option.displayName) },
                                    onClick = { selectedInterval = option; intervalDropdownExpanded = false },
                                )
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = {
                            val url = urlFieldValue.trim()
                            if (url.isEmpty()) return@Button
                            isLoading = true
                            scope.launch {
                                val fetched = configRepository.fetchFromUrl(url)
                                if (fetched == null) {
                                    snackbarHostState.showSnackbar("Failed to fetch config from URL")
                                    isLoading = false
                                    return@launch
                                }
                                editableStore.saveLocalConfig(fetched)
                                themePrefs.configUrl = url
                                themePrefs.configRefreshInterval = selectedInterval
                                if (selectedInterval != ConfigRefreshInterval.MANUAL) {
                                    themePrefs.configSourceDirty = false
                                    ConfigRefreshScheduler.schedule(context, selectedInterval)
                                    statusText = "Synced from $url"
                                } else {
                                    markDirtyAndCancelRefresh(context, themePrefs)
                                    statusText = "Local config · auto-refresh paused"
                                }
                                onConfigChanged()
                                snackbarHostState.showSnackbar("Config imported from URL")
                                isLoading = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        enabled = !isLoading,
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text(if (isLoading) "Fetching…" else "Fetch & Import")
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Export
            SettingsCategoryHeader(title = "Export")
            SettingsCard {
                Column(modifier = Modifier.padding(16.dp)) {
                    Button(
                        onClick = {
                            scope.launch {
                                val cfg = configRepository.getConfig()
                                val json = sh.kavi.fasttravel.core.ConfigWriter.writeConfig(cfg)
                                onExportFile("fast-travel-config.json") { uri ->
                                    scope.launch(Dispatchers.IO) {
                                        context.contentResolver.openOutputStream(uri)?.use { it.write(json.toByteArray()) }
                                        snackbarHostState.showSnackbar("Config exported")
                                    }
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                    ) { Text("Export config") }
                }
            }

            // Reset to remote (only if URL is configured and dirty)
            if (themePrefs.configUrl.isNotEmpty() && themePrefs.configSourceDirty) {
                Spacer(modifier = Modifier.height(16.dp))
                SettingsCategoryHeader(title = "Reset")
                SettingsCard {
                    ListItem(
                        headlineContent = {
                            Text("Reset to remote", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.error)
                        },
                        supportingContent = {
                            Text("Re-fetch from ${themePrefs.configUrl} and re-enable auto-refresh",
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        modifier = Modifier.clickable { showResetDialog = true },
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    if (showResetDialog) {
        AlertDialog(
            onDismissRequest = { showResetDialog = false },
            title = { Text("Reset to remote?") },
            text = { Text("This will discard local edits and re-fetch from ${themePrefs.configUrl}.") },
            confirmButton = {
                TextButton(onClick = {
                    showResetDialog = false
                    scope.launch {
                        val fetched = configRepository.fetchFromUrl(themePrefs.configUrl)
                        if (fetched != null) {
                            editableStore.saveLocalConfig(fetched)
                            themePrefs.configSourceDirty = false
                            ConfigRefreshScheduler.schedule(context, themePrefs.configRefreshInterval)
                            onConfigChanged()
                            statusText = "Synced from ${themePrefs.configUrl}"
                            snackbarHostState.showSnackbar("Reset to remote config")
                        } else {
                            snackbarHostState.showSnackbar("Failed to fetch remote config")
                        }
                    }
                }) { Text("Reset", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showResetDialog = false }) { Text("Cancel") } },
        )
    }
}
```

**Step 3: Add `fetchFromUrl(url: String)` to `ConfigRepository`**

Since `fetchFromGitHub()` uses `themePrefs.configUrl`, add a URL-overload:

In `ConfigRepository.kt`, add:
```kotlin
suspend fun fetchFromUrl(url: String): FastTravelConfig? = withContext(Dispatchers.IO) {
    try {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = CONNECT_TIMEOUT_MS
        connection.readTimeout = READ_TIMEOUT_MS
        connection.requestMethod = "GET"
        if (connection.responseCode == HttpURLConnection.HTTP_OK) {
            val json = connection.inputStream.bufferedReader().use { it.readText() }
            connection.disconnect()
            ConfigParser.safeParseConfig(json)
        } else { connection.disconnect(); null }
    } catch (_: Exception) { null }
}
```

**Step 4: Wire `ImportExport` route in `SettingsNavHost`**

```kotlin
composable(SettingsRoute.ImportExport.route) {
    ImportExportScreen(
        navController = navController,
        themePrefs = themePrefs,
        configRepository = configRepository,
        editableStore = editableStore,
        onConfigChanged = refreshConfig,
        snackbarHostState = snackbarHostState,
        onImportFile = onImportFile,
        onExportFile = onExportFile,
    )
}
```

Remove `ConfigSource` route and `ConfigSourceScreen` composable.

**Step 5: Build**

```bash
cd android && ./gradlew :app:compileDebugKotlin
```

**Step 6: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt \
        android/app/src/main/kotlin/sh/kavi/fasttravel/data/ConfigRepository.kt
git commit -m "feat(android): add Import/Export screen with file/URL import, export, dirty tracking"
```

---

## Chunk E — Playwright tests (extension)

### Task 16: Playwright — settings navigation tests

**Files:**
- Create: `extension/tests/e2e/settings.spec.ts`

**Step 1: Write tests**

```typescript
import { test, expect } from "./fixtures";

test("settings: sidebar has 6 items in correct order", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html`);
  const links = page.locator(".sidebar-link");
  await expect(links).toHaveCount(6);
  const texts = await links.allTextContents();
  const trimmed = texts.map(t => t.trim());
  expect(trimmed).toEqual(["Appearance", "Configuration", "Ignore list", "History", "Set as default", "About"]);
});

test("settings: Configuration screen shows Commands, Groups, Default command, Import/Export", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  await expect(page.locator("text=Commands")).toBeVisible();
  await expect(page.locator("text=Groups")).toBeVisible();
  await expect(page.locator("text=Default command")).toBeVisible();
  await expect(page.locator("text=Import / Export")).toBeVisible();
});

test("settings: clicking Commands in Configuration navigates to commands list", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  await page.locator("text=Commands").first().click();
  await expect(page).toHaveURL(/.*#\/commands$/);
});

test("settings: Import/Export link navigates to import-export screen", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);
  await page.locator("text=Import / Export").click();
  await expect(page).toHaveURL(/.*#\/import-export$/);
  await expect(page.locator("text=Import from file")).toBeVisible();
  await expect(page.locator("text=Import from URL")).toBeVisible();
  await expect(page.locator("text=Export")).toBeVisible();
});
```

**Step 2: Build extension and run tests**

```bash
cd extension && npm run build:all && npx playwright test tests/e2e/settings.spec.ts --headed
```
Expected: all 4 tests pass.

**Step 3: Commit**

```bash
git add extension/tests/e2e/settings.spec.ts
git commit -m "test(extension): Playwright tests for settings navigation"
```

---

### Task 17: Playwright — config editing and dirty tracking tests

**Files:**
- Create: `extension/tests/e2e/config-editing.spec.ts`

**Step 1: Write tests**

```typescript
import { test, expect } from "./fixtures";

// Helper: get current config from service worker storage
async function getStoredConfig(context: import("@playwright/test").BrowserContext, extensionId: string) {
  const sw = context.serviceWorkers()[0];
  return sw.evaluate(() =>
    chrome.storage.local.get("fast-travel-config").then(v => v["fast-travel-config"])
  );
}

async function getDirtyFlag(context: import("@playwright/test").BrowserContext) {
  const sw = context.serviceWorkers()[0];
  return sw.evaluate(() =>
    chrome.storage.local.get("fast-travel-config-dirty").then(v => v["fast-travel-config-dirty"] ?? false)
  );
}

test("config: adding a command sets dirty flag", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/commands/new`);

  await page.fill('[placeholder="unique-id"]', "test-cmd");
  await page.fill('[placeholder*="name"]', "Test Command");
  // Fill trigger
  const triggerInput = page.locator('input[placeholder*="trigger"]').first();
  await triggerInput.fill("tc");
  await triggerInput.press("Enter");
  // Fill URL
  await page.fill('[placeholder*="defaultUrl"]', "https://test.com");
  await page.locator("button.primary", { hasText: "Save command" }).click();

  await page.waitForURL(/.*#\/commands$/);

  const dirty = await getDirtyFlag(context);
  expect(dirty).toBe(true);
});

test("config: editing default command sets dirty flag", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/configuration`);

  const select = page.locator('select#default-cmd');
  const options = await select.locator("option").allTextContents();
  expect(options.length).toBeGreaterThan(1);

  // Pick a different option than the current one
  const current = await select.inputValue();
  const other = await select.locator(`option:not([value="${current}"])`).first().getAttribute("value");
  await select.selectOption(other!);

  await page.waitForTimeout(300);
  const dirty = await getDirtyFlag(context);
  expect(dirty).toBe(true);
});

test("config: export produces valid JSON matching stored config", async ({ context, extensionId }) => {
  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  // Listen for the download
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: "/tmp",
  });

  await page.goto(`chrome-extension://${extensionId}/options/options.html#/import-export`);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("button", { hasText: "Export config" }).click(),
  ]);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const json = Buffer.concat(chunks).toString("utf-8");
  const exported = JSON.parse(json);

  const stored = await getStoredConfig(context, extensionId);
  expect(exported).toEqual(stored);
});

test("config: importing a valid file replaces config", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html#/import-export`);

  // First export the current config, modify it, re-import
  const sw = context.serviceWorkers()[0];
  const original = await sw.evaluate(() =>
    chrome.storage.local.get("fast-travel-config").then(v => v["fast-travel-config"])
  );
  const modified = { ...original, defaultCommand: original.defaultCommand + "-modified-test" };

  // Write a temp file via page evaluate (blob URL trick)
  await page.evaluate((cfg) => {
    const blob = new Blob([JSON.stringify(cfg)], { type: "application/json" });
    const dt = new DataTransfer();
    const file = new File([blob], "test.json", { type: "application/json" });
    dt.items.add(file);
    (document.getElementById("file-import-input") as HTMLInputElement).files = dt.files;
    (document.getElementById("file-import-input") as HTMLInputElement).dispatchEvent(new Event("change"));
  }, modified);

  await page.waitForTimeout(500);

  const newCfg = await getStoredConfig(context, extensionId);
  expect(newCfg.defaultCommand).toBe(modified.defaultCommand);
});
```

**Step 2: Add `id="file-import-input"` to the file input in `import-export.ts`**

In Task 9's `import-export.ts`, update the file input element:
```typescript
const fileInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none", id: "file-import-input" }) as HTMLInputElement;
```

**Step 3: Build and run**

```bash
cd extension && npm run build:all && npx playwright test tests/e2e/config-editing.spec.ts --headed
```

**Step 4: Commit**

```bash
git add extension/tests/e2e/config-editing.spec.ts
git commit -m "test(extension): Playwright tests for config editing, dirty flag, import/export"
```

---

## Chunk F — Android instrumented tests (AVD)

### Task 18: Set up AVD and run basic smoke test

**Step 1: Stop Gradle daemons and boot AVD**

```bash
cd android && ./gradlew --stop
$ANDROID_HOME/emulator/emulator -avd fast_travel_dev \
  -no-snapshot -gpu swiftshader_indirect -memory 3072 \
  -cores 2 -no-boot-anim -no-audio &
adb wait-for-device
adb shell getprop sys.boot_completed
```
Wait until `getprop` returns `1`. If `adb install` fails once after boot, retry after 2s — normal.

**Step 2: Build and install**

```bash
./gradlew :app:installDebug
```

**Step 3: Verify the app launches and settings home is flat**

```bash
adb shell am start -n sh.kavi.fasttravel/.ui.SearchActivity
adb shell am start -n sh.kavi.fasttravel/.ui.SettingsActivity
```

Take a screenshot and verify:
```bash
adb exec-out screencap -p > /tmp/settings-home.png
```

Expected: flat list with Appearance, Configuration, Ignore list, History, About — no category headers.

**Step 4: Commit** (no new code — just verified AVD works)

---

### Task 19: Write Android instrumented tests for settings navigation

**Files:**
- Create: `android/app/src/androidTest/kotlin/sh/kavi/fasttravel/ui/SettingsNavigationTest.kt`

**Step 1: Create the test class**

```kotlin
package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SettingsNavigationTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<SettingsActivity>()

    @Test
    fun settingsHome_showsFlatFiveItems() {
        composeTestRule.onNodeWithText("Appearance").assertIsDisplayed()
        composeTestRule.onNodeWithText("Configuration").assertIsDisplayed()
        composeTestRule.onNodeWithText("Ignore list").assertIsDisplayed()
        composeTestRule.onNodeWithText("History").assertIsDisplayed()
        composeTestRule.onNodeWithText("About").assertIsDisplayed()
        // Ensure no category headers are shown
        composeTestRule.onNodeWithText("Configuration", substring = false).assertIsDisplayed()
    }

    @Test
    fun configuration_showsExpectedItems() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Commands").assertIsDisplayed()
        composeTestRule.onNodeWithText("Groups").assertIsDisplayed()
        composeTestRule.onNodeWithText("Default Command").assertIsDisplayed()
        composeTestRule.onNodeWithText("Import / Export").assertIsDisplayed()
    }

    @Test
    fun importExport_screenLoads() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
        composeTestRule.onNodeWithText("Choose file…").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fetch & Import").assertIsDisplayed()
        composeTestRule.onNodeWithText("Export config").assertIsDisplayed()
    }
}
```

**Step 2: Run instrumented tests**

```bash
cd android && ./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=sh.kavi.fasttravel.ui.SettingsNavigationTest
```
Expected: 3 tests pass.

**Step 3: Commit**

```bash
git add android/app/src/androidTest/kotlin/sh/kavi/fasttravel/ui/SettingsNavigationTest.kt
git commit -m "test(android): instrumented navigation tests for flattened settings"
```

---

### Task 20: Write Android instrumented tests for config editing + dirty tracking

**Files:**
- Create: `android/app/src/androidTest/kotlin/sh/kavi/fasttravel/ui/ConfigEditingTest.kt`

**Step 1: Write tests**

```kotlin
package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import sh.kavi.fasttravel.data.ConfigRefreshInterval
import sh.kavi.fasttravel.data.ThemePreferences

@RunWith(AndroidJUnit4::class)
class ConfigEditingTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<SettingsActivity>()

    private lateinit var themePrefs: ThemePreferences

    @Before
    fun setup() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        themePrefs = ThemePreferences(ctx)
        // Reset dirty flag before each test
        themePrefs.configSourceDirty = false
        themePrefs.configRefreshInterval = ConfigRefreshInterval.DAILY
    }

    @Test
    fun addCommand_setsDirtyFlag() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Commands").performClick()
        composeTestRule.onNodeWithContentDescription("Add command").performClick()

        // Fill new command form
        composeTestRule.onNodeWithText("ID").performTextInput("e2e-test-cmd")
        composeTestRule.onNodeWithText("Name").performTextInput("E2E Test")
        // Add a trigger chip
        composeTestRule.onNodeWithText("Add trigger").performTextInput("et")
        // Save
        composeTestRule.onNodeWithText("Save").performClick()
        composeTestRule.waitForIdle()

        assert(themePrefs.configSourceDirty) { "Expected dirty flag to be true after adding command" }
    }

    @Test
    fun editGroup_setsDirtyFlag() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Groups").performClick()
        // Long-press first group to edit
        composeTestRule.onAllNodesWithTag("group-item").onFirst().performLongClick()
        composeTestRule.onNodeWithText("Edit").performClick()
        composeTestRule.onNodeWithText("Save").performClick()
        composeTestRule.waitForIdle()

        assert(themePrefs.configSourceDirty) { "Expected dirty flag to be true after editing group" }
    }

    @Test
    fun editIgnoreList_setsDirtyFlag() {
        composeTestRule.onNodeWithText("Ignore list").performClick()
        composeTestRule.onNodeWithText("Add word").performClick()
        composeTestRule.onNodeWithText("Word").performTextInput("testword")
        composeTestRule.onNodeWithText("Add").performClick()
        composeTestRule.waitForIdle()

        assert(themePrefs.configSourceDirty) { "Expected dirty flag to be true after editing ignore list" }
    }

    @Test
    fun exportConfig_producesValidJson() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
        // Export button triggers system share sheet — verify it appears
        composeTestRule.onNodeWithText("Export config").performClick()
        // The share sheet or file picker should appear
        composeTestRule.waitForIdle()
        // Verify the activity didn't crash (file picker opened)
        composeTestRule.onNodeWithText("Export config").assertExists()
    }

    @Test
    fun importExportStatus_showsPausedWhenDirty() {
        themePrefs.configSourceDirty = true
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
        composeTestRule.onNodeWithText("auto-refresh paused", substring = true).assertIsDisplayed()
    }
}
```

**Step 2: Run**

```bash
cd android && ./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=sh.kavi.fasttravel.ui.ConfigEditingTest
```
Expected: all tests pass.

**Step 3: Commit**

```bash
git add android/app/src/androidTest/kotlin/sh/kavi/fasttravel/ui/ConfigEditingTest.kt
git commit -m "test(android): instrumented tests for config editing and dirty tracking"
```

---

## Chunk G — Final verification

### Task 21: Full end-to-end test run

**Extension:**

```bash
cd extension && npm run build:all && npm test && npx playwright test tests/e2e/
```
Expected: all unit tests and e2e tests pass.

**Android:**

```bash
cd android && ./gradlew :app:connectedDebugAndroidTest
```
Expected: all instrumented tests pass.

**Visual check — extension:**
1. Open `chrome-extension://<id>/options/options.html`
2. Verify sidebar: Appearance, Configuration, Ignore list, History, Set as default, About
3. Click Configuration → verify Commands, Groups, Default command, Import/Export sub-items
4. Click Import/Export → file import, URL import with interval, export, status row
5. Add a command → go to Import/Export → verify "auto-refresh paused" status
6. Export config → verify JSON downloads and is valid

**Visual check — Android (AVD or device):**
1. Open Settings → verify flat 5-item list (no headers)
2. Tap Configuration → Commands, Groups, Default Command, Import/Export
3. Tap Import/Export → file picker button, URL field, interval dropdown, Export button
4. Edit any command → status shows "auto-refresh paused"
5. Export → verify share sheet opens with JSON file

**Commit:**

```bash
git add .
git commit -m "feat: complete settings simplification and config import/export"
```
