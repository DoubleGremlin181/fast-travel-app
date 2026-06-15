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
    ├── validate-config.mjs        # Validates shared/config/default-config.json
    ├── bump-version.mjs           # Called by GitHub Actions release workflow
    ├── test-version-consistency.mjs # Verifies version is in sync across all files
    └── auto-update-domains/       # Weekly domain health checker with pluggable
                                   # sources (Wikipedia, FMHY) that auto-commits
                                   # mirror updates to main
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

### Version consistency check
```bash
node tools/test-version-consistency.mjs
```

## Releasing

Releases are fully automated via GitHub Actions. After merging to `main`:

1. Go to **Actions → Release** in the GitHub UI
2. Click **Run workflow**
3. Select bump type: `patch`, `minor`, or `major`
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

## Key Architecture Decisions

- **Native Android over web wrapper:** The app uses device-specific APIs (installed app detection, home screen widget, WorkManager for background refresh) that aren't available in a WebView wrapper.
- **Config URL model:** Users point the app/extension at a hosted JSON file. This lets config be shared across devices and updated without a new app release.
- **Shared test fixtures:** `shared/test-fixtures/` contains JSON fixtures used by both the extension (Vitest) and Android (JUnit5) to ensure behavioral parity.
- **Firefox manifest merging:** `manifest.firefox.json` is deep-merged over `manifest.json` at build time by `extension/scripts/build.mjs`, not maintained as a separate full manifest.
