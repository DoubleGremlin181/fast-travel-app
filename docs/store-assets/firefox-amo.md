# Firefox AMO — Listing Copy

**Draft for review.** Paste into addons.mozilla.org when creating the listing.

## Name

```
Fast Travel
```

## Add-on type

Extension. Extension ID: `khukmani+fast.travel@gmail.com`
(set in `extension/manifest.firefox.json`).

## Summary (max 250 chars)

```
Turn your address bar into a command line for the web. Define short triggers and jump
straight to the sites and searches you use most, with inline suggestions and a focused
new tab page. No servers, no tracking, no ads.
```

## Detailed description

```
Fast Travel turns your address bar into a command line for the web.

Instead of bookmarks, history, and half-remembered URLs, type a short command and go
straight where you mean to: a search on a specific site, a subreddit, a stock ticker,
your team's dashboard — whatever you set up.

FEATURES
• Command-based navigation — define triggers like "yt", "gh", or "r/" and route them
  anywhere you want.
• Inline suggestions — get autocomplete as you type, per command, from the search
  engines you choose.
• New tab page — a fast, focused start page built around your commands.
• Bring your own config — keep your commands in a JSON file you host yourself, and
  sync the same setup across every device and browser. Or just use the built-in
  defaults and edit them in-app.
• Groups, icon packs, and themes — organize and personalize your command set.

PRIVACY
Fast Travel has no servers and no accounts. It collects nothing, tracks nothing, and
shows no ads. Your settings and commands stay on your device. Network requests only
happen when you ask for them — fetching your config file or search suggestions.
Full policy: https://doublegremlin181.github.io/fast-travel-app/privacy-policy

Fast Travel is open source: https://github.com/DoubleGremlin181/fast-travel-app
```

## License

MIT (matches the repository `LICENSE`).

## Privacy policy

Required by AMO. URL: https://doublegremlin181.github.io/fast-travel-app/privacy-policy

## Notes for reviewers

- Minimum Firefox version: 128.0 (`strict_min_version` in the Firefox manifest).
- The extension registers a search provider that points at the sentinel host
  `fast-travel-omnibox.invalid`; this URL is intercepted internally and is never
  actually requested over the network — it is the mechanism used to capture the
  address-bar query and route it to the matching command.
- Source build: `cd extension && npm install && npm run build:firefox` produces the
  reviewed artifact in `extension/dist-firefox/`.

## Assets needed

- Screenshots: 1280×800 recommended (see `README.md`).
- Icon: 128×128 (already in `extension/src/icons/icon128.png`).
