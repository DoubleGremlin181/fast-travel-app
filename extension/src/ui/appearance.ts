export type AppearanceMode = "light" | "dark" | "system";
export type AppearanceVariant =
    "material" | "material-you" | "material-you-tint"
  | "glass" | "gradient-blue" | "gradient-purple"
  | "neumorphism" | "amoled" | "transparent";
export type AppearanceShape = "pill" | "soft" | "rounded" | "square";

export interface AppearancePrefs {
    mode: AppearanceMode;
    variant: AppearanceVariant;
    shape: AppearanceShape;
    accent?: string;  // hex, only used when variant is material-you or material-you-tint
}

const STORAGE_KEY = "fast-travel-appearance";
const DEFAULTS: AppearancePrefs = { mode: "system", variant: "material", shape: "pill" };

// Remember the last applied mode so the OS-theme listener below only re-reports
// while "system" is active (explicit Light/Dark are reported by the worker's
// own storage listener).
let lastAppliedMode: AppearanceMode = DEFAULTS.mode;

/**
 * Tell the service worker which theme is active so it can pick the matching
 * toolbar icon (the worker can't read prefers-color-scheme itself). Best-effort:
 * a no-op outside an extension page or if the worker isn't listening.
 */
function reportResolvedTheme(theme: "light" | "dark"): void {
    try {
        void chrome.runtime?.sendMessage?.({ type: "resolvedTheme", theme })?.catch?.(() => {});
    } catch {
        // ignore — not in an extension context
    }
}

// Re-report when the OS theme flips while "system" mode is active.
try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        if (lastAppliedMode === "system") reportResolvedTheme(e.matches ? "dark" : "light");
    });
} catch {
    // ignore — no matchMedia (non-browser context)
}

/**
 * Mirror prefs to localStorage so the pre-paint shim (apply-theme.ts) can read
 * them synchronously before first paint — chrome.storage is async-only and would
 * paint the wrong theme first (FOUC). Page-only; wrapped because localStorage may
 * be unavailable (the shim then falls back to system via matchMedia).
 */
function mirrorToLocalStorage(prefs: AppearancePrefs): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // ignore — pre-paint falls back to system
    }
}

export async function getAppearance(): Promise<AppearancePrefs> {
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    return { ...DEFAULTS, ...(stored[STORAGE_KEY] ?? {}) };
}

export async function setAppearance(prefs: AppearancePrefs): Promise<void> {
    mirrorToLocalStorage(prefs);
    await chrome.storage.sync.set({ [STORAGE_KEY]: prefs });
}

export function subscribe(listener: (prefs: AppearancePrefs) => void): () => void {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === "sync" && changes[STORAGE_KEY]) {
            listener({ ...DEFAULTS, ...(changes[STORAGE_KEY].newValue ?? {}) });
        }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
}

export function applyAppearance(prefs: AppearancePrefs) {
    // Refresh the synchronous mirror every time prefs are applied (each page's
    // init applies the chrome.storage.sync source of truth), so the next page
    // load's pre-paint shim reads an up-to-date value.
    mirrorToLocalStorage(prefs);
    const html = document.documentElement;
    const resolvedMode = prefs.mode === "system"
        ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : prefs.mode;
    // AMOLED has a black body regardless of mode, so chip tints and surface
    // tokens must resolve to their dark-mode values for visual consistency.
    html.dataset.mode = prefs.variant === "amoled" ? "dark" : resolvedMode;
    html.dataset.variant = prefs.variant;
    html.dataset.shape = prefs.shape;

    // Keep the toolbar icon in sync with the applied theme (amoled counts as
    // dark, per dataset.mode above).
    lastAppliedMode = prefs.mode;
    reportResolvedTheme(html.dataset.mode === "dark" ? "dark" : "light");
    if (prefs.accent) html.style.setProperty("--custom-accent", prefs.accent);
    else html.style.removeProperty("--custom-accent");

    // Material You / Tint: regenerate the M3 palette from the accent. Fire-and-
    // forget to keep applyAppearance synchronous — the base dataset flip above
    // already happened, so the page renders with the variant's static overrides
    // immediately; the palette application below is purely additive and lands
    // a microtask later once material-you.ts is loaded.
    if ((prefs.variant === "material-you" || prefs.variant === "material-you-tint") && prefs.accent) {
        const resolved = html.dataset.mode === "dark" ? "dark" : "light";
        import("./material-you.js").then(m => m.applyMaterialYouPalette(prefs.accent!, resolved));
    }
}
