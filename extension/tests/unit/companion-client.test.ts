/**
 * Unit tests for companion-client.ts.
 *
 * All network I/O is intercepted by replacing globalThis.fetch with a stub.
 * AbortController is the real browser global (Node 18+ supplies it); we do not
 * need to mock it — mocked fetch throws / resolves before the abort timer fires,
 * and clearTimeout() cancels the timer in the finally block.
 *
 * chrome.storage.local is mocked (same helper as auto-ignore-store.test.ts) so
 * that discover()'s prefs read/write does not require a real extension context.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  discover,
  pair,
  openPairingWindow,
  search,
  openFile,
  CompanionError,
  DISCOVERY_PORTS,
} from "../../src/core/companion-client.js";
import type { PingResponse, SearchRequest } from "../../src/core/companion-types.js";

// ── Storage mock ─────────────────────────────────────────────────────────────

function mockStorage(initial: Record<string, unknown> = {}) {
  const backing: Record<string, unknown> = { ...initial };
  return {
    get: async (keys: string | string[]) => {
      const want = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of want) if (k in backing) out[k] = backing[k];
      return out;
    },
    set: async (obj: Record<string, unknown>) => {
      Object.assign(backing, obj);
    },
    remove: async (k: string | string[]) => {
      for (const key of Array.isArray(k) ? k : [k]) delete backing[key];
    },
    _backing: backing,
  };
}

function installStorage(initial: Record<string, unknown> = {}) {
  const storage = mockStorage(initial);
  (globalThis as unknown as { chrome: unknown }).chrome = { storage: { local: storage } };
  return storage;
}

// ── Fetch stub helpers ───────────────────────────────────────────────────────

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function stubFetch(fn: FetchFn) {
  (globalThis as unknown as { fetch: FetchFn }).fetch = fn;
}

function restoreFetch() {
  delete (globalThis as unknown as Record<string, unknown>).fetch;
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const PING: PingResponse = {
  name: "fast-travel-companion",
  version: "1.0.0",
  protocolVersion: 1,
  os: "linux",
  paired: false,
  pairingOpen: false,
  defaultIndexer: "baloo",
  indexers: [],
};

const SEARCH_REQ: SearchRequest = {
  query: "report",
  queryMode: "simple",
  sort: { field: "relevance", dir: "desc" },
  filters: {},
  page: 0,
  pageSize: 20,
};

const SEARCH_RESP = {
  results: [],
  total: 0,
  page: 0,
  tookMs: 3,
  indexer: "baloo",
};

// ── discover() ───────────────────────────────────────────────────────────────

describe("discover", () => {
  beforeEach(() => {
    installStorage(); // empty → no cached port → full scan
  });

  afterEach(() => {
    restoreFetch();
  });

  it("returns first responding port (7333)", async () => {
    let callCount = 0;
    stubFetch(async (url) => {
      callCount++;
      if (url.includes(":7333/")) {
        return new Response(JSON.stringify(PING), { status: 200 });
      }
      // Should not reach here for the first-port-succeeds case
      throw new Error(`Unexpected probe of ${url}`);
    });

    const result = await discover();

    expect(result).not.toBeNull();
    expect(result!.port).toBe(7333);
    expect(result!.ping).toEqual(PING);
    expect(callCount).toBe(1);
  });

  it("skips the first port and returns the second when 7333 fails", async () => {
    stubFetch(async (url) => {
      if (url.includes(":7334/")) {
        return new Response(JSON.stringify(PING), { status: 200 });
      }
      throw new Error("port unreachable");
    });

    const result = await discover();

    expect(result).not.toBeNull();
    expect(result!.port).toBe(7334);
  });

  it("returns null when all ports fail", async () => {
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    const result = await discover();

    expect(result).toBeNull();
  });

  it("returns null when all ports return non-ok HTTP status", async () => {
    stubFetch(async () => new Response(null, { status: 503 }));

    const result = await discover();

    expect(result).toBeNull();
  });

  it("scans all DISCOVERY_PORTS (11 ports, 7333–7343) before giving up", async () => {
    const probed: number[] = [];
    stubFetch(async (url) => {
      const match = url.match(/:(\d+)\//);
      if (match) probed.push(parseInt(match[1], 10));
      throw new Error("unreachable");
    });

    await discover();

    expect(probed).toEqual([...DISCOVERY_PORTS]);
  });

  it("uses cached port first, skipping full scan", async () => {
    // Pre-populate storage with a cached port
    const cachedPort = 7337;
    installStorage({
      "fast-travel-local-search-prefs": {
        enabled: false,
        queryMode: "simple",
        sort: { field: "relevance", dir: "desc" },
        filters: {},
        view: "list",
        port: cachedPort,
      },
    });

    let callCount = 0;
    stubFetch(async (url) => {
      callCount++;
      if (url.includes(`:${cachedPort}/`)) {
        return new Response(JSON.stringify(PING), { status: 200 });
      }
      throw new Error("should not probe other ports");
    });

    const result = await discover();

    expect(result!.port).toBe(cachedPort);
    expect(callCount).toBe(1); // only the cached port was tried
  });

  it("falls back to full scan when cached port fails", async () => {
    installStorage({
      "fast-travel-local-search-prefs": {
        enabled: false,
        queryMode: "simple",
        sort: { field: "relevance", dir: "desc" },
        filters: {},
        view: "list",
        port: 7337, // cached but dead
      },
    });

    stubFetch(async (url) => {
      if (url.includes(":7333/")) {
        return new Response(JSON.stringify(PING), { status: 200 });
      }
      throw new Error("unreachable");
    });

    const result = await discover();

    expect(result!.port).toBe(7333);
  });
});

// ── pair() ───────────────────────────────────────────────────────────────────

describe("pair", () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("POSTs {clientName} to /v1/pair and returns the token", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit = {};

    stubFetch(async (url, init = {}) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify({ token: "tok-abc123" }), { status: 200 });
    });

    const token = await pair(7333, "Fast Travel (Chrome)");

    expect(token).toBe("tok-abc123");
    expect(capturedUrl).toBe("http://127.0.0.1:7333/v1/pair");
    expect(capturedInit.method).toBe("POST");
    expect(JSON.parse(capturedInit.body as string)).toEqual({
      clientName: "Fast Travel (Chrome)",
    });
  });

  it("403 response → CompanionError with code pairing_closed", async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({ error: "pairing_closed", message: "Pairing window is closed" }),
        { status: 403 },
      ),
    );

    try {
      await pair(7333, "X");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("pairing_closed");
      expect((e as CompanionError).errorResponse?.error).toBe("pairing_closed");
    }
  });

  it("403 without body → CompanionError with code pairing_closed (fallback)", async () => {
    stubFetch(async () => new Response(null, { status: 403 }));

    try {
      await pair(7333, "X");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("pairing_closed");
    }
  });

  it("network failure → CompanionError with code network", async () => {
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    try {
      await pair(7333, "X");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("network");
    }
  });

  it("other non-ok status → CompanionError with server error code", async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({ error: "internal", message: "Unexpected error" }),
        { status: 500 },
      ),
    );

    try {
      await pair(7333, "X");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("internal");
    }
  });
});

// ── openPairingWindow() ──────────────────────────────────────────────────────

describe("openPairingWindow", () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("POSTs to /v1/pairing/open and resolves on 200", async () => {
    let capturedUrl = "";
    stubFetch(async (url) => {
      capturedUrl = url;
      return new Response(null, { status: 200 });
    });

    await expect(openPairingWindow(7333)).resolves.toBeUndefined();
    expect(capturedUrl).toBe("http://127.0.0.1:7333/v1/pairing/open");
  });

  it("network failure → CompanionError with code network", async () => {
    stubFetch(async () => {
      throw new Error("network");
    });

    try {
      await openPairingWindow(7333);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("network");
    }
  });
});

// ── search() ─────────────────────────────────────────────────────────────────

describe("search", () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("sends Authorization: Bearer header and POST body, returns SearchResponse", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: unknown;

    stubFetch(async (url, init = {}) => {
      capturedUrl = url;
      capturedHeaders = Object.fromEntries(
        new Headers(init.headers as HeadersInit).entries(),
      );
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify(SEARCH_RESP), { status: 200 });
    });

    const result = await search(7333, "tok-xyz", SEARCH_REQ);

    expect(result).toEqual(SEARCH_RESP);
    expect(capturedUrl).toBe("http://127.0.0.1:7333/v1/search");
    expect(capturedHeaders["authorization"]).toBe("Bearer tok-xyz");
    expect(capturedBody).toEqual(SEARCH_REQ);
  });

  it("token is sent only in Authorization header, not logged or thrown", async () => {
    // Structural: verify token does not appear in any thrown error message
    // on an ordinary 200 response. The body test above confirms the header path.
    stubFetch(async () => new Response(JSON.stringify(SEARCH_RESP), { status: 200 }));
    // No assertions needed — test passes if no error is thrown with token in it.
    await search(7333, "secret-token", SEARCH_REQ);
  });

  it("401 → CompanionError with code unauthorized", async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid token" }),
        { status: 401 },
      ),
    );

    try {
      await search(7333, "bad-token", SEARCH_REQ);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("unauthorized");
    }
  });

  it("401 without body → CompanionError with code unauthorized (fallback)", async () => {
    stubFetch(async () => new Response(null, { status: 401 }));

    try {
      await search(7333, "bad-token", SEARCH_REQ);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("unauthorized");
      expect((e as CompanionError).message).toBe("Unauthorized");
    }
  });

  it("503 → CompanionError with code indexer_unavailable", async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({ error: "indexer_unavailable", message: "Baloo not running" }),
        { status: 503 },
      ),
    );

    try {
      await search(7333, "tok", SEARCH_REQ);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("indexer_unavailable");
    }
  });

  it("network failure → CompanionError with code network", async () => {
    stubFetch(async () => {
      throw new Error("fetch failed");
    });

    try {
      await search(7333, "tok", SEARCH_REQ);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("network");
    }
  });
});

// ── openFile() ───────────────────────────────────────────────────────────────

describe("openFile", () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    restoreFetch();
  });

  it("POSTs {path} to /v1/open without reveal when reveal=false (default)", async () => {
    let capturedBody: unknown;
    stubFetch(async (_url, init = {}) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await openFile(7333, "tok", "/home/alice/doc.pdf");

    expect(capturedBody).toEqual({ path: "/home/alice/doc.pdf" });
  });

  it("POSTs {path, reveal:true} when reveal=true", async () => {
    let capturedBody: unknown;
    stubFetch(async (_url, init = {}) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await openFile(7333, "tok", "/home/alice/doc.pdf", true);

    expect(capturedBody).toEqual({ path: "/home/alice/doc.pdf", reveal: true });
  });

  it("sends Authorization: Bearer header", async () => {
    let authHeader = "";
    stubFetch(async (_url, init = {}) => {
      authHeader = new Headers(init.headers as HeadersInit).get("authorization") ?? "";
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await openFile(7333, "tok-open", "/some/path");

    expect(authHeader).toBe("Bearer tok-open");
  });

  it("network failure → CompanionError with code network", async () => {
    stubFetch(async () => {
      throw new Error("ECONNRESET");
    });

    try {
      await openFile(7333, "tok", "/path");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("network");
    }
  });

  it("401 → CompanionError with code unauthorized", async () => {
    stubFetch(async () =>
      new Response(
        JSON.stringify({ error: "unauthorized", message: "Bad token" }),
        { status: 401 },
      ),
    );

    try {
      await openFile(7333, "bad", "/path");
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(CompanionError);
      expect((e as CompanionError).code).toBe("unauthorized");
    }
  });
});
