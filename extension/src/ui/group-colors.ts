/** Resolve a group's hex color into a (fill, foreground) token pair.
 * Mirrors the Android app's GroupColorPalette: canonical brand colors map to
 * curated pastel tokens; anything else falls through to a neutral pair.
 */

export interface GroupTint {
  fill: string;
  fg: string;
}

const NEUTRAL: GroupTint = {
  fill: "var(--tint-neutral-fill)",
  fg: "var(--tint-neutral-fg)",
};

const CANONICAL: Record<string, GroupTint> = {
  "#4285f4": { fill: "var(--tint-blue-fill)", fg: "var(--tint-blue-fg)" },
  "#2563eb": { fill: "var(--tint-blue-fill)", fg: "var(--tint-blue-fg)" },
  "#1a73e8": { fill: "var(--tint-blue-fill)", fg: "var(--tint-blue-fg)" },
  "#db4437": { fill: "var(--tint-red-fill)", fg: "var(--tint-red-fg)" },
  "#ea4335": { fill: "var(--tint-red-fill)", fg: "var(--tint-red-fg)" },
  "#dc2626": { fill: "var(--tint-red-fill)", fg: "var(--tint-red-fg)" },
  "#0f9d58": { fill: "var(--tint-green-fill)", fg: "var(--tint-green-fg)" },
  "#137333": { fill: "var(--tint-green-fill)", fg: "var(--tint-green-fg)" },
  "#16a34a": { fill: "var(--tint-green-fill)", fg: "var(--tint-green-fg)" },
  "#f57c00": { fill: "var(--tint-orange-fill)", fg: "var(--tint-orange-fg)" },
  "#ea580c": { fill: "var(--tint-orange-fill)", fg: "var(--tint-orange-fg)" },
  "#ff9800": { fill: "var(--tint-orange-fill)", fg: "var(--tint-orange-fg)" },
  "#fbbc04": { fill: "var(--tint-amber-fill)", fg: "var(--tint-amber-fg)" },
  "#f9ab00": { fill: "var(--tint-amber-fill)", fg: "var(--tint-amber-fg)" },
  "#eab308": { fill: "var(--tint-amber-fill)", fg: "var(--tint-amber-fg)" },
  "#7c3aed": { fill: "var(--tint-purple-fill)", fg: "var(--tint-purple-fg)" },
  "#9c27b0": { fill: "var(--tint-purple-fill)", fg: "var(--tint-purple-fg)" },
  "#a855f7": { fill: "var(--tint-purple-fill)", fg: "var(--tint-purple-fg)" },
  "#0891b2": { fill: "var(--tint-cyan-fill)", fg: "var(--tint-cyan-fg)" },
  "#06b6d4": { fill: "var(--tint-cyan-fill)", fg: "var(--tint-cyan-fg)" },
  "#be185d": { fill: "var(--tint-pink-fill)", fg: "var(--tint-pink-fg)" },
  "#ec4899": { fill: "var(--tint-pink-fill)", fg: "var(--tint-pink-fg)" },
};

/** Semantic bucket names so heuristics can target related hues. */
const HUE_BUCKETS: { name: keyof typeof BUCKET_TINT; hueMin: number; hueMax: number }[] = [
  { name: "red", hueMin: 345, hueMax: 360 },
  { name: "red", hueMin: 0, hueMax: 15 },
  { name: "orange", hueMin: 16, hueMax: 45 },
  { name: "amber", hueMin: 46, hueMax: 65 },
  { name: "green", hueMin: 66, hueMax: 165 },
  { name: "cyan", hueMin: 166, hueMax: 200 },
  { name: "blue", hueMin: 201, hueMax: 255 },
  { name: "purple", hueMin: 256, hueMax: 300 },
  { name: "pink", hueMin: 301, hueMax: 344 },
];

const BUCKET_TINT: Record<"red" | "orange" | "amber" | "green" | "cyan" | "blue" | "purple" | "pink", GroupTint> = {
  red: { fill: "var(--tint-red-fill)", fg: "var(--tint-red-fg)" },
  orange: { fill: "var(--tint-orange-fill)", fg: "var(--tint-orange-fg)" },
  amber: { fill: "var(--tint-amber-fill)", fg: "var(--tint-amber-fg)" },
  green: { fill: "var(--tint-green-fill)", fg: "var(--tint-green-fg)" },
  cyan: { fill: "var(--tint-cyan-fill)", fg: "var(--tint-cyan-fg)" },
  blue: { fill: "var(--tint-blue-fill)", fg: "var(--tint-blue-fg)" },
  purple: { fill: "var(--tint-purple-fill)", fg: "var(--tint-purple-fg)" },
  pink: { fill: "var(--tint-pink-fill)", fg: "var(--tint-pink-fg)" },
};

export function resolveGroupTint(color: string | undefined | null): GroupTint {
  if (!color) return NEUTRAL;
  const key = color.trim().toLowerCase();
  const canonical = CANONICAL[key];
  if (canonical) return canonical;

  const rgb = parseHex(key);
  if (!rgb) return NEUTRAL;
  const { h, s, l } = rgbToHsl(rgb[0], rgb[1], rgb[2]);

  // Near-gray → neutral bucket, no matter the hue.
  if (s < 0.12 || l < 0.1 || l > 0.92) return NEUTRAL;

  for (const bucket of HUE_BUCKETS) {
    if (h >= bucket.hueMin && h <= bucket.hueMax) return BUCKET_TINT[bucket.name];
  }
  return NEUTRAL;
}

function parseHex(hex: string): [number, number, number] | null {
  let h = hex;
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
        break;
      case gn:
        h = ((bn - rn) / d + 2) * 60;
        break;
      case bn:
        h = ((rn - gn) / d + 4) * 60;
        break;
    }
  }
  return { h: Math.round(h), s, l };
}
