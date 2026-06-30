/**
 * Unit tests for the pure helpers in options/screens/local-search.ts.
 *
 * None of these tests touch the DOM or chrome.storage — all helpers are
 * pure functions that take data and return a value.
 */

import { describe, it, expect } from "vitest";
import {
  detectOS,
  configHasSTrigger,
  regexAvailable,
  contentAvailable,
  deriveStatus,
} from "../../src/options/screens/local-search.js";
import type { FastTravelConfig } from "../../src/core/types.js";
import type { PingResponse, IndexerInfo, Capabilities } from "../../src/core/companion-types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CAPS_NONE: Capabilities = {
  booleanOps: false,
  prefixWildcard: false,
  infixWildcard: false,
  regex: false,
  pathScope: false,
  content: false,
};

function makeIndexer(
  id: string,
  available: boolean,
  caps: Partial<Capabilities> = {},
): IndexerInfo {
  return { id, name: id, available, capabilities: { ...CAPS_NONE, ...caps } };
}

const PING_BASE: PingResponse = {
  name: "fast-travel-companion",
  version: "1.0.0",
  protocolVersion: 1,
  os: "linux",
  paired: false,
  pairingOpen: false,
  defaultIndexer: "baloo",
  indexers: [],
};

function makeConfig(triggers: string[]): FastTravelConfig {
  return {
    version: 2,
    defaultCommand: triggers[0] ?? "g",
    groups: [
      {
        id: "g1",
        name: "General",
        commands: triggers.map((t, i) => ({
          id: `cmd-${i}`,
          triggers: [t],
          name: `Command ${i}`,
          type: "standard" as const,
          routes: [],
        })),
      },
    ],
    ignoreList: [],
  };
}

// ── detectOS ─────────────────────────────────────────────────────────────────

describe("detectOS", () => {
  it("detects Windows from a typical Chrome/Windows UA", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0";
    expect(detectOS(ua)).toBe("windows");
  });

  it("detects Windows case-insensitively ('win' substring)", () => {
    expect(detectOS("Mozilla/5.0 (Win32; x86) Gecko/20100101")).toBe("windows");
  });

  it("detects macOS from a typical Safari UA", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15";
    expect(detectOS(ua)).toBe("macos");
  });

  it("detects macOS from 'Mac' substring", () => {
    expect(detectOS("Mozilla/5.0 (Mac OS X 10_15_7)")).toBe("macos");
  });

  it("defaults to linux for a Linux UA", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0";
    expect(detectOS(ua)).toBe("linux");
  });

  it("defaults to linux for an empty string", () => {
    expect(detectOS("")).toBe("linux");
  });

  it("defaults to linux for an unrecognised UA", () => {
    expect(detectOS("SomeUnknownBrowser/1.0")).toBe("linux");
  });
});

// ── configHasSTrigger ─────────────────────────────────────────────────────────

describe("configHasSTrigger", () => {
  it("returns false for an empty config", () => {
    const cfg = makeConfig([]);
    // makeConfig uses triggers[0] as defaultCommand; guard against empty
    cfg.groups[0].commands = [];
    cfg.defaultCommand = "g";
    expect(configHasSTrigger(cfg)).toBe(false);
  });

  it("returns false when no command uses 's'", () => {
    expect(configHasSTrigger(makeConfig(["g", "yt", "gh"]))).toBe(false);
  });

  it("returns true when a command has 's' as a trigger (lowercase)", () => {
    expect(configHasSTrigger(makeConfig(["g", "s", "gh"]))).toBe(true);
  });

  it("returns true when a command has 'S' (uppercase — triggers are lower-cased by buildTriggerMap)", () => {
    const cfg = makeConfig(["g", "gh"]);
    cfg.groups[0].commands!.push({
      id: "cmd-s",
      triggers: ["S"],
      name: "Stack Overflow",
      type: "standard",
      routes: [],
    });
    expect(configHasSTrigger(cfg)).toBe(true);
  });

  it("returns false when the only trigger is 'st' (not 's')", () => {
    expect(configHasSTrigger(makeConfig(["g", "st"]))).toBe(false);
  });
});

// ── regexAvailable ────────────────────────────────────────────────────────────

describe("regexAvailable", () => {
  it("returns false when indexers list is empty", () => {
    expect(regexAvailable({ ...PING_BASE, indexers: [] })).toBe(false);
  });

  it("returns false when no available indexer supports regex", () => {
    const ping: PingResponse = {
      ...PING_BASE,
      indexers: [makeIndexer("baloo", true, { regex: false })],
    };
    expect(regexAvailable(ping)).toBe(false);
  });

  it("returns false when the regex-capable indexer is not available", () => {
    const ping: PingResponse = {
      ...PING_BASE,
      indexers: [makeIndexer("recoll", false, { regex: true })],
    };
    expect(regexAvailable(ping)).toBe(false);
  });

  it("returns true when at least one available indexer supports regex", () => {
    const ping: PingResponse = {
      ...PING_BASE,
      indexers: [
        makeIndexer("baloo", true, { regex: false }),
        makeIndexer("recoll", true, { regex: true }),
      ],
    };
    expect(regexAvailable(ping)).toBe(true);
  });

  it("returns true when the sole indexer is available and supports regex", () => {
    const ping: PingResponse = {
      ...PING_BASE,
      indexers: [makeIndexer("recoll", true, { regex: true })],
    };
    expect(regexAvailable(ping)).toBe(true);
  });
});

// ── contentAvailable ──────────────────────────────────────────────────────────

describe("contentAvailable", () => {
  it("returns false when there are no indexers", () => {
    expect(contentAvailable({ ...PING_BASE, indexers: [] })).toBe(false);
  });

  it("returns false when the default indexer is not in the list", () => {
    const ping: PingResponse = {
      ...PING_BASE,
      defaultIndexer: "missing",
      indexers: [makeIndexer("baloo", true, { content: true })],
    };
    expect(contentAvailable(ping)).toBe(false);
  });

  it("returns false when the default indexer does not support content", () => {
    const ping: PingResponse = {
      ...PING_BASE,
      defaultIndexer: "baloo",
      indexers: [makeIndexer("baloo", true, { content: false })],
    };
    expect(contentAvailable(ping)).toBe(false);
  });

  it("returns false when the default indexer supports content but is not available", () => {
    const ping: PingResponse = {
      ...PING_BASE,
      defaultIndexer: "recoll",
      indexers: [makeIndexer("recoll", false, { content: true })],
    };
    expect(contentAvailable(ping)).toBe(false);
  });

  it("returns true when the default indexer is available and supports content", () => {
    const ping: PingResponse = {
      ...PING_BASE,
      defaultIndexer: "recoll",
      indexers: [
        makeIndexer("baloo", true, { content: false }),
        makeIndexer("recoll", true, { content: true }),
      ],
    };
    expect(contentAvailable(ping)).toBe(true);
  });
});

// ── deriveStatus ──────────────────────────────────────────────────────────────

describe("deriveStatus", () => {
  it("returns 'notFound' when discover result is null and no previous port", () => {
    expect(deriveStatus(null, {})).toBe("notFound");
  });

  it("returns 'notFound' when discover result is null and port is undefined", () => {
    expect(deriveStatus(null, { port: undefined })).toBe("notFound");
  });

  it("returns 'disconnected' when discover result is null but a previous port is stored", () => {
    expect(deriveStatus(null, { port: 7333 })).toBe("disconnected");
  });

  it("returns 'unpaired' when companion is found but ping.paired is false", () => {
    const result = { port: 7333, ping: { ...PING_BASE, paired: false } };
    expect(deriveStatus(result, {})).toBe("unpaired");
  });

  it("returns 'unpaired' when companion is paired but we have no stored token", () => {
    const result = { port: 7333, ping: { ...PING_BASE, paired: true } };
    expect(deriveStatus(result, { port: 7333 })).toBe("unpaired");
  });

  it("returns 'connected' when companion is paired and we have a stored token", () => {
    const result = { port: 7333, ping: { ...PING_BASE, paired: true } };
    expect(deriveStatus(result, { port: 7333, token: "tok-abc" })).toBe("connected");
  });

  it("returns 'unpaired' when companion reports paired:false even if we have a stored token (re-pair needed)", () => {
    // Companion was reset; our old token is now invalid.
    const result = { port: 7333, ping: { ...PING_BASE, paired: false } };
    expect(deriveStatus(result, { port: 7333, token: "tok-old" })).toBe("unpaired");
  });
});
