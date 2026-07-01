import { parseCommand, buildTriggerMap } from "../core/parser.js";
import { fetchSuggestions } from "../core/suggestions.js";
import { detectDevice } from "../core/device.js";
import { resolveIconUrl } from "../core/icon.js";
import type {
  FastTravelConfig,
  TypoResult,
  Command,
  Group,
} from "../core/types.js";
import type { Suggestion } from "../core/suggestions.js";
import { resolveGroupTint } from "../ui/group-colors.js";
import { renderFavicon } from "../ui/favicon.js";
import { applyAppearance, getAppearance, subscribe as subscribeAppearance } from "../ui/appearance.js";
import {
  decrementCandidate,
  incrementCandidate,
  removeCandidate,
  loadCandidates,
  getAutoIgnoreThreshold,
  type AutoIgnoreStore,
} from "../core/auto-ignore-store.js";
import { effectiveIgnoreList } from "../core/effective-ignore-list.js";
import { addLocalIgnore, loadLocalIgnores } from "../core/local-ignore-store.js";
import { rankByFrecency } from "../core/frecency.js";

interface HistoryEntry {
  query: string;
  commandId: string | null;
  timestamp: number;
}

type SuggestionKind = "command" | "api" | "history";

interface SuggestionItem {
  text: string;
  display: string;
  kind: SuggestionKind;
  command?: Command;
  matchedTrigger?: string;
  timestamp?: number;
  iconUrl?: string;
  groupColor?: string;
}

interface ResolvedCommand {
  cmd: Command;
  groupColor?: string;
}

function flattenWithColors(cfg: FastTravelConfig): ResolvedCommand[] {
  const out: ResolvedCommand[] = [];
  function walk(groups: Group[], parentColor?: string): void {
    for (const group of groups) {
      const color = parentColor ?? group.color;
      if (group.commands) {
        for (const cmd of group.commands) out.push({ cmd, groupColor: color });
      }
      if (group.groups) walk(group.groups, color);
    }
  }
  walk(cfg.groups);
  return out;
}

function findCommandColor(cfg: FastTravelConfig, predicate: (c: Command) => boolean): string | undefined {
  for (const { cmd, groupColor } of flattenWithColors(cfg)) {
    if (predicate(cmd)) return groupColor;
  }
  return undefined;
}

function findResolvedById(cfg: FastTravelConfig, id: string | null): ResolvedCommand | null {
  if (!id) return null;
  for (const rc of flattenWithColors(cfg)) if (rc.cmd.id === id) return rc;
  return null;
}

function findResolvedByTrigger(cfg: FastTravelConfig, trigger: string): ResolvedCommand | null {
  const t = trigger.toLowerCase();
  for (const rc of flattenWithColors(cfg)) {
    if (rc.cmd.triggers.some((x) => x.toLowerCase() === t)) return rc;
  }
  return null;
}

// State
let config: FastTravelConfig | null = null;
// Recent usage history, fetched once at load and used to frecency-rank the
// empty-input quick chips.
let topChipHistory: HistoryEntry[] = [];
let permanentIgnoreList: string[] = [];
let localIgnores: string[] = [];
let candidates: AutoIgnoreStore = {};
let threshold = 3;
let currentTypo: TypoResult | null = null;
const device = detectDevice();

async function refreshIgnoreState(): Promise<void> {
  // Baseline ignoreList shipped in the config (normally empty) …
  permanentIgnoreList = (await chrome.runtime.sendMessage({ type: "getIgnoreList" })) ?? [];
  // … plus the user's device-local additions (never written to the config).
  localIgnores = await loadLocalIgnores();
  candidates = await loadCandidates();
  threshold = await getAutoIgnoreThreshold();
}

function currentEffectiveIgnoreList(): string[] {
  return effectiveIgnoreList(permanentIgnoreList, localIgnores, candidates, threshold);
}

// DOM
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const searchWrapper = document.getElementById("search-wrapper")!;
const suggestionsDropdown = document.getElementById("suggestions-dropdown")!;
const leadingIcon = document.getElementById("leading-icon")!;
const typoContainer = document.getElementById("typo-container")!;
const typoMessage = document.getElementById("typo-message")!;
const typoAccept = document.getElementById("typo-accept")!;
const typoSearch = document.getElementById("typo-search")!;
const typoIgnore = document.getElementById("typo-ignore")!;
const chipsSection = document.getElementById("chips-section")!;
const chipsContent = document.getElementById("chips-content")!;

const defaultLeadingIcon = leadingIcon.innerHTML;

const ONBOARDING_HINT_DISMISSED_KEY = "fast-travel-onboarding-hint-dismissed";
const SEARCH_ENGINE_ACTIVE_KEY = "fast-travel-search-engine-active";

// Toggle `.tail-visible` based on whether the element's content overflows.
// The class flips overflow to the start of the line so the tail (with a
// leading ellipsis) stays visible. Used by the search input on blur and by
// API suggestion rows on render / resize.
function applyTailVisible(el: HTMLElement): void {
  el.classList.toggle("tail-visible", el.scrollWidth > el.clientWidth);
}

function refreshTailVisibleAll(): void {
  applyTailVisible(searchInput);
  suggestionsDropdown
    .querySelectorAll<HTMLElement>(".suggestion-api .suggestion-text")
    .forEach(applyTailVisible);
}

// Re-evaluate overflow when the bar or dropdown is resized (e.g. window
// resize, dropdown open/close changing inner width).
const tailResizeObserver = new ResizeObserver(refreshTailVisibleAll);
tailResizeObserver.observe(searchInput);
tailResizeObserver.observe(suggestionsDropdown);

async function setupOnboardingHint(): Promise<void> {
  const hint = document.getElementById("onboarding-hint");
  const dismissBtn = document.getElementById("onboarding-hint-dismiss");
  if (!hint || !dismissBtn) return;
  const stored = await chrome.storage.local.get([ONBOARDING_HINT_DISMISSED_KEY, SEARCH_ENGINE_ACTIVE_KEY]);
  if (stored[ONBOARDING_HINT_DISMISSED_KEY] || stored[SEARCH_ENGINE_ACTIVE_KEY]) return;
  hint.classList.remove("hidden");
  dismissBtn.addEventListener("click", async () => {
    hint.classList.add("hidden");
    await chrome.storage.local.set({ [ONBOARDING_HINT_DISMISSED_KEY]: true });
  });
}

async function init(): Promise<void> {
  // Everything is wrapped so the page can NEVER be stranded on a blank/error tab:
  // whatever happens, the `finally` marks the page interactive (issue #44). The
  // "?q=" path is reached via the default-search context menu / omnibox, so a
  // thrown error or an un-navigable result must still leave a usable search bar.
  try {
    applyAppearance(await getAppearance());
    subscribeAppearance(applyAppearance);
    config = await chrome.runtime.sendMessage({ type: "getConfig" });
    await refreshIgnoreState();
    topChipHistory = (await chrome.runtime.sendMessage({ type: "getHistory" })) ?? [];

    // Omnibox search-provider path: ?q=<query> → resolve + navigate immediately.
    // The presence of ?q= proves Fast Travel is the active default search engine.
    const q = new URLSearchParams(window.location.search).get("q");
    if (q !== null) {
      chrome.storage.local.set({ [SEARCH_ENGINE_ACTIVE_KEY]: true });
    }
    if (q !== null && config) {
      const trimmed = q.trim();
      if (trimmed) {
        const result = parseCommand({
          rawQuery: trimmed,
          device,
          config,
          ignoreList: currentEffectiveIgnoreList(),
        });
        // Only navigate for a redirect whose scheme is allowed. A refused scheme
        // must NOT silently strand the page — fall through to the search bar.
        if (result.type === "redirect" && /^(https?|mailto|tel|file):/i.test(result.url)) {
          chrome.runtime.sendMessage({
            type: "addHistory",
            value: { query: trimmed, commandId: result.commandId, timestamp: Date.now() },
          });
          window.location.replace(result.url);
          return;
        }
        if (result.type === "typo") {
          history.replaceState(null, "", window.location.pathname);
          searchInput.value = trimmed;
          updateLeadingIcon(trimmed);
          if (config) renderQuickChips();
          showTypoSuggestion(result);
          return;
        }
        // Unresolvable / scheme-refused query: drop it into the search bar so the
        // user lands on a working page (not an error) and can retry.
        searchInput.value = trimmed;
        updateLeadingIcon(trimmed);
      }
      history.replaceState(null, "", window.location.pathname);
    }

    if (config) renderQuickChips();
    void setupOnboardingHint();
  } catch (e) {
    console.error("[fast-travel] newtab init failed:", e);
  } finally {
    markReady();
  }
}

// Signal that init() has finished loading config and the page is interactive.
// Pressing Enter before this resolves makes handleSearch() a no-op (config is
// null), so e2e tests must wait for [data-ft-ready] before submitting a query.
function markReady(): void {
  document.documentElement.dataset.ftReady = "1";
}

function focusSearchInput(): void {
  const grab = () => {
    if (!document.hasFocus()) return;
    if (document.activeElement === searchInput) return;
    searchInput.focus({ preventScroll: true });
  };
  grab();
  requestAnimationFrame(grab);
  setTimeout(grab, 50);

  // Re-grab when switching back to this tab or returning from the omnibox.
  window.addEventListener("focus", grab);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") grab();
  });

  // Type-anywhere: route printable keystrokes to the search bar when the page
  // has focus but a non-input element is active.
  document.addEventListener("keydown", (e) => {
    if (!document.hasFocus()) return;
    // Defer to the typo prompt while it's showing. This handler is registered at
    // module-eval time (via focusSearchInput()), so it runs BEFORE the typo
    // keydown handler. Without this guard it would re-focus the search box and
    // type the shortcut letter (y/g/i/n) — firing the input listener's hideTypo()
    // and clearing currentTypo before the typo handler ever sees the key, which
    // is why the typo shortcuts appeared dead.
    if (currentTypo) return;
    if (e.target === searchInput) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1) return;
    e.preventDefault();
    searchInput.focus({ preventScroll: true });
    const start = searchInput.selectionStart ?? searchInput.value.length;
    const end = searchInput.selectionEnd ?? searchInput.value.length;
    searchInput.value = searchInput.value.slice(0, start) + e.key + searchInput.value.slice(end);
    searchInput.selectionStart = searchInput.selectionEnd = start + 1;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// Start grabbing focus immediately — before init() awaits config/storage, which
// is the window where Chrome's omnibox otherwise wins the focus race.
focusSearchInput();

/** Pastel-tinted quick command chips under the search bar. Hidden while the
 * user is typing and while the suggestions dropdown is open. */
function renderQuickChips(): void {
  if (!config) return;
  chipsContent.replaceChildren();
  const resolved = flattenWithColors(config).filter(({ cmd }) => cmd.type === "standard");
  // Rank the standard commands by frecency (usage frequency + recency), most
  // relevant first; falls back to config order with no history. Shared with the
  // Android side via shared/test-fixtures/frecency.fixtures.json.
  const byId = new Map(resolved.map((rc) => [rc.cmd.id, rc]));
  const ranked = rankByFrecency(
    resolved.map((rc) => rc.cmd.id),
    topChipHistory,
    Date.now(),
  )
    .map((id) => byId.get(id))
    .filter((rc): rc is ResolvedCommand => rc !== undefined);
  for (const { cmd, groupColor } of ranked.slice(0, 8)) {
    const tint = resolveGroupTint(groupColor);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quick-chip";
    btn.style.background = tint.fill;
    btn.style.color = tint.fg;
    btn.title = cmd.name;

    const faviconEl = document.createElement("span");
    faviconEl.className = "quick-chip-favicon";
    renderFavicon(faviconEl, { iconUrl: resolveIconUrl(cmd, device), trigger: cmd.triggers[0], groupColor, size: 16 });
    btn.appendChild(faviconEl);

    const label = document.createElement("span");
    label.textContent = cmd.triggers[0];
    btn.appendChild(label);

    btn.addEventListener("click", () => {
      searchInput.value = cmd.triggers[0] + " ";
      searchInput.focus();
      showSuggestions(searchInput.value);
    });

    chipsContent.appendChild(btn);
  }
}

function updateChipsVisibility(): void {
  const hasText = searchInput.value.trim().length > 0;
  const dropdownOpen = !suggestionsDropdown.classList.contains("hidden");
  chipsSection.classList.toggle("hidden", hasText || dropdownOpen);
}

function handleSearch(): void {
  if (!config) return;
  const query = searchInput.value.trim();
  if (!query) return;

  const result = parseCommand({
    rawQuery: query,
    device,
    config,
    ignoreList: currentEffectiveIgnoreList(),
  });

  if (result.type === "redirect") {
    if (!/^(https?|mailto|tel|file):/i.test(result.url)) return;
    chrome.runtime.sendMessage({
      type: "addHistory",
      value: { query, commandId: result.commandId, timestamp: Date.now() },
    });
    window.location.href = result.url;
  } else if (result.type === "typo") {
    showTypoSuggestion(result);
  }
}

function showTypoSuggestion(typo: TypoResult): void {
  currentTypo = typo;
  typoContainer.classList.remove("hidden");
  typoMessage.textContent = "";
  typoMessage.append(
    "Did you mean ",
    Object.assign(document.createElement("strong"), { textContent: typo.suggestedTrigger }),
    ` (${typo.suggestedCommand.name})?`,
  );
  searchInput.blur();
}

function hideTypo(): void {
  currentTypo = null;
  typoContainer.classList.add("hidden");
  searchInput.focus();
}

async function acceptTypo(): Promise<void> {
  if (!currentTypo) return;
  const trigger = currentTypo.originalQuery.split(/\s+/)[0].toLowerCase();
  // Negative dismissal signal — user confirms the typo was right.
  await decrementCandidate(trigger);
  chrome.runtime.sendMessage({
    type: "addHistory",
    value: {
      query: currentTypo.originalQuery,
      commandId: currentTypo.suggestedCommand.id,
      timestamp: Date.now(),
    },
  });
  const url = currentTypo.correctedUrl;
  hideTypo();
  window.location.href = url;
}

async function defaultSearch(): Promise<void> {
  if (!currentTypo || !config) return;
  const query = currentTypo.originalQuery;
  chrome.runtime.sendMessage({
    type: "addHistory",
    value: { query, commandId: null, timestamp: Date.now() },
  });
  const trigger = query.split(/\s+/)[0].toLowerCase();
  // Positive dismissal signal — bump the counter. Auto-add is handled
  // implicitly by effectiveIgnoreList (Task 8 wires it at parse time).
  await incrementCandidate(trigger);
  candidates = await loadCandidates();
  // Force the typo'd trigger into the ignore list for this parse so the query is
  // searched verbatim on the user's default engine — never a hard-coded one.
  const fallback = parseCommand({
    rawQuery: query,
    device,
    config,
    ignoreList: [...currentEffectiveIgnoreList(), trigger],
  });
  if (fallback.type === "redirect") window.location.href = fallback.url;
}

async function ignoreTypo(): Promise<void> {
  if (!currentTypo) return;
  const trigger = currentTypo.originalQuery.split(/\s+/)[0].toLowerCase();
  // Add to the DEVICE-LOCAL ignore list (not the config) so a permanent ignore
  // never dirties the config or pauses remote auto-refresh. Drop any auto-ignore
  // candidate so the manual add wins.
  await addLocalIgnore(trigger);
  localIgnores = await loadLocalIgnores();
  await removeCandidate(trigger);
  candidates = await loadCandidates();
  hideTypo();
  handleSearch();
}

/** Leading icon: magnifier by default, swap to command favicon when the first
 * token matches a known trigger. Reverts when the trigger no longer matches. */
function updateLeadingIcon(query: string): void {
  if (!config) return;
  const first = query.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!first) {
    resetLeadingIcon();
    return;
  }
  const rc = findResolvedByTrigger(config, first);
  if (!rc) {
    resetLeadingIcon();
    return;
  }
  leadingIcon.classList.add("is-command");
  leadingIcon.replaceChildren();
  renderFavicon(leadingIcon, {
    iconUrl: resolveIconUrl(rc.cmd, device),
    trigger: rc.cmd.triggers[0],
    groupColor: rc.groupColor,
    size: 22,
  });
}

function resetLeadingIcon(): void {
  if (!leadingIcon.classList.contains("is-command")) return;
  leadingIcon.classList.remove("is-command");
  leadingIcon.removeAttribute("style");
  leadingIcon.innerHTML = defaultLeadingIcon;
}

function hideSuggestions(): void {
  suggestionsDropdown.classList.add("hidden");
  searchWrapper.classList.remove("dropdown-open");
  activeSuggestionIndex = -1;
  updateChipsVisibility();
}

let suggestionTimer: ReturnType<typeof setTimeout> | null = null;
let activeSuggestionIndex = -1;
// The items backing the currently-rendered suggestion rows, and the user's
// originally-typed text captured when arrow-key navigation begins (so Esc or
// arrowing back above the first row can restore it).
let currentSuggestionItems: SuggestionItem[] = [];
let typedText = "";

async function showHistory(): Promise<void> {
  if (!config) return;
  const history: HistoryEntry[] = await chrome.runtime.sendMessage({ type: "getHistory" });
  if (!history || history.length === 0) return;

  const seen = new Set<string>();
  const items: SuggestionItem[] = history
    .filter((h) => {
      if (seen.has(h.query)) return false;
      seen.add(h.query);
      return true;
    })
    .slice(0, 8)
    .map((h) => {
      const rc = findResolvedById(config!, h.commandId);
      return {
        text: h.query,
        display: h.query,
        kind: "history",
        timestamp: h.timestamp,
        iconUrl: rc ? resolveIconUrl(rc.cmd, device) : undefined,
        groupColor: rc?.groupColor,
        command: rc?.cmd,
      };
    });

  renderSuggestions(items, true);
}

function showSuggestions(query: string): void {
  updateLeadingIcon(query);
  if (suggestionTimer) {
    clearTimeout(suggestionTimer);
    suggestionTimer = null;
  }
  if (!config || !query.trim()) {
    if (!query.trim() && document.activeElement === searchInput) {
      showHistory();
    } else {
      hideSuggestions();
    }
    return;
  }

  const triggerMap = buildTriggerMap(config);
  const parts = query.trim().split(/\s+/);
  const partial = parts[0].toLowerCase();
  const commandItems: SuggestionItem[] = [];

  if (parts.length === 1) {
    for (const [trigger, cmd] of triggerMap) {
      if (cmd.type === "prefix") continue;
      if (trigger.startsWith(partial) && trigger !== partial) {
        const groupColor = findCommandColor(config, (c) => c.id === cmd.id);
        commandItems.push({
          text: trigger + " ",
          display: `${trigger} — ${cmd.name}`,
          kind: "command",
          command: cmd,
          matchedTrigger: trigger,
          iconUrl: resolveIconUrl(cmd, device),
          groupColor,
        });
      }
      if (commandItems.length >= 3) break;
    }
  }

  // Only render synchronously when we have new content to show. If the
  // dropdown is already populated and the new query produces no immediate
  // command matches (e.g. multi-word query, or after clicking the populate
  // arrow), keep the existing items in place until the API response lands
  // a few hundred ms later. Avoids a hide/show flicker on bursty typing
  // and on populate-button clicks.
  const dropdownVisible = !suggestionsDropdown.classList.contains("hidden");
  if (commandItems.length > 0 || !dropdownVisible) {
    renderSuggestions(commandItems);
  }

  suggestionTimer = setTimeout(async () => {
    if (!config) return;
    try {
      const apiSuggestions = await fetchSuggestions(query, config);
      if (searchInput.value !== query) return;
      const apiItems: SuggestionItem[] = apiSuggestions.slice(0, 5).map((s: Suggestion) => {
        const groupColor = s.commandTrigger
          ? findCommandColor(config!, (c) => c.triggers.includes(s.commandTrigger!))
          : undefined;
        const cmd = s.commandTrigger ? triggerMap.get(s.commandTrigger.toLowerCase()) : undefined;
        return {
          text: s.text,
          display: s.displayText,
          kind: "api",
          command: cmd,
          matchedTrigger: s.commandTrigger ?? undefined,
          iconUrl: cmd ? resolveIconUrl(cmd, device) : undefined,
          groupColor,
        };
      });
      renderSuggestions([...commandItems, ...apiItems]);
    } catch {
      // keep command-only list
    }
  }, 240);
}

function formatTimestamp(ts?: number): string {
  if (!ts) return "";
  const date = new Date(ts);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function arrowIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "suggestion-trailing-arrow");
  svg.setAttribute("aria-hidden", "true");
  // NW-pointing arrow (matches Android, where ArrowOutward is rotated -90°).
  // Shaft: bottom-right → top-left. Head corner at (7,7) extends along the
  // top and left edges of the bounding box.
  svg.innerHTML = '<path d="M17 17L7 7"/><path d="M17 7H7V17"/>';
  return svg;
}

// Trailing populate-only button: fills the search input with the suggestion's
// text without submitting, mirroring the IconButton on Android. The row's
// own click handler still searches; this button stops propagation so a click
// on the arrow doesn't also fire the row click.
function populateButton(text: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "suggestion-populate-btn";
  btn.setAttribute("aria-label", "Populate search bar");
  btn.appendChild(arrowIcon());
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    searchInput.value = text;
    searchInput.focus();
    showSuggestions(text);
    updateLeadingIcon(text);
    updateChipsVisibility();
  });
  return btn;
}

function renderSuggestions(items: SuggestionItem[], showClearHistory = false): void {
  if (items.length === 0 && !showClearHistory) {
    hideSuggestions();
    return;
  }

  suggestionsDropdown.replaceChildren();
  searchWrapper.classList.add("dropdown-open");
  activeSuggestionIndex = -1;
  currentSuggestionItems = items;

  let lastKind: SuggestionKind | "" = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (lastKind && lastKind !== item.kind) {
      const sep = document.createElement("div");
      sep.className = "suggestion-separator";
      suggestionsDropdown.appendChild(sep);
    }
    lastKind = item.kind;

    const el = document.createElement("div");
    el.className = `suggestion-item suggestion-${item.kind}`;
    el.dataset.index = String(i);
    el.setAttribute("role", "option");

    const favicon = document.createElement("div");
    favicon.className = "suggestion-favicon";
    renderFavicon(favicon, {
      iconUrl: item.iconUrl,
      trigger: item.matchedTrigger ?? item.command?.triggers[0] ?? item.display.charAt(0),
      groupColor: item.groupColor,
      size: 20,
    });
    el.appendChild(favicon);

    if (item.kind === "history") {
      const text = document.createElement("span");
      text.className = "suggestion-history-text";
      text.textContent = item.display;
      el.appendChild(text);

      const time = document.createElement("span");
      time.className = "suggestion-history-time";
      time.textContent = formatTimestamp(item.timestamp);
      el.appendChild(time);
      el.appendChild(populateButton(item.text));
    } else if (item.kind === "command") {
      const tint = resolveGroupTint(item.groupColor);
      const trigger = document.createElement("span");
      trigger.className = "suggestion-trigger";
      trigger.textContent = item.matchedTrigger ?? item.command?.triggers[0] ?? "";
      trigger.style.color = tint.fg;
      el.appendChild(trigger);

      const name = document.createElement("span");
      name.className = "suggestion-cmd-name";
      name.textContent = item.command?.name ?? "";
      el.appendChild(name);
    } else {
      const text = document.createElement("span");
      text.className = "suggestion-text";
      text.textContent = item.display;
      el.appendChild(text);
      el.appendChild(populateButton(item.text));
    }

    el.addEventListener("click", () => {
      searchInput.value = item.text;
      hideSuggestions();
      if (item.kind === "command") {
        searchInput.focus();
        updateLeadingIcon(item.text);
      } else {
        handleSearch();
      }
    });

    suggestionsDropdown.appendChild(el);
  }

  if (showClearHistory && items.length > 0) {
    const sep = document.createElement("div");
    sep.className = "suggestion-separator";
    suggestionsDropdown.appendChild(sep);

    const clearEl = document.createElement("button");
    clearEl.type = "button";
    clearEl.className = "suggestion-clear-history";
    clearEl.textContent = "Clear history";
    clearEl.addEventListener("click", async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({ type: "clearHistory" });
      hideSuggestions();
    });
    suggestionsDropdown.appendChild(clearEl);
  }

  suggestionsDropdown.classList.remove("hidden");
  updateChipsVisibility();

  // Mark API suggestion rows that overflow so they show the tail with a
  // leading ellipsis. History rows intentionally keep head-first ellipsis,
  // and command rows show head-first (the cmd-name CSS handles that).
  // rAF lets layout settle before measuring scrollWidth.
  requestAnimationFrame(() => {
    suggestionsDropdown
      .querySelectorAll<HTMLElement>(".suggestion-api .suggestion-text")
      .forEach(applyTailVisible);
  });
}

// Keyboard navigation — omnibox model:
//   ↑/↓  move the highlight and autofill the input with the highlighted
//        suggestion (caret at end); arrowing back above the first row restores
//        the originally-typed text. Continuing to type refines from there.
//   Enter same as clicking the row (kind-aware): a command fills + keeps
//        editing; an engine/history suggestion searches. No selection → search
//        the typed text.
//   Tab   accept + keep editing for any kind (fills the box, never searches),
//        so you can refine before pressing Enter. No selection → completes the
//        top suggestion.
//   Esc   restore the originally-typed text and close the dropdown.
searchInput.addEventListener("keydown", (e) => {
  const items = suggestionsDropdown.querySelectorAll<HTMLElement>(".suggestion-item");
  if (e.key === "ArrowDown" && items.length > 0) {
    e.preventDefault();
    if (activeSuggestionIndex === -1) typedText = searchInput.value;
    activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
    updateActiveSuggestion(items);
    autofillFromActive(items);
  } else if (e.key === "ArrowUp" && items.length > 0) {
    e.preventDefault();
    if (activeSuggestionIndex === -1) typedText = searchInput.value;
    activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, -1);
    updateActiveSuggestion(items);
    autofillFromActive(items);
  } else if (e.key === "Tab" && items.length > 0) {
    e.preventDefault();
    const idx = activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0;
    acceptSuggestion(currentSuggestionItems[idx]);
  } else if (e.key === "Enter") {
    if (activeSuggestionIndex >= 0 && items.length > 0) {
      items[activeSuggestionIndex].click();
    } else {
      hideSuggestions();
      handleSearch();
    }
  } else if (e.key === "Escape") {
    if (activeSuggestionIndex >= 0) restoreTypedText();
    hideSuggestions();
    if (currentTypo) hideTypo();
  }
});

function updateActiveSuggestion(items: NodeListOf<HTMLElement>): void {
  items.forEach((item, i) => item.classList.toggle("active", i === activeSuggestionIndex));
}

// Sets the input value and places the caret at the end (so type-ahead appends).
function setInputValue(value: string): void {
  searchInput.value = value;
  searchInput.setSelectionRange(value.length, value.length);
}

// Reflects the highlighted row into the input. When arrowed back above the
// first row (index -1) it restores the originally-typed text. Uses each item's
// `text` field, which for commands already carries a trailing space (e.g.
// "g "), so typing ahead continues the command as "g <query>".
function autofillFromActive(items: NodeListOf<HTMLElement>): void {
  if (activeSuggestionIndex === -1) {
    restoreTypedText();
    return;
  }
  const item = currentSuggestionItems[activeSuggestionIndex];
  if (!item) return;
  setInputValue(item.text);
  updateLeadingIcon(item.text);
  items[activeSuggestionIndex]?.scrollIntoView({ block: "nearest" });
}

function restoreTypedText(): void {
  setInputValue(typedText);
  updateLeadingIcon(typedText);
}

// Tab behaviour: fill the box with the suggestion and keep editing (mirrors a
// command row's click), regardless of kind — never submits a search.
function acceptSuggestion(item: SuggestionItem | undefined): void {
  if (!item) return;
  setInputValue(item.text);
  hideSuggestions();
  searchInput.focus();
  updateLeadingIcon(item.text);
  updateChipsVisibility();
}

searchInput.addEventListener("input", () => {
  if (currentTypo) hideTypo();
  showSuggestions(searchInput.value);
  updateChipsVisibility();
});

searchInput.addEventListener("focus", () => {
  searchInput.classList.remove("tail-visible");
  if (!searchInput.value.trim()) showHistory();
});

searchInput.addEventListener("blur", () => {
  // Chrome resets scrollLeft to 0 after blur (before rAF) so scrollLeft=scrollWidth
  // doesn't persist; the .tail-visible class is the durable equivalent.
  applyTailVisible(searchInput);
});

// Typo-prompt shortcuts. The type-anywhere handler defers to these while a typo
// is showing (see focusSearchInput), so the search box stays blurred and these
// keys reach here. "g" and "n" both decline the suggestion and fall back to the
// user's default engine (defaultSearch) — "n" ("no") is the engine-agnostic alias
// and is intentionally not advertised in the UI.
document.addEventListener("keydown", (e) => {
  if (!currentTypo) return;
  if (e.key === "y" || e.key === "Y") {
    e.preventDefault();
    void acceptTypo();
  } else if (e.key === "g" || e.key === "G" || e.key === "n" || e.key === "N") {
    e.preventDefault();
    void defaultSearch();
  } else if (e.key === "i" || e.key === "I") {
    e.preventDefault();
    void ignoreTypo();
  } else if (e.key === "Escape") {
    hideTypo();
  }
});

typoAccept.addEventListener("click", () => void acceptTypo());
typoSearch.addEventListener("click", () => void defaultSearch());
typoIgnore.addEventListener("click", () => void ignoreTypo());

document.addEventListener("click", (e) => {
  if (
    !searchInput.contains(e.target as Node) &&
    !suggestionsDropdown.contains(e.target as Node)
  ) {
    hideSuggestions();
  }
});

// init() handles its own errors and always marks the page ready, but guard the
// call site too so a rejection can never surface as an unhandled error.
void init().catch((e) => console.error("[fast-travel] newtab init rejected:", e));
