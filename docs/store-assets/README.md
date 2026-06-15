# Store Listing Assets

Listing copy and graphics for the Chrome Web Store, Firefox AMO, and Google Play.

## Copy

- `chrome-web-store.md` — Chrome Web Store listing.
- `firefox-amo.md` — Firefox AMO listing.
- `google-play.md` — Google Play listing.

The byline (**Supercharge your search bar**), short summary, and detailed
description (command examples + feature list) are kept consistent across all three.

## Graphics

Editable SVG sources and the render script live in `sources/`. Re-render after edits:

```bash
node docs/store-assets/sources/render.mjs
```

| File | Size | Used by |
|---|---|---|
| `google-play/feature-graphic.png` | 1024×500 | Google Play feature graphic |
| `google-play/icon-512.png` | 512×512 | Google Play listing icon |
| `chrome/promo-tile.png` | 440×280 | Chrome Web Store small promo tile |

## Screenshots

| Folder | Size | Count |
|---|---|---|
| `chrome/screenshots/` | 1280×800 | 4 |
| `firefox/screenshots/` | 1280×800 | 4 |
| `google-play/screenshots/` | 1080×2160 (Play's 2:1 max) | 5 |

Regenerate extension screenshots with `extension/scripts/screenshot-store.mjs`;
Android screenshots are captured from the `fast_travel_dev` AVD and cropped to 2:1.

## Privacy policy

All three stores require a privacy-policy URL. Source: `docs/privacy-policy.md`,
served at `https://kavi.sh/fast-travel-app/privacy-policy/`.

## Icons

Brand sources: `shared/brand/`. Extension icons (16/48/128) ship in
`extension/src/icons/`; Android launcher icons in `android/app/src/main/res/mipmap-*`.
