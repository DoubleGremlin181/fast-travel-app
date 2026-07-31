import type {
  Command,
  FastTravelConfig,
  Group,
  NormalizeStep,
} from "./types.js";
import { flattenCommands } from "./config.js";

const NORMALIZE_VOCAB: readonly NormalizeStep[] = [
  "trim",
  "collapseSpaces",
  "stripSpaces",
  "lower",
  "upper",
  "snake",
  "camel",
];

const MAX_PATTERN_LENGTH = 64;

const ALLOWED_URL_RE = /^(https?|mailto|tel|file):/i;

function lintUrl(url: string, fieldPath: string): LintError[] {
  if (!ALLOWED_URL_RE.test(url)) {
    return [
      {
        path: fieldPath,
        message: `URL scheme not allowed (got "${url.split(":")[0]}")`,
      },
    ];
  }
  return [];
}

export interface LintError {
  path: string;
  message: string;
}

/**
 * Semantic config linter that checks constraints beyond JSON Schema.
 */
export function lintConfig(config: FastTravelConfig): LintError[] {
  const errors: LintError[] = [];
  const commands = flattenCommands(config);

  checkDuplicateTriggers(commands, errors);
  checkDuplicateIds(commands, errors);
  checkDefaultCommandExists(config, commands, errors);
  checkPatternPlaceholders(commands, errors);
  checkNormalize(commands, errors);
  checkEmptyStrings(commands, errors);
  checkUrlSchemes(commands, errors);
  checkDefaultLuckyUrl(config, errors);

  return errors;
}

const HTTPS_QUERY_RE = /^https?:\/\/.*\{query\}.*$/;

function checkDefaultLuckyUrl(
  config: FastTravelConfig,
  errors: LintError[],
): void {
  if (config.defaultLuckyUrl === undefined) return;
  if (!HTTPS_QUERY_RE.test(config.defaultLuckyUrl)) {
    errors.push({
      path: "defaultLuckyUrl",
      message: `defaultLuckyUrl must be an http(s) URL containing {query} — got "${config.defaultLuckyUrl}"`,
    });
  }
}

function checkDuplicateTriggers(
  commands: Command[],
  errors: LintError[],
): void {
  const seen = new Map<string, string>();
  for (const cmd of commands) {
    for (const trigger of cmd.triggers) {
      const lower = trigger.toLowerCase();
      const existing = seen.get(lower);
      if (existing) {
        errors.push({
          path: `commands.${cmd.id}.triggers`,
          message: `Duplicate trigger "${trigger}" (also used by "${existing}")`,
        });
      } else {
        seen.set(lower, cmd.id);
      }
    }
  }
}

function checkDuplicateIds(
  commands: Command[],
  errors: LintError[],
): void {
  const seen = new Set<string>();
  for (const cmd of commands) {
    if (seen.has(cmd.id)) {
      errors.push({
        path: `commands.${cmd.id}`,
        message: `Duplicate command id "${cmd.id}"`,
      });
    }
    seen.add(cmd.id);
  }
}

function checkDefaultCommandExists(
  config: FastTravelConfig,
  commands: Command[],
  errors: LintError[],
): void {
  const exists = commands.some((c) =>
    c.triggers.some(
      (t) => t.toLowerCase() === config.defaultCommand.toLowerCase(),
    ),
  );
  if (!exists) {
    errors.push({
      path: "defaultCommand",
      message: `Default command trigger "${config.defaultCommand}" does not match any command`,
    });
  }
}

function checkPatternPlaceholders(
  commands: Command[],
  errors: LintError[],
): void {
  for (const cmd of commands) {
    for (const route of cmd.routes) {
      if (!route.patterns) continue;
      for (const pattern of route.patterns) {
        const matchPlaceholders = extractPlaceholders(pattern.match);
        const urlPlaceholders = extractPlaceholders(pattern.url);

        for (const ph of matchPlaceholders) {
          if (!urlPlaceholders.has(ph)) {
            errors.push({
              path: `commands.${cmd.id}.patterns`,
              message: `Pattern placeholder "{${ph}}" in match "${pattern.match}" not found in url "${pattern.url}"`,
            });
          }
        }

        for (const ph of urlPlaceholders) {
          if (!matchPlaceholders.has(ph)) {
            errors.push({
              path: `commands.${cmd.id}.patterns`,
              message: `URL placeholder "{${ph}}" in "${pattern.url}" not captured in match "${pattern.match}"`,
            });
          }
        }

        checkLengthBounds(cmd.id, pattern.match, errors);
      }
    }
  }
}

const PLACEHOLDER_RE = /\{(\w+)(?::(\d+)(?:-(\d+))?)?\}/g;

function extractPlaceholders(str: string): Set<string> {
  const placeholders = new Set<string>();
  PLACEHOLDER_RE.lastIndex = 0;
  let match;
  while ((match = PLACEHOLDER_RE.exec(str)) !== null) {
    placeholders.add(match[1]);
  }
  return placeholders;
}

function checkLengthBounds(
  commandId: string,
  matchStr: string,
  errors: LintError[],
): void {
  PLACEHOLDER_RE.lastIndex = 0;
  let m;
  while ((m = PLACEHOLDER_RE.exec(matchStr)) !== null) {
    const lo = m[2] !== undefined ? Number(m[2]) : undefined;
    const hi = m[3] !== undefined ? Number(m[3]) : undefined;
    if (lo === undefined) continue;
    if (lo < 1 || lo > MAX_PATTERN_LENGTH) {
      errors.push({
        path: `commands.${commandId}.patterns`,
        message: `Pattern length "{${m[1]}:${m[2]}${m[3] ? "-" + m[3] : ""}}" out of bounds (must be 1..${MAX_PATTERN_LENGTH})`,
      });
    }
    if (hi !== undefined) {
      if (hi < lo || hi > MAX_PATTERN_LENGTH) {
        errors.push({
          path: `commands.${commandId}.patterns`,
          message: `Pattern range "{${m[1]}:${m[2]}-${m[3]}}" invalid (must satisfy N ≤ M ≤ ${MAX_PATTERN_LENGTH})`,
        });
      }
    }
  }
}

function checkNormalize(
  commands: Command[],
  errors: LintError[],
): void {
  const vocab = new Set<string>(NORMALIZE_VOCAB);
  for (const cmd of commands) {
    if (!cmd.normalize) continue;
    for (const step of cmd.normalize) {
      if (!vocab.has(step)) {
        errors.push({
          path: `commands.${cmd.id}.normalize`,
          message: `Unknown normalize step "${step}". Allowed: ${NORMALIZE_VOCAB.join(", ")}`,
        });
      }
    }
  }
}

function checkEmptyStrings(
  commands: Command[],
  errors: LintError[],
): void {
  for (const cmd of commands) {
    if (!cmd.name.trim()) {
      errors.push({
        path: `commands.${cmd.id}.name`,
        message: "Command name is empty",
      });
    }
    for (const trigger of cmd.triggers) {
      if (!trigger.trim()) {
        errors.push({
          path: `commands.${cmd.id}.triggers`,
          message: "Empty trigger string",
        });
      }
    }
    for (const route of cmd.routes) {
      if (!route.defaultUrl.trim()) {
        errors.push({
          path: `commands.${cmd.id}.routes.defaultUrl`,
          message: "Empty defaultUrl",
        });
      }
    }
  }
}

function checkUrlSchemes(
  commands: Command[],
  errors: LintError[],
): void {
  for (const cmd of commands) {
    for (const route of cmd.routes) {
      if (route.defaultUrl.trim()) {
        errors.push(
          ...lintUrl(
            route.defaultUrl,
            `commands.${cmd.id}.routes.defaultUrl`,
          ),
        );
      }
      if (route.searchUrl?.trim()) {
        errors.push(
          ...lintUrl(
            route.searchUrl,
            `commands.${cmd.id}.routes.searchUrl`,
          ),
        );
      }
      if (route.patterns) {
        for (const pattern of route.patterns) {
          if (pattern.url.trim()) {
            errors.push(
              ...lintUrl(
                pattern.url,
                `commands.${cmd.id}.patterns.url`,
              ),
            );
          }
        }
      }
    }
  }
}
