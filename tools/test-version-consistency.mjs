#!/usr/bin/env node
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function readJson(path) { return JSON.parse(readFileSync(path, "utf-8")); }

const expected = readJson(resolve(root, "package.json")).version;
let failed = false;

function check(label, actual) {
  if (actual !== expected) {
    console.error(`FAIL: ${label} has "${actual}", expected "${expected}"`);
    failed = true;
  } else {
    console.log(`OK:   ${label} = ${actual}`);
  }
}

check("extension/package.json",  readJson(resolve(root, "extension/package.json")).version);
check("extension/manifest.json", readJson(resolve(root, "extension/manifest.json")).version);

const gradle = readFileSync(resolve(root, "android/app/build.gradle.kts"), "utf-8");
const gradleMatch = gradle.match(/versionName\s*=\s*"([^"]*)"/);
check("android build.gradle.kts versionName", gradleMatch?.[1]);

const about = readFileSync(resolve(root, "extension/src/options/screens/about.ts"), "utf-8");
const aboutMatch = about.match(/"v(\d+\.\d+\.\d+)"/);
check("extension/src/options/screens/about.ts", aboutMatch?.[1]);

if (failed) process.exit(1);
console.log("\nAll versions consistent.");
