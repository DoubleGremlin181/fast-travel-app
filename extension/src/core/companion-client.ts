/**
 * HTTP client for the Fast Travel companion daemon.
 *
 * All network details (URL construction, auth headers, timeout) live here.
 * Callers receive typed results or a CompanionError — never raw Response
 * objects or URL strings.
 *
 * Token hygiene: the token is placed into the Authorization header only.
 * It is never logged, thrown in error messages, or stored in this module.
 */

import type {
  PingResponse,
  SearchRequest,
  SearchResponse,
  ErrorCode,
  ErrorResponse,
} from "./companion-types.js";
import { getLocalSearchPrefs, setLocalSearchPrefs } from "./local-search-store.js";

// ── Constants ────────────────────────────────────────────────────────────────

/** Port range scanned by discover(). Companion default is 7333; scans up to 7343. */
export const DISCOVERY_PORTS: readonly number[] = [
  7333, 7334, 7335, 7336, 7337, 7338, 7339, 7340, 7341, 7342, 7343,
];

/** Per-port timeout for ping probes during discovery. */
export const PING_TIMEOUT_MS = 500;

// ── Error class ──────────────────────────────────────────────────────────────

/**
 * Typed error thrown by all companion-client functions.
 *
 * - `code`: one of the protocol ErrorCode values, or `"network"` for
 *   fetch/timeout failures where no HTTP response was received.
 * - `errorResponse`: the parsed ErrorResponse body when the server returned one.
 */
export class CompanionError extends Error {
  constructor(
    public readonly code: ErrorCode | "network",
    message: string,
    public readonly errorResponse?: ErrorResponse,
  ) {
    super(message);
    this.name = "CompanionError";
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}/v1`;
}

/**
 * Attempt a single /v1/ping on the given port. Returns the PingResponse on
 * success, or null if the port is unreachable, times out, or returns non-200.
 */
async function pingPort(port: number): Promise<PingResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl(port)}/ping`, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as PingResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the error body from a failed response, returning undefined if it
 * cannot be read or is not a valid ErrorResponse shape.
 */
async function parseErrorBody(res: Response): Promise<ErrorResponse | undefined> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string" && typeof body.message === "string") {
      return body as ErrorResponse;
    }
  } catch {
    // ignore
  }
  return undefined;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover the companion daemon by probing ports 7333–7343.
 *
 * - Checks the last-known port (stored in local-search prefs) first.
 * - Falls back to a full port scan if the cached port is absent or fails.
 * - Caches the found port in prefs so subsequent calls are fast.
 * - Returns null when no companion is running on any port.
 */
export async function discover(): Promise<{ port: number; ping: PingResponse } | null> {
  const prefs = await getLocalSearchPrefs();

  // Fast path: try the cached port first.
  if (prefs.port !== undefined) {
    const ping = await pingPort(prefs.port);
    if (ping !== null) {
      return { port: prefs.port, ping };
    }
  }

  // Full scan: try every port in order.
  for (const port of DISCOVERY_PORTS) {
    const ping = await pingPort(port);
    if (ping !== null) {
      await setLocalSearchPrefs({ port });
      return { port, ping };
    }
  }

  return null;
}

/**
 * Pair with the companion. Requires the companion's pairing window to be open.
 *
 * @param port       Active companion port (from discover).
 * @param clientName Human-readable client label, e.g. "Fast Travel (Chrome)".
 * @returns The Bearer token to use in subsequent authenticated calls.
 * @throws CompanionError  code "pairing_closed" (403) | "network" | other ErrorCode.
 */
export async function pair(port: number, clientName: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(port)}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName }),
    });
  } catch (e) {
    throw new CompanionError("network", (e as Error).message);
  }

  if (!res.ok) {
    const errBody = await parseErrorBody(res);
    const code: ErrorCode =
      errBody?.error ?? (res.status === 403 ? "pairing_closed" : "internal");
    throw new CompanionError(code, errBody?.message ?? `HTTP ${res.status}`, errBody);
  }

  const body = (await res.json()) as { token: string };
  return body.token;
}

/**
 * Ask the companion to open its pairing confirmation window. The user must
 * confirm on the companion side before pair() will succeed.
 *
 * @param port  Active companion port (from discover).
 * @throws CompanionError on network failure or non-OK response.
 */
export async function openPairingWindow(port: number): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(port)}/pairing/open`, { method: "POST" });
  } catch (e) {
    throw new CompanionError("network", (e as Error).message);
  }

  if (!res.ok) {
    const errBody = await parseErrorBody(res);
    const code: ErrorCode = errBody?.error ?? "internal";
    throw new CompanionError(code, errBody?.message ?? `HTTP ${res.status}`, errBody);
  }
}

/**
 * Execute a file search against the companion.
 *
 * @param port   Active companion port.
 * @param token  Bearer token from pair().
 * @param req    Search parameters (query, mode, sort, filters, pagination).
 * @throws CompanionError  code "unauthorized" (401 — re-pair required) | "network" | other ErrorCode.
 */
export async function search(
  port: number,
  token: string,
  req: SearchRequest,
): Promise<SearchResponse> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(port)}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(req),
    });
  } catch (e) {
    throw new CompanionError("network", (e as Error).message);
  }

  if (res.status === 401) {
    const errBody = await parseErrorBody(res);
    throw new CompanionError("unauthorized", errBody?.message ?? "Unauthorized", errBody);
  }

  if (!res.ok) {
    const errBody = await parseErrorBody(res);
    const code: ErrorCode = errBody?.error ?? "internal";
    throw new CompanionError(code, errBody?.message ?? `HTTP ${res.status}`, errBody);
  }

  return (await res.json()) as SearchResponse;
}

/**
 * Ask the companion to open (or reveal) a file in the OS file manager.
 *
 * @param port    Active companion port.
 * @param token   Bearer token from pair().
 * @param path    Absolute path of the file or folder to open.
 * @param reveal  When true, reveal the item in the file manager rather than
 *                opening it directly.
 * @throws CompanionError on auth failure, network error, or other error code.
 */
export async function openFile(
  port: number,
  token: string,
  path: string,
  reveal = false,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(port)}/open`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(reveal ? { path, reveal } : { path }),
    });
  } catch (e) {
    throw new CompanionError("network", (e as Error).message);
  }

  if (!res.ok) {
    const errBody = await parseErrorBody(res);
    const code: ErrorCode = errBody?.error ?? "internal";
    throw new CompanionError(code, errBody?.message ?? `HTTP ${res.status}`, errBody);
  }
}
