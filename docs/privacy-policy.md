---
title: Privacy Policy — Fast Travel
permalink: /privacy-policy/
---

# Privacy Policy — Fast Travel

_Last updated: 14 May 2026_

Fast Travel is a command-based search tool available as a browser extension (Chrome,
Firefox) and a native Android app. This policy explains what data the app handles and,
just as importantly, what it does **not**.

## Summary

- **There are no Fast Travel servers.** We do not operate a backend, and we do not have
  user accounts.
- **We do not collect, transmit, sell, or share any personal data.**
- **No analytics, no telemetry, no tracking, no advertising.**
- All of your settings and configuration stay **on your device**.

## What is stored on your device

Fast Travel keeps the following in your browser's or Android device's local storage. It
never leaves your device except as described in "Network requests" below.

- **Your settings** — themes, layout preferences, and other in-app options.
- **Your command configuration** — the list of commands, search engines, and icon packs,
  whether typed in manually or synced from a config URL you provide.
- **A cached copy of your remote config** — if you set a config URL, the most recent
  fetched copy is cached locally so the app works offline.
- **Auto-ignore list** — locally-computed entries used to refine command matching.

You can clear all of this at any time by removing the extension / app, or via the
in-app settings.

## Network requests

Fast Travel only makes network requests that are a direct result of something you do.
None of these requests go to a server operated by us.

1. **Fetching your config URL.** If you set a remote configuration URL, the app fetches
   that URL to load your commands. The request goes to whichever host you chose. The
   built-in default configuration is bundled with the app and requires no network
   request.
2. **Search suggestions.** As you type, the app may request autocomplete suggestions
   from the suggestion API endpoints defined in your configuration (for example, a
   search engine's public autocomplete endpoint). The text you type is sent to those
   third-party endpoints so they can return suggestions. These providers handle that
   data under their own privacy policies.
3. **Site icons.** The app may fetch favicons for the sites in your configuration so it
   can display their icons.
4. **Navigation.** When you run a command, the app opens the destination URL in your
   browser. This is ordinary web browsing and is subject to the destination site's own
   policies.

If you do not set a config URL and do not use suggestion-backed commands, Fast Travel
makes effectively no network requests of its own.

## Browser extension permissions

The extension requests these permissions purely to provide its core functionality:

- **`storage`** — save your settings and configuration locally.
- **`alarms`** — periodically refresh your remote config in the background.
- **`tabs`** and **`webNavigation`** — detect and redirect address-bar searches so your
  commands run.
- **`declarativeNetRequestWithHostAccess`** and host access — redirect the internal
  search sentinel URL to the right destination. Host access is used only for this
  redirect; the extension does not read page content.

## Android permissions

- **Internet / network state** — fetch your config URL and search suggestions, as
  described above.
- **Installed-app query** (`queries`) — on Android 11+ the app reads the list of
  launchable apps **on your device** so you can launch them with a command. This list
  is used locally and is **never transmitted off the device**.

## Children's privacy

Fast Travel is not directed at children and does not knowingly collect any data from
anyone, including children.

## Changes to this policy

If this policy changes, the updated version will be published at this URL with a new
"Last updated" date.

## Contact

Questions about this policy can be sent to **khukmani+fast-travel@gmail.com**, or raised
as an issue on the project's GitHub repository.
