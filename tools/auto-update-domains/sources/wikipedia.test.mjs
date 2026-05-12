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

test("resolve returns first plausible external link, skipping the down domain", async () => {
  const fakeFetch = async () =>
    fakeMediaWikiResponse([
      "https://olddomain.example/",   // down — skipped
      "https://newdomain.example/",
      "https://some-other.example/",
    ]);
  const host = await resolve({
    downDomain: "olddomain.example",
    autoUpdate: { source: "wikipedia", wikipediaTitle: "Some Service" },
    commandName: "Some Service",
    fetchImpl: fakeFetch,
  });
  assert.equal(host, "newdomain.example");
});

test("resolve skips internet-archive and citation-database hosts", async () => {
  const fakeFetch = async () =>
    fakeMediaWikiResponse([
      "https://web.archive.org/web/...",
      "https://www.wikidata.org/wiki/Q123",
      "https://viaf.org/viaf/123",
      "https://realdomain.example/",
    ]);
  const host = await resolve({
    downDomain: "olddomain.example",
    autoUpdate: { source: "wikipedia", wikipediaTitle: "Service" },
    commandName: "Service",
    fetchImpl: fakeFetch,
  });
  assert.equal(host, "realdomain.example");
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
    return fakeMediaWikiResponse(["https://x.example/"]);
  };
  await resolve({
    downDomain: "olddomain.example",
    autoUpdate: { source: "wikipedia" },
    commandName: "Fallback Title",
    fetchImpl: fakeFetch,
  });
  assert.ok(captured[0].includes("Fallback%20Title"));
});
