#!/usr/bin/env node
/**
 * Regenerates shared/config/tlds.json — the list of valid top-level domains
 * used by URL detection (see extension/src/core/parser.ts tryUrlDetection and
 * the Android CommandParser port). A single-token query like "gmail.com" only
 * navigates directly when its final label is on this list.
 *
 * Data source: tools/tlds-source.txt — a checked-in snapshot of IANA's
 * authoritative registry (https://data.iana.org/TLD/tlds-alpha-by-domain.txt).
 * The snapshot's "# Version" header line records its provenance/date.
 * Run with --fetch to refresh the snapshot from IANA before regenerating.
 *
 * Entries are lowercased; internationalized TLDs stay in their "xn--" punycode
 * form, so unicode TLDs typed in native script are NOT detected as URLs (they
 * fall through to search). That trade-off keeps detection ASCII-only and
 * identical across the extension and the Android port.
 *
 * Usage: node tools/build-tlds.mjs [--fetch]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, "tlds-source.txt");
const OUTPUT = join(__dirname, "..", "shared", "config", "tlds.json");
const IANA_URL = "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";

if (process.argv.includes("--fetch")) {
  const res = await fetch(IANA_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  writeFileSync(SOURCE, await res.text());
  console.log(`Refreshed ${SOURCE} from ${IANA_URL}`);
}

const tlds = readFileSync(SOURCE, "utf8")
  .split("\n")
  .map((l) => l.trim().toLowerCase())
  .filter((l) => l && !l.startsWith("#"))
  .sort();

// Format 10 entries per line for a readable diff (matches common-words.json).
const lines = [];
for (let i = 0; i < tlds.length; i += 10) {
  const chunk = tlds.slice(i, i + 10).map((t) => JSON.stringify(t));
  lines.push("  " + chunk.join(", "));
}
const json = "[\n" + lines.join(",\n") + "\n]\n";

writeFileSync(OUTPUT, json);
console.log(`Wrote ${tlds.length} TLDs to ${OUTPUT}`);
