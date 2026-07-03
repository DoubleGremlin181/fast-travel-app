# Updating store listings after an asset change

The store-listing icon and promo graphics were switched to the light **Paper**
variant (Paper squircle, Night + Denim chevron) so each listing reads
consistently light. The app-UI screenshots were already light and are unchanged,
and the theming-demo screenshots (`04-theme-dark.png`, `google-play/…/05-home-dark.png`)
intentionally stay **dark** — they exist to show off light+dark theming, so do
**not** replace them.

Regenerate the graphics from source before uploading:

```bash
node docs/store-assets/sources/render.mjs
```

Then replace the assets in each store as below. All three require re-review; the
extension keeps functioning on the old assets until the new listing is approved.

## Chrome Web Store

1. Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → the Fast Travel item.
2. **Store listing** tab:
   - **Store icon** → upload `docs/store-assets/chrome/store-icon-128.png` (128×128).
   - **Small promo tile** → upload `docs/store-assets/chrome/promo-tile.png` (440×280).
   - **Marquee promo tile** (only if used) → `docs/store-assets/chrome/marquee-promo-tile.png` (1400×560).
   - Screenshots are unchanged (`screenshots/01–03` light; `04-theme-dark` stays dark).
3. **Save draft** → **Submit for review**. Review typically takes a few hours to a few days.

## Firefox AMO

1. Open the [Developer Hub](https://addons.mozilla.org/developers/) → Fast Travel → **Manage**.
2. **Edit listing** → **Add-on Media**:
   - **Icon** → upload `docs/store-assets/firefox/icon-128.png` (128×128).
   - Screenshots are unchanged (`01–03` light; `04-theme-dark` stays dark).
3. **Save Changes**. (Icon/screenshot updates to an existing listing are usually applied without full re-review.)

> The packaged toolbar icon inside the extension now matches the selected theme
> at runtime (the dark Night tile for Dark, the light Paper tile for Light); it
> ships with the next signed build and needs no store-listing action.

## Google Play

1. Open the [Play Console](https://play.google.com/console) → Fast Travel.
2. **Grow → Store presence → Main store listing**:
   - **App icon** → upload `docs/store-assets/google-play/icon-512.png` (512×512).
   - **Feature graphic** → upload `docs/store-assets/google-play/feature-graphic.png` (1024×500).
   - **Phone screenshots** are unchanged (`01–04` light; `05-home-dark` stays dark).
3. **Save** → **Send for review** / publish via your release track. Review can take a few hours to a couple of days.

## Note on the installed app icon (Android)

The Android launcher icon is a fixed brand mark; it now includes a `<monochrome>`
layer, so on Android 13+ it participates in the launcher's **themed icons** (it
follows the *system* light/dark theme where the launcher supports and the user
enables that feature). Making the launcher icon track the app's own in-app
Light/Dark/System toggle is not feasible without activity-alias swapping (which
flickers/removes the icon and can kill the task), so it is intentionally out of
scope.
