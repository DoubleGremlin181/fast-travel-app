#!/usr/bin/env node
// Called by the GitHub Actions release workflow.
// Usage:
//   node tools/bump-version.mjs bump <patch|minor|major|X.Y.Z>   (real release)
//   node tools/bump-version.mjs beta <pr-number>                 (PR test build)

import { readFileSync, writeFileSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ── Paths ───────────────────────────────────────────────────────────────────
const ROOT_PKG = resolve(root, "package.json");
const EXT_PKG = resolve(root, "extension/package.json");
const MANIFEST = resolve(root, "extension/manifest.json");
const ABOUT = resolve(root, "extension/src/options/screens/about.ts");
const GRADLE = resolve(root, "android/app/build.gradle.kts");

// ── JSON helpers ────────────────────────────────────────────────────────────
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

// ── Pure version computation (exported for tests) ───────────────────────────
export function bumpSemver(current, type) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  if (type === "patch") return `${major}.${minor}.${patch + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  throw new Error(
    `Invalid bump type: ${type}. Use patch, minor, major, or X.Y.Z`,
  );
}

// The manifest version must stay numeric (Chrome MV3 only allows 1-4 dotted
// integers), so the PR number rides in a 4th segment; the human-readable
// display string keeps the literal "-beta-<pr>".
export function betaVersions(base, pr) {
  return {
    displayVersion: `${base}-beta-${pr}`,
    manifestVersion: `${base}.${pr}`,
  };
}

// ── Argument parsing (exported for tests) ───────────────────────────────────
const USAGE =
  "Usage:\n" +
  "  node tools/bump-version.mjs bump <patch|minor|major|X.Y.Z>\n" +
  "  node tools/bump-version.mjs beta <pr-number>";

export function parseArgs(args) {
  const [mode, value] = args;
  if (mode === "bump") {
    if (!value) throw new Error(USAGE);
    return { mode: "bump", bumpType: value };
  }
  if (mode === "beta") {
    if (!value || !/^\d+$/.test(value) || Number(value) < 1) {
      throw new Error(USAGE);
    }
    return { mode: "beta", pr: Number(value) };
  }
  throw new Error(USAGE);
}

// ── File writers ────────────────────────────────────────────────────────────
function writeRootPackageJson(version) {
  const pkg = readJson(ROOT_PKG);
  pkg.version = version;
  writeJson(ROOT_PKG, pkg);
}

function writeExtPackageJson(version) {
  const pkg = readJson(EXT_PKG);
  pkg.version = version;
  writeJson(EXT_PKG, pkg);
}

function writeManifest(version) {
  const manifest = readJson(MANIFEST);
  manifest.version = version;
  writeJson(MANIFEST, manifest);
}

function writeAbout(displayVersion) {
  const content = readFileSync(ABOUT, "utf-8");
  // Matches both the clean badge ("v2.0.0") and an already-beta'd badge
  // ("v2.0.0-beta-19") so the rewrite is idempotent.
  const updated = content.replace(
    /"v\d+\.\d+\.\d+(?:-beta-\d+)?"/,
    `"v${displayVersion}"`,
  );
  if (updated === content) {
    throw new Error("Could not find version string in about.ts");
  }
  writeFileSync(ABOUT, updated);
}

// versionCode is only rewritten when a value is passed (real releases);
// PR builds omit it and leave versionCode untouched.
function writeGradle(versionName, versionCode) {
  let content = readFileSync(GRADLE, "utf-8");
  content = content.replace(
    /versionName\s*=\s*"[^"]*"/,
    `versionName = "${versionName}"`,
  );
  if (versionCode !== undefined) {
    content = content.replace(
      /versionCode\s*=\s*\d+/,
      `versionCode = ${versionCode}`,
    );
  }
  writeFileSync(GRADLE, content);
}

// ── Modes ───────────────────────────────────────────────────────────────────
function runBump(bumpType) {
  const currentVersion = readJson(ROOT_PKG).version;
  const newVersion = bumpSemver(currentVersion, bumpType);
  console.log(`Bumping ${currentVersion} → ${newVersion}`);

  const gradleContent = readFileSync(GRADLE, "utf-8");
  const versionCodeMatch = gradleContent.match(/versionCode\s*=\s*(\d+)/);
  if (!versionCodeMatch) {
    throw new Error("Could not find versionCode in build.gradle.kts");
  }
  const newVersionCode = parseInt(versionCodeMatch[1], 10) + 1;

  writeRootPackageJson(newVersion);
  writeExtPackageJson(newVersion);
  writeManifest(newVersion);
  writeAbout(newVersion);
  writeGradle(newVersion, newVersionCode);

  console.log(
    `Done. New version: ${newVersion}, Android versionCode: ${newVersionCode}`,
  );
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `version=${newVersion}\n`);
  }
}

function runBeta(pr) {
  const base = readJson(ROOT_PKG).version;
  const { displayVersion, manifestVersion } = betaVersions(base, pr);
  console.log(
    `Applying beta version: ${displayVersion} (manifest ${manifestVersion})`,
  );

  writeManifest(manifestVersion);
  writeAbout(displayVersion);
  writeGradle(displayVersion);

  console.log("Done.");
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  if (parsed.mode === "bump") runBump(parsed.bumpType);
  else runBeta(parsed.pr);
}

// Only run the CLI when executed directly, not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
