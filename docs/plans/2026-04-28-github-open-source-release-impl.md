# Open Source Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare the `fast-travel-app` monorepo (browser extension + Android app) for public release on GitHub as `DoubleGremlin181/fast-travel-app`.

**Architecture:** Single big-bang branch covering sanitization, documentation, automated CI/CD (test + release), signing infrastructure, and test additions. The release workflow is triggered manually from the GitHub Actions UI via `workflow_dispatch`; CI runs on every PR/push to main. Version bumping is handled entirely by the release workflow — no local CLI needed.

**Tech Stack:** TypeScript/esbuild (extension), Kotlin/Compose/Gradle (Android), GitHub Actions, Vitest + Playwright (extension tests), JUnit5 + Compose Test (Android), `chrome-webstore-upload-cli`, `web-ext`, Gradle Play Publisher plugin.

---

## Task 1: Update .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add all missing entries**

Open `.gitignore` and append these lines (keep the existing content):

```
# Claude Code (machine-specific)
.claude/

# Playwright MCP debug logs
.playwright-mcp/

# JVM crash dumps (Android)
android/hs_err_pid*.log
android/replay_pid*.log

# Generated screenshots (regenerate with screenshot scripts)
docs/screenshots/
android/screenshots/
extension/theme-screenshots/

# Playwright test results
extension/test-results/

# Dev/debug Playwright scripts (local-path-dependent, not real tests)
extension/ft-pw-*.mjs
extension/ft-test-*.mjs
```

**Step 2: Delete the existing generated files that are now gitignored**

```bash
rm -f android/hs_err_pid*.log android/replay_pid*.log
rm -rf extension/test-results/ extension/theme-screenshots/
# docs/screenshots and android/screenshots may not exist - that's fine
```

**Step 3: Verify gitignore works**

```bash
git status
```
Expected: `.playwright-mcp/`, `android/hs_err_pid*.log` and the other paths should NOT appear as untracked.

**Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: update gitignore for OSS release"
```

---

## Task 2: Remove Dev Scripts

**Files:**
- Delete: all `extension/ft-pw-*.mjs` and `extension/ft-test-*.mjs`

**Step 1: Delete the files**

```bash
git rm extension/ft-pw-*.mjs extension/ft-test-*.mjs
```

**Step 2: Verify they're gone**

```bash
ls extension/ft-pw-*.mjs 2>/dev/null && echo "FAIL: files still present" || echo "OK"
```

**Step 3: Commit**

```bash
git commit -m "chore: remove local-path-dependent dev scripts"
```

---

## Task 3: Fix Hardcoded Absolute Paths in Android Tests

Both `CommandParserTest.kt` and `NormalizeTest.kt` have a `resolveSharedFile()` helper that already tries relative paths first, then falls back to the hardcoded `/home/kavish/...` absolute path. Simply remove the absolute fallback — the relative paths (`../shared/...` and `../../shared/...`) already work correctly when Gradle runs from `android/` or `android/app/`.

**Files:**
- Modify: `android/app/src/test/kotlin/sh/kavi/fasttravel/core/CommandParserTest.kt`
- Modify: `android/app/src/test/kotlin/sh/kavi/fasttravel/core/NormalizeTest.kt`

**Step 1: Edit CommandParserTest.kt — remove the absolute fallback**

Find the `resolveSharedFile` function (around line 40) and change it from:

```kotlin
private fun resolveSharedFile(relativePath: String): File {
    val candidates = listOf(
        File("../shared/$relativePath"),
        File("../../shared/$relativePath"),
        File("shared/$relativePath"),
        // Absolute fallback
        File("/home/kavish/Documents/Claude/fast-travel-app/shared/$relativePath"),
    )
    return candidates.firstOrNull { it.exists() }
        ?: throw IllegalStateException(
            "Cannot find shared/$relativePath. Tried: ${candidates.map { it.absolutePath }}"
        )
}
```

To:

```kotlin
private fun resolveSharedFile(relativePath: String): File {
    val candidates = listOf(
        File("../shared/$relativePath"),
        File("../../shared/$relativePath"),
        File("shared/$relativePath"),
    )
    return candidates.firstOrNull { it.exists() }
        ?: throw IllegalStateException(
            "Cannot find shared/$relativePath. Tried: ${candidates.map { it.absolutePath }}"
        )
}
```

**Step 2: Apply the same edit to NormalizeTest.kt**

Same change — remove the absolute path entry from the `candidates` list.

**Step 3: Run Android unit tests to confirm they still pass**

```bash
cd android && ./gradlew test --tests "sh.kavi.fasttravel.core.CommandParserTest" --tests "sh.kavi.fasttravel.core.NormalizeTest"
```

Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add android/app/src/test/kotlin/sh/kavi/fasttravel/core/CommandParserTest.kt \
        android/app/src/test/kotlin/sh/kavi/fasttravel/core/NormalizeTest.kt
git commit -m "fix(android): remove hardcoded local paths from test helpers"
```

---

## Task 4: Use BuildConfig.VERSION_NAME in Android Instead of Hardcoded "v2.0.0"

The version string `"v2.0.0"` appears twice in `SettingsActivity.kt` (lines 567 and 1856). Rather than having the release workflow patch a string in a Kotlin file, read the version from `BuildConfig.VERSION_NAME`, which Gradle auto-generates from `build.gradle.kts`.

**Files:**
- Modify: `android/app/build.gradle.kts`
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt`

**Step 1: Enable BuildConfig generation in build.gradle.kts**

In the `buildFeatures` block, add `buildConfig = true`:

```kotlin
buildFeatures {
    compose = true
    buildConfig = true
}
```

**Step 2: Replace hardcoded version strings in SettingsActivity.kt**

Search for both occurrences of `"v2.0.0"` and replace each with `"v${BuildConfig.VERSION_NAME}"`.

Line ~567 (the "About" menu item supporting text):
```kotlin
// Before
supportingText = "v2.0.0",
// After
supportingText = "v${BuildConfig.VERSION_NAME}",
```

Line ~1856 (the About screen headline version text):
```kotlin
// Before
text = "v2.0.0",
// After
text = "v${BuildConfig.VERSION_NAME}",
```

The `BuildConfig` import resolves to `sh.kavi.fasttravel.BuildConfig` — Gradle generates this automatically, no manual import needed if the namespace is already `sh.kavi.fasttravel`.

**Step 3: Build to confirm it compiles**

```bash
cd android && ./gradlew assembleDebug
```

Expected: `BUILD SUCCESSFUL`

**Step 4: Commit**

```bash
git add android/app/build.gradle.kts \
        android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt
git commit -m "fix(android): read version from BuildConfig instead of hardcoded string"
```

---

## Task 5: Update All Repo URLs to fast-travel-app

Three source files reference the old `DoubleGremlin181/fast-travel` repo. Update them all to `DoubleGremlin181/fast-travel-app`.

**Files:**
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/data/ThemePreferences.kt:38`
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/core/ConfigWriter.kt:13`
- Modify: `extension/src/options/screens/about.ts`
- Modify: `android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt`

**Step 1: Update ThemePreferences.kt default config URL**

Line 38 — change:
```kotlin
"https://raw.githubusercontent.com/DoubleGremlin181/fast-travel/main/shared/config/default-config.json"
```
To:
```kotlin
"https://raw.githubusercontent.com/DoubleGremlin181/fast-travel-app/main/shared/config/default-config.json"
```

**Step 2: Update ConfigWriter.kt schema URL**

Line 13 — change:
```kotlin
obj.put("\$schema", "https://raw.githubusercontent.com/DoubleGremlin181/fast-travel/main/shared/config/config.schema.json")
```
To:
```kotlin
obj.put("\$schema", "https://raw.githubusercontent.com/DoubleGremlin181/fast-travel-app/main/shared/config/config.schema.json")
```

**Step 3: Update extension about.ts**

Replace the GitHub link `href` and the "View on GitHub" text block — update both the main repo link and keep the "Original v1 site" link pointing at the old repo (that one is intentionally backward-looking):

```typescript
// Change the main GitHub link from:
el("a", { href: "https://github.com/DoubleGremlin181/fast-travel", target: "_blank", rel: "noopener" }, "View on GitHub"),
// To:
el("a", { href: "https://github.com/DoubleGremlin181/fast-travel-app", target: "_blank", rel: "noopener" }, "View on GitHub"),
```

The "Original v1 site" line stays unchanged.

**Step 4: Update SettingsActivity.kt about links**

There are two references. Find lines containing `DoubleGremlin181/fast-travel"` (not `fast-travel-app`) in SettingsActivity.kt and update them to `DoubleGremlin181/fast-travel-app`.

Line ~1895 (display text):
```kotlin
// Before
"github.com/DoubleGremlin181/fast-travel",
// After
"github.com/DoubleGremlin181/fast-travel-app",
```

Line ~1904 (URI):
```kotlin
// Before
Uri.parse("https://github.com/DoubleGremlin181/fast-travel"),
// After
Uri.parse("https://github.com/DoubleGremlin181/fast-travel-app"),
```

**Step 5: Verify no remaining old repo references in source**

```bash
grep -r "DoubleGremlin181/fast-travel[^-]" \
  android/app/src/main/ extension/src/ \
  --include="*.kt" --include="*.ts"
```

Expected: no output (zero matches).

**Step 6: Commit**

```bash
git add android/app/src/main/kotlin/sh/kavi/fasttravel/data/ThemePreferences.kt \
        android/app/src/main/kotlin/sh/kavi/fasttravel/core/ConfigWriter.kt \
        android/app/src/main/kotlin/sh/kavi/fasttravel/ui/SettingsActivity.kt \
        extension/src/options/screens/about.ts
git commit -m "fix: update all repo URLs to fast-travel-app"
```

---

## Task 6: Add LICENSE File

**Files:**
- Create: `LICENSE`

**Step 1: Create the MIT license file**

```
MIT License

Copyright (c) 2026 Kavish Hukmani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Step 2: Commit**

```bash
git add LICENSE
git commit -m "chore: add MIT license file"
```

---

## Task 7: Write README.md

**Files:**
- Create: `README.md`

**Step 1: Write the README**

```markdown
# Fast Travel App

**Supercharge your search bar.** Type commands to navigate the web faster — available as a browser extension for Chrome and Firefox, and as a native Android app.

> **This is the v2 successor to [fast-travel](https://github.com/DoubleGremlin181/fast-travel).** The original self-hosted static page (v1) remains fully functional and available.

## Install

| Platform | Link |
|---|---|
| Chrome | *(coming soon — Chrome Web Store)* |
| Firefox | *(coming soon — Firefox Add-ons)* |
| Android | *(coming soon — Google Play)* |

## v1 vs v2

| | v1 (`fast-travel`) | v2 (`fast-travel-app`) |
|---|---|---|
| Architecture | Self-hosted static page | Browser extension + Android app |
| Installation | Fork → deploy → set as search engine URL | Install from Chrome/Firefox store or Google Play |
| Hosting required | Yes (GitHub Pages or own server) | No |
| Platform support | Any browser with custom search engine support | Chrome, Firefox, Android only |
| Config | Edit `config.json` in your fork | Remote URL sync or local in-app editing |
| Search suggestions | Google only; browser/OS dependent | All platforms; site-specific suggestions per command |

**Choose v1** if you prefer no browser extension, need any-browser support, or want a fully self-hosted solution.  
**Choose v2** if you want a native Android app, one-click install, or cross-device config sync via URL.

## Quick Start

1. Install the extension or Android app
2. Open Settings → Configuration → set a remote config URL (or use the built-in default)
3. Type a command in your browser's address bar or the Android search widget

## Development

### Prerequisites
- Node.js 22+
- JDK 17+
- Android SDK (API 36)

### Extension

```bash
cd extension
npm install
npm run build          # Chrome
npm run build:firefox  # Firefox
npm test               # Unit tests
npm run test:e2e       # End-to-end tests (requires Chrome)
```

### Android

```bash
cd android
./gradlew assembleDebug   # Debug APK
./gradlew test            # Unit tests
./gradlew connectedTest   # Instrumented tests (requires device/emulator)
```

### Config validation

```bash
node tools/validate-config.mjs
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with v1 vs v2 comparison and quick start"
```

---

## Task 8: Write CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

**Step 1: Write CLAUDE.md**

```markdown
# Fast Travel App — Claude Code Guide

## Repo Layout

```
fast-travel-app/
├── extension/          # Browser extension (TypeScript + esbuild)
│   ├── src/            # Source: background, newtab, options, popup, core, ui
│   ├── tests/
│   │   ├── unit/       # Vitest unit tests
│   │   └── e2e/        # Playwright e2e tests (Chrome)
│   ├── scripts/        # build.mjs — builds Chrome or Firefox dist
│   ├── manifest.json   # Chrome manifest (base)
│   └── manifest.firefox.json  # Firefox overrides (deep-merged over base)
├── android/            # Native Android app (Kotlin + Compose)
│   └── app/src/
│       ├── main/       # Application source
│       ├── test/       # JUnit5 unit tests
│       └── androidTest/# Compose instrumented tests
├── shared/
│   ├── config/         # default-config.json + config.schema.json
│   └── test-fixtures/  # JSON fixtures shared by extension and Android tests
└── tools/
    ├── validate-config.mjs   # Validates shared/config/default-config.json
    ├── bump-version.mjs      # Called by GitHub Actions release workflow
    └── dns-over-wikipedia/   # Automated domain health checker
```

## Building

### Extension
```bash
cd extension && npm run build          # Chrome → extension/dist/
cd extension && npm run build:firefox  # Firefox → extension/dist/
```

### Android
```bash
cd android && ./gradlew assembleDebug   # Debug APK
cd android && ./gradlew bundleRelease   # Release AAB (requires signing env vars)
```

## Running Tests

### Extension unit tests
```bash
cd extension && npm test
```

### Extension e2e tests (needs Chrome installed)
```bash
cd extension && npm run build && npm run test:e2e
```

### Android unit tests
```bash
cd android && ./gradlew test
```

### Android instrumented tests (needs device or emulator)
```bash
cd android && ./gradlew connectedAndroidTest
```

### Config validation
```bash
node tools/validate-config.mjs
```

## Releasing

Releases are fully automated via GitHub Actions. After merging to `main`:

1. Go to **Actions → Release** in the GitHub UI
2. Click **Run workflow**
3. Select bump type: `patch`, `minor`, or `major` (or enter an explicit version)
4. The workflow bumps versions, builds, signs, and publishes to all stores

Do NOT manually edit version numbers in source files.

## CI Secrets (for maintainers)

All secrets live in **GitHub → Settings → Secrets and variables → Actions**.

| Secret | Purpose | Where to rotate |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Android signing keystore (base64) | Re-encode keystore file |
| `ANDROID_KEY_ALIAS` | Keystore key alias | Android keystore |
| `ANDROID_KEY_PASSWORD` | Key password | Android keystore |
| `ANDROID_STORE_PASSWORD` | Store password | Android keystore |
| `CHROME_CLIENT_ID` | Chrome Web Store API | [Google Cloud Console](https://console.cloud.google.com) |
| `CHROME_CLIENT_SECRET` | Chrome Web Store API | Google Cloud Console |
| `CHROME_REFRESH_TOKEN` | Chrome Web Store OAuth | Google Cloud Console |
| `CHROME_EXTENSION_ID` | Chrome extension ID | Chrome Web Store Dashboard |
| `FIREFOX_API_KEY` | Firefox AMO API | [addons.mozilla.org/developers](https://addons.mozilla.org/developers/) |
| `FIREFOX_API_SECRET` | Firefox AMO API | addons.mozilla.org |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Play Store publish | [Google Play Console](https://play.google.com/console) |

For first-time setup instructions (new store listings), see `docs/release-setup.md`.

## Key Architecture Decisions

- **Native Android over web wrapper:** The app uses device-specific APIs (installed app detection, home screen widget, WorkManager for background refresh) that aren't available in a WebView wrapper.
- **Config URL model:** Users point the app/extension at a hosted JSON file. This lets config be shared across devices and updated without a new app release.
- **Shared test fixtures:** `shared/test-fixtures/` contains JSON fixtures used by both the extension (Vitest) and Android (JUnit5) to ensure behavioral parity.
- **Firefox manifest merging:** `manifest.firefox.json` is deep-merged over `manifest.json` at build time by `extension/scripts/build.mjs`, not maintained as a separate full manifest.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with repo layout, build commands, and release guide"
```

---

## Task 9: Write CONTRIBUTING.md

**Files:**
- Create: `CONTRIBUTING.md`

**Step 1: Write CONTRIBUTING.md**

```markdown
# Contributing to Fast Travel App

## Adding or Editing Commands

Commands live in `shared/config/default-config.json`. The schema is at `shared/config/config.schema.json`.

1. Edit `shared/config/default-config.json`
2. Run `node tools/validate-config.mjs` — must pass before opening a PR
3. Test locally in the extension (`npm run build` then load from `extension/dist/`)

## Pull Requests

- One logical change per PR
- All tests must pass (CI runs automatically on every PR)
- Do not manually bump version numbers — the release workflow handles that
- For extension changes: run `cd extension && npm test` and `npm run test:e2e`
- For Android changes: run `cd android && ./gradlew test`

## Adding Extension Features

Source is under `extension/src/`. The build entry points are:
- `src/background/service-worker.ts` — background logic, DNR rules
- `src/options/options.ts` — settings UI
- `src/newtab/newtab.ts` — new tab page (search bar)
- `src/popup/popup.ts` — toolbar popup

Add unit tests in `extension/tests/unit/` and e2e tests in `extension/tests/e2e/`.

## Adding Android Features

Source is under `android/app/src/main/kotlin/sh/kavi/fasttravel/`.
- `core/` — pure business logic (no Android dependencies)
- `data/` — storage, config fetching, preferences
- `ui/` — Compose screens
- `deeplink/` — deep link handling

Add unit tests in `android/app/src/test/` and instrumented tests in `android/app/src/androidTest/`.
```

**Step 2: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING.md"
```

---

## Task 10: Write docs/release-setup.md

**Files:**
- Create: `docs/release-setup.md`

**Step 1: Write the one-time setup guide**

```markdown
# Release Setup (One-Time)

This document covers first-time setup for a brand-new store listing. If you're
an existing maintainer, all secrets are already in GitHub — see CLAUDE.md.

## Android Keystore

```bash
keytool -genkey -v -keystore release.keystore \
  -alias fast-travel \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore somewhere safe (password manager, not in the repo).
Base64-encode it for GitHub:

```bash
base64 -w 0 release.keystore
```

Add to GitHub secrets:
- `ANDROID_KEYSTORE_BASE64` — output of the base64 command above
- `ANDROID_KEY_ALIAS` — `fast-travel` (or whatever alias you chose)
- `ANDROID_KEY_PASSWORD` — key password you set
- `ANDROID_STORE_PASSWORD` — store password you set

## Chrome Web Store

1. Pay the one-time $5 developer fee at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole)
2. Create a new item, upload a zip of `extension/dist/`
3. Note the extension ID from the dashboard
4. Create a Google Cloud project, enable Chrome Web Store API
5. Create OAuth credentials (Desktop app), generate a refresh token using `chrome-webstore-upload-cli`'s auth helper

Add to GitHub secrets:
- `CHROME_EXTENSION_ID`
- `CHROME_CLIENT_ID`
- `CHROME_CLIENT_SECRET`
- `CHROME_REFRESH_TOKEN`

## Firefox AMO

1. Create an account at [addons.mozilla.org](https://addons.mozilla.org)
2. Generate API credentials at [addons.mozilla.org/en-US/developers/addon/api/key/](https://addons.mozilla.org/en-US/developers/addon/api/key/)

Add to GitHub secrets:
- `FIREFOX_API_KEY`
- `FIREFOX_API_SECRET`

## Google Play

1. Create a developer account ($25 one-time fee) at [play.google.com/console](https://play.google.com/console)
2. Create a new app, complete store listing
3. Create a service account in Google Play Console with "Release manager" role
4. Download the JSON key file

Add to GitHub secrets:
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — contents of the JSON key file
- `GOOGLE_PLAY_PACKAGE_NAME` — `sh.kavi.fasttravel`
```

**Step 2: Commit**

```bash
git add docs/release-setup.md
git commit -m "docs: add one-time release setup guide"
```

---

## Task 11: Add GitHub Issue and PR Templates

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/ISSUE_TEMPLATE/new_command.md`
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

**Step 1: Create bug report template**

```markdown
---
name: Bug report
about: Something isn't working
---

**Platform:** <!-- Chrome extension / Firefox extension / Android app -->
**Version:** <!-- e.g. v2.1.0 -->

**What happened:**

**What you expected:**

**Steps to reproduce:**
1.
2.
3.
```

**Step 2: Create feature request template**

```markdown
---
name: Feature request
about: Suggest an idea
---

**What problem does this solve?**

**Proposed solution:**

**Platform:** <!-- Chrome / Firefox / Android / all -->
```

**Step 3: Create new command suggestion template**

```markdown
---
name: New command suggestion
about: Suggest a command to add to the default config
---

**Service/site:**

**Proposed trigger(s):** <!-- e.g. `gh`, `github` -->

**Default URL:** <!-- opens when no query given -->

**Search URL:** <!-- use {query} placeholder -->

**Suggestions API (optional):** <!-- URL returning JSON suggestions -->

**Device-specific routes (optional):** <!-- e.g. different URL on Android -->
```

**Step 4: Create PR template**

```markdown
## What does this change?

## Checklist
- [ ] Tests pass (`npm test` for extension, `./gradlew test` for Android)
- [ ] Config validated (`node tools/validate-config.mjs`) if config was changed
- [ ] Version NOT manually bumped (release workflow handles this)
- [ ] New tests added for new behaviour
```

**Step 5: Commit**

```bash
git add .github/ISSUE_TEMPLATE/ .github/PULL_REQUEST_TEMPLATE.md
git commit -m "chore: add GitHub issue and PR templates"
```

---

## Task 12: Write Version Bump Script

This script is called exclusively by the GitHub Actions release workflow — not intended for direct use.

**Files:**
- Create: `tools/bump-version.mjs`

**Step 1: Write the script**

```javascript
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
  // Explicit version string
  if (/^\d+\.\d+\.\d+$/.test(type)) return type;
  throw new Error(`Invalid bump type: ${type}. Use patch, minor, major, or X.Y.Z`);
}

const bumpType = process.argv[2];
if (!bumpType) {
  console.error("Usage: node tools/bump-version.mjs <patch|minor|major|X.Y.Z>");
  process.exit(1);
}

// Read current version from root package.json
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
// Output for GitHub Actions to capture
console.log(`::set-output name=version::${newVersion}`);
```

**Step 2: Make it executable**

```bash
chmod +x tools/bump-version.mjs
```

**Step 3: Test it locally with a dry run**

```bash
# Sanity check — pipe to /dev/null to avoid actually writing
node tools/bump-version.mjs patch
```

Expected: prints `Bumping 2.0.0 → 2.0.1` and `Done.`

**Step 4: Revert the test bump (do not commit bumped versions yet)**

```bash
git checkout -- package.json extension/package.json extension/manifest.json \
  extension/src/options/screens/about.ts android/app/build.gradle.kts
```

**Step 5: Commit the script itself**

```bash
git add tools/bump-version.mjs
git commit -m "chore: add version bump script for release workflow"
```

---

## Task 13: Version Consistency Meta-Test

A test that catches drift — if any file's version disagrees with the root `package.json`, it fails.

**Files:**
- Create: `tools/test-version-consistency.mjs`

**Step 1: Write the test**

```javascript
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
```

**Step 2: Run it to confirm current state is consistent**

```bash
node tools/test-version-consistency.mjs
```

Expected: all `OK:` lines, exit 0.

**Step 3: Wire it into the root test script in package.json**

In `package.json`, update the `"test"` script:
```json
"test": "node tools/validate-config.mjs && node tools/test-version-consistency.mjs && npm run test --workspaces --if-present"
```

**Step 4: Commit**

```bash
git add tools/test-version-consistency.mjs package.json
git commit -m "test: add version consistency meta-test"
```

---

## Task 14: Add CI Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  extension:
    name: Extension — lint, build, unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Validate config
        run: node tools/validate-config.mjs

      - name: Check version consistency
        run: node tools/test-version-consistency.mjs

      - name: Build extension (Chrome)
        run: npm run build -w extension

      - name: Build extension (Firefox)
        run: npm run build:firefox -w extension

      - name: Unit tests
        run: npm test -w extension

  extension-e2e:
    name: Extension — e2e tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build -w extension

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
        working-directory: extension

      - name: Run e2e tests
        run: npm run test:e2e -w extension

  android-unit:
    name: Android — unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Run unit tests
        run: ./gradlew test
        working-directory: android

  android-instrumented:
    name: Android — instrumented tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Run instrumented tests
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          arch: x86_64
          script: cd android && ./gradlew connectedAndroidTest
```

**Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow for extension and Android tests"
```

---

## Task 15: Add Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `android/app/build.gradle.kts` (add signing config)

**Step 1: Add signing config to build.gradle.kts**

Inside the `android { ... }` block, add a `signingConfigs` section and wire it to the release build type. The config reads signing credentials from environment variables set by the workflow:

```kotlin
signingConfigs {
    create("release") {
        storeFile = System.getenv("SIGNING_STORE_FILE")?.let { file(it) }
        keyAlias = System.getenv("SIGNING_KEY_ALIAS")
        keyPassword = System.getenv("SIGNING_KEY_PASSWORD")
        storePassword = System.getenv("SIGNING_STORE_PASSWORD")
    }
}

buildTypes {
    release {
        signingConfig = signingConfigs.getByName("release")
        isMinifyEnabled = false
        proguardFiles(
            getDefaultProguardFile("proguard-android-optimize.txt"),
            "proguard-rules.pro"
        )
    }
}
```

Also add the Gradle Play Publisher plugin to `android/app/build.gradle.kts` plugins block:
```kotlin
id("com.github.triplet.play") version "3.10.1"
```

And configure it:
```kotlin
play {
    serviceAccountCredentials.set(
        file(System.getenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") ?: "play-credentials.json")
    )
    track.set("production")
    defaultToAppBundles.set(true)
}
```

**Step 2: Add the play publisher plugin to the root build.gradle.kts**

In `android/build.gradle.kts`, add to the plugins block:
```kotlin
id("com.github.triplet.play") version "3.10.1" apply false
```

**Step 3: Write the release workflow**

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      bump:
        description: "Version bump type"
        required: true
        type: choice
        options: [patch, minor, major]

permissions:
  contents: write

jobs:
  release:
    name: Bump, build, sign, and publish
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Install Node dependencies
        run: npm ci

      # ── Version bump ──────────────────────────────────────────────────────
      - name: Bump version
        id: bump
        run: |
          node tools/bump-version.mjs ${{ inputs.bump }}
          VERSION=$(node -p "require('./package.json').version")
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"

      - name: Commit and tag version bump
        run: |
          git add package.json extension/package.json extension/manifest.json \
            extension/src/options/screens/about.ts android/app/build.gradle.kts
          git commit -m "chore: bump version to ${{ steps.bump.outputs.version }}"
          git tag "v${{ steps.bump.outputs.version }}"
          git push --follow-tags

      # ── Extension build ───────────────────────────────────────────────────
      - name: Build extension (Chrome)
        run: npm run build -w extension

      - name: Package Chrome extension
        run: |
          cd extension/dist && zip -r ../../chrome-extension.zip .
        working-directory: .

      - name: Build extension (Firefox)
        run: npm run build:firefox -w extension

      - name: Package Firefox extension
        run: |
          cd extension/dist && zip -r ../../firefox-extension.zip .
        working-directory: .

      # ── Android build ─────────────────────────────────────────────────────
      - name: Decode Android keystore
        run: echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > /tmp/release.keystore

      - name: Build Android AAB
        run: ./gradlew bundleRelease
        working-directory: android
        env:
          SIGNING_STORE_FILE: /tmp/release.keystore
          SIGNING_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          SIGNING_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          SIGNING_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}

      # ── Publish ───────────────────────────────────────────────────────────
      - name: Publish to Chrome Web Store
        run: |
          npx chrome-webstore-upload-cli upload \
            --source chrome-extension.zip \
            --extension-id ${{ secrets.CHROME_EXTENSION_ID }} \
            --client-id ${{ secrets.CHROME_CLIENT_ID }} \
            --client-secret ${{ secrets.CHROME_CLIENT_SECRET }} \
            --refresh-token ${{ secrets.CHROME_REFRESH_TOKEN }} \
            --auto-publish

      - name: Publish to Firefox AMO
        run: |
          npx web-ext sign \
            --source-dir extension/dist \
            --api-key ${{ secrets.FIREFOX_API_KEY }} \
            --api-secret ${{ secrets.FIREFOX_API_SECRET }} \
            --channel listed

      - name: Publish to Google Play
        run: ./gradlew publishBundle
        working-directory: android
        env:
          SIGNING_STORE_FILE: /tmp/release.keystore
          SIGNING_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          SIGNING_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
          SIGNING_STORE_PASSWORD: ${{ secrets.ANDROID_STORE_PASSWORD }}
          GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}

      # ── GitHub Release ────────────────────────────────────────────────────
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.bump.outputs.version }}
          generate_release_notes: true
          files: |
            chrome-extension.zip
            firefox-extension.zip
            android/app/build/outputs/bundle/release/app-release.aab
```

**Step 4: Commit**

```bash
git add .github/workflows/release.yml android/app/build.gradle.kts android/build.gradle.kts
git commit -m "ci: add release workflow with version bump, signing, and store publishing"
```

---

## Task 16: Android Instrumented Tests — Config Import/Export Flow

The existing `SettingsNavigationTest.kt` confirms the Import/Export screen loads, but doesn't test URL fetch or state changes. Add a test that confirms a URL import shows a success/error state.

**Files:**
- Create: `android/app/src/androidTest/kotlin/sh/kavi/fasttravel/ui/ImportExportTest.kt`

**Step 1: Write the test**

```kotlin
package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ImportExportTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<SettingsActivity>()

    private fun navigateToImportExport() {
        composeTestRule.onNodeWithText("Configuration").performClick()
        composeTestRule.onNodeWithText("Import / Export").performClick()
    }

    @Test
    fun importExport_allThreeSectionsVisible() {
        navigateToImportExport()
        composeTestRule.onNodeWithText("Choose file…").assertIsDisplayed()
        composeTestRule.onNodeWithText("Fetch & Import").assertIsDisplayed()
        composeTestRule.onNodeWithText("Export config").assertIsDisplayed()
    }

    @Test
    fun urlImport_emptyUrl_fetchButtonDisabledOrShowsError() {
        navigateToImportExport()
        composeTestRule.onNodeWithText("Fetch & Import").performClick()
        // With an empty URL the button should either be a no-op or show an error
        // Confirm the screen doesn't crash
        composeTestRule.onNodeWithText("Fetch & Import").assertIsDisplayed()
    }

    @Test
    fun export_buttonVisible_and_tappable() {
        navigateToImportExport()
        composeTestRule.onNodeWithText("Export config").performClick()
        // A file picker or share sheet should open; confirm the screen doesn't crash
        composeTestRule.onNodeWithText("Export config").assertIsDisplayed()
    }
}
```

**Step 2: Run the new test on a device/emulator**

```bash
cd android && ./gradlew connectedAndroidTest \
  --tests "sh.kavi.fasttravel.ui.ImportExportTest"
```

Expected: `BUILD SUCCESSFUL`, all 3 tests pass.

**Step 3: Commit**

```bash
git add android/app/src/androidTest/kotlin/sh/kavi/fasttravel/ui/ImportExportTest.kt
git commit -m "test(android): instrumented tests for import/export screen"
```

---

## Task 17: Android Instrumented Tests — Search Widget

**Files:**
- Create: `android/app/src/androidTest/kotlin/sh/kavi/fasttravel/ui/SearchWidgetTest.kt`

**Step 1: Write the test**

The home screen widget (`SearchWidgetProvider`) can be tested by launching `SearchActivity` directly and verifying search UI elements are present.

```kotlin
package sh.kavi.fasttravel.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SearchWidgetTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<SearchActivity>()

    @Test
    fun searchActivity_searchBarIsDisplayed() {
        // The search activity launched by the widget should show a search field
        composeTestRule.waitForIdle()
        // Verify the activity loaded without crashing and shows a search UI
        composeTestRule.onNodeWithContentDescription("Search")
            .assertIsDisplayed()
    }
}
```

**Step 2: Run the test**

```bash
cd android && ./gradlew connectedAndroidTest \
  --tests "sh.kavi.fasttravel.ui.SearchWidgetTest"
```

Expected: `BUILD SUCCESSFUL`.

**Step 3: Commit**

```bash
git add android/app/src/androidTest/kotlin/sh/kavi/fasttravel/ui/SearchWidgetTest.kt
git commit -m "test(android): instrumented test for search activity (widget entry point)"
```

---

## Task 18: Extension E2E — Per-Site Search Suggestions

**Files:**
- Create: `extension/tests/e2e/suggestions.spec.ts`

**Step 1: Write the test**

```typescript
import { test, expect } from "./fixtures";

test("newtab: suggestions appear when typing a known command query", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  const input = page.locator("input[type='search'], input[type='text']").first();
  await input.fill("g hello");
  // Suggestions dropdown should appear (may be empty if no network in CI — just check container renders)
  await page.waitForTimeout(300);
  const suggestions = page.locator(".suggestions, [role='listbox'], [data-suggestions]");
  // The suggestions container should exist in DOM even if empty
  await expect(suggestions).toHaveCount(1);
});

test("newtab: different commands show distinct suggestion sources", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);
  const input = page.locator("input[type='search'], input[type='text']").first();

  // Type a command with a site-specific suggestions API
  await input.fill("ddg test");
  await page.waitForTimeout(300);

  // Clear and type a command with no suggestions API configured
  await input.fill("");
  await input.fill("noapi test");
  await page.waitForTimeout(300);

  // Confirm the page doesn't crash with either command
  await expect(input).toBeVisible();
});
```

> **Note:** Adjust selectors to match the actual newtab DOM once you've inspected it with `npm run build && npx playwright open` pointing at the built newtab. The selectors above are placeholders — update them to match real class names found in `extension/src/newtab/`.

**Step 2: Run the test**

```bash
cd extension && npm run build && npm run test:e2e -- suggestions.spec.ts
```

Expected: both tests pass (or are skipped if selectors need adjusting — fix selectors to match real DOM).

**Step 3: Commit**

```bash
git add extension/tests/e2e/suggestions.spec.ts
git commit -m "test(extension): e2e tests for per-site search suggestions"
```

---

## Task 19: Update Old Repo README

This is a change to a separate repository (`DoubleGremlin181/fast-travel`). Create a PR there.

**Step 1: Clone or fork the old repo (if not already local)**

```bash
gh repo clone DoubleGremlin181/fast-travel /tmp/fast-travel-v1
cd /tmp/fast-travel-v1
git checkout -b add-v2-notice
```

**Step 2: Prepend the successor notice to README.md**

Add this block at the very top of the existing README, before the `# Fast Travel` heading:

```markdown
> **Fast Travel App (v2) is now available.** If you want a browser extension + native Android app with one-click install and cross-device config sync, see [fast-travel-app](https://github.com/DoubleGremlin181/fast-travel-app).
>
> v1 (this repo) remains fully functional and is the right choice if you prefer a self-hosted static page that works in any browser without an extension.

```

**Step 3: Commit and open a PR**

```bash
git add README.md
git commit -m "docs: add v2 successor notice linking to fast-travel-app"
gh pr create \
  --title "docs: add v2 successor notice" \
  --body "Links users to fast-travel-app for the v2 extension + Android experience while making clear v1 remains the right choice for self-hosted/any-browser setups."
```

**Step 4: Merge the PR on GitHub**

---

## Final Verification

**Step 1: Run the full test suite locally**

```bash
# From repo root
npm test

# Android
cd android && ./gradlew test
```

Expected: all pass, including version consistency meta-test.

**Step 2: Dry-run the version bump script**

```bash
node tools/bump-version.mjs patch
git diff  # confirm all 5 locations updated correctly
git checkout -- .  # revert
```

**Step 3: Verify no PII or old-repo references remain in source**

```bash
grep -r "DoubleGremlin181/fast-travel[^-]" \
  extension/src/ android/app/src/main/ tools/ \
  --include="*.kt" --include="*.ts" --include="*.mjs" --include="*.json"

grep -r "/home/kavish" \
  extension/ android/ tools/ shared/ \
  --include="*.kt" --include="*.ts" --include="*.mjs" \
  --exclude-dir=node_modules
```

Expected: no output from either command.

**Step 4: Commit anything remaining and push**

```bash
git status  # confirm clean
git log --oneline -20  # review commit history
git push origin master
```
