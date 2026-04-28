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
./gradlew connectedAndroidTest   # Instrumented tests (requires device/emulator)
```

### Config validation

```bash
node tools/validate-config.mjs
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
