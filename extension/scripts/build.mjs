import * as esbuild from "esbuild";
import { cpSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");
const isFirefox = process.argv.includes("--firefox");

// Clean dist/ before every build to prevent stale artifacts
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Build TypeScript files
const entryPoints = [
  "src/background/service-worker.ts",
  "src/newtab/newtab.ts",
  "src/options/options.ts",
  "src/popup/popup.ts",
];

await esbuild.build({
  entryPoints: entryPoints.map((e) => resolve(root, e)),
  bundle: true,
  outdir: dist,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  minify: false,
  splitting: true,
  loader: { ".json": "json" },
});

// apply-theme is loaded as a render-blocking CLASSIC <script> (not a module) so
// it runs synchronously before first paint and applies the saved theme without a
// FOUC flash. A classic <script> can't load an ESM file, so emit it as a
// standalone IIFE (no splitting/imports) at dist/ui/apply-theme.js.
await esbuild.build({
  entryPoints: [resolve(root, "src/ui/apply-theme.ts")],
  bundle: true,
  outfile: resolve(dist, "ui/apply-theme.js"),
  format: "iife",
  target: "es2022",
  sourcemap: true,
  minify: false,
});

// Copy static files
const staticFiles = [
  ["src/newtab/newtab.html", "newtab/newtab.html"],
  ["src/newtab/newtab.css", "newtab/newtab.css"],
  ["src/options/options.html", "options/options.html"],
  ["src/options/options.css", "options/options.css"],
  ["src/popup/popup.html", "popup/popup.html"],
  ["src/popup/popup.css", "popup/popup.css"],
  ["src/ui/tokens.css", "ui/tokens.css"],
  ["src/ui/variants.css", "ui/variants.css"],
  ["src/icons/icon16.png", "icons/icon16.png"],
  ["src/icons/icon48.png", "icons/icon48.png"],
  ["src/icons/icon128.png", "icons/icon128.png"],
  // Light "Paper" toolbar variants — the service worker swaps to these when the
  // resolved appearance is dark, so the toolbar icon follows the selected theme.
  ["src/icons/icon16-paper.png", "icons/icon16-paper.png"],
  ["src/icons/icon48-paper.png", "icons/icon48-paper.png"],
  ["src/icons/icon128-paper.png", "icons/icon128-paper.png"],
];

for (const [src, dest] of staticFiles) {
  const destPath = resolve(dist, dest);
  mkdirSync(dirname(destPath), { recursive: true });
  try {
    cpSync(resolve(root, src), destPath);
  } catch {
    // File may not exist yet during scaffolding
  }
}

// Copy localised messages (manifest.json's `default_locale` requires this).
try {
  cpSync(resolve(root, "src/_locales"), resolve(dist, "_locales"), { recursive: true });
} catch {
  // _locales may not exist yet during scaffolding
}

/**
 * Recursively merges `source` into `target`. Used for Firefox-specific manifest
 * overrides — `Object.assign` was shallow, so nested overrides under e.g.
 * `action` or `background` were silently clobbered.
 */
function deepMerge(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...(target ?? {}) };
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Build manifest
let manifest = JSON.parse(
  readFileSync(resolve(root, "manifest.json"), "utf-8"),
);

if (isFirefox) {
  try {
    const firefoxOverrides = JSON.parse(
      readFileSync(resolve(root, "manifest.firefox.json"), "utf-8"),
    );
    manifest = deepMerge(manifest, firefoxOverrides);
    // Replace keys that must not be merged but replaced wholesale.
    // deepMerge unions nested objects, so without this the Firefox background
    // object ends up with both `service_worker` (Chrome MV3) and `scripts`
    // (Firefox MV3), which fails web-ext lint/sign.
    if (firefoxOverrides.background) {
      manifest.background = firefoxOverrides.background;
    }
  } catch {
    // Firefox overrides may not exist yet
  }
}

writeFileSync(resolve(dist, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Built extension for ${isFirefox ? "Firefox" : "Chrome"} -> dist/`);
