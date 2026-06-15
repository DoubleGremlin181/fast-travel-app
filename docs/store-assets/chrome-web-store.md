# Chrome Web Store — Listing Copy

## Name

```
Fast Travel
```

## Category

Productivity

## Short description (max 132 chars)

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
Full policy: https://doublegremlin181.github.io/fast-travel-app/privacy-policy

Open source: https://github.com/DoubleGremlin181/fast-travel-app
```

## Privacy practices (console questionnaire)

- Does the item collect user data? **No.**
- Single purpose: "Provide command-based navigation and search from the browser
  address bar and new tab page."
- Permission justifications:
  - `storage` — save the user's settings and command configuration locally.
  - `alarms` — periodically refresh the user's remote config in the background.
  - `tabs` / `webNavigation` — detect address-bar searches and route them to the
    matching command.
  - `declarativeNetRequestWithHostAccess` + host access — redirect the internal search
    sentinel URL to the resolved destination. No page content is read.

## Assets

- Screenshots: `chrome/screenshots/` (4 @ 1280×800).
- Small promo tile: `chrome/promo-tile.png` (440×280).
- Icon: 128×128 (`extension/src/icons/icon128.png`).
