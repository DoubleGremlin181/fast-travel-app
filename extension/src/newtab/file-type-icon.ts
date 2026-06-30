/**
 * Per-file-type icon module for the local-search results view.
 *
 * Pure, side-effect-free exports (safe in Node/Vitest):
 *   fileTypeIconDescriptor — maps type+ext to a stable { iconId, fillVar, fgVar }
 *
 * DOM export (requires document):
 *   renderFileTypeIcon — populates a container element with a tinted icon,
 *                        mirroring the renderFavicon pattern in ui/favicon.ts.
 *
 * No external icon library is used — paths are inline Feather-compatible SVGs.
 */

import type { FileType } from "../core/companion-types.js";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Stable descriptor returned by fileTypeIconDescriptor.
 * Used by tests and by the DOM rendering helper.
 */
export interface FileTypeIconDescriptor {
  /** Matches the resolved FileType category (unknown → "other"). */
  iconId: FileType;
  /** CSS custom property for the tinted background (from tokens.css). */
  fillVar: string;
  /** CSS custom property for the icon foreground color (from tokens.css). */
  fgVar: string;
}

// ── Category → tint map ──────────────────────────────────────────────────────

/**
 * Per-category (fillVar, fgVar) pairs using the tint tokens from tokens.css.
 * One entry per FileType — deliberately exhaustive so TypeScript catches gaps.
 */
const TINT_MAP: Record<FileType, { fillVar: string; fgVar: string }> = {
  folder:   { fillVar: "var(--tint-amber-fill)",   fgVar: "var(--tint-amber-fg)" },
  image:    { fillVar: "var(--tint-green-fill)",   fgVar: "var(--tint-green-fg)" },
  video:    { fillVar: "var(--tint-purple-fill)",  fgVar: "var(--tint-purple-fg)" },
  audio:    { fillVar: "var(--tint-cyan-fill)",    fgVar: "var(--tint-cyan-fg)" },
  archive:  { fillVar: "var(--tint-orange-fill)",  fgVar: "var(--tint-orange-fg)" },
  code:     { fillVar: "var(--tint-blue-fill)",    fgVar: "var(--tint-blue-fg)" },
  document: { fillVar: "var(--tint-red-fill)",     fgVar: "var(--tint-red-fg)" },
  other:    { fillVar: "var(--tint-neutral-fill)", fgVar: "var(--tint-neutral-fg)" },
};

// ── Category → SVG path data ─────────────────────────────────────────────────

/**
 * Inline Feather-compatible SVG path data (24×24 viewBox).
 * The SVG wrapper is added at render time so tests can inspect just the paths.
 */
const SVG_PATHS: Record<FileType, string> = {
  folder:
    '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>' +
    '<circle cx="8.5" cy="8.5" r="1.5"/>' +
    '<polyline points="21 15 16 10 5 21"/>',
  video:
    '<polygon points="23 7 16 12 23 17 23 7"/>' +
    '<rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  audio:
    '<path d="M9 18V5l12-2v13"/>' +
    '<circle cx="6" cy="18" r="3"/>' +
    '<circle cx="18" cy="16" r="3"/>',
  archive:
    '<polyline points="21 8 21 21 3 21 3 8"/>' +
    '<rect x="1" y="3" width="22" height="5"/>' +
    '<line x1="10" y1="12" x2="14" y2="12"/>',
  code:
    '<polyline points="16 18 22 12 16 6"/>' +
    '<polyline points="8 6 2 12 8 18"/>',
  document:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="16" y1="13" x2="8" y2="13"/>' +
    '<line x1="16" y1="17" x2="8" y2="17"/>',
  other:
    '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>' +
    '<polyline points="13 2 13 9 20 9"/>',
};

// ── Pure function (exported + unit-tested) ────────────────────────────────────

/**
 * Return a stable descriptor for a file type (and optional extension).
 * Unknown types resolve to "other".  Currently type-level only; future
 * callers may refine by extension (e.g. ".py" within "code").
 *
 * Safe to call in Node/Vitest — no DOM access.
 */
export function fileTypeIconDescriptor(
  type: string,
  _ext?: string,
): FileTypeIconDescriptor {
  const resolved: FileType = (type in TINT_MAP) ? (type as FileType) : "other";
  const { fillVar, fgVar } = TINT_MAP[resolved];
  return { iconId: resolved, fillVar, fgVar };
}

// ── DOM helper ────────────────────────────────────────────────────────────────

/**
 * Populate `container` with a tinted SVG icon for the given file type.
 * Mirrors the renderFavicon(container, opts) pattern:
 *   - clears the container's children
 *   - applies tint colours as inline styles (background + color)
 *   - appends an SVG element that sizes itself to 60% of the container
 *
 * Container sizing is left to CSS (.ls-result-icon), so both list (32 px)
 * and grid (52 px) contexts work without extra JS.
 */
export function renderFileTypeIcon(
  container: HTMLElement,
  type: string,
  ext?: string,
): void {
  const { iconId, fillVar, fgVar } = fileTypeIconDescriptor(type, ext);
  container.replaceChildren();
  container.style.background = fillVar;
  container.style.color = fgVar;
  container.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" class="ls-type-icon-svg">' +
    SVG_PATHS[iconId] +
    "</svg>";
}
