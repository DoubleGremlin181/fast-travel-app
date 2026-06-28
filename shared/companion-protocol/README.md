# Fast Travel Companion Protocol

Cross-platform JSON contract between the **fast-travel local-search companion daemon** (Go),
the **browser extension** (TypeScript), and the **Android app** (Kotlin).

All types are defined in [`protocol.schema.json`](./protocol.schema.json).  
Fixtures are in [`fixtures/`](./fixtures/).

## Running the validator

```bash
node shared/companion-protocol/validate.mjs
```

Exit 0 = all fixtures pass; exit 1 = errors.  Use as a CI gate or pre-commit hook.

---

## Endpoints

All endpoints are HTTP/JSON on `127.0.0.1`. The companion listens on a fixed local port
(not yet specified here; tracked in the companion implementation task).

| Method / Path   | Auth         | Request body  | Response body                    |
|-----------------|--------------|---------------|----------------------------------|
| `GET /v1/ping`  | none         | —             | `PingResponse`                   |
| `POST /v1/pair` | Origin-check | `PairRequest` | `PairResponse` or `ErrorResponse`|
| `POST /v1/search`| Bearer token| `SearchRequest`| `SearchResponse` or `ErrorResponse`|
| `POST /v1/open` | Bearer token | `OpenRequest` | `OpenResponse` or `ErrorResponse`|

**Auth:** authenticated endpoints require `Authorization: Bearer <token>` where the token was
obtained from `POST /v1/pair`.  The companion validates the Origin header on `/v1/pair` to
prevent cross-site request forgery; it rejects origins that are not the extension's own
`chrome-extension://` or `moz-extension://` origin.

### WebSocket: `GET /v1/stream`

A WebSocket endpoint for push notifications from the companion to the extension (e.g. index
rebuild complete, indexer state changed).  Frame format is TBD and not schematised in this
task.  Frames are JSON objects with at minimum a `type` string field.  Authentication is
established by passing the Bearer token as a query parameter `?token=<token>` on the initial
HTTP upgrade request.

---

## 1. Object types

All named types are in `protocol.schema.json#/$defs`.

| Type | Description |
|------|-------------|
| `PingResponse` | Returned by `GET /v1/ping` — companion identity, OS, indexer list |
| `IndexerInfo` | One indexer entry inside `PingResponse.indexers` |
| `Capabilities` | Feature flags for an indexer (all booleans) |
| `PairRequest` / `PairResponse` | Pairing flow |
| `SearchRequest` | Search query with mode, sort, filters, pagination |
| `Sort` / `Filters` / `DateRange` | Sub-objects of `SearchRequest` |
| `SearchResponse` | Paginated results |
| `FileResult` | A single file match |
| `FileType` | Enum shared by `FileResult.type` and `Filters.types` |
| `OpenRequest` / `OpenResponse` | Open-file action |
| `ErrorResponse` | Error payload for any failed request |
| `AstNode` | Parsed query AST node (oneOf six shapes) |

### `FileResult.id` — canonical choice

`FileResult.id` is the **absolute path** of the file (identical to `FileResult.path`).
Using the path as the id keeps it stable across companion restarts and human-readable in
logs.  Implementations that cannot guarantee a stable absolute path (e.g. removable media)
may use a deterministic hash of the path and must document the hash function used.

---

## 2. Query mini-syntax and AST

This section is the authoritative specification.  All three implementations (Go, TypeScript,
Kotlin) must parse the same query string into the same normalised AST.  The fixture file
[`fixtures/query-parsing.json`](./fixtures/query-parsing.json) encodes the canonical AST for
every case listed below and is the parity gate.

### Syntax rules

- **Whitespace** separates terms.  Adjacent terms are implicitly **AND**.
- **`OR`** (case-insensitive, as a standalone token) **or** `|` (pipe) joins adjacent
  AND-groups with **OR**.  **AND binds tighter than OR**:
  `a b OR c d` → `(a AND b) OR (c AND d)`.
- A **leading `-` or `!`** on a term negates it: `a -b` → `a AND NOT b`.
- **Double quotes** form a **phrase**: `"foo bar"` is one phrase node (spaces are literal).
- **`path:` prefix** scopes a term to the `path` field instead of the default `name` field:
  `path:src`, `path:"my docs"`, `path:*util*`.
- **Wildcards** `*` and `?`:
  - In **`wildcard` mode**: `*` matches any run of characters; `?` matches one character.
    A term that contains `*` or `?` produces a `term` node with `wildcard: true`.
  - In **`simple` mode**: `*` and `?` are **literal characters**; `wildcard` is always `false`.
- In **`regex` mode**: no tokenisation occurs.  The entire `query` string is treated as a
  regular expression against the `name` field.  Exception: if the query starts with `path:`,
  the remainder (after stripping `path:`) is a regex against the `path` field.  No
  AND/OR/NOT/phrase parsing applies in regex mode.

### AST node shapes

Each node is one of (discriminated by `op`):

| `op`     | Required fields                          | Notes |
|----------|------------------------------------------|-------|
| `"and"`  | `nodes` (array, ≥ 2 `AstNode`s)         | Nested ANDs are flattened |
| `"or"`   | `nodes` (array, ≥ 2 `AstNode`s)         | Children are AND-groups |
| `"not"`  | `node` (single `AstNode`)               | Wraps exactly one node |
| `"term"` | `field`, `value`, `wildcard`             | `field`: `"name"` or `"path"` |
| `"phrase"`| `field`, `value`                        | `field`: `"name"` or `"path"` |
| `"regex"` | `field`, `value`                        | `field`: `"name"` or `"path"` |

### Normalisation rules

- A single term parses to the bare leaf node — no wrapping `and`.
- Multiple AND'd terms produce one flat `and` node with N children (nested ANDs are merged).
- OR produces one `or` node whose children are the AND-groups (each child is a leaf, a
  `phrase`, or an `and` node).
- `not` always wraps exactly one node.

### Fixture cases (summary)

See [`fixtures/query-parsing.json`](./fixtures/query-parsing.json) for the full ASTs.

| # | Query | Mode | Top-level op |
|---|-------|------|--------------|
| 1 | `report` | simple | `term` |
| 2 | `annual report` | simple | `and` |
| 3 | `cat OR dog` | simple | `or` |
| 4 | `a b \| c d` | wildcard | `or` → two `and` children |
| 5 | `report -draft` | simple | `and` (with `not` child) |
| 6 | `report !draft` | wildcard | `and` (with `not` child) |
| 7 | `"final report"` | simple | `phrase` |
| 8 | `path:projects` | simple | `term` on `path` field |
| 9 | `path:"my docs"` | wildcard | `phrase` on `path` field |
| 10 | `inv*.pdf` | wildcard | `term`, `wildcard:true` |
| 11 | `inv*.pdf` | simple | `term`, `wildcard:false` |
| 12 | `path:*reports*` | wildcard | `term` on `path`, `wildcard:true` |
| 13 | `^budget_\d{4}\.xlsx$` | regex | `regex` on `name` |
| 14 | `path:.*/invoices/.*` | regex | `regex` on `path` |
| 15 | `path:src foo OR bar -baz` | wildcard | `or` → two `and` children |

---

## 3. Capabilities matrix

See [`fixtures/capabilities.json`](./fixtures/capabilities.json) for the four documented
platform scenarios:

| Scenario | `defaultIndexer` | Notes |
|----------|-----------------|-------|
| Linux KDE | `baloo` | plocate available for regex routing |
| Linux (plocate only) | `plocate` | No content search |
| Windows | `wsearch` | Everything available for regex/wildcard |
| Android | `mediastore` | Reports `os: "linux"` (Android kernel); no regex, no content |

> **Android OS value:** The companion protocol's `os` field has three values —
> `"linux"`, `"windows"`, `"macos"`. An Android device reports `"linux"` because Android
> runs on the Linux kernel.  Client code that needs to distinguish Android from a desktop
> Linux host should check whether `defaultIndexer` is `"mediastore"`.
