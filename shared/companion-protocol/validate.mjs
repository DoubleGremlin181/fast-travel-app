#!/usr/bin/env node
// Validates shared/companion-protocol fixtures against the shapes defined in
// protocol.schema.json (hand-rolled subset — the JSON Schema is the source of
// truth; this script enforces the same invariants both clients rely on at
// runtime).
//
// Exit 0 = OK, exit 1 = errors. Use as a pre-commit / CI gate:
//   node shared/companion-protocol/validate.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// --- constants (mirrors schema enums) ---
const QUERY_MODES = new Set(["simple", "wildcard", "regex"]);
const SORT_FIELDS = new Set(["relevance", "created", "modified"]);
const SORT_DIRS = new Set(["asc", "desc"]);
const FILE_TYPES = new Set(["document", "image", "video", "audio", "archive", "code", "folder", "other"]);
const OS_VALUES = new Set(["linux", "windows", "macos"]);
const AST_OPS = new Set(["and", "or", "not", "term", "phrase", "regex"]);
const AST_FIELDS = new Set(["name", "path"]);

// --- helpers ---
function isString(v) { return typeof v === "string"; }
function isNonEmptyString(v) { return typeof v === "string" && v.length > 0; }
function isInteger(v) { return Number.isInteger(v); }
function isNonNegInt(v) { return Number.isInteger(v) && v >= 0; }
function isPosInt(v) { return Number.isInteger(v) && v >= 1; }
function isBool(v) { return typeof v === "boolean"; }
function isArray(v) { return Array.isArray(v); }
function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

function checkKeys(obj, allowed, path, errors) {
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) errors.push(`${path}: unexpected property "${k}"`);
  }
}

// --- AST node validator ---
const AST_AND_KEYS = new Set(["op", "nodes"]);
const AST_OR_KEYS = new Set(["op", "nodes"]);
const AST_NOT_KEYS = new Set(["op", "node"]);
const AST_TERM_KEYS = new Set(["op", "field", "value", "wildcard"]);
const AST_PHRASE_KEYS = new Set(["op", "field", "value"]);
const AST_REGEX_KEYS = new Set(["op", "field", "value"]);

function validateAstNode(node, path, errors) {
  if (!isObject(node)) {
    errors.push(`${path}: AST node must be an object`);
    return;
  }
  if (!AST_OPS.has(node.op)) {
    errors.push(`${path}.op: must be one of ${[...AST_OPS].join(", ")} — got ${JSON.stringify(node.op)}`);
    return;
  }
  switch (node.op) {
    case "and":
      checkKeys(node, AST_AND_KEYS, path, errors);
      if (!isArray(node.nodes) || node.nodes.length < 2) {
        errors.push(`${path}.nodes: must be an array with at least 2 elements for op "and"`);
      } else {
        node.nodes.forEach((n, i) => validateAstNode(n, `${path}.nodes[${i}]`, errors));
      }
      break;
    case "or":
      checkKeys(node, AST_OR_KEYS, path, errors);
      if (!isArray(node.nodes) || node.nodes.length < 2) {
        errors.push(`${path}.nodes: must be an array with at least 2 elements for op "or"`);
      } else {
        node.nodes.forEach((n, i) => validateAstNode(n, `${path}.nodes[${i}]`, errors));
      }
      break;
    case "not":
      checkKeys(node, AST_NOT_KEYS, path, errors);
      if (!isObject(node.node)) {
        errors.push(`${path}.node: must be an AST node object`);
      } else {
        validateAstNode(node.node, `${path}.node`, errors);
      }
      break;
    case "term":
      checkKeys(node, AST_TERM_KEYS, path, errors);
      if (!AST_FIELDS.has(node.field)) {
        errors.push(`${path}.field: must be "name" or "path" — got ${JSON.stringify(node.field)}`);
      }
      if (!isString(node.value)) errors.push(`${path}.value: must be a string`);
      if (!isBool(node.wildcard)) errors.push(`${path}.wildcard: must be a boolean`);
      break;
    case "phrase":
      checkKeys(node, AST_PHRASE_KEYS, path, errors);
      if (!AST_FIELDS.has(node.field)) {
        errors.push(`${path}.field: must be "name" or "path" — got ${JSON.stringify(node.field)}`);
      }
      if (!isString(node.value)) errors.push(`${path}.value: must be a string`);
      break;
    case "regex":
      checkKeys(node, AST_REGEX_KEYS, path, errors);
      if (!AST_FIELDS.has(node.field)) {
        errors.push(`${path}.field: must be "name" or "path" — got ${JSON.stringify(node.field)}`);
      }
      if (!isString(node.value)) errors.push(`${path}.value: must be a string`);
      break;
  }
}

// --- Capabilities validator ---
const CAPABILITIES_KEYS = new Set(["booleanOps", "prefixWildcard", "infixWildcard", "regex", "pathScope", "content"]);
const CAPABILITIES_REQUIRED = ["booleanOps", "prefixWildcard", "infixWildcard", "regex", "pathScope", "content"];

function validateCapabilities(cap, path, errors) {
  if (!isObject(cap)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(cap, CAPABILITIES_KEYS, path, errors);
  for (const k of CAPABILITIES_REQUIRED) {
    if (!isBool(cap[k])) errors.push(`${path}.${k}: must be a boolean`);
  }
}

// --- IndexerInfo validator ---
const INDEXER_INFO_KEYS = new Set(["id", "name", "available", "capabilities"]);

function validateIndexerInfo(idx, path, errors) {
  if (!isObject(idx)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(idx, INDEXER_INFO_KEYS, path, errors);
  if (!isNonEmptyString(idx.id)) errors.push(`${path}.id: must be a non-empty string`);
  if (!isNonEmptyString(idx.name)) errors.push(`${path}.name: must be a non-empty string`);
  if (!isBool(idx.available)) errors.push(`${path}.available: must be a boolean`);
  if (idx.capabilities === undefined) {
    errors.push(`${path}.capabilities: required`);
  } else {
    validateCapabilities(idx.capabilities, `${path}.capabilities`, errors);
  }
}

// --- PingResponse validator ---
const PING_KEYS = new Set(["name", "version", "protocolVersion", "os", "paired", "pairingOpen", "defaultIndexer", "indexers"]);

function validatePingResponse(ping, path, errors) {
  if (!isObject(ping)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(ping, PING_KEYS, path, errors);
  if (!isNonEmptyString(ping.name)) errors.push(`${path}.name: must be a non-empty string`);
  if (!isNonEmptyString(ping.version)) errors.push(`${path}.version: must be a non-empty string`);
  if (!isInteger(ping.protocolVersion) || ping.protocolVersion < 1) {
    errors.push(`${path}.protocolVersion: must be an integer >= 1`);
  }
  if (!OS_VALUES.has(ping.os)) {
    errors.push(`${path}.os: must be one of ${[...OS_VALUES].join(", ")} — got ${JSON.stringify(ping.os)}`);
  }
  if (!isBool(ping.paired)) errors.push(`${path}.paired: must be a boolean`);
  if (!isBool(ping.pairingOpen)) errors.push(`${path}.pairingOpen: must be a boolean`);
  if (!isNonEmptyString(ping.defaultIndexer)) errors.push(`${path}.defaultIndexer: must be a non-empty string`);
  if (!isArray(ping.indexers)) {
    errors.push(`${path}.indexers: must be an array`);
  } else {
    ping.indexers.forEach((idx, i) => validateIndexerInfo(idx, `${path}.indexers[${i}]`, errors));
  }
}

// --- Sort validator ---
const SORT_KEYS = new Set(["field", "dir"]);

function validateSort(sort, path, errors) {
  if (!isObject(sort)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(sort, SORT_KEYS, path, errors);
  if (!SORT_FIELDS.has(sort.field)) {
    errors.push(`${path}.field: must be one of ${[...SORT_FIELDS].join(", ")} — got ${JSON.stringify(sort.field)}`);
  }
  if (!SORT_DIRS.has(sort.dir)) {
    errors.push(`${path}.dir: must be one of ${[...SORT_DIRS].join(", ")} — got ${JSON.stringify(sort.dir)}`);
  }
}

// --- DateRange validator ---
const DATE_RANGE_KEYS = new Set(["from", "to"]);

function validateDateRange(dr, path, errors) {
  if (!isObject(dr)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(dr, DATE_RANGE_KEYS, path, errors);
  if (dr.from !== undefined && !isNonNegInt(dr.from)) {
    errors.push(`${path}.from: must be an integer >= 0 (epoch ms)`);
  }
  if (dr.to !== undefined && !isNonNegInt(dr.to)) {
    errors.push(`${path}.to: must be an integer >= 0 (epoch ms)`);
  }
}

// --- Filters validator ---
const FILTERS_KEYS = new Set(["types", "createdRange", "modifiedRange", "pathPrefix", "titleOnly", "content"]);

function validateFilters(filters, path, errors) {
  if (!isObject(filters)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(filters, FILTERS_KEYS, path, errors);
  if (filters.types !== undefined) {
    if (!isArray(filters.types)) {
      errors.push(`${path}.types: must be an array`);
    } else {
      filters.types.forEach((t, i) => {
        if (!FILE_TYPES.has(t)) {
          errors.push(`${path}.types[${i}]: must be one of ${[...FILE_TYPES].join(", ")} — got ${JSON.stringify(t)}`);
        }
      });
    }
  }
  if (filters.createdRange !== undefined) validateDateRange(filters.createdRange, `${path}.createdRange`, errors);
  if (filters.modifiedRange !== undefined) validateDateRange(filters.modifiedRange, `${path}.modifiedRange`, errors);
  if (filters.pathPrefix !== undefined && !isString(filters.pathPrefix)) {
    errors.push(`${path}.pathPrefix: must be a string`);
  }
  if (filters.titleOnly !== undefined && !isBool(filters.titleOnly)) {
    errors.push(`${path}.titleOnly: must be a boolean`);
  }
  if (filters.content !== undefined && !isBool(filters.content)) {
    errors.push(`${path}.content: must be a boolean`);
  }
}

// --- SearchRequest validator ---
const SEARCH_REQUEST_KEYS = new Set(["query", "queryMode", "sort", "filters", "page", "pageSize", "history"]);

function validateSearchRequest(req, path, errors) {
  if (!isObject(req)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(req, SEARCH_REQUEST_KEYS, path, errors);
  if (!isString(req.query)) errors.push(`${path}.query: must be a string`);
  if (!QUERY_MODES.has(req.queryMode)) {
    errors.push(`${path}.queryMode: must be one of ${[...QUERY_MODES].join(", ")} — got ${JSON.stringify(req.queryMode)}`);
  }
  if (req.sort === undefined) {
    errors.push(`${path}.sort: required`);
  } else {
    validateSort(req.sort, `${path}.sort`, errors);
  }
  if (req.filters === undefined) {
    errors.push(`${path}.filters: required`);
  } else {
    validateFilters(req.filters, `${path}.filters`, errors);
  }
  if (!isNonNegInt(req.page)) errors.push(`${path}.page: must be an integer >= 0`);
  if (!isPosInt(req.pageSize)) errors.push(`${path}.pageSize: must be an integer >= 1`);
  if (req.history !== undefined) {
    if (!isArray(req.history)) {
      errors.push(`${path}.history: must be an array if present`);
    } else {
      req.history.forEach((s, i) => {
        if (!isString(s)) errors.push(`${path}.history[${i}]: must be a string`);
      });
    }
  }
}

// --- FileResult validator ---
const FILE_RESULT_KEYS = new Set(["id", "name", "path", "dir", "ext", "mime", "type", "size", "createdAt", "modifiedAt", "score", "iconHint"]);

function validateFileResult(result, path, errors) {
  if (!isObject(result)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(result, FILE_RESULT_KEYS, path, errors);
  if (!isNonEmptyString(result.id)) errors.push(`${path}.id: must be a non-empty string`);
  if (!isNonEmptyString(result.name)) errors.push(`${path}.name: must be a non-empty string`);
  if (!isNonEmptyString(result.path)) errors.push(`${path}.path: must be a non-empty string`);
  if (!isNonEmptyString(result.dir)) errors.push(`${path}.dir: must be a non-empty string`);
  if (!isString(result.ext)) errors.push(`${path}.ext: must be a string`);
  if (!isString(result.mime)) errors.push(`${path}.mime: must be a string`);
  if (!FILE_TYPES.has(result.type)) {
    errors.push(`${path}.type: must be one of ${[...FILE_TYPES].join(", ")} — got ${JSON.stringify(result.type)}`);
  }
  if (!isNonNegInt(result.size)) errors.push(`${path}.size: must be an integer >= 0 (bytes)`);
  if (!isNonNegInt(result.createdAt)) errors.push(`${path}.createdAt: must be an integer >= 0 (epoch ms)`);
  if (!isNonNegInt(result.modifiedAt)) errors.push(`${path}.modifiedAt: must be an integer >= 0 (epoch ms)`);
  if (typeof result.score !== "number") errors.push(`${path}.score: must be a number`);
  if (result.iconHint !== undefined && !isString(result.iconHint)) {
    errors.push(`${path}.iconHint: must be a string if present`);
  }
}

// --- SearchResponse validator ---
const SEARCH_RESPONSE_KEYS = new Set(["results", "total", "page", "tookMs", "indexer", "degraded"]);

function validateSearchResponse(resp, path, errors) {
  if (!isObject(resp)) { errors.push(`${path}: must be an object`); return; }
  checkKeys(resp, SEARCH_RESPONSE_KEYS, path, errors);
  if (!isArray(resp.results)) {
    errors.push(`${path}.results: must be an array`);
  } else {
    resp.results.forEach((r, i) => validateFileResult(r, `${path}.results[${i}]`, errors));
  }
  if (!isNonNegInt(resp.total)) errors.push(`${path}.total: must be an integer >= 0`);
  if (!isNonNegInt(resp.page)) errors.push(`${path}.page: must be an integer >= 0`);
  if (!isNonNegInt(resp.tookMs)) errors.push(`${path}.tookMs: must be an integer >= 0`);
  if (!isNonEmptyString(resp.indexer)) errors.push(`${path}.indexer: must be a non-empty string`);
  if (resp.degraded !== undefined && !isBool(resp.degraded)) {
    errors.push(`${path}.degraded: must be a boolean if present`);
  }
}

// --- file loader ---
function loadJson(filePath, label) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    return { error: `Cannot read ${label}: ${e.message}` };
  }
  try {
    return { data: JSON.parse(raw) };
  } catch (e) {
    return { error: `Invalid JSON in ${label}: ${e.message}` };
  }
}

// --- fixture validators ---
function validateQueryParsing(data, errors) {
  if (!isObject(data) || !isArray(data.cases)) {
    errors.push("fixtures/query-parsing.json: must be { cases: [...] }");
    return 0;
  }
  data.cases.forEach((c, i) => {
    const p = `query-parsing.cases[${i}] ("${c.name ?? i}")`;
    if (!isNonEmptyString(c.name)) errors.push(`${p}.name: must be a non-empty string`);
    if (!isString(c.query)) errors.push(`${p}.query: must be a string`);
    if (!QUERY_MODES.has(c.queryMode)) {
      errors.push(`${p}.queryMode: must be one of ${[...QUERY_MODES].join(", ")} — got ${JSON.stringify(c.queryMode)}`);
    }
    validateAstNode(c.ast, `${p}.ast`, errors);
  });
  return data.cases.length;
}

function validateSearchExamples(data, errors) {
  if (!isObject(data) || !isArray(data.cases)) {
    errors.push("fixtures/search-examples.json: must be { cases: [...] }");
    return 0;
  }
  data.cases.forEach((c, i) => {
    const p = `search-examples.cases[${i}] ("${c.name ?? i}")`;
    if (!isNonEmptyString(c.name)) errors.push(`${p}.name: must be a non-empty string`);
    if (c.request === undefined) {
      errors.push(`${p}.request: required`);
    } else {
      validateSearchRequest(c.request, `${p}.request`, errors);
    }
    if (c.response === undefined) {
      errors.push(`${p}.response: required`);
    } else {
      validateSearchResponse(c.response, `${p}.response`, errors);
    }
  });
  return data.cases.length;
}

function validateCapabilitiesCases(data, errors) {
  if (!isObject(data) || !isArray(data.cases)) {
    errors.push("fixtures/capabilities.json: must be { cases: [...] }");
    return 0;
  }
  data.cases.forEach((c, i) => {
    const p = `capabilities.cases[${i}] ("${c.name ?? i}")`;
    if (!isNonEmptyString(c.name)) errors.push(`${p}.name: must be a non-empty string`);
    if (c.ping === undefined) {
      errors.push(`${p}.ping: required`);
    } else {
      validatePingResponse(c.ping, `${p}.ping`, errors);
    }
  });
  return data.cases.length;
}

// --- main ---
function main() {
  let totalErrors = 0;

  // 1. Verify schema exists and is valid JSON
  const schemaPath = resolve(HERE, "protocol.schema.json");
  const schemaResult = loadJson(schemaPath, "protocol.schema.json");
  if (schemaResult.error) {
    console.error(schemaResult.error);
    process.exit(1);
  }
  console.log("OK protocol.schema.json");

  // 2. query-parsing.json
  {
    const label = "fixtures/query-parsing.json";
    const result = loadJson(resolve(HERE, label), label);
    if (result.error) {
      console.error(result.error);
      totalErrors++;
    } else {
      const errors = [];
      const count = validateQueryParsing(result.data, errors);
      if (errors.length === 0) {
        console.log(`OK ${label} (${count} cases)`);
      } else {
        console.error(`FAIL ${label} (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
        for (const e of errors) console.error(`  - ${e}`);
        totalErrors += errors.length;
      }
    }
  }

  // 3. search-examples.json
  {
    const label = "fixtures/search-examples.json";
    const result = loadJson(resolve(HERE, label), label);
    if (result.error) {
      console.error(result.error);
      totalErrors++;
    } else {
      const errors = [];
      const count = validateSearchExamples(result.data, errors);
      if (errors.length === 0) {
        console.log(`OK ${label} (${count} cases)`);
      } else {
        console.error(`FAIL ${label} (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
        for (const e of errors) console.error(`  - ${e}`);
        totalErrors += errors.length;
      }
    }
  }

  // 4. capabilities.json
  {
    const label = "fixtures/capabilities.json";
    const result = loadJson(resolve(HERE, label), label);
    if (result.error) {
      console.error(result.error);
      totalErrors++;
    } else {
      const errors = [];
      const count = validateCapabilitiesCases(result.data, errors);
      if (errors.length === 0) {
        console.log(`OK ${label} (${count} cases)`);
      } else {
        console.error(`FAIL ${label} (${errors.length} error${errors.length === 1 ? "" : "s"}):`);
        for (const e of errors) console.error(`  - ${e}`);
        totalErrors += errors.length;
      }
    }
  }

  if (totalErrors === 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
