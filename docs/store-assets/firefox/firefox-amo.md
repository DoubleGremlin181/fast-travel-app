# Firefox AMO — Listing Copy

## Name

```
Fast Travel
```

## Add-on type

Extension. Extension ID: `fast-travel@kavi.sh`
(set in `extension/manifest.firefox.json`).

## Summary (max 250 chars)

```
Turn your search bar into a command line for the web. Define short triggers and jump straight to the sites and searches you use.
```

## Detailed description

```
Supercharge your search bar.

Fast Travel turns your search bar into a command line for the web. Instead of
bookmarks, history, and half-remembered URLs, type a short command and go straight
where you mean to.

WHAT YOU CAN DO
• g kittens — a Google search for "kittens"
• ddg privacy — the same search on DuckDuckGo
• r/technology — jump straight to the r/technology subreddit
• $AAPL — pull up an Apple stock quote
• yt lofi beats — search YouTube
• gh fast-travel — search GitHub
• w black holes — search Wikipedia
• apps balatro — find an app on the right store for your device
• maps coffee — find nearby coffee on Google Maps
• hn — open Hacker News
Every command is yours to configure — change the triggers, point them anywhere, or
add your own.

FEATURES
• Command-based navigation — short triggers route to any site or search you set up.
• Inline suggestions — autocomplete as you type, per command, from the search engines
  you choose.
• New tab page — a fast, focused start page built around your commands.
• Address-bar integration — type a command in the address bar and go straight there.
• Bring your own config — keep your commands in a JSON file you host yourself and sync
  the same setup across every device and browser, or use the built-in defaults and
  edit them in-app.
• Device-aware routing — one command can resolve to the right destination per device.
• Groups & themes — organize and personalize your command set, with light and dark
  modes and multiple styles.

PRIVATE BY DESIGN
Fast Travel has no servers and no accounts. It collects nothing, tracks nothing, and
shows no ads. Your settings and commands stay on your device. Network requests only
happen when you ask for them — fetching your config file or search suggestions.
Full policy: https://kavi.sh/fast-travel-app/privacy-policy/

Open source: https://github.com/DoubleGremlin181/fast-travel-app
```

## Homepage

```
https://kavi.sh/fast-travel-app/
```

## License

MIT (matches the repository `LICENSE`).

## Privacy policy

URL: https://kavi.sh/fast-travel-app/privacy-policy/

## Notes for reviewers

- Minimum Firefox version: 128.0 (`strict_min_version` in the Firefox manifest).
- The extension registers a search provider that points at the sentinel host
  `fast-travel-omnibox.invalid`; this URL is intercepted internally and is never
  actually requested over the network — it is the mechanism used to capture the
  address-bar query and route it to the matching command.
- Source build: `cd extension && npm install && npm run build:firefox` produces the
  reviewed artifact in `extension/dist/`.

## Assets

- Listing icon: `icon-128.png` (128×128, transparent padding).
- Screenshots: `screenshots/` (4 @ 1280×800); captions in `screenshots/captions.md`.
- Packaged icon (auto-used from the XPI): `extension/src/icons/icon128.png`.
