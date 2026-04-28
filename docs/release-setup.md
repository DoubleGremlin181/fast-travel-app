# Release Setup (One-Time)

This document covers first-time setup for a brand-new store listing. If you're
an existing maintainer, all secrets are already in GitHub — see CLAUDE.md.

## Android Keystore

Generate a new keystore (keep this file safe — losing it means you cannot update the app):

```bash
keytool -genkey -v -keystore release.keystore \
  -alias fast-travel \
  -keyalg RSA -keysize 2048 -validity 10000
```

Store the keystore in a password manager, not in the repo. Base64-encode it for GitHub:

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
2. Create a new item, upload a zip of `extension/dist/` for the initial review
3. Note the extension ID from the dashboard
4. Create a Google Cloud project, enable the Chrome Web Store API
5. Create OAuth 2.0 credentials (Desktop app type), then generate a refresh token using the `chrome-webstore-upload-cli` auth helper:
   ```bash
   npx chrome-webstore-upload-cli@latest login
   ```

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
2. Create a new app and complete the store listing
3. Upload a signed AAB manually for the first release (Play requires at least one manual upload before the API can be used)
4. In Google Play Console → Setup → API access, create a service account with "Release manager" role
5. Download the JSON key file for the service account

Add to GitHub secrets:
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — full contents of the JSON key file
