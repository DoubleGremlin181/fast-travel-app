#!/usr/bin/env node
// Rasterize Fast Travel brand SVGs to the PNG sizes needed by the
// extension and the Android launcher.
//
// Requires `ksvgtopng5` on PATH (from package `kdoctools5` / `plasma-desktop`
// on most Linux distros). ImageMagick's internal SVG renderer is unreliable
// for thin stroked paths, so we use ksvgtopng5 which wraps QtSvg.
// Run with:
//   node shared/brand/generate-icons.mjs
//
// Output:
//   shared/brand/out/extension/icon{16,32,48,128,180,192}.png
//   shared/brand/out/android/mipmap-{m,h,x,xx,xxx}dpi/ic_launcher{,_round}.png
//   shared/brand/out/android/ic_launcher_foreground_{108,162,216,324,432}.png
//
// The extension PNGs are copied into extension/src/icons and
// extension/dev-harness/icons. The Android PNGs are copied into
// android/app/src/main/res/mipmap-*.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT = resolve(HERE, "out");

const NIGHT = "#0E1020";
const PAPER = "#F5F2EC";
const DENIM = "#3E6098";

/** Build an SVG for an app-icon tile at a given pixel size.
 *  Stroke and padding scale so the mark stays optically balanced at every size. */
function iconSvg({ size, bg, fg, accent, rounded = true, cornerPct = 0.22 }) {
  // Small sizes need a thicker stroke and less padding so the mark reads.
  const small = size <= 48;
  const strokeBase = small ? 30 : 22;
  const padBase = small ? 40 : 52;
  const chevScale = small ? 0.78 : 0.58;
  const mark = size * chevScale;
  const off = (size - mark) / 2;
  const scale = mark / 200;
  const r = rounded ? Math.round(size * cornerPct) : 0;

  // Chevron geometry in 200-unit space, parametrized by pad.
  const halfW = (200 - padBase * 2) / 2;
  const chevW = halfW - 3; // gap = 6 ⇒ half gap = 3
  const chevH = 80;
  const cx = 100;
  const yTop = cx - chevH / 2;
  const yMid = cx;
  const yBot = cx + chevH / 2;
  const c1x1 = padBase;
  const c1x2 = padBase + chevW;
  const c2x1 = cx + 3;
  const c2x2 = c2x1 + chevW;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${bg}"/>
  <g transform="translate(${off.toFixed(2)},${off.toFixed(2)}) scale(${scale.toFixed(4)})">
    <g fill="none" stroke-width="${strokeBase}" stroke-linecap="square" stroke-linejoin="miter">
      <polyline stroke="${fg}" points="${c1x1},${yTop} ${c1x2},${yMid} ${c1x1},${yBot}"/>
      <polyline stroke="${accent}" points="${c2x1},${yTop} ${c2x2},${yMid} ${c2x1},${yBot}"/>
    </g>
  </g>
</svg>`;
}

/** Adaptive-icon foreground: transparent square, chevron only.
 *  Android adaptive icons require a 108 dp safe zone inside a 432 dp layer. */
function adaptiveForegroundSvg({ size, fg = PAPER, accent = DENIM }) {
  // 66/108 of the layer is the visible circle; keep the mark inside that.
  const markScale = 0.42;
  const mark = size * markScale;
  const off = (size - mark) / 2;
  const scale = mark / 200;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <g transform="translate(${off.toFixed(2)},${off.toFixed(2)}) scale(${scale.toFixed(4)})">
    <g fill="none" stroke-width="22" stroke-linecap="square" stroke-linejoin="miter">
      <polyline stroke="${fg}" points="52,60 97,100 52,140"/>
      <polyline stroke="${accent}" points="103,60 148,100 103,140"/>
    </g>
  </g>
</svg>`;
}

function render(svg, outPng, size) {
  mkdirSync(dirname(outPng), { recursive: true });
  const tmpSvg = outPng.replace(/\.png$/, ".svg");
  writeFileSync(tmpSvg, svg);
  execFileSync("ksvgtopng5", [String(size), String(size), tmpSvg, outPng], {
    stdio: "inherit",
  });
}

function copyInto(src, destinations) {
  for (const dest of destinations) {
    if (!existsSync(dirname(dest))) mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

// ─── Extension toolbar icons ────────────────────────────────────────────
// Single solid tile (Night bg + Paper+Denim chevron) that reads on both
// light and dark browser chrome. Rounded 18 % per brand kit ToolbarIcon.
const extensionSizes = [16, 32, 48, 128, 180, 192];
for (const size of extensionSizes) {
  const svg = iconSvg({
    size, bg: NIGHT, fg: PAPER, accent: DENIM, cornerPct: 0.18,
  });
  const out = resolve(OUT, "extension", `icon${size}.png`);
  render(svg, out, size);
}

// Copy 16/48/128 into the extension source + dev-harness. Keep the larger
// sizes in shared/brand/out so the build can pick them up as needed.
for (const size of [16, 48, 128]) {
  const src = resolve(OUT, "extension", `icon${size}.png`);
  copyInto(src, [
    resolve(ROOT, "extension", "src", "icons", `icon${size}.png`),
    resolve(ROOT, "extension", "dev-harness", "icons", `icon${size}.png`),
  ]);
}

// ─── Android mipmap launcher ────────────────────────────────────────────
// Legacy (pre-adaptive) launcher icon: solid Night tile with the mark.
// Android expects these densities for ic_launcher.png / ic_launcher_round.png:
const androidDensities = [
  { name: "mdpi",    px: 48  },
  { name: "hdpi",    px: 72  },
  { name: "xhdpi",   px: 96  },
  { name: "xxhdpi",  px: 144 },
  { name: "xxxhdpi", px: 192 },
];
for (const { name, px } of androidDensities) {
  const square = iconSvg({ size: px, bg: NIGHT, fg: PAPER, accent: DENIM, cornerPct: 0.16 });
  const round  = iconSvg({ size: px, bg: NIGHT, fg: PAPER, accent: DENIM, cornerPct: 0.5 });
  const sqOut = resolve(OUT, "android", `mipmap-${name}`, "ic_launcher.png");
  const rdOut = resolve(OUT, "android", `mipmap-${name}`, "ic_launcher_round.png");
  render(square, sqOut, px);
  render(round,  rdOut, px);
  copyInto(sqOut, [resolve(ROOT, "android", "app", "src", "main", "res", `mipmap-${name}`, "ic_launcher.png")]);
  copyInto(rdOut, [resolve(ROOT, "android", "app", "src", "main", "res", `mipmap-${name}`, "ic_launcher_round.png")]);
}

// Adaptive icon foreground PNGs (optional — used if an adaptive drawable
// is wired up later). Layer size 108 dp × densities.
const adaptiveSizes = [
  { name: "mdpi",    px: 108 },
  { name: "hdpi",    px: 162 },
  { name: "xhdpi",   px: 216 },
  { name: "xxhdpi",  px: 324 },
  { name: "xxxhdpi", px: 432 },
];
for (const { name, px } of adaptiveSizes) {
  const svg = adaptiveForegroundSvg({ size: px });
  const out = resolve(OUT, "android", `mipmap-${name}`, "ic_launcher_foreground.png");
  render(svg, out, px);
}

console.log("\n✓ Brand icons generated into shared/brand/out/");
console.log("  extension/src/icons/ and dev-harness/icons/ updated.");
console.log("  android/app/src/main/res/mipmap-*/ic_launcher{,_round}.png updated.");
