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
    img.src = iconUrl;
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
