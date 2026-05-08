#!/usr/bin/env node

/**
 * DNS over Wikipedia -- domain health checker for Fast Travel v2
 *
 * Reads the default config, extracts every domain used by commands,
 * checks reachability with HTTP HEAD, and when a domain is down it
 * queries Wikipedia for the service to suggest alternative domains.
 *
 * Usage:
 *   node check-domains.mjs                 # check & report
 *   node check-domains.mjs --update-config # also patch the config file
 */

import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "../../shared/config/default-config.json");

const UPDATE_CONFIG = process.argv.includes("--update-config");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the origin (scheme + host) from a URL string, or null. */
function extractDomain(urlStr) {
  if (!urlStr) return null;
  try {
    const u = new URL(urlStr);
    // Skip non-http(s) schemes like file:// or mailto:
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname;
  } catch {
    return null;
  }
}

/** HTTP HEAD with a timeout.  Returns { ok, status, error }. */
async function checkDomain(domain) {
  const url = `https://${domain}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "FastTravel-DnsOverWikipedia/1.0" },
    });
    clearTimeout(timer);

    if (res.status >= 500) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, error: null };
  } catch (err) {
    clearTimeout(timer);
    const msg = err.name === "AbortError" ? "timeout" : err.message;
    return { ok: false, status: null, error: msg };
  }
}

/**
 * Query the MediaWiki API for external links on a Wikipedia article.
 * Returns an array of URLs found on the page, or [].
 */
const WIKIPEDIA_BASE_DELAY_MS = 250;
const WIKIPEDIA_MAX_RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWikipediaExtLinks(title) {
  const apiUrl =
    `https://en.wikipedia.org/w/api.php` +
    `?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=extlinks&ellimit=50&format=json`;

  // Polite throttle between calls plus exponential backoff on 429/503.
  await sleep(WIKIPEDIA_BASE_DELAY_MS);

  for (let attempt = 0; attempt < WIKIPEDIA_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        headers: { "User-Agent": "FastTravel-DnsOverWikipedia/1.0 (https://kavi.sh)" },
      });
      if (res.status === 429 || res.status === 503) {
        const headerWait = Number(res.headers.get("retry-after")) ||
          Number(res.headers.get("x-backoff")) || 0;
        const backoff = Math.max(headerWait * 1000, 1000 * 2 ** attempt);
        console.error(`  [wikipedia] ${res.status} on "${title}" — backing off ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) return [];
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) return [];

      const links = [];
      for (const page of Object.values(pages)) {
        if (page.extlinks) {
          for (const link of page.extlinks) {
            // MediaWiki returns { "*": "url" }
            const url = link["*"] || link.url;
            if (url) links.push(url);
          }
        }
      }
      return links;
    } catch {
      // Network error — back off and retry once.
      await sleep(1000 * 2 ** attempt);
    }
  }
  return [];
}

/**
 * Given raw external links from Wikipedia and the *down* domain,
 * extract plausible alternative domains (https only, skip the
 * broken domain itself, skip common non-service hosts).
 */
function extractAlternativeDomains(links, downDomain) {
  const dominated = new Set();
  const skipHosts = new Set([
    "web.archive.org",
    "archive.org",
    "www.wikidata.org",
    "d-nb.info",
    "id.loc.gov",
    "viaf.org",
    "www.worldcat.org",
  ]);

  for (const raw of links) {
    try {
      const u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      const host = u.hostname.toLowerCase();
      if (host === downDomain.toLowerCase()) continue;
      if (skipHosts.has(host)) continue;
      dominated.add(host);
    } catch {
      // ignore
    }
  }
  return [...dominated];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Read config
  const raw = await readFile(CONFIG_PATH, "utf-8");
  const config = JSON.parse(raw);

  // 2. Collect domains and their associated commands, recursing into nested groups.
  /** @type {Map<string, { commandIds: Set<string>, commandNames: Set<string> }>} */
  const domainMap = new Map();

  function collectFromGroups(groups) {
    for (const group of groups ?? []) {
      for (const cmd of group.commands ?? []) {
        for (const route of cmd.routes) {
          for (const urlField of ["defaultUrl", "searchUrl"]) {
            const domain = extractDomain(route[urlField]);
            if (!domain) continue;
            if (!domainMap.has(domain)) {
              domainMap.set(domain, {
                commandIds: new Set(),
                commandNames: new Set(),
              });
            }
            domainMap.get(domain).commandIds.add(cmd.id);
            domainMap.get(domain).commandNames.add(cmd.name);
          }
        }
      }
      collectFromGroups(group.groups);
    }
  }

  collectFromGroups(config.groups);

  const domains = [...domainMap.keys()];
  console.error(`[dns-over-wikipedia] Checking ${domains.length} unique domains...`);

  // 3. Check reachability
  const results = await Promise.all(
    domains.map(async (domain) => {
      const result = await checkDomain(domain);
      const tag = result.ok ? "OK" : "DOWN";
      console.error(`  ${tag}  ${domain}  ${result.error || result.status}`);
      return { domain, ...result };
    })
  );

  // 4. For unreachable domains, look up Wikipedia
  /** @type {Array<{ domain: string, commandId: string, suggestedAlternatives: string[] }>} */
  const unreachable = [];

  for (const r of results) {
    if (r.ok) continue;

    const meta = domainMap.get(r.domain);
    const commandIds = [...meta.commandIds];
    const names = [...meta.commandNames];

    // Build search terms from command names
    const searchTerms = new Set();
    for (const name of names) {
      searchTerms.add(name);
      // Also try the domain itself (e.g. "Fast.com")
      searchTerms.add(r.domain);
    }

    let allAlternatives = [];

    for (const term of searchTerms) {
      console.error(`  [wikipedia] Looking up "${term}" ...`);
      const links = await fetchWikipediaExtLinks(term);
      const alts = extractAlternativeDomains(links, r.domain);
      allAlternatives.push(...alts);
    }

    // Deduplicate
    allAlternatives = [...new Set(allAlternatives)];

    for (const cmdId of commandIds) {
      unreachable.push({
        domain: r.domain,
        error: r.error,
        commandId: cmdId,
        suggestedAlternatives: allAlternatives,
      });
    }
  }

  // 5. Build report
  const report = {
    timestamp: new Date().toISOString(),
    checked: domains.length,
    healthy: results.filter((r) => r.ok).length,
    unreachable,
  };

  // 6. Optionally update config
  if (UPDATE_CONFIG && unreachable.length > 0) {
    console.error(`\n[dns-over-wikipedia] --update-config: attempting to patch config...`);
    let configChanged = false;

    for (const entry of unreachable) {
      if (entry.suggestedAlternatives.length === 0) {
        console.error(`  SKIP ${entry.domain} (${entry.commandId}): no alternatives found`);
        continue;
      }

      // Pick the first suggested alternative
      const newDomain = entry.suggestedAlternatives[0];
      console.error(`  PATCH ${entry.commandId}: ${entry.domain} -> ${newDomain}`);

      for (const group of config.groups ?? []) {
        for (const cmd of group.commands ?? []) {
          if (cmd.id === entry.commandId) {
            for (const route of cmd.routes) {
              for (const field of ["defaultUrl", "searchUrl"]) {
                if (route[field] && extractDomain(route[field]) === entry.domain) {
                  route[field] = route[field].replace(entry.domain, newDomain);
                  configChanged = true;
                }
              }
            }
          }
        }
      }
    }

    if (configChanged) {
      await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
      console.error(`[dns-over-wikipedia] Config updated: ${CONFIG_PATH}`);
    } else {
      console.error(`[dns-over-wikipedia] No changes applied to config.`);
    }
  }

  // 7. Output JSON report to stdout
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(`[dns-over-wikipedia] Fatal error: ${err.message}`);
  process.exit(1);
});
