import {
  applyAppearance,
  getAppearance,
  setAppearance,
  type AppearanceMode,
  type AppearancePrefs,
  type AppearanceShape,
  type AppearanceVariant,
} from "../../ui/appearance.js";
import { el, card, screenHeader } from "../dom.js";

const THEME_OPTIONS: { value: AppearanceMode; title: string; desc: string }[] = [
  { value: "light", title: "Light", desc: "Always use the light theme." },
  { value: "dark", title: "Dark", desc: "Always use the dark theme." },
  { value: "system", title: "System", desc: "Follow your OS / browser setting." },
];

const SHAPE_OPTIONS: { value: AppearanceShape; title: string; desc: string }[] = [
  { value: "pill", title: "Pill", desc: "Fully rounded (default)." },
  { value: "soft", title: "Soft", desc: "Medium rounded corners." },
  { value: "rounded", title: "Rounded", desc: "Moderately rounded corners." },
  { value: "square", title: "Square", desc: "Barely-rounded corners." },
];

const VARIANT_OPTIONS: { value: AppearanceVariant; title: string; desc: string }[] = [
  { value: "material", title: "Material", desc: "Classic Material 3 surfaces." },
  { value: "material-you", title: "Material You", desc: "Dynamic palette from your accent." },
  { value: "material-you-tint", title: "Material You Tint", desc: "Soft accent-tinted search bar." },
  { value: "glass", title: "Glass", desc: "Blurred translucent chrome." },
  { value: "gradient-blue", title: "Gradient Blue", desc: "Denim blue diagonal gradient." },
  { value: "gradient-purple", title: "Gradient Purple", desc: "Magenta → purple gradient." },
  { value: "neumorphism", title: "Neumorphism", desc: "Soft inset shadows." },
  { value: "amoled", title: "AMOLED", desc: "Pure-black background for OLED screens." },
  { value: "transparent", title: "Transparent", desc: "Outlined bar over any wallpaper." },
];

const ACCENT_VARIANTS: AppearanceVariant[] = ["material-you", "material-you-tint"];
const DEFAULT_ACCENT = "#3E6098";

// Preview-only radius lookup. The live search bar pulls its radius from the
// [data-shape] selector in tokens.css; this map is just so the options preview
// can mirror the selection without waiting for a stylesheet reload.
const PREVIEW_RADII: Record<AppearanceShape, string> = {
  pill: "999px",
  soft: "20px",
  rounded: "16px",
  square: "8px",
};

export async function renderAppearance(main: HTMLElement): Promise<void> {
  main.appendChild(screenHeader("Appearance", "Theme, variant, and search-bar styling for the new tab page."));

  let prefs = await getAppearance();

  // Storage writes are debounced so dragging the native color picker doesn't
  // fire a chrome.storage.sync.set on every pointermove — the live
  // applyAppearance call still updates the UI immediately.
  let writeTimer: number | undefined;
  const scheduleWrite = (next: AppearancePrefs) => {
    prefs = next;
    applyAppearance(next);
    if (writeTimer !== undefined) clearTimeout(writeTimer);
    writeTimer = window.setTimeout(() => {
      void setAppearance(next);
      writeTimer = undefined;
    }, 150);
  };

  // --- Theme mode ---
  const themeGroup = el("div", { class: "radio-group" });
  for (const opt of THEME_OPTIONS) {
    const cls = opt.value === prefs.mode ? "radio-card selected" : "radio-card";
    const optionCard = el(
      "label",
      { class: cls, "data-value": opt.value },
      el("input", { type: "radio", name: "theme", value: opt.value }),
      el("div", { class: "radio-card-title" }, opt.title),
      el("div", { class: "radio-card-desc" }, opt.desc),
    );
    optionCard.addEventListener("click", (e) => {
      e.preventDefault();
      scheduleWrite({ ...prefs, mode: opt.value });
      themeGroup.querySelectorAll<HTMLElement>(".radio-card").forEach((c) => {
        c.classList.toggle("selected", c.getAttribute("data-value") === opt.value);
      });
    });
    themeGroup.appendChild(optionCard);
  }
  const themeHint = el("div", { class: "card-hint" }, "This style is always dark.");
  const themeCard = card("Theme mode", themeGroup);
  themeCard.appendChild(themeHint);
  main.appendChild(themeCard);

  // --- Variant ---
  const variantGroup = el("div", { class: "variant-group" });
  for (const opt of VARIANT_OPTIONS) {
    const cls = opt.value === prefs.variant ? "variant-card selected" : "variant-card";
    const thumb = el("div", { class: "variant-thumb", "data-variant": opt.value, "data-mode": resolvedMode(prefs.mode) });
    thumb.appendChild(el("div", { class: "variant-thumb-bar" }));
    const optionCard = el(
      "label",
      { class: cls, "data-value": opt.value },
      el("input", { type: "radio", name: "variant", value: opt.value }),
      thumb,
      el("div", { class: "variant-card-title" }, opt.title),
      el("div", { class: "variant-card-desc" }, opt.desc),
    );
    optionCard.addEventListener("click", (e) => {
      e.preventDefault();
      const next: AppearancePrefs = { ...prefs, variant: opt.value };
      if (ACCENT_VARIANTS.includes(opt.value) && !next.accent) next.accent = DEFAULT_ACCENT;
      scheduleWrite(next);
      variantGroup.querySelectorAll<HTMLElement>(".variant-card").forEach((c) => {
        c.classList.toggle("selected", c.getAttribute("data-value") === opt.value);
      });
      updateAccentVisibility(opt.value);
      updateThemeModeDisabled(opt.value);
    });
    variantGroup.appendChild(optionCard);
  }
  main.appendChild(card("Variant", variantGroup));

  // --- Accent (conditional) ---
  const accentInput = el("input", {
    type: "color",
    class: "accent-picker",
    value: prefs.accent ?? DEFAULT_ACCENT,
  }) as HTMLInputElement;
  const accentValue = el("code", { class: "accent-value" }, (prefs.accent ?? DEFAULT_ACCENT).toUpperCase());
  const accentRow = el(
    "div",
    { class: "accent-row" },
    accentInput,
    accentValue,
    el(
      "div",
      { class: "accent-hint" },
      "Used to generate the Material You palette for your new tab page.",
    ),
  );
  accentInput.addEventListener("input", () => {
    const hex = accentInput.value;
    accentValue.textContent = hex.toUpperCase();
    scheduleWrite({ ...prefs, accent: hex });
  });
  const accentCard = card("Accent color", accentRow);
  accentCard.classList.add("accent-card");
  main.appendChild(accentCard);

  function updateAccentVisibility(variant: AppearanceVariant) {
    accentCard.style.display = ACCENT_VARIANTS.includes(variant) ? "" : "none";
  }
  updateAccentVisibility(prefs.variant);

  function updateThemeModeDisabled(variant: AppearanceVariant) {
    const disabled = variant === "amoled";
    themeGroup.querySelectorAll<HTMLElement>(".radio-card").forEach((c) => {
      c.classList.toggle("disabled", disabled);
    });
    themeHint.style.display = disabled ? "" : "none";
  }
  updateThemeModeDisabled(prefs.variant);

  // --- Search-bar shape ---
  const shapeGroup = el("div", { class: "radio-group" });
  const preview = el("div", { class: "appearance-preview" });
  const previewBar = el(
    "div",
    { class: "appearance-preview-bar" },
    el(
      "div",
      { class: "appearance-preview-icon" },
      svgIcon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
    ),
    el("div", { class: "appearance-preview-text" }, "Search or type a command…"),
  );
  preview.appendChild(previewBar);
  applyPreviewShape(previewBar, prefs.shape);

  for (const opt of SHAPE_OPTIONS) {
    const cls = opt.value === prefs.shape ? "radio-card selected" : "radio-card";
    const optionCard = el(
      "label",
      { class: cls, "data-value": opt.value },
      el("input", { type: "radio", name: "search-shape", value: opt.value }),
      el("div", { class: "radio-card-title" }, opt.title),
      el("div", { class: "radio-card-desc" }, opt.desc),
    );
    optionCard.addEventListener("click", (e) => {
      e.preventDefault();
      scheduleWrite({ ...prefs, shape: opt.value });
      applyPreviewShape(previewBar, opt.value);
      shapeGroup.querySelectorAll<HTMLElement>(".radio-card").forEach((c) => {
        c.classList.toggle("selected", c.getAttribute("data-value") === opt.value);
      });
    });
    shapeGroup.appendChild(optionCard);
  }

  const shapeCard = el("section", { class: "card" });
  shapeCard.appendChild(el("div", { class: "card-header" }, "Search-bar shape"));
  shapeCard.appendChild(preview);
  shapeCard.appendChild(shapeGroup);
  main.appendChild(shapeCard);
}

function resolvedMode(mode: AppearanceMode): "light" | "dark" {
  if (mode === "system") return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return mode;
}

function applyPreviewShape(bar: HTMLElement, shape: AppearanceShape): void {
  bar.style.borderRadius = PREVIEW_RADII[shape];
}

function svgIcon(inner: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = inner;
  return svg;
}
