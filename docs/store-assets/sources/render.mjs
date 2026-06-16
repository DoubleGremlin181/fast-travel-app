// Rasterizes the store SVG sources to PNGs at exact pixel sizes using the
// Playwright-bundled Chromium (no ImageMagick/sharp required).
//
//   node docs/store-assets/sources/render.mjs
//
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

// [svg source, output png, width, height, transparent?]
// transparent=true preserves the alpha channel (for the CWS store icon's padding);
// the others fill their full canvas with an opaque background.
const jobs = [
  ['docs/store-assets/sources/feature-graphic.svg', 'docs/store-assets/google-play/feature-graphic.png', 1024, 500],
  ['docs/store-assets/sources/promo-tile.svg',      'docs/store-assets/chrome/promo-tile.png',           440,  280],
  ['docs/store-assets/sources/marquee.svg',         'docs/store-assets/chrome/marquee-promo-tile.png',  1400,  560],
  ['docs/store-assets/sources/icon.svg',            'docs/store-assets/google-play/icon-512.png',        512,  512],
  ['docs/store-assets/sources/store-icon.svg',      'docs/store-assets/chrome/store-icon-128.png',       128,  128, true],
];

const browser = await chromium.launch();
try {
  for (const [src, out, w, h, transparent] of jobs) {
    const svg = readFileSync(resolve(root, src), 'utf8');
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><head><style>
         html,body{margin:0;padding:0;background:transparent}
         svg{display:block;width:${w}px;height:${h}px}
       </style></head><body>${svg}</body></html>`,
      { waitUntil: 'networkidle' }
    );
    await page.screenshot({
      path: resolve(root, out),
      clip: { x: 0, y: 0, width: w, height: h },
      omitBackground: !!transparent,
    });
    await page.close();
    console.log(`✓ ${out}  (${w}×${h})`);
  }
} finally {
  await browser.close();
}
