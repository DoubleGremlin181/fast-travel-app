# Store Listing Assets

Everything needed to create the Chrome Web Store, Firefox AMO, and Google Play
listings. Listing copy is drafted and ready for review; **screenshots and promo
graphics still need to be captured** (see "Screenshots" below).

## Status

| Asset | Chrome | Firefox | Google Play |
|---|---|---|---|
| Short description | ✅ drafted | ✅ drafted | ✅ drafted |
| Long description | ✅ drafted | ✅ drafted | ✅ drafted |
| Privacy policy URL | ⏳ needs GitHub Pages live | ⏳ | ⏳ |
| Screenshots | ❌ to capture | ❌ to capture | ❌ to capture |
| Promo / feature graphic | ❌ to create | n/a | ❌ to create |
| Icon | ✅ in repo | ✅ in repo | ✅ in repo |

Drafted copy lives in `chrome-web-store.md`, `firefox-amo.md`, `google-play.md`.

## Privacy policy URL

All three stores require one. Source: `docs/privacy-policy.md`. Once GitHub Pages is
enabled (Settings → Pages → deploy from `main` / `/docs`), the URL will be:

```
https://doublegremlin181.github.io/fast-travel-app/privacy-policy
```

Confirm the exact path after Pages builds, then paste it into each listing.

## Screenshots — to capture

Automated capture could not be run in the current dev environment (Playwright's
bundled browser is unsupported on this OS, and no Android device was attached).
Capture these when joining, using the existing scripts:

- **Extension options screens** — `node extension/scripts/screenshot-options.mjs`
  (outputs to `extension/scripts/screenshots/`). Requires `cd extension && npm install`
  and `npm run build` first.
- **Extension new-tab + address bar** — `node extension/scripts/screenshot-newtab.mjs`
  (needs ImageMagick `magick` and an X display).
- **Android themes** — `bash android/screenshot-themes.sh` (needs a connected device
  or emulator via `adb`).

Then crop/resize into the per-store folders below.

### Per-store size requirements

| Store | Screenshot size | Min count | Other graphics |
|---|---|---|---|
| Chrome Web Store | 1280×800 or 640×400 PNG | 1 (5 recommended) | Small promo tile 440×280; optional marquee 1400×560 |
| Firefox AMO | up to 2400×1800, 1280×800 recommended | 1 | none required |
| Google Play | phone: 16:9 or 9:16, 320–3840 px | 2 | Feature graphic 1024×500 (required); 512×512 icon |

Drop final files into:

```
docs/store-assets/chrome/screenshots/
docs/store-assets/firefox/screenshots/
docs/store-assets/google-play/screenshots/
docs/store-assets/google-play/feature-graphic.png
docs/store-assets/chrome/promo-tile.png
```

## Icons

Brand sources are in `shared/brand/` (`icon-*.svg`, `generate-icons.mjs`). Extension
icons (16/48/128) ship in `extension/src/icons/`. Android launcher icons are in
`android/app/src/main/res/mipmap-*`. A 512×512 PNG for the Play listing can be
generated from the brand SVGs.
