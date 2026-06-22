import { test } from "node:test";
import assert from "node:assert/strict";

import { resolve } from "./wikipedia.mjs";

function fakeMediaWikiResponse(extlinks) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      query: {
        pages: {
          "12345": { extlinks: extlinks.map((u) => ({ "*": u })) },
        },
      },
    }),
  };
}

test("returns a same-brand mirror on a different TLD, skipping the down domain", async () => {
  const fakeFetch = async () =>
    fakeMediaWikiResponse([
      "https://sci-hub.se/",            // down — skipped
      "https://www.nature.com/articles/d41586", // unrelated coverage — skipped
      "https://sci-hub.st/",            // PICKED (same brand)
    ]);
  const host = await resolve({
    downDomain: "sci-hub.se",
    autoUpdate: { source: "wikipedia", wikipediaTitle: "Sci-Hub" },
    commandName: "Sci-Hub",
    fetchImpl: fakeFetch,
  });
  assert.equal(host, "sci-hub.st");
});

test("skips a news article that merely mentions the service and picks the real mirror", async () => {
  // Regression for the real failure: Wikipedia's first extlink for Anna's
  // Archive was a LA Weekly news article, not a mirror.
  const fakeFetch = async () =>
    fakeMediaWikiResponse([
      "https://www.laweekly.com/free-z-library-e-book-download-search-engine-annas-archive-launches/",
      "https://annas-archive.gl/", // PICKED (brand match)
    ]);
  const host = await resolve({
    downDomain: "annas-archive.org",
    autoUpdate: { source: "wikipedia", wikipediaTitle: "Anna's Archive" },
    commandName: "Anna's Archive",
    fetchImpl: fakeFetch,
  });
  assert.equal(host, "annas-archive.gl");
});

test("returns null when no external link matches the service brand (won't guess a news domain)", async () => {
  const fakeFetch = async () =>
    fakeMediaWikiResponse([
      "https://www.laweekly.com/some-article/",
      "https://news.ycombinator.com/item?id=1",
    ]);
  const host = await resolve({
    downDomain: "annas-archive.org",
    autoUpdate: { source: "wikipedia", wikipediaTitle: "Anna's Archive" },
    commandName: "Anna's Archive",
    fetchImpl: fakeFetch,
  });
  assert.equal(host, null);
});

test("resolve skips internet-archive and citation-database hosts", async () => {
  const fakeFetch = async () =>
    fakeMediaWikiResponse([
      "https://web.archive.org/web/...",
      "https://www.wikidata.org/wiki/Q123",
      "https://viaf.org/viaf/123",
      "https://sci-hub.st/", // brand match
    ]);
  const host = await resolve({
    downDomain: "sci-hub.se",
    autoUpdate: { source: "wikipedia", wikipediaTitle: "Sci-Hub" },
    commandName: "Sci-Hub",
    fetchImpl: fakeFetch,
  });
  assert.equal(host, "sci-hub.st");
});

test("resolve returns null when Wikipedia returns no external links", async () => {
  const fakeFetch = async () => fakeMediaWikiResponse([]);
  const host = await resolve({
    downDomain: "olddomain.example",
    autoUpdate: { source: "wikipedia", wikipediaTitle: "Nothing" },
    commandName: "Nothing",
    fetchImpl: fakeFetch,
  });
  assert.equal(host, null);
});

test("resolve uses commandName when wikipediaTitle is absent", async () => {
  const captured = [];
  const fakeFetch = async (url) => {
    captured.push(url);
    return fakeMediaWikiResponse(["https://sci-hub.st/"]);
  };
  const host = await resolve({
    downDomain: "sci-hub.se",
    autoUpdate: { source: "wikipedia" },
    commandName: "Sci-Hub",
    fetchImpl: fakeFetch,
  });
  assert.ok(captured[0].includes("Sci-Hub"));
  assert.equal(host, "sci-hub.st");
});
