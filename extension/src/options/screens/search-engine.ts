import { el, screenHeader } from "../dom.js";
import { showSnackbar } from "../../ui/snackbar.js";

const SENTINEL_URL = "https://fast-travel-omnibox.invalid/search?q=%s";
const ENGINE_NAME = "Fast Travel";
const SUGGESTED_SHORTCUT = "ft2";
const SEARCH_ENGINE_ACTIVE_KEY = "fast-travel-search-engine-active";

type BrowserFamily = "chromium" | "firefox";

interface BrowserInfo {
  name: string;
  family: BrowserFamily;
  settingsUrl: string;
}

// userAgentData.brands always includes these regardless of the actual browser.
const CHROMIUM_GENERIC_BRAND = /^(not.{0,4}a.{0,4}brand|chromium)$/i;

// Brand names whose URL scheme doesn't follow `brand.toLowerCase().replace(/\s+/g, "")`.
const CHROMIUM_SCHEME_ALIASES: Record<string, string> = {
  "google chrome": "chrome",
  "microsoft edge": "edge",
};

// Browsers whose settings page lives at a path other than /settings/searchEngines.
const CHROMIUM_SETTINGS_PATH_OVERRIDES: Record<string, string> = {
  "vivaldi": "settings/search",
};

function chromiumSettingsUrl(brandName: string): string {
  const key = brandName.toLowerCase();
  const scheme = CHROMIUM_SCHEME_ALIASES[key] ?? key.replace(/\s+/g, "");
  const path = CHROMIUM_SETTINGS_PATH_OVERRIDES[scheme] ?? "settings/searchEngines";
  return `${scheme}://${path}`;
}

function chromiumBrandName(brands: { brand: string }[]): string {
  return brands.find(b => !CHROMIUM_GENERIC_BRAND.test(b.brand))?.brand ?? "Chrome";
}

function firefoxBrandName(ua: string): string {
  // Strip parenthesised platform/OS segments, then find any product token that
  // isn't part of the standard Gecko stack — that's the fork's own brand.
  const stripped = ua.replace(/\([^)]*\)/g, "");
  const GECKO_STACK = new Set(["Mozilla", "Gecko", "Firefox", "AppleWebKit", "Safari"]);
  const token = (stripped.match(/([A-Za-z][A-Za-z0-9]*)\/[\d.]+/g) ?? [])
    .map(t => t.split("/")[0])
    .find(t => !GECKO_STACK.has(t));
  return token ?? "Firefox";
}

async function detectBrowser(): Promise<BrowserInfo> {
  const ua = navigator.userAgent;

  // Firefox and its forks: userAgentData not yet available in Firefox.
  // All Gecko-based forks include "Firefox" in their UA.
  if (ua.includes("Firefox")) {
    return {
      name: firefoxBrandName(ua),
      family: "firefox",
      settingsUrl: "about:preferences#search",
    };
  }

  // Chromium family: userAgentData provides structured brand info from the
  // browser itself — no manual brand list needed.
  const uaData = (navigator as Navigator & {
    userAgentData?: { brands: { brand: string; version: string }[] };
  }).userAgentData;

  if (uaData?.brands) {
    const name = chromiumBrandName(uaData.brands);
    return { name, family: "chromium", settingsUrl: chromiumSettingsUrl(name) };
  }

  // Fallback: old Chromium build without userAgentData.
  return { name: "Chrome", family: "chromium", settingsUrl: "chrome://settings/searchEngines" };
}

export async function renderSearchEngine(main: HTMLElement): Promise<void> {
  main.appendChild(
    screenHeader(
      "Default search engine",
      "Route the address bar through Fast Travel.",
    ),
  );

  const stored = await chrome.storage.local.get(SEARCH_ENGINE_ACTIVE_KEY);
  const isActive = !!stored[SEARCH_ENGINE_ACTIVE_KEY];

  if (isActive) {
    const banner = el("section", { class: "card" });
    const body = el("div", { class: "card-body" });
    body.appendChild(
      el("p", { class: "form-hint" }, "✓ Fast Travel is your default search engine. Address-bar queries are being routed through Fast Travel."),
    );
    const resetBtn = el("button", { class: "secondary", style: "margin-top:8px" }, "Not using Fast Travel as default? Reset status");
    resetBtn.addEventListener("click", async () => {
      await chrome.storage.local.remove(SEARCH_ENGINE_ACTIVE_KEY);
      location.reload();
    });
    body.appendChild(resetBtn);
    banner.appendChild(body);
    main.appendChild(banner);
    return;
  }

  const browser = await detectBrowser();

  if (browser.family === "firefox") {
    renderFirefoxSetup(main, browser.name);
  } else {
    renderChromiumSetup(main, browser.name, browser.settingsUrl);
  }
}

function renderFirefoxSetup(main: HTMLElement, browserName: string): void {
  const card = el("section", { class: "card" });
  card.appendChild(el("div", { class: "card-header" }, "Set Fast Travel as your default"));
  const body = el("div", { class: "card-body" });

  body.appendChild(
    el("p", { class: "form-hint" },
      `Fast Travel is already registered as a search engine in ${browserName}. Open ${browserName}'s search settings and select it as your default.`,
    ),
  );

  const ol = document.createElement("ol");
  ol.className = "setup-steps";
  const steps: Array<HTMLElement | string> = [
    makeStep(
      "Copy the URL below and paste it into the address bar:",
      fieldList([["", "about:preferences#search"]]),
    ),
    makeStep("Under ", el("strong", null, "Default Search Engine"), ", open the dropdown and select ", el("strong", null, "Fast Travel"), "."),
    makeStep("Click ", el("strong", null, "I've set it up"), " below once done."),
  ];
  for (const s of steps) {
    const li = document.createElement("li");
    if (typeof s === "string") li.textContent = s;
    else li.appendChild(s);
    ol.appendChild(li);
  }
  body.appendChild(ol);

  const doneBtn = el("button", { class: "primary" }, "I've set it up");
  doneBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ [SEARCH_ENGINE_ACTIVE_KEY]: true });
    location.reload();
  });
  body.appendChild(doneBtn);

  body.appendChild(
    el("p", { class: "form-hint" },
      `Note: ${browserName} doesn't show live address-bar suggestions for custom engines. Press Enter to run your query through Fast Travel, or type the ft keyword for live command suggestions.`,
    ),
  );

  card.appendChild(body);
  main.appendChild(card);
}

function renderChromiumSetup(main: HTMLElement, browserName: string, settingsUrl: string): void {
  const card = el("section", { class: "card" });
  card.appendChild(el("div", { class: "card-header" }, "Set Fast Travel as your default"));
  const body = el("div", { class: "card-body" });

  body.appendChild(
    el("p", { class: "form-hint" },
      `${browserName} doesn't let extensions make themselves the default search engine automatically. Follow the steps below once — it takes about 30 seconds.`,
    ),
  );
  body.appendChild(
    el("p", { class: "form-hint" },
      `Note: ${browserName} doesn't show live address-bar suggestions for custom engines added this way. Press Enter to run your query through Fast Travel's command logic, or type the ft keyword for live command suggestions.`,
    ),
  );

  const actionRow = el("div", { class: "btn-row" });
  const openBtn = el("button", { class: "primary" }, `Copy URL & open ${browserName} search settings`);
  openBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(SENTINEL_URL);
      showSnackbar({ message: "Search URL copied — paste into the URL field in the dialog" });
    } catch {
      // ignore
    }
    chrome.tabs?.create?.({ url: settingsUrl });
  });
  actionRow.appendChild(openBtn);

  const doneBtn = el("button", { class: "secondary" }, "I've set it up");
  doneBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ [SEARCH_ENGINE_ACTIVE_KEY]: true });
    location.reload();
  });
  actionRow.appendChild(doneBtn);
  body.appendChild(actionRow);

  const ol = document.createElement("ol");
  ol.className = "setup-steps";
  const steps: Array<HTMLElement | string> = [
    `Click the button above — this opens ${browserName}'s search-engine settings and copies the URL you'll paste in step 3.`,
    makeStep("Scroll to ", el("strong", null, "Site search"), " and click ", el("strong", null, "Add"), "."),
    makeStep(
      "Fill the dialog (copy each field here):",
      fieldList([
        ["Name", ENGINE_NAME],
        ["Shortcut", SUGGESTED_SHORTCUT, "Can be anything unique. Avoid 'ft' — the extension already claims it."],
        ["URL with %s in place of query", SENTINEL_URL, "Already on your clipboard from step 1."],
      ]),
    ),
    makeStep("Click ", el("strong", null, "Add"), " in the dialog."),
    makeStep(
      "Find the new ",
      el("strong", null, "Fast Travel"),
      " row (under Site search) → click the ",
      el("strong", null, "⋮ menu"),
      " → ",
      el("strong", null, "Make default"),
      ".",
    ),
  ];
  for (const s of steps) {
    const li = document.createElement("li");
    if (typeof s === "string") li.textContent = s;
    else li.appendChild(s);
    ol.appendChild(li);
  }
  body.appendChild(ol);
  card.appendChild(body);
  main.appendChild(card);
}

function makeStep(...nodes: Array<string | HTMLElement>): HTMLElement {
  const span = document.createElement("span");
  for (const n of nodes) {
    if (typeof n === "string") span.appendChild(document.createTextNode(n));
    else span.appendChild(n);
  }
  return span;
}

function fieldList(fields: Array<[string, string] | [string, string, string]>): HTMLElement {
  const wrap = el("div", { class: "copy-fields" });
  for (const [label, value, hint] of fields) {
    const row = el("div", { class: "copy-field" });
    row.appendChild(el("div", { class: "copy-field-label" }, label));
    const valueRow = el("div", { class: "copy-field-value" });
    valueRow.appendChild(el("code", null, value));
    const copyBtn = el("button", { class: "copy-btn", type: "button" }, "Copy");
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(value);
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
      } catch {
        showSnackbar({ message: "Copy failed — select manually" });
      }
    });
    valueRow.appendChild(copyBtn);
    row.appendChild(valueRow);
    if (hint) row.appendChild(el("div", { class: "copy-field-hint" }, hint));
    wrap.appendChild(row);
  }
  return wrap;
}
