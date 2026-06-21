# Store Listing Assets

Listing copy and graphics for the Chrome Web Store, Firefox AMO, and Google Play.

## Layout

Each store has its own folder holding that store's listing copy and graphics:

| Folder | Contents |
|---|---|
| `chrome/` | `chrome-web-store.md`, `promo-tile.png` (440×280), `promo-video.mp4` (1280×720), `screenshots/` (4 @ 1280×800) |
| `firefox/` | `firefox-amo.md`, `screenshots/` (4 @ 1280×800) |
| `google-play/` | `google-play.md`, `feature-graphic.png` (1024×500), `icon-512.png` (512×512), `promo-video.mp4` (1280×720) + `promo-video-portrait.mp4`, `screenshots/` (5 @ 1080×2160, Play's 2:1 max) |
| `sources/` | editable SVG sources + `render.mjs` for the graphics |

The byline (**Supercharge your search bar**), short summary, and detailed
description (command examples + feature list) are kept consistent across all three
listings.

## Promo video

The Chrome Web Store and Google Play accept a promotional video only as a **YouTube
link**, so `promo-video.mp4` is the master to upload to YouTube and then link in the
listing. Both cuts show the same ~10 searches; the Android one opens YouTube / Wikipedia
/ Maps as native apps, the browser one redirects in-tab. `google-play/promo-video-portrait.mp4`
is the un-letterboxed portrait cut for a phone-framed placement. Firefox AMO doesn't
support promo videos, so there's no `firefox/promo-video.mp4`.

## Regenerating assets

```bash
node docs/store-assets/sources/render.mjs       # re-render promo graphics from sources/
cd extension && npm run record:store-video      # chrome/promo-video.mp4
bash android/tools/record-store-video.sh        # google-play/promo-video*.mp4 (see APP-SETUP)
```

Extension screenshots come from `extension/scripts/screenshot-store.mjs`; Android
screenshots are captured from the `fast_travel_dev` AVD and cropped to 2:1.

## Privacy policy

All three stores require a privacy-policy URL. Source: `docs/privacy-policy.md`,
served at `https://kavi.sh/fast-travel-app/privacy-policy/`.

## Icons

Brand sources: `shared/brand/`. Extension icons (16/48/128) ship in
`extension/src/icons/`; Android launcher icons in `android/app/src/main/res/mipmap-*`.
