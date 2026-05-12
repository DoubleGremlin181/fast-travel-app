#!/usr/bin/env node
// Validates tools/auto-update-domains/auto-update.json against its schema rules
// AND cross-references command-ids against shared/config/default-config.json.
//
// Exit 0 = OK, exit 1 = errors.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTO_UPDATE_PATH = resolve(HERE, "auto-update.json");
const CONFIG_PATH = resolve(HERE, "../../shared/config/default-config.json");

const ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SLUG_RE = /^[a-z0-9-]+$/;

function collectCommandIds(groups, out) {
  for (const g of groups ?? []) {
    for (const c of g.commands ?? []) {
      if (typeof c?.id === "string") out.add(c.id);
    }
    collectCommandIds(g.groups, out);
  }
}

export function validateAutoUpdate(autoUpdate, configCommandIds) {
  const errors = [];

  if (!autoUpdate || typeof autoUpdate !== "object") {
    return ["auto-update: not an object"];
  }
  for (const key of Object.keys(autoUpdate)) {
    if (key !== "$schema" && key !== "commands") {
      errors.push(`auto-update: unexpected property "${key}"`);
    }
  }
  if (!autoUpdate.commands || typeof autoUpdate.commands !== "object") {
    errors.push(`auto-update.commands: must be an object`);
    return errors;
  }

  for (const [id, entry] of Object.entries(autoUpdate.commands)) {
    const path = `auto-update.commands["${id}"]`;
    if (!ID_RE.test(id)) {
      errors.push(`${path}: id must be kebab-case`);
    }
    if (!configCommandIds.has(id)) {
      errors.push(`${path}: no command with id "${id}" exists in default-config.json`);
    }
    if (!entry || typeof entry !== "object") {
      errors.push(`${path}: not an object`);
      continue;
    }
    if (entry.source === "wikipedia") {
      const allowed = new Set(["source", "wikipediaTitle"]);
      for (const k of Object.keys(entry)) {
        if (!allowed.has(k)) errors.push(`${path}: unexpected property "${k}" for wikipedia source`);
      }
      if (typeof entry.wikipediaTitle !== "string" || entry.wikipediaTitle.length === 0) {
        errors.push(`${path}.wikipediaTitle: must be a non-empty string`);
      }
    } else if (entry.source === "fmhy") {
      const allowed = new Set(["source", "fmhyPath", "matchName"]);
      for (const k of Object.keys(entry)) {
        if (!allowed.has(k)) errors.push(`${path}: unexpected property "${k}" for fmhy source`);
      }
      if (typeof entry.fmhyPath !== "string" || !SLUG_RE.test(entry.fmhyPath)) {
        errors.push(`${path}.fmhyPath: must match ${SLUG_RE} — got ${JSON.stringify(entry.fmhyPath)}`);
      }
      if (typeof entry.matchName !== "string" || entry.matchName.length === 0) {
        errors.push(`${path}.matchName: must be a non-empty string`);
      }
    } else {
      errors.push(`${path}.source: must be "wikipedia" or "fmhy" — got ${JSON.stringify(entry.source)}`);
    }
  }

  return errors;
}

function main() {
  const autoUpdate = JSON.parse(readFileSync(AUTO_UPDATE_PATH, "utf8"));
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  const ids = new Set();
  collectCommandIds(config.groups, ids);

  const errors = validateAutoUpdate(autoUpdate, ids);
  if (errors.length === 0) {
    console.log(`OK ${AUTO_UPDATE_PATH}`);
    process.exit(0);
  }
  console.error(`FAIL ${AUTO_UPDATE_PATH} (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
