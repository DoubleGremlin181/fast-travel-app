/**
 * Applied to <html> before first paint to avoid FOUC.
 *
 * Reads the session-mirrored appearance prefs (populated by the service worker
 * from chrome.storage.sync on install/startup/change) and applies them.
 */
import type { AppearancePrefs } from "./appearance.js";

(async () => {
    try {
        const session = await chrome.storage.session.get("fast-travel-appearance");
        const { applyAppearance } = await import("./appearance.js");
        const defaults: AppearancePrefs = { mode: "system", variant: "material", shape: "pill" };
        applyAppearance({ ...defaults, ...(session["fast-travel-appearance"] ?? {}) });
    } catch {
        // Fallback to defaults — applyAppearance has defaults
    }
})();
