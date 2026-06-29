import type { AutoIgnoreStore } from "./auto-ignore-store.js";

/**
 * Compute the effective ignore list merged from three sources:
 *  - `permanent`: the config's baseline ignoreList (shared, ships in the config).
 *  - `local`: the user's device-local ignore additions. Kept OUT of the config
 *    on purpose so editing it never marks the config dirty / pauses remote
 *    auto-refresh — it's merged here at parse time instead.
 *  - `candidates`: "active" auto-ignore entries — those whose dismissal count
 *    has reached `threshold` and that the user has not pinned via
 *    `AutoIgnoreCandidate.doNotIgnore`.
 *
 * All output triggers are lowercased and deduplicated while preserving
 * insertion order: baseline first, then local additions, then active candidates.
 */
export function effectiveIgnoreList(
  permanent: string[],
  local: string[],
  candidates: AutoIgnoreStore,
  threshold: number,
): string[] {
  const out = new Set<string>();
  for (const p of permanent) out.add(p.toLowerCase());
  for (const l of local) out.add(l.toLowerCase());
  for (const [trigger, cand] of Object.entries(candidates)) {
    if (!cand.doNotIgnore && cand.count >= threshold) {
      out.add(trigger.toLowerCase());
    }
  }
  return [...out];
}
