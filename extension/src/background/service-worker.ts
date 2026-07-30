import { parseCommand, buildTriggerMap } from "../core/parser.js";
import { fetchSuggestions } from "../core/suggestions.js";
import { lintConfig } from "../core/config-linter.js";
import {
  LATEST_RELEASE_KEY,
  RELEASES_API_URL,
  isSideloadedChromium,
  isUpdateCheckDue,
  parseLatestRelease,
} from "../core/update-check.js";
import { detectDevice } from "../core/device.js";
import type { FastTravelConfig, TypoResult } from "../core/types.js";
import bundledConfig from "../../../shared/config/default-config.json";

const DEFAULT_CONFIG_URL =
  "https://raw.githubusercontent.com/DoubleGremlin181/fast-travel-app/main/shared/config/default-config.json";
const CONFIG_KEY = "fast-travel-config";
const CONFIG_DIRTY_KEY = "fast-travel-config-dirty";
const HISTORY_KEY = "fast-travel-history";
const CONFIG_URL_KEY = "fast-travel-config-url";
const REFRESH_INTERVAL_KEY = "fast-travel-refresh-interval";
const LAST_SYNCED_KEY = "fast-travel-last-synced";
const REFRESH_ALARM = "config-refresh";
const UPDATE_ALARM = "update-check";
const UPDATE_CHECK_PERIOD_MINUTES = 24 * 60;
const CONFIG_FETCH_TIMEOUT_MS = 5000;
const APPEARANCE_KEY = "fast-travel-appearance";

// Appearance prefs are mirrored to localStorage by the page (appearance.ts) and
// read synchronously before first paint by apply-theme.ts. The worker uses them
// only to pick the toolbar icon (below); it has no localStorage and can't read
// prefers-color-scheme, so "system" mode is resolved by the pages (which post a
// "resolvedTheme" message) rather than here.

type RefreshInterval = "manual" | "daily" | "weekly";
type AppearanceMode = "light" | "dark" | "system";
// Only the fields the worker needs to pick an icon.
type AppearancePrefs = { mode?: AppearanceMode; variant?: string };

// Resolve the toolbar theme the worker can commit to on its own. Mirrors
// applyAppearance's `variant === "amoled" ? "dark" : resolvedMode` rule so the
// worker and the page's "resolvedTheme" message never pick different icons:
// amoled forces a dark body regardless of mode, so it resolves to "dark" even
// under "system". Returns null for plain "system" (which the worker can't
// resolve without prefers-color-scheme) — an open page reports that instead.
function resolveWorkerTheme(prefs: AppearancePrefs | undefined): "light" | "dark" | null {
  if (!prefs) return null;
  if (prefs.variant === "amoled") return "dark";
  if (prefs.mode === "light" || prefs.mode === "dark") return prefs.mode;
  return null;
}

// The toolbar icon matches the selected theme: the dark Night tile
// (icon16/48/128.png) for Dark, the light Paper tile (…-paper.png) for Light.
// NOTE: chrome.action.setIcon({path}) fails ("Failed to fetch") in an MV3
// service worker, so we decode the PNGs to ImageData and pass {imageData}.
const iconDataCache = new Map<"light" | "dark", Record<number, ImageData>>();

async function loadIconData(theme: "light" | "dark"): Promise<Record<number, ImageData>> {
  const cached = iconDataCache.get(theme);
  if (cached) return cached;
  const suffix = theme === "dark" ? "" : "-paper";
  const record: Record<number, ImageData> = {};
  for (const size of [16, 48, 128]) {
    const url = chrome.runtime.getURL(`icons/icon${size}${suffix}.png`);
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    record[size] = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();
  }
  iconDataCache.set(theme, record);
  return record;
}

async function setToolbarIcon(theme: "light" | "dark"): Promise<void> {
  try {
    await chrome.action.setIcon({ imageData: await loadIconData(theme) });
  } catch {
    // Ignore (e.g. during teardown, or if the action API is unavailable).
  }
}

// On startup, honour any theme the worker can resolve (explicit Light/Dark, or
// any amoled variant) immediately. Plain "system" is left at the manifest
// default (Night) until an open page reports the resolved OS theme via the
// "resolvedTheme" message.
async function initToolbarIcon(): Promise<void> {
  const v = await chrome.storage.sync.get(APPEARANCE_KEY);
  const theme = resolveWorkerTheme(v[APPEARANCE_KEY] as AppearancePrefs | undefined);
  if (theme) await setToolbarIcon(theme);
}

function intervalToMinutes(interval: RefreshInterval): number | null {
  switch (interval) {
    case "daily":
      return 24 * 60;
    case "weekly":
      return 7 * 24 * 60;
    case "manual":
      return null;
  }
}

async function getConfiguredUrl(): Promise<string> {
  const v = await chrome.storage.local.get(CONFIG_URL_KEY);
  const url = (v[CONFIG_URL_KEY] as string | undefined)?.trim();
  return url && url.length > 0 ? url : DEFAULT_CONFIG_URL;
}

async function getRefreshInterval(): Promise<RefreshInterval> {
  const v = await chrome.storage.local.get(REFRESH_INTERVAL_KEY);
  return (v[REFRESH_INTERVAL_KEY] as RefreshInterval | undefined) ?? "daily";
}

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

/**
 * Run the same lint checks the in-app editor uses. Returns true if the config
 * is safe to load. We log errors but never throw — a bad remote config falls
 * through to the cached/bundled one.
 */
function isConfigUsable(cfg: unknown, source: string): cfg is FastTravelConfig {
  if (!cfg || typeof cfg !== "object") return false;
  try {
    const errors = lintConfig(cfg as FastTravelConfig);
    if (errors.length > 0) {
      console.warn(
        `[fast-travel] discarding ${source} config: ${errors.length} lint error(s); first: ${errors[0].message}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[fast-travel] ${source} config threw during lint: ${String(e)}`);
    return false;
  }
}

// History entry type
interface HistoryEntry {
  query: string;
  commandId: string | null;
  timestamp: number;
}

// Load search history
async function getHistory(): Promise<HistoryEntry[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return (result[HISTORY_KEY] as HistoryEntry[]) ?? [];
}

// Add a history entry (keep last 50)
async function addHistory(entry: HistoryEntry): Promise<void> {
  const trimmed = entry.query.trim();
  if (!trimmed) return;
  const history = await getHistory();
  history.unshift({ ...entry, query: trimmed });
  if (history.length > 50) history.length = 50;
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

// Clear all history
async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

// Load config from storage, falling back to bundled config. Validates every
// load path so a corrupt cached/remote config doesn't poison the parser.
async function getConfig(): Promise<FastTravelConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const stored = result[CONFIG_KEY];
  return isConfigUsable(stored, "stored") ? stored : (bundledConfig as unknown as FastTravelConfig);
}

async function setConfig(cfg: FastTravelConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: cfg, [CONFIG_DIRTY_KEY]: true });
  await chrome.alarms.clear(REFRESH_ALARM);
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

export interface RefreshResult {
  ok: boolean;
  reason?: string;
}

// Fetch and store config from the configured URL. Validates before persisting
// so a bad publish doesn't replace a known-good cached copy.
async function fetchAndStoreConfig(clearDirtyOnSuccess = true): Promise<RefreshResult> {
  const url = await getConfiguredUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status} ${response.statusText}` };
    }
    let config: unknown;
    try {
      config = await response.json();
    } catch (e) {
      return { ok: false, reason: `Invalid JSON: ${(e as Error).message}` };
    }
    if (!isConfigUsable(config, "remote")) {
      return { ok: false, reason: "Config failed validation (see service worker console)" };
    }
    await chrome.storage.local.set({
      [CONFIG_KEY]: config,
      [LAST_SYNCED_KEY]: Date.now(),
    });
    if (clearDirtyOnSuccess) await clearDirty();
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "Request timed out" : (e as Error).message;
    return { ok: false, reason: msg };
  } finally {
    clearTimeout(timer);
  }
}

// Redirects the search_provider's sentinel URL back into the extension so
// every default-engine omnibox query runs through Fast Travel. Must be set up
// dynamically because we need `chrome.runtime.id` to build the target URL.
const SEARCH_REDIRECT_RULE_ID = 1;

async function installSearchRedirectRule(): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  // Chrome blocks DNR redirects of browser-initiated navigations into
  // chrome-extension:// pages (issue #44) → ERR_BLOCKED_BY_CLIENT, and dynamic
  // rules persist across updates. So on Chrome, actively REMOVE any rule a prior
  // build installed and rely on the webNavigation handler instead. The DNR rule
  // is only used on Firefox (regexSubstitution, FF 131+).
  if (!navigator.userAgent.includes("Firefox")) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [SEARCH_REDIRECT_RULE_ID],
      });
    } catch (e) {
      console.warn("[fast-travel] failed to remove stale redirect rule:", e);
    }
    return;
  }
  const target = `${chrome.runtime.getURL("newtab/newtab.html")}?q=\\1`;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [SEARCH_REDIRECT_RULE_ID],
      addRules: [
        {
          id: SEARCH_REDIRECT_RULE_ID,
          priority: 1,
          action: {
            type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
            redirect: { regexSubstitution: target },
          },
          condition: {
            regexFilter: "^https://fast-travel-omnibox\\.invalid/search\\?q=(.*)$",
            resourceTypes: ["main_frame" as chrome.declarativeNetRequest.ResourceType],
          },
        },
      ],
    });
  } catch (e) {
    console.warn("[fast-travel] failed to install search redirect rule:", e);
  }
}

// Route the search_provider's sentinel URL into the New Tab page via an
// extension-initiated navigation (chrome.tabs.update). This is the primary
// mechanism on Chrome and the fallback on Firefox.
//
// Why not a declarativeNetRequest redirect on Chrome: Chrome BLOCKS DNR redirects
// of browser-initiated navigations (omnibox / context-menu "Search Fast Travel
// for …") into chrome-extension:// pages — ERR_BLOCKED_BY_CLIENT — even when the
// target is declared web_accessible (issue #44). An extension-initiated
// tabs.update is allowed. onBeforeNavigate fires before the network request, so
// the .invalid host is never actually contacted.
if (chrome.webNavigation?.onBeforeNavigate) {
  chrome.webNavigation.onBeforeNavigate.addListener(
    (details) => {
      if (details.frameId !== 0) return;
      try {
        const q = new URL(details.url).searchParams.get("q");
        if (!q) return;
        chrome.tabs.update(details.tabId, {
          url: `${chrome.runtime.getURL("newtab/newtab.html")}?q=${encodeURIComponent(q)}`,
        });
      } catch {
        // ignore malformed URLs
      }
    },
    { url: [{ hostEquals: "fast-travel-omnibox.invalid" }] },
  );
}

// Sideloaded (GitHub-installed) Chromium builds never auto-update, so poll the
// latest GitHub Release and cache it; the new tab page turns the cached value
// into a one-time per-version update hint. Store builds skip all of this.
// Checks run at most once a day: startup calls are throttled against the last
// check's timestamp, and only the daily alarm passes force=true.
async function checkForUpdate(force = false): Promise<void> {
  if (!isSideloadedChromium()) return;
  if (!force) {
    const stored = await chrome.storage.local.get(LATEST_RELEASE_KEY);
    if (!isUpdateCheckDue(stored[LATEST_RELEASE_KEY], Date.now())) return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(RELEASES_API_URL, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    const latest = parseLatestRelease(await response.json(), Date.now());
    if (latest) {
      await chrome.storage.local.set({ [LATEST_RELEASE_KEY]: latest });
    }
  } catch (e) {
    console.warn("[fast-travel] update check failed:", e);
  } finally {
    clearTimeout(timer);
  }
}

async function scheduleUpdateCheck(): Promise<void> {
  if (!isSideloadedChromium()) return;
  // Don't reset the countdown on every worker spin-up — only create the alarm
  // if a prior one isn't already pending (alarms persist across restarts).
  const existing = await chrome.alarms.get(UPDATE_ALARM);
  if (!existing) {
    chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: UPDATE_CHECK_PERIOD_MINUTES });
  }
}

// Run on every service-worker startup (not just onInstalled/onStartup, which
// don't fire on a plain reload): on Chrome this REMOVES any stale redirect rule
// a prior build left behind (issue #44); on Firefox it (re)installs it.
installSearchRedirectRule();

// On install: seed with bundled config, then try fetching latest from GitHub
chrome.runtime.onInstalled.addListener(async () => {
  // Immediately store the bundled config so newtab works offline
  const existing = await chrome.storage.local.get(CONFIG_KEY);
  if (!existing[CONFIG_KEY]) {
    await chrome.storage.local.set({ [CONFIG_KEY]: bundledConfig });
  }
  // Then try to fetch a newer version from GitHub (non-blocking), unless dirty
  if (!(await isDirty())) {
    fetchAndStoreConfig();
  }
  scheduleRefresh();
  installSearchRedirectRule();
  initToolbarIcon();
  scheduleUpdateCheck();
  checkForUpdate();
});

// Reinstall the rule on every worker startup — dynamic rules persist across
// restarts, but the target URL contains chrome.runtime.id which is stable; we
// still refresh it defensively in case the extension was reloaded.
// Also refresh config unless user has locally-edited (dirty) config.
chrome.runtime.onStartup.addListener(async () => {
  installSearchRedirectRule();
  if (!(await isDirty())) {
    fetchAndStoreConfig();
  }
  initToolbarIcon();
  scheduleUpdateCheck();
  checkForUpdate();
});

// When the refresh interval changes in settings, reschedule the alarm. When the
// appearance preference changes to a theme the worker can resolve, update the
// toolbar icon immediately (plain "system" is handled by the page-reported
// "resolvedTheme").
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[REFRESH_INTERVAL_KEY]) {
    scheduleRefresh();
  }
  if (areaName === "sync" && changes[APPEARANCE_KEY]) {
    const theme = resolveWorkerTheme(changes[APPEARANCE_KEY].newValue as AppearancePrefs | undefined);
    if (theme) void setToolbarIcon(theme);
  }
});

// Periodic config refresh
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    if (!(await isDirty())) await fetchAndStoreConfig();
  }
  if (alarm.name === UPDATE_ALARM) {
    await checkForUpdate(true);
  }
});

// Keyboard command: open Fast Travel newtab with focus properly in the page's
// search input. Chrome's Ctrl+T focuses the omnibox at the browser-chrome
// level (which extensions can't override); creating the tab programmatically
// via chrome.tabs.create bypasses that pre-focus, so the page's JS focus call
// actually sticks.
chrome.commands?.onCommand.addListener((command) => {
  if (command !== "open-focused-newtab") return;
  chrome.tabs.create({ url: chrome.runtime.getURL("newtab/newtab.html") });
});

// Ctrl+T and the + button route through chrome://newtab/, which triggers
// Chrome's omnibox pre-focus — an OS-level steal that page JS cannot override.
// Intercepting here and replacing with a programmatic chrome.tabs.create()
// bypasses that pre-focus, so the page's autofocus/focus() call wins.
// chrome_url_overrides stays in the manifest as a fallback if the SW is idle.
// Chrome: intercept via tabs.onCreated — pendingUrl is "chrome://newtab/" before
// the NTP override resolves, giving us a reliable signal.
chrome.tabs.onCreated.addListener(async (tab) => {
  if ((tab.pendingUrl ?? tab.url) !== "chrome://newtab/") return;
  if (tab.id === undefined) return;
  // Never tear down the SOLE tab of a window. At browser startup / new window the
  // New Tab Page is the only tab, so removing it closes the whole window before
  // the replacement is created (issue #43). The omnibox focus-steal we work around
  // only happens via Ctrl+T / "+", where the window already has other tabs.
  let siblings: chrome.tabs.Tab[];
  try {
    siblings = await chrome.tabs.query({ windowId: tab.windowId });
  } catch {
    return;
  }
  if (siblings.length <= 1) return;
  chrome.tabs.remove(tab.id, () => {
    if (chrome.runtime.lastError) return;
    chrome.tabs.create({
      url: chrome.runtime.getURL("newtab/newtab.html"),
      windowId: tab.windowId,
      index: tab.index,
    });
  });
});

// Firefox: the NTP override resolves to the extension URL before tabs.onCreated
// fires, so pendingUrl is never "about:newtab". Instead intercept via
// tabs.onUpdated when the URL first becomes our newtab page.
if (navigator.userAgent.includes("Firefox")) {
  const handledTabs = new Set<number>();

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== "loading") return;
    if (!changeInfo.url?.endsWith("/newtab/newtab.html")) return;
    if (!tab.active) return;
    if (handledTabs.has(tabId)) return;
    handledTabs.add(tabId);
    // Don't tear down the sole tab of a window — removing it would close the
    // window at startup / new window (mirrors the Chrome guard for issue #43).
    let siblings: chrome.tabs.Tab[];
    try {
      siblings = await chrome.tabs.query({ windowId: tab.windowId });
    } catch {
      return;
    }
    if (siblings.length <= 1) return;
    chrome.tabs.remove(tabId, () => {
      if (chrome.runtime.lastError) return;
      chrome.tabs.create(
        { url: chrome.runtime.getURL("newtab/newtab.html"), windowId: tab.windowId, index: tab.index },
        (newTab) => { if (newTab?.id !== undefined) handledTabs.add(newTab.id); },
      );
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    handledTabs.delete(tabId);
  });
}

// Omnibox: show a persistent hint as the default suggestion. Chrome/Firefox
// display this inline when the user hasn't picked another suggestion.
try {
  chrome.omnibox.setDefaultSuggestion({
    description: "Type a command (g, yt, gh, $AAPL…) or anything to search",
  });
} catch {
  // Some hosts restrict this call during module init; ignore.
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Omnibox: suggest as user types. Suggestions from a matched command's API
// keep the trigger prefix in `content` so pressing Enter on them still routes
// through the right command (otherwise parseCommand treats them as free text
// and the default command swallows them).
chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const config = await getConfig();
  if (!config) return;

  const results: chrome.omnibox.SuggestResult[] = [];
  const seen = new Set<string>();
  const triggerMap = buildTriggerMap(config);
  const parts = text.trim().split(/\s+/);
  const firstToken = parts[0]?.toLowerCase();

  // Single-word input: list every command whose trigger starts with the typed
  // prefix — including exact matches, so the user sees confirmation they're
  // about to launch a command.
  if (parts.length === 1 && firstToken) {
    for (const [trigger, cmd] of triggerMap) {
      if (cmd.type !== "standard") continue;
      if (!trigger.startsWith(firstToken)) continue;
      const content = trigger === firstToken ? trigger : trigger + " ";
      if (seen.has(content)) continue;
      seen.add(content);
      results.push({
        content,
        description: `<match>${escapeXml(trigger)}</match> — <dim>${escapeXml(cmd.name)}</dim>`,
      });
      if (results.length >= 4) break;
    }
  }

  // Fetch search suggestions from APIs (fetchSuggestions already prefixes the
  // trigger when a command is matched, so `content` is navigation-ready).
  try {
    const suggestions = await fetchSuggestions(text, config);
    for (const s of suggestions.slice(0, 5)) {
      if (seen.has(s.text)) continue;
      seen.add(s.text);
      const badge = s.commandTrigger ? `<match>${escapeXml(s.commandTrigger)}</match> ` : "";
      results.push({
        content: s.text,
        description: `${badge}<dim>${escapeXml(s.displayText)}</dim>`,
      });
    }
  } catch {
    // Suggestion fetch failed - show command matches only
  }

  suggest(results);
});

// Omnibox: navigate on enter
chrome.omnibox.onInputEntered.addListener(
  async (text, disposition) => {
    const config = await getConfig();
    if (!config) return;

    const result = parseCommand({
      rawQuery: text,
      device: detectDevice(),
      config,
      ignoreList: [],
    });

    let navUrl: string | null = null;
    let commandId: string | null = null;

    if (result.type === "redirect") {
      navUrl = result.url;
      commandId = result.commandId;
    } else if (result.type === "typo") {
      const typo = result as unknown as TypoResult;
      navUrl = typo.correctedUrl;
      commandId = typo.suggestedCommand?.id ?? null;
    }

    if (navUrl && /^(https?|mailto|tel|file):/i.test(navUrl)) {
      // Save to history
      addHistory({ query: text, commandId, timestamp: Date.now() });

      switch (disposition) {
        case "currentTab": {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id != null) {
            await chrome.tabs.update(tab.id, { url: navUrl });
          }
          break;
        }
        case "newForegroundTab":
          chrome.tabs.create({ url: navUrl });
          break;
        case "newBackgroundTab":
          chrome.tabs.create({ url: navUrl, active: false });
          break;
      }
    }
  },
);

// Listen for messages from newtab/options pages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "getConfig") {
    getConfig().then((config) => sendResponse(config));
    return true;
  }
  if (message.type === "getIgnoreList") {
    // The config's BASELINE ignoreList only (normally empty). The user's own
    // ignore additions live device-local in local-ignore-store and are merged
    // at parse time — adding one must never write/dirty the config.
    getConfig().then((cfg) => sendResponse(cfg.ignoreList));
    return true;
  }
  if (message.type === "addHistory") {
    addHistory(message.value).then(() => sendResponse(true));
    return true;
  }
  if (message.type === "getHistory") {
    getHistory().then((history) => sendResponse(history));
    return true;
  }
  if (message.type === "clearHistory") {
    clearHistory().then(() => sendResponse(true));
    return true;
  }
  if (message.type === "refreshConfig") {
    fetchAndStoreConfig(false).then((result) => sendResponse(result));
    return true;
  }
  if (message.type === "openTab") {
    chrome.tabs.create({ url: message.url });
    return false;
  }
  if (message.type === "setConfig") {
    const cfg = message.config as FastTravelConfig;
    if (!isConfigUsable(cfg, "setConfig message")) {
      sendResponse({ ok: false, reason: "Config failed validation" });
      return true;
    }
    setConfig(cfg).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "resolvedTheme") {
    // Pages report their resolved light/dark theme so the toolbar icon can
    // follow "system" mode (which the worker can't resolve on its own).
    void setToolbarIcon(message.theme === "dark" ? "dark" : "light");
    return false;
  }
  if (message.type === "getConfigSourceState") {
    Promise.all([
      chrome.storage.local.get([CONFIG_URL_KEY, REFRESH_INTERVAL_KEY, LAST_SYNCED_KEY]),
      isDirty(),
    ]).then(([v, dirty]) => {
      // Report the *effective* URL (falling back to the built-in default) so the
      // options UI prefills an editable URL field like the Android app does,
      // rather than leaving it blank until the user imports one.
      const stored = (v[CONFIG_URL_KEY] as string | undefined)?.trim();
      sendResponse({
        url: stored && stored.length > 0 ? stored : DEFAULT_CONFIG_URL,
        interval: (v[REFRESH_INTERVAL_KEY] as string) ?? "daily",
        lastSynced: (v[LAST_SYNCED_KEY] as number | null) ?? null,
        dirty,
      });
    });
    return true;
  }
  if (message.type === "importFromUrl") {
    (async () => {
      await chrome.storage.local.set({
        [CONFIG_URL_KEY]: message.url,
        [REFRESH_INTERVAL_KEY]: message.interval,
      });
      const result = await fetchAndStoreConfig(true);
      await scheduleRefresh();
      sendResponse(result);
    })();
    return true;
  }
  if (message.type === "resetToRemote") {
    fetchAndStoreConfig(true).then(async (result) => {
      if (result.ok) await scheduleRefresh();
      sendResponse(result);
    });
    return true;
  }
});
