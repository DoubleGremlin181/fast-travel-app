#!/usr/bin/env node
// Called by the GitHub Actions release workflow.
// Usage: node tools/bump-version.mjs <patch|minor|major|X.Y.Z>

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n");
}

function bumpSemver(current, type) {
  const [major, minor, patch] = current.split(".").map(Number);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  if (type === "patch") return `${major}.${minor}.${patch + 1}`;
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  throw new Error(`Invalid bump type: ${type}. Use patch, minor, major, or X.Y.Z`);
}

const bumpType = process.argv[2];
if (!bumpType) {
  console.error("Usage: node tools/bump-version.mjs <patch|minor|major|X.Y.Z>");
  process.exit(1);
}

const rootPkg = readJson(resolve(root, "package.json"));
const currentVersion = rootPkg.version;
const newVersion = bumpSemver(currentVersion, bumpType);

console.log(`Bumping ${currentVersion} → ${newVersion}`);

// 1. Root package.json
rootPkg.version = newVersion;
writeJson(resolve(root, "package.json"), rootPkg);

// 2. extension/package.json
const extPkg = readJson(resolve(root, "extension/package.json"));
extPkg.version = newVersion;
writeJson(resolve(root, "extension/package.json"), extPkg);

// 3. extension/manifest.json
const manifest = readJson(resolve(root, "extension/manifest.json"));
manifest.version = newVersion;
writeJson(resolve(root, "extension/manifest.json"), manifest);

// 4. extension/src/options/screens/about.ts — replace the hardcoded version badge
const aboutPath = resolve(root, "extension/src/options/screens/about.ts");
const aboutContent = readFileSync(aboutPath, "utf-8");
const updatedAbout = aboutContent.replace(/"v\d+\.\d+\.\d+"/, `"v${newVersion}"`);
if (updatedAbout === aboutContent) throw new Error("Could not find version string in about.ts");
writeFileSync(aboutPath, updatedAbout);

// 5. android/app/build.gradle.kts — bump versionName and increment versionCode
const gradlePath = resolve(root, "android/app/build.gradle.kts");
let gradleContent = readFileSync(gradlePath, "utf-8");

const versionCodeMatch = gradleContent.match(/versionCode\s*=\s*(\d+)/);
if (!versionCodeMatch) throw new Error("Could not find versionCode in build.gradle.kts");
const newVersionCode = parseInt(versionCodeMatch[1], 10) + 1;

gradleContent = gradleContent
  .replace(/versionCode\s*=\s*\d+/, `versionCode = ${newVersionCode}`)
  .replace(/versionName\s*=\s*"[^"]*"/, `versionName = "${newVersion}"`);
writeFileSync(gradlePath, gradleContent);

console.log(`Done. New version: ${newVersion}, Android versionCode: ${newVersionCode}`);
console.log(`::set-output name=version::${newVersion}`);
