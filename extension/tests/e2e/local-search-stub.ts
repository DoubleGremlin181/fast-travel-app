/**
 * Stub companion HTTP server for local-search e2e tests.
 *
 * Implements the minimal Fast Travel companion protocol subset needed for
 * end-to-end testing:
 *   GET  /v1/ping   — discovery probe (no auth)
 *   POST /v1/pair   — pairing (returns a fixed Bearer token)
 *   POST /v1/search — authenticated file search (returns 3 canned results)
 *   POST /v1/open   — authenticated file open (records the path)
 *
 * CORS headers are permissive (* origin) so the extension-origin fetch works
 * regardless of the loaded-extension origin Chromium assigns.
 */

import * as http from "node:http";

// ── Internal state ────────────────────────────────────────────────────────────

let paired = false;
let lastSearchBody: unknown = null;
let lastOpenPath: string | null = null;
let openCallCount = 0;
let searchCallCount = 0;

// ── Canned ping response ──────────────────────────────────────────────────────

function buildPingResponse() {
  return {
    name: "fast-travel-companion",
    version: "test",
    protocolVersion: 1,
    os: "linux",
    paired,
    pairingOpen: true,
    defaultIndexer: "baloo",
    indexers: [
      {
        id: "baloo",
        name: "KDE Baloo",
        available: true,
        capabilities: {
          booleanOps: true,
          prefixWildcard: true,
          infixWildcard: true,
          regex: false,
          pathScope: true,
          content: true,
        },
      },
      {
        id: "plocate",
        name: "plocate",
        available: true,
        capabilities: {
          booleanOps: false,
          prefixWildcard: true,
          infixWildcard: true,
          regex: true,
          pathScope: true,
          content: false,
        },
      },
    ],
  };
}

// ── Canned search response ────────────────────────────────────────────────────

function buildSearchResponse(query: string) {
  const now = Date.now();
  const results = [
    {
      id: "/home/user/docs/report-2024.pdf",
      name: "report-2024.pdf",
      path: "/home/user/docs/report-2024.pdf",
      dir: "/home/user/docs",
      ext: "pdf",
      mime: "application/pdf",
      type: "document",
      size: 1_048_576,
      createdAt: now - 86_400_000 * 30,
      modifiedAt: now - 3_600_000,
      score: 0.95,
    },
    {
      id: "/home/user/docs/report-draft.docx",
      name: "report-draft.docx",
      path: "/home/user/docs/report-draft.docx",
      dir: "/home/user/docs",
      ext: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      type: "document",
      size: 524_288,
      createdAt: now - 86_400_000 * 7,
      modifiedAt: now - 86_400_000,
      score: 0.88,
    },
    {
      id: "/home/user/docs/quarterly-report.xlsx",
      name: "quarterly-report.xlsx",
      path: "/home/user/docs/quarterly-report.xlsx",
      dir: "/home/user/docs",
      ext: "xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      type: "document",
      size: 262_144,
      createdAt: now - 86_400_000 * 14,
      modifiedAt: now - 86_400_000 * 2,
      score: 0.76,
    },
  ];

  return {
    results,
    total: 3,
    page: 0,
    tookMs: 1,
    indexer: "baloo",
    degraded: false,
  };
}

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS_HEADERS: http.OutgoingHttpHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ── Request routing ───────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const { method, url } = req;

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // ── Routes ──────────────────────────────────────────────────────────────────

  if (method === "GET" && url === "/v1/ping") {
    sendJson(res, 200, buildPingResponse());
    return;
  }

  if (method === "POST" && url === "/v1/pair") {
    paired = true;
    sendJson(res, 200, { token: "e2e-test-token" });
    return;
  }

  if (method === "POST" && url === "/v1/search") {
    const raw = await readBody(req);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { body = raw; }
    lastSearchBody = body;
    searchCallCount++;
    const query = typeof body === "object" && body !== null && "query" in body
      ? String((body as Record<string, unknown>).query)
      : "";
    sendJson(res, 200, buildSearchResponse(query));
    return;
  }

  if (method === "POST" && url === "/v1/open") {
    const raw = await readBody(req);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { body = raw; }
    const path = typeof body === "object" && body !== null && "path" in body
      ? String((body as Record<string, unknown>).path)
      : null;
    lastOpenPath = path;
    openCallCount++;
    sendJson(res, 200, { ok: true });
    return;
  }

  // Unknown route
  sendJson(res, 404, { error: "not_found", message: `No route for ${method} ${url}` });
}

// ── Server lifecycle ──────────────────────────────────────────────────────────

let server: http.Server | null = null;

export function start(): Promise<void> {
  // Reset all state on (re)start
  paired = false;
  lastSearchBody = null;
  lastOpenPath = null;
  openCallCount = 0;
  searchCallCount = 0;

  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err: unknown) => {
        console.error("[stub] unhandled error:", err);
        if (!res.headersSent) {
          sendJson(res, 500, { error: "internal", message: String(err) });
        }
      });
    });
    server.listen(7333, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
}

export function stop(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server) return resolve();
    server.close((err) => {
      server = null;
      if (err) reject(err);
      else resolve();
    });
  });
}

// ── Accessors for test assertions ─────────────────────────────────────────────

export function getLastSearchBody(): unknown {
  return lastSearchBody;
}

export function getLastOpenPath(): string | null {
  return lastOpenPath;
}

export function getOpenCallCount(): number {
  return openCallCount;
}

export function getSearchCallCount(): number {
  return searchCallCount;
}

export function isPaired(): boolean {
  return paired;
}
