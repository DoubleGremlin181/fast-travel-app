# Post-Launch Steps (README & Repo Metadata)

Run these once the three store listings are live and you have their public URLs.
Each step is pre-written so it's a quick copy/paste. Covers issues #10, #13, #9, #8.

## 1. README install badges (#10)

Replace the install table in `README.md` (currently the `(coming soon — …)` rows) with
real badges. Fill in the three URLs:

```markdown
## Install

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/CHROME_EXTENSION_ID?label=Chrome&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/CHROME_EXTENSION_ID)
[![Firefox Add-ons](https://img.shields.io/amo/v/fast-travel?label=Firefox&logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/firefox/addon/FIREFOX_SLUG/)
[![Google Play](https://img.shields.io/badge/Google%20Play-sh.kavi.fasttravel-blue?logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=sh.kavi.fasttravel)
```

Placeholders to fill:
- `CHROME_EXTENSION_ID` — from the Chrome Web Store dashboard
- `FIREFOX_SLUG` — the AMO listing slug (e.g. `fast-travel`)
- Google Play uses the fixed package name `sh.kavi.fasttravel` — no edit needed

## 2. README screenshot / GIF (#13)

Add a hero image just under the tagline line in `README.md`:

```markdown
![Fast Travel](docs/store-assets/chrome/screenshots/newtab.png)
```

Use one of the captured store screenshots, or record a short demo GIF of typing a
command + suggestions and save it to `docs/store-assets/`.

## 3. Repo website URL (#9)

Point the repository's website field at the privacy-policy / landing page:

```bash
gh repo edit DoubleGremlin181/fast-travel-app \
  --homepage "https://doublegremlin181.github.io/fast-travel-app/"
```

## 4. Repo topics (#8)

```bash
gh repo edit DoubleGremlin181/fast-travel-app \
  --add-topic browser-extension \
  --add-topic chrome-extension \
  --add-topic firefox-addon \
  --add-topic android \
  --add-topic productivity \
  --add-topic search \
  --add-topic new-tab-page
```

## 5. Branch protection on main (#7)

Not store-related, but part of repo hardening. Enable via Settings → Branches, or:

```bash
gh api -X PUT repos/DoubleGremlin181/fast-travel-app/branches/main/protection \
  -F required_status_checks.strict=true \
  -F 'required_status_checks.contexts[]=' \
  -F enforce_admins=true \
  -F required_pull_request_reviews.required_approving_review_count=1 \
  -F restrictions=
```

Adjust the status-check contexts to match the CI job names in `.github/workflows/ci.yml`.
