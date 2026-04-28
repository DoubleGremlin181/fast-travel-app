# Contributing to Fast Travel App

## Adding or Editing Commands

Commands live in `shared/config/default-config.json`. The schema is at `shared/config/config.schema.json`.

1. Edit `shared/config/default-config.json`
2. Run `node tools/validate-config.mjs` — must pass before opening a PR
3. Test locally in the extension (`npm run build` then load from `extension/dist/`)

## Pull Requests

- One logical change per PR
- All tests must pass (CI runs automatically on every PR)
- Do not manually bump version numbers — the release workflow handles that
- For extension changes: run `cd extension && npm test` and `npm run test:e2e`
- For Android changes: run `cd android && ./gradlew test`

## Adding Extension Features

Source is under `extension/src/`. The build entry points are:
- `src/background/service-worker.ts` — background logic, DNR rules
- `src/options/options.ts` — settings UI
- `src/newtab/newtab.ts` — new tab page (search bar)
- `src/popup/popup.ts` — toolbar popup

Add unit tests in `extension/tests/unit/` and e2e tests in `extension/tests/e2e/`.

## Adding Android Features

Source is under `android/app/src/main/kotlin/sh/kavi/fasttravel/`.
- `core/` — pure business logic (no Android dependencies)
- `data/` — storage, config fetching, preferences
- `ui/` — Compose screens
- `deeplink/` — deep link handling

Add unit tests in `android/app/src/test/` and instrumented tests in `android/app/src/androidTest/`.
