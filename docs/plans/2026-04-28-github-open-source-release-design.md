# Open Source Release Design — fast-travel-app

**Date:** 2026-04-28
**Repo:** `DoubleGremlin181/fast-travel-app`
**Approach:** Big bang — all changes in one branch

---

## 1. Sanitization & Repository Hygiene

### Remove from repo / add to `.gitignore`
- All `extension/ft-pw-*.mjs` and `extension/ft-test-*.mjs` dev scripts (hardcoded local paths, not real tests) — deleted, paths gitignored
- `.claude/` — Claude Code machine-specific settings
- `.playwright-mcp/` — local debug logs
- `android/hs_err_pid*.log`, `android/replay_pid*.log` — JVM crash dumps
- `docs/screenshots/`, `android/screenshots/` — generated artifacts
- `extension/test-results/`, `extension/theme-screenshots/` — generated test output
- `chevron-brand-kit/` stays in the repo

### Fix hardcoded local paths
- `android/app/src/test/.../CommandParserTest.kt` and `NormalizeTest.kt` — replace `<home>/...` absolute paths with project-relative paths via `System.getProperty("user.dir")` or Gradle test resource loading

### Update URLs to new repo
- Default config fetch URL in `ThemePreferences.kt` → `raw.githubusercontent.com/DoubleGremlin181/fast-travel-app/main/...`
- JSON schema URL in `ConfigWriter.kt` → `raw.githubusercontent.com/DoubleGremlin181/fast-travel-app/main/...`
- About links in `extension/src/options/screens/about.ts` → new repo
- About links in `android/.../SettingsActivity.kt` → new repo

---

## 2. Documentation

### README.md
- Project headline + screenshot/demo GIF placeholder
- Successor notice: "Fast Travel App is the v2 successor to [fast-travel](https://github.com/DoubleGremlin181/fast-travel). The original self-hosted v1 remains available."
- Comparison table:

| | v1 (`fast-travel`) | v2 (`fast-travel-app`) |
|---|---|---|
| Architecture | Self-hosted static page | Browser extension + Android app |
| Installation | Fork → deploy → set as search engine URL | Install from Chrome/Firefox store or Google Play |
| Hosting required | Yes (GitHub Pages or own server) | No |
| Platform support | Any browser with custom search engine support | Chrome, Firefox, Android only |
| Config | Edit `config.json` in your fork | Remote URL sync or local in-app editing |
| Search suggestions | Google only; browser/OS dependent | All platforms; site-specific suggestions per command |

- Install badges (Chrome Web Store, Firefox AMO, Google Play) — placeholders until published
- Quick start (install + set config URL)
- Development setup (prerequisites, `npm install`, Gradle commands)
- Contributing section linking to `CONTRIBUTING.md`
- License (MIT)

### CLAUDE.md
- Repo layout (extension, android, shared, tools)
- How to build each platform
- How to run tests
- Key architectural decisions (native Android vs web wrapper, config URL model, shared fixtures)
- Release process (trigger workflow from GitHub Actions UI)
- Secret rotation guide: where each CI secret lives, where to rotate (Google Cloud Console, addons.mozilla.org, Google Play Console, Android keystore re-encoding)

### CONTRIBUTING.md
- How to add/edit commands in the shared config
- How to submit a PR for extension vs Android changes
- Test requirements before merging

### docs/release-setup.md
- One-time setup instructions for generating the Android keystore, creating Chrome/Firefox/Play service accounts, and uploading secrets to GitHub — useful if the project ever needs a fresh start

### Old repo (`fast-travel`) README update
- Pin notice at top: "v1 is a self-hosted static page — if you prefer no extension install or need any-browser support, v1 is still the right choice. For a native Android app and one-click browser install, see [fast-travel-app](https://github.com/DoubleGremlin181/fast-travel-app)."

---

## 3. Release Workflow (GitHub Actions `workflow_dispatch`)

No local version CLI. Release is triggered manually from the GitHub Actions UI after merging.

### Inputs
- Version bump type: `patch` / `minor` / `major` (or explicit version string e.g. `2.1.0`)

### Steps
1. Bump all version references:
   - `package.json` (root) — `version`
   - `extension/package.json` — `version`
   - `extension/manifest.json` — `version`
   - `extension/manifest.firefox.json` — `version`
   - `android/app/build.gradle.kts` — `versionName` + `versionCode` (auto-incremented integer)
   - Hardcoded version strings in `extension/src/options/screens/about.ts` and `SettingsActivity.kt`
2. Commit `chore: bump version to X.Y.Z` and push tag `vX.Y.Z`
3. Build extension (Chrome + Firefox) and Android AAB
4. Sign artifacts using secrets
5. Publish to Chrome Web Store, Firefox AMO, and Google Play

### CI workflow (always-on, runs on every PR/push to main)
- Extension unit tests (Vitest)
- Extension build validation
- Android unit tests (Gradle)
- Config validation (`tools/validate-config.mjs`)

---

## 4. Signing & Publishing

### Secrets stored in GitHub repo secrets
| Secret | Used for |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Android APK/AAB signing |
| `ANDROID_KEY_ALIAS` | Android signing |
| `ANDROID_KEY_PASSWORD` | Android signing |
| `ANDROID_STORE_PASSWORD` | Android signing |
| `CHROME_CLIENT_ID` | Chrome Web Store publish |
| `CHROME_CLIENT_SECRET` | Chrome Web Store publish |
| `CHROME_REFRESH_TOKEN` | Chrome Web Store publish |
| `FIREFOX_API_KEY` | Firefox AMO signing |
| `FIREFOX_API_SECRET` | Firefox AMO signing |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Play publish |

### Tooling
- Chrome: `chrome-webstore-upload-cli`
- Firefox: `web-ext sign`
- Android: Gradle `com.github.triplet.play` plugin

---

## 5. Test Cleanup

### Remove
- All `extension/ft-pw-*.mjs` and `extension/ft-test-*.mjs`

### Fix
- `CommandParserTest.kt` and `NormalizeTest.kt` — replace hardcoded absolute paths

### Add coverage for gaps
- Android instrumented tests: config import/export flow
- Android instrumented tests: search widget interactions
- Extension e2e: search suggestion fetching (per-site, site-specific)
- Meta-test: version string consistency across `package.json`, manifests, and `build.gradle.kts`

---

## 6. Additional OSS Hygiene

### GitHub repository setup
- Branch protection on `main` — require PR + passing CI before merge
- Issue templates: bug report, feature request, new command suggestion
- PR template with checklist (tests pass, version not bumped manually, config validated)

### Licensing
- Add `LICENSE` file to repo root (MIT, matching `package.json`)

### Config schema
- Update all `$schema` references to point to new repo URL
- Schema published at `raw.githubusercontent.com/DoubleGremlin181/fast-travel-app/main/shared/config/config.schema.json`

### Release notes
- GitHub release auto-created by release workflow, populated from conventional commits (`feat:`, `fix:`, `chore:`) since last tag

### `.gitignore` additions
- `.claude/`
- `.playwright-mcp/`
- `android/hs_err_pid*.log`
- `android/replay_pid*.log`
- `docs/screenshots/`
- `android/screenshots/`
- `extension/test-results/`
- `extension/theme-screenshots/`
- `extension/ft-pw-*.mjs`
- `extension/ft-test-*.mjs`
