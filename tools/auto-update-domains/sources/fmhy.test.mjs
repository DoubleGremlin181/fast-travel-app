import { test } from "node:test";
import assert from "node:assert/strict";

import { findLinkHost, resolve } from "./fmhy.mjs";

const READING_FIXTURE = `
## Books

* ⭐ **[Library Genesis](https://libgen.li/)** - Books / Comics / Manga / [Tools](https://example.com/tools) / [Mirrors](https://example.com/mirrors)
* [Libgen for Calibre](https://github.com/poochinski9/libgen-calibre-store-plugin) - Tool
* ⭐ **[Sci-Hub](https://sci-hub.ru/)** - Science Articles / Research Papers
`;

const TORRENTING_FIXTURE = `
* [1337x](https://1337x.to/home/), [2](https://x1337x.cc/) - Video / Audio
* 1337x Tools - [Telegram Bot](https://t.me/search_content_bot)
* ⭐ **[BTDigg](https://btdig.com/)** - DHT-Based
`;

test("findLinkHost finds first matching link by matchName (substring, case-insensitive)", () => {
  assert.equal(findLinkHost(READING_FIXTURE, "Library Genesis", "olddomain.example"), "libgen.li");
  assert.equal(findLinkHost(READING_FIXTURE, "library genesis", "olddomain.example"), "libgen.li");
  assert.equal(findLinkHost(READING_FIXTURE, "Sci-Hub", "olddomain.example"), "sci-hub.ru");
});

test("findLinkHost picks the first link inside torrenting fixture", () => {
  assert.equal(findLinkHost(TORRENTING_FIXTURE, "1337x", "olddomain.example"), "1337x.to");
  assert.equal(findLinkHost(TORRENTING_FIXTURE, "BTDigg", "olddomain.example"), "btdig.com");
});

test("findLinkHost returns null when matchName is absent", () => {
  assert.equal(findLinkHost(READING_FIXTURE, "NonExistentService", "olddomain.example"), null);
});

test("findLinkHost returns null if the matched host equals downDomain", () => {
  assert.equal(findLinkHost(READING_FIXTURE, "Library Genesis", "libgen.li"), null);
});

test("findLinkHost handles bold/star wrapping around the link text", () => {
  const md = "* ⭐ **[Miruro](https://www.miruro.com/)** - streaming";
  assert.equal(findLinkHost(md, "Miruro", "down.example"), "www.miruro.com");
});

test("resolve fetches the FMHY markdown for fmhyPath and returns the hostname", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      text: async () => READING_FIXTURE,
    };
  };
  const host = await resolve({
    downDomain: "olddomain.example",
    autoUpdate: { source: "fmhy", fmhyPath: "reading", matchName: "Library Genesis" },
    fetchImpl: fakeFetch,
  });
  assert.equal(host, "libgen.li");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("/docs/reading.md"));
});

test("resolve returns null when FMHY returns non-2xx", async () => {
  const fakeFetch = async () => ({ ok: false, status: 404, text: async () => "" });
  const host = await resolve({
    downDomain: "olddomain.example",
    autoUpdate: { source: "fmhy", fmhyPath: "missing", matchName: "Whatever" },
    fetchImpl: fakeFetch,
  });
  assert.equal(host, null);
});

test("resolve returns null when fetch throws", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const host = await resolve({
    downDomain: "olddomain.example",
    autoUpdate: { source: "fmhy", fmhyPath: "reading", matchName: "Library Genesis" },
    fetchImpl: fakeFetch,
  });
  assert.equal(host, null);
});
