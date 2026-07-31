#!/usr/bin/env node
// Validates shared/config/default-config.json against the rules in
// shared/config/config.schema.json (a hand-rolled subset — the JSON Schema is
// the source of truth, this script enforces the same invariants both clients
// rely on at runtime).
//
// Exit 0 = OK, exit 1 = errors. Use as a pre-commit / CI gate.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const SCHEMA_VERSION = 2;
const ID_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const TRIGGER_RE = /^\S+$/;
const URL_SCHEME_RE = /^(https?|mailto|tel|file):/;
const HTTPS_RE = /^https?:\/\//;
const HTTPS_QUERY_RE = /^https?:\/\/.*\{query\}.*$/;
const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const COMMAND_TYPES = new Set(["standard", "prefix", "redirect"]);
const DEVICES = new Set(["Windows", "MacOS", "Linux", "Android", "iOS", "Unknown"]);
const BROWSERS = new Set(["Chrome", "Firefox", "Safari", "Edge", "Other"]);
const NORMALIZE_STEPS = new Set(["trim", "collapseSpaces", "stripSpaces", "lower", "upper", "snake", "camel"]);
// Matches {name} and length-modified forms {name:N} / {name:N-M}. The captured
// group is always the bare name, so substitution code downstream only sees
// unique placeholder names. Mirrors extension/src/core/parser.ts PLACEHOLDER_RE.
const PLACEHOLDER_RE = /\{(\w+)(?::\d+(?:-\d+)?)?\}/g;
// URLs never use the length-modified form (runtime substitutes `{name}`, not
// `{name:N}`), so flag that separately.
const URL_LENGTH_MODIFIER_RE = /\{\w+:\d+(?:-\d+)?\}/g;

const ALLOWED_KEYS = {
  root: new Set(["$schema", "version", "defaultCommand", "defaultSuggestionsApi", "defaultLuckyUrl", "groups", "ignoreList"]),
  group: new Set(["id", "name", "color", "description", "commands", "groups"]),
  command: new Set(["id", "triggers", "name", "type", "description", "color", "iconUrl", "iconOverrides", "suggestionsApi", "normalize", "routes"]),
  iconOverride: new Set(["devices", "iconUrl"]),
  route: new Set(["devices", "browsers", "defaultUrl", "searchUrl", "patterns"]),
  pattern: new Set(["match", "url"]),
};

function isPlainString(v) {
  return typeof v === "string" && v.length > 0;
}

function extractPlaceholders(str) {
  const out = new Set();
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(str)) !== null) out.add(m[1]);
  return out;
}

function checkExtraKeys(obj, allowed, path, errors) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      errors.push(`${path}: unexpected property "${key}"`);
    }
  }
}

function validatePattern(p, path, errors) {
  if (!p || typeof p !== "object") {
    errors.push(`${path}: not an object`);
    return;
  }
  checkExtraKeys(p, ALLOWED_KEYS.pattern, path, errors);
  if (!isPlainString(p.match)) errors.push(`${path}.match: must be non-empty string`);
  if (!isPlainString(p.url)) errors.push(`${path}.url: must be non-empty string`);

  if (isPlainString(p.match) && isPlainString(p.url)) {
    const matchPh = extractPlaceholders(p.match);
    const urlPh = extractPlaceholders(p.url);
    for (const ph of urlPh) {
      if (!matchPh.has(ph)) {
        errors.push(`${path}: URL placeholder "{${ph}}" not captured by match "${p.match}"`);
      }
    }
    // URLs should use the plain `{name}` form — the length modifier only
    // constrains the match, not the substituted value.
    URL_LENGTH_MODIFIER_RE.lastIndex = 0;
    let mod;
    while ((mod = URL_LENGTH_MODIFIER_RE.exec(p.url)) !== null) {
      errors.push(`${path}: URL uses "${mod[0]}" — length modifiers belong in match only; use the bare {name} form in url`);
    }
    // Duplicate placeholder names within match are ambiguous — flag them.
    const counts = new Map();
    PLACEHOLDER_RE.lastIndex = 0;
    let m;
    while ((m = PLACEHOLDER_RE.exec(p.match)) !== null) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    }
    for (const [name, n] of counts) {
      if (n > 1) errors.push(`${path}: placeholder "{${name}}" used ${n} times in match "${p.match}" — names must be unique`);
    }
  }
}

function validateRoute(r, path, errors) {
  if (!r || typeof r !== "object") {
    errors.push(`${path}: not an object`);
    return;
  }
  checkExtraKeys(r, ALLOWED_KEYS.route, path, errors);

  if (r.devices === "*") {
    // ok
  } else if (Array.isArray(r.devices) && r.devices.length > 0) {
    for (const d of r.devices) {
      if (!DEVICES.has(d)) errors.push(`${path}.devices: "${d}" is not a known device`);
    }
  } else {
    errors.push(`${path}.devices: must be "*" or a non-empty array of device names`);
  }

  if (r.browsers !== undefined) {
    if (!Array.isArray(r.browsers) || r.browsers.length === 0) {
      errors.push(`${path}.browsers: must be a non-empty array if present`);
    } else {
      for (const b of r.browsers) {
        if (!BROWSERS.has(b)) errors.push(`${path}.browsers: "${b}" is not a known browser`);
      }
    }
  }

  if (!isPlainString(r.defaultUrl) || !URL_SCHEME_RE.test(r.defaultUrl)) {
    errors.push(`${path}.defaultUrl: must be http(s)/mailto/tel/file URL — got "${r.defaultUrl}"`);
  }
  if (r.searchUrl !== undefined) {
    if (!isPlainString(r.searchUrl) || !URL_SCHEME_RE.test(r.searchUrl)) {
      errors.push(`${path}.searchUrl: must be http(s)/mailto/tel/file URL — got "${r.searchUrl}"`);
    }
  }

  if (r.patterns !== undefined) {
    if (!Array.isArray(r.patterns)) {
      errors.push(`${path}.patterns: must be an array`);
    } else {
      r.patterns.forEach((p, i) => validatePattern(p, `${path}.patterns[${i}]`, errors));
    }
  }
}

function validateCommand(c, path, errors, seenIds, seenTriggers) {
  if (!c || typeof c !== "object") {
    errors.push(`${path}: not an object`);
    return;
  }
  checkExtraKeys(c, ALLOWED_KEYS.command, path, errors);

  if (!isPlainString(c.id) || !ID_RE.test(c.id)) {
    errors.push(`${path}.id: must be kebab-case ([a-z0-9] start/end) — got "${c.id}"`);
  } else if (seenIds.has(c.id)) {
    errors.push(`${path}.id: duplicate id "${c.id}"`);
  } else {
    seenIds.add(c.id);
  }

  if (!Array.isArray(c.triggers) || c.triggers.length === 0) {
    errors.push(`${path}.triggers: must be a non-empty array`);
  } else {
    for (const t of c.triggers) {
      if (!isPlainString(t) || !TRIGGER_RE.test(t)) {
        errors.push(`${path}.triggers: trigger "${t}" must be non-empty and contain no whitespace`);
        continue;
      }
      const lower = t.toLowerCase();
      const owner = seenTriggers.get(lower);
      if (owner && owner !== c.id) {
        errors.push(`${path}.triggers: trigger "${t}" is also used by command "${owner}"`);
      } else {
        seenTriggers.set(lower, c.id);
      }
    }
  }

  if (!isPlainString(c.name)) errors.push(`${path}.name: must be non-empty string`);
  if (!COMMAND_TYPES.has(c.type)) errors.push(`${path}.type: must be one of ${[...COMMAND_TYPES].join(", ")}`);

  if (c.description !== undefined && typeof c.description !== "string") {
    errors.push(`${path}.description: must be string if present`);
  }
  if (c.color !== undefined && (!isPlainString(c.color) || !HEX_COLOR_RE.test(c.color))) {
    errors.push(`${path}.color: must be a #RRGGBB or #RRGGBBAA hex color`);
  }
  if (c.iconUrl !== undefined && (!isPlainString(c.iconUrl) || !HTTPS_RE.test(c.iconUrl))) {
    errors.push(`${path}.iconUrl: must be http(s) URL — got "${c.iconUrl}"`);
  }
  if (c.iconOverrides !== undefined) {
    if (!Array.isArray(c.iconOverrides)) {
      errors.push(`${path}.iconOverrides: must be an array`);
    } else {
      const seenDevices = new Map(); // device -> overrideIndex
      c.iconOverrides.forEach((ov, i) => {
        const ovPath = `${path}.iconOverrides[${i}]`;
        if (!ov || typeof ov !== "object") {
          errors.push(`${ovPath}: not an object`);
          return;
        }
        checkExtraKeys(ov, ALLOWED_KEYS.iconOverride, ovPath, errors);
        if (!Array.isArray(ov.devices) || ov.devices.length === 0) {
          errors.push(`${ovPath}.devices: must be a non-empty array`);
        } else {
          for (const d of ov.devices) {
            if (!DEVICES.has(d)) {
              errors.push(`${ovPath}.devices: "${d}" is not a known device`);
              continue;
            }
            const prev = seenDevices.get(d);
            if (prev !== undefined) {
              errors.push(`${path}.iconOverrides: device "${d}" appears in entries [${prev}] and [${i}] — each device may appear in at most one override`);
            } else {
              seenDevices.set(d, i);
            }
          }
        }
        if (!isPlainString(ov.iconUrl) || !HTTPS_RE.test(ov.iconUrl)) {
          errors.push(`${ovPath}.iconUrl: must be http(s) URL — got "${ov.iconUrl}"`);
        }
      });
    }
  }
  if (c.suggestionsApi !== undefined && (!isPlainString(c.suggestionsApi) || !HTTPS_QUERY_RE.test(c.suggestionsApi))) {
    errors.push(`${path}.suggestionsApi: must be http(s) URL containing {query} — got "${c.suggestionsApi}"`);
  }

  if (c.normalize !== undefined) {
    if (!Array.isArray(c.normalize) || c.normalize.length === 0) {
      errors.push(`${path}.normalize: must be a non-empty array if present`);
    } else {
      for (const step of c.normalize) {
        if (!NORMALIZE_STEPS.has(step)) {
          errors.push(`${path}.normalize: "${step}" is not a known step (expected one of ${[...NORMALIZE_STEPS].join(", ")})`);
        }
      }
    }
  }

  if (!Array.isArray(c.routes) || c.routes.length === 0) {
    errors.push(`${path}.routes: must be a non-empty array`);
  } else {
    c.routes.forEach((r, i) => validateRoute(r, `${path}.routes[${i}]`, errors));
  }
}

function validateGroup(g, path, errors, seenIds, seenTriggers) {
  if (!g || typeof g !== "object") {
    errors.push(`${path}: not an object`);
    return;
  }
  checkExtraKeys(g, ALLOWED_KEYS.group, path, errors);

  if (!isPlainString(g.id) || !ID_RE.test(g.id)) {
    errors.push(`${path}.id: must be kebab-case — got "${g.id}"`);
  }
  if (!isPlainString(g.name)) errors.push(`${path}.name: must be non-empty string`);
  if (g.color !== undefined && (!isPlainString(g.color) || !HEX_COLOR_RE.test(g.color))) {
    errors.push(`${path}.color: must be a #RRGGBB or #RRGGBBAA hex color`);
  }

  if (g.commands !== undefined) {
    if (!Array.isArray(g.commands)) {
      errors.push(`${path}.commands: must be an array`);
    } else {
      g.commands.forEach((c, i) => validateCommand(c, `${path}.commands[${i}]`, errors, seenIds, seenTriggers));
    }
  }
  if (g.groups !== undefined) {
    if (!Array.isArray(g.groups)) {
      errors.push(`${path}.groups: must be an array`);
    } else {
      g.groups.forEach((sub, i) => validateGroup(sub, `${path}.groups[${i}]`, errors, seenIds, seenTriggers));
    }
  }
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== "object") {
    return ["config: not an object"];
  }
  checkExtraKeys(cfg, ALLOWED_KEYS.root, "config", errors);

  if (cfg.version !== SCHEMA_VERSION) {
    errors.push(`config.version: must be ${SCHEMA_VERSION} — got ${JSON.stringify(cfg.version)}`);
  }
  if (!isPlainString(cfg.defaultCommand)) {
    errors.push(`config.defaultCommand: must be non-empty string`);
  }
  if (cfg.defaultSuggestionsApi !== undefined &&
      (!isPlainString(cfg.defaultSuggestionsApi) || !HTTPS_QUERY_RE.test(cfg.defaultSuggestionsApi))) {
    errors.push(`config.defaultSuggestionsApi: must be http(s) URL containing {query}`);
  }
  if (cfg.defaultLuckyUrl !== undefined &&
      (!isPlainString(cfg.defaultLuckyUrl) || !HTTPS_QUERY_RE.test(cfg.defaultLuckyUrl))) {
    errors.push(`config.defaultLuckyUrl: must be http(s) URL containing {query}`);
  }
  if (cfg.ignoreList !== undefined) {
    if (!Array.isArray(cfg.ignoreList)) {
      errors.push(`config.ignoreList: must be an array`);
    } else {
      cfg.ignoreList.forEach((s, i) => {
        if (!isPlainString(s)) errors.push(`config.ignoreList[${i}]: must be non-empty string`);
      });
    }
  }

  const seenIds = new Set();
  const seenTriggers = new Map();

  if (!Array.isArray(cfg.groups) || cfg.groups.length === 0) {
    errors.push(`config.groups: must be a non-empty array`);
  } else {
    cfg.groups.forEach((g, i) => validateGroup(g, `config.groups[${i}]`, errors, seenIds, seenTriggers));
  }

  if (isPlainString(cfg.defaultCommand) && !seenTriggers.has(cfg.defaultCommand.toLowerCase())) {
    errors.push(`config.defaultCommand: "${cfg.defaultCommand}" does not match any command trigger`);
  }

  return errors;
}

function main() {
  const args = process.argv.slice(2);
  const path = args[0] ?? resolve(ROOT, "shared/config/default-config.json");
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    console.error(`Cannot read ${path}: ${e.message}`);
    process.exit(1);
  }
  let cfg;
  try {
    cfg = JSON.parse(raw);
  } catch (e) {
    console.error(`Invalid JSON in ${path}: ${e.message}`);
    process.exit(1);
  }
  const errors = validateConfig(cfg);
  if (errors.length === 0) {
    console.log(`OK ${path}`);
    process.exit(0);
  }
  console.error(`FAIL ${path} (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
