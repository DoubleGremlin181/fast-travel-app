# Store Listing Assets

Listing copy and graphics for the Chrome Web Store, Firefox AMO, and Google Play.

## Layout

Each store has its own folder holding that store's listing copy and graphics:

| Folder | Contents |
|---|---|
| `chrome/` | `chrome-web-store.md`, `promo-tile.png` (440×280), `screenshots/` (4 @ 1280×800) |
| `firefox/` | `firefox-amo.md`, `screenshots/` (4 @ 1280×800) |
| `google-play/` | `google-play.md`, `feature-graphic.png` (1024×500), `icon-512.png` (512×512), `screenshots/` (5 @ 1080×2160, Play's 2:1 max) |
| `sources/` | editable SVG sources + `render.mjs` for the graphics |

The byline (**Supercharge your search bar**), short summary, and detailed
description (command examples + feature list) are kept consistent across all three
listings.

## Regenerating assets

```bash
node docs/store-assets/sources/render.mjs   # re-render promo graphics from sources/
```

Extension screenshots come from `extension/scripts/screenshot-store.mjs`; Android
screenshots are captured from the `fast_travel_dev` AVD and cropped to 2:1.

## Privacy policy

All three stores require a privacy-policy URL. Source: `docs/privacy-policy.md`,
served at `https://kavi.sh/fast-travel-app/privacy-policy/`.

## Icons

Brand sources: `shared/brand/`. Extension icons (16/48/128) ship in
`extension/src/icons/`; Android launcher icons in `android/app/src/main/res/mipmap-*`.
