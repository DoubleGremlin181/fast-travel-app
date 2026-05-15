# Chrome Web Store — Listing Copy

**Draft for review.** Paste into the Chrome Web Store developer console when creating
the listing. Edit freely.

## Name

```
Fast Travel
```

## Category

Productivity

## Short description (max 132 chars)

```
Type short commands in your address bar to jump straight to the sites and searches you use most.
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

## Assets needed

- Screenshots: 1280×800 PNG (see `README.md`). Suggested set: new tab page, a command
  in the address bar with suggestions, the options/commands screen, a theme showcase.
- Small promo tile: 440×280 PNG.
- Icon: 128×128 (already in `extension/src/icons/icon128.png`).
