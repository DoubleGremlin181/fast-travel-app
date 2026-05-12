#!/usr/bin/env node

/**
 * Auto-update domains -- health checker for Fast Travel v2 config.
 *
 * Reads the default config, extracts every domain used by commands,
 * checks reachability with HTTP HEAD, and for each unreachable domain
 * dispatches to a registered source (Wikipedia or FMHY) per the mapping
 * in auto-update.json. The source returns a candidate hostname; the
 * orchestrator then HEAD-checks the candidate before applying it, so a
 * dead suggestion never lands in the config.
 *
 * Usage:
 *   node check-domains.mjs                 # check & report
 *   node check-domains.mjs --update-config # also patch the config file
 */

import { readFile, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import * as wikipediaSource from "./sources/wikipedia.mjs";
import * as fmhySource from "./sources/fmhy.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "../../shared/config/default-config.json");
const AUTO_UPDATE_PATH = resolve(__dirname, "./auto-update.json");

const SOURCES = {
  wikipedia: wikipediaSource,
  fmhy: fmhySource,
};

/** Extract the host from a URL string, or null for non-http(s) URLs. */
export function extractDomain(urlStr) {
  if (!urlStr) return null;
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname;
  } catch {
    return null;
  }
}

/** HTTP HEAD with a 5s timeout. Returns { ok, status, error }. */
export async function checkDomain(domain, fetchImpl = fetch) {
  const url = `https://${domain}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetchImpl(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "FastTravel-AutoUpdateDomains/1.0" },
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

function collectDomainsForCommands(groups, out) {
  for (const group of groups ?? []) {
    for (const cmd of group.commands ?? []) {
      for (const route of cmd.routes) {
        for (const field of ["defaultUrl", "searchUrl"]) {
          const domain = extractDomain(route[field]);
          if (!domain) continue;
          if (!out.has(domain)) {
            out.set(domain, { commandIds: new Set(), commandNames: new Set() });
          }
          out.get(domain).commandIds.add(cmd.id);
          out.get(domain).commandNames.add(cmd.name);
        }
      }
    }
    collectDomainsForCommands(group.groups, out);
  }
}

function substituteDomain(config, commandId, oldDomain, newDomain) {
  let changed = false;
  function walk(groups) {
    for (const group of groups ?? []) {
      for (const cmd of group.commands ?? []) {
        if (cmd.id !== commandId) continue;
        for (const route of cmd.routes) {
          for (const field of ["defaultUrl", "searchUrl"]) {
            if (route[field] && extractDomain(route[field]) === oldDomain) {
              route[field] = route[field].replace(oldDomain, newDomain);
              changed = true;
            }
          }
        }
      }
      walk(group.groups);
    }
  }
  walk(config.groups);
  return changed;
}

/**
 * For one unreachable command, ask the registered source for a candidate
 * domain and verify that the candidate itself is reachable. Returns the
 * candidate hostname, or null on any failure.
 */
export async function resolveCandidate({
  downDomain,
  commandId,
  commandName,
  autoUpdateEntry,
  fetchImpl = fetch,
  checkDomainImpl = checkDomain,
}) {
  if (!autoUpdateEntry) {
    console.error(`  SKIP ${commandId}: no auto-update entry for "${commandId}"`);
    return null;
  }
  const sourceMod = SOURCES[autoUpdateEntry.source];
  if (!sourceMod) {
    console.error(`  SKIP ${commandId}: unknown source "${autoUpdateEntry.source}"`);
    return null;
  }

  const candidate = await sourceMod.resolve({
    downDomain,
    autoUpdate: autoUpdateEntry,
    commandName,
    fetchImpl,
  });
  if (!candidate) {
    console.error(`  SKIP ${commandId}: source "${autoUpdateEntry.source}" returned no candidate for ${downDomain}`);
    return null;
  }
  if (candidate === downDomain) {
    console.error(`  SKIP ${commandId}: source returned the same domain (${candidate})`);
    return null;
  }

  const verify = await checkDomainImpl(candidate, fetchImpl);
  if (!verify.ok) {
    console.error(`  SKIP ${commandId}: candidate ${candidate} is not reachable (${verify.error || verify.status})`);
    return null;
  }
  console.error(`  PATCH ${commandId}: ${downDomain} -> ${candidate}`);
  return candidate;
}

async function main() {
  const UPDATE_CONFIG = process.argv.includes("--update-config");

  const config = JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  let autoUpdate;
  try {
    autoUpdate = JSON.parse(await readFile(AUTO_UPDATE_PATH, "utf-8"));
  } catch (err) {
    console.error(`[auto-update-domains] Cannot read ${AUTO_UPDATE_PATH}: ${err.message}`);
    process.exit(1);
  }
  const autoUpdateMap = autoUpdate.commands ?? {};

  const domainMap = new Map();
  collectDomainsForCommands(config.groups, domainMap);

  const domains = [...domainMap.keys()];
  console.error(`[auto-update-domains] Checking ${domains.length} unique domains...`);

  const results = await Promise.all(
    domains.map(async (domain) => {
      const result = await checkDomain(domain);
      console.error(`  ${result.ok ? "OK  " : "DOWN"}  ${domain}  ${result.error || result.status}`);
      return { domain, ...result };
    }),
  );

  const unreachable = [];
  let configChanged = false;

  for (const r of results) {
    if (r.ok) continue;
    const meta = domainMap.get(r.domain);
    const commandIds = [...meta.commandIds];
    const commandName = [...meta.commandNames][0];

    for (const cmdId of commandIds) {
      const entry = autoUpdateMap[cmdId];
      const candidate = UPDATE_CONFIG
        ? await resolveCandidate({
            downDomain: r.domain,
            commandId: cmdId,
            commandName,
            autoUpdateEntry: entry,
          })
        : null;

      unreachable.push({
        domain: r.domain,
        error: r.error,
        commandId: cmdId,
        autoUpdate: entry ?? null,
        candidate: candidate ?? null,
      });

      if (UPDATE_CONFIG && candidate) {
        const patched = substituteDomain(config, cmdId, r.domain, candidate);
        if (patched) configChanged = true;
      }
    }
  }

  if (UPDATE_CONFIG) {
    if (configChanged) {
      await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
      console.error(`[auto-update-domains] Config updated: ${CONFIG_PATH}`);
    } else {
      console.error(`[auto-update-domains] No changes applied to config.`);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    checked: domains.length,
    healthy: results.filter((r) => r.ok).length,
    unreachable,
  };
  console.log(JSON.stringify(report, null, 2));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(`[auto-update-domains] Fatal error: ${err.message}`);
    process.exit(1);
  });
}
