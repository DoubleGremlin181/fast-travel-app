import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveCandidate } from "./check-domains.mjs";

test("resolveCandidate writes nothing when there's no auto-update entry", async () => {
  const result = await resolveCandidate({
    downDomain: "down.example",
    commandId: "some-cmd",
    commandName: "Some Cmd",
    autoUpdateEntry: undefined,
  });
  assert.equal(result, null);
});

test("resolveCandidate skips unknown source", async () => {
  const result = await resolveCandidate({
    downDomain: "down.example",
    commandId: "some-cmd",
    commandName: "Some Cmd",
    autoUpdateEntry: { source: "imaginary" },
  });
  assert.equal(result, null);
});

test("resolveCandidate returns the candidate when source resolves and HEAD check passes", async () => {
  const fakeFetch = async (url) => {
    // wikipedia.mjs hits the MediaWiki API and parses JSON
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        query: {
          pages: { "1": { extlinks: [{ "*": "https://reachable.example/" }] } },
        },
      }),
    };
  };
  const fakeCheckDomain = async (host) => ({ ok: true, status: 200, error: null });

  const result = await resolveCandidate({
    downDomain: "reachable.org",
    commandId: "some-cmd",
    commandName: "Reachable",
    autoUpdateEntry: { source: "wikipedia", wikipediaTitle: "Reachable" },
    fetchImpl: fakeFetch,
    checkDomainImpl: fakeCheckDomain,
  });
  assert.equal(result, "reachable.example");
});

test("resolveCandidate returns null when the source returns the same down domain", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      query: {
        pages: { "1": { extlinks: [{ "*": "https://down.example/" }] } },
      },
    }),
  });
  const result = await resolveCandidate({
    downDomain: "down.example",
    commandId: "some-cmd",
    commandName: "Some Cmd",
    autoUpdateEntry: { source: "wikipedia", wikipediaTitle: "Some Cmd" },
    fetchImpl: fakeFetch,
    checkDomainImpl: async () => ({ ok: true, status: 200, error: null }),
  });
  assert.equal(result, null);
});

test("resolveCandidate returns null when the candidate itself fails its HEAD check", async () => {
  const fakeFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      query: {
        pages: { "1": { extlinks: [{ "*": "https://dead.example/" }] } },
      },
    }),
  });
  // Resolver suggests "dead.example" (brand match), but the second HEAD check
  // says it's down, so resolveCandidate must reject it.
  const fakeCheckDomain = async () => ({ ok: false, status: null, error: "dns-error" });

  const result = await resolveCandidate({
    downDomain: "dead.org",
    commandId: "some-cmd",
    commandName: "Dead",
    autoUpdateEntry: { source: "wikipedia", wikipediaTitle: "Dead" },
    fetchImpl: fakeFetch,
    checkDomainImpl: fakeCheckDomain,
  });
  assert.equal(result, null);
});

test("resolveCandidate dispatches to the FMHY source when entry.source is 'fmhy'", async () => {
  const fmhyMarkdown = "* ⭐ **[Library Genesis](https://libgen.li/)** - Books";
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, text: async () => fmhyMarkdown };
  };
  const fakeCheckDomain = async () => ({ ok: true, status: 200, error: null });

  const result = await resolveCandidate({
    downDomain: "down.example",
    commandId: "libgen",
    commandName: "Library Genesis",
    autoUpdateEntry: { source: "fmhy", fmhyPath: "reading", matchName: "Library Genesis" },
    fetchImpl: fakeFetch,
    checkDomainImpl: fakeCheckDomain,
  });
  assert.equal(result, "libgen.li");
  assert.ok(calls[0].includes("/docs/reading.md"));
});
