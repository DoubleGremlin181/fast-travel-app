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
