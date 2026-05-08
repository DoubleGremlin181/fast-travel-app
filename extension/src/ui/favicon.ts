/** Render a favicon with a monogram fallback. Mirrors Android's MonogramIcon:
 * when no iconUrl or the fetch fails, paint a colored circle with the first
 * character of the trigger, using the group's tint. */

import { resolveGroupTint, type GroupTint } from "./group-colors.js";

export interface FaviconOpts {
  iconUrl?: string;
  trigger: string;
  groupColor?: string;
  size?: number;
}

const ICON_CACHE_BUST_KEY = "fast-travel-icon-cache-bust";
let iconCacheBust: number | null = null;
let cacheBustResolved = false;

function applyCacheBust(url: string): string {
  if (!iconCacheBust) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_ftcb=${iconCacheBust}`;
}

const cacheBustReady: Promise<void> = (async () => {
  try {
    const v = await chrome.storage?.local?.get(ICON_CACHE_BUST_KEY);
    iconCacheBust = (v?.[ICON_CACHE_BUST_KEY] as number | null) ?? null;
  } catch {
    iconCacheBust = null;
  } finally {
    cacheBustResolved = true;
  }
})();

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes[ICON_CACHE_BUST_KEY]) {
    iconCacheBust = (changes[ICON_CACHE_BUST_KEY].newValue as number | null) ?? null;
  }
});

/** Attach a favicon image to `container`. On error, swap to a monogram. */
export function renderFavicon(container: HTMLElement, opts: FaviconOpts): void {
  const { iconUrl, trigger, groupColor, size = 20 } = opts;
  container.replaceChildren();
  const tint = resolveGroupTint(groupColor);

  if (iconUrl) {
    const img = document.createElement("img");
    img.alt = "";
    img.width = size;
    img.height = size;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      container.replaceChildren();
      paintMonogram(container, trigger, tint);
    });
    container.appendChild(img);
    if (cacheBustResolved) {
      img.src = applyCacheBust(iconUrl);
    } else {
      cacheBustReady.then(() => {
        img.src = applyCacheBust(iconUrl);
      });
    }
  } else {
    paintMonogram(container, trigger, tint);
  }
}

function paintMonogram(container: HTMLElement, trigger: string, tint: GroupTint): void {
  container.classList.add("monogram");
  container.style.background = tint.fill;
  container.style.color = tint.fg;
  const span = document.createElement("span");
  span.textContent = (trigger[0] ?? "?").toUpperCase();
  container.appendChild(span);
}
