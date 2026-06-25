/**
 * Pre-paint theme shim. Loaded as a render-blocking *classic* script (NOT a
 * module — see newtab/options/popup HTML) so it executes synchronously before
 * first paint, preventing a theme flash (FOUC) in either direction.
 *
 * chrome.storage is async-only and can't be read before paint, so this reads the
 * synchronous localStorage mirror written by appearance.ts (setAppearance /
 * applyAppearance). "system" mode resolves via matchMedia. The full source of
 * truth (chrome.storage.sync) is reconciled a moment later by each page's init
 * (applyAppearance), which also refreshes the mirror.
 *
 * Kept self-contained (no imports) so esbuild emits it as a standalone IIFE that
 * a classic <script> can load (MV3 CSP `script-src 'self'` forbids inline). The
 * dataset logic mirrors applyAppearance() in appearance.ts — keep them in sync.
 */
(() => {
    try {
        const raw = localStorage.getItem("fast-travel-appearance");
        const p = raw ? JSON.parse(raw) : null;
        const mode: string = p?.mode ?? "system";
        const variant: string = p?.variant ?? "material";
        const shape: string = p?.shape ?? "pill";
        const dark =
            mode === "system"
                ? matchMedia("(prefers-color-scheme: dark)").matches
                : mode === "dark";
        const el = document.documentElement;
        // AMOLED is a dark variant regardless of resolved mode (see appearance.ts).
        el.dataset.mode = variant === "amoled" ? "dark" : dark ? "dark" : "light";
        el.dataset.variant = variant;
        el.dataset.shape = shape;
        if (p?.accent) el.style.setProperty("--custom-accent", p.accent);
    } catch {
        // Fall back to the CSS :root defaults (light). The Material-You accent
        // palette (if any) is applied later, additively, by applyAppearance().
    }
})();
