import type { AutoIgnoreStore } from "./auto-ignore-store.js";

/**
 * Compute the effective ignore list: the union of `permanent` entries (always
 * ignored) and "active" auto-ignore `candidates` — those whose dismissal count
 * has reached `threshold` and that the user has not pinned via
 * `AutoIgnoreCandidate.doNotIgnore`.
 *
 * All output triggers are lowercased and deduplicated while preserving
 * insertion order: permanent entries come first, followed by any candidates
 * not already listed permanently.
 */
export function effectiveIgnoreList(
  permanent: string[],
  candidates: AutoIgnoreStore,
  threshold: number,
): string[] {
  const out = new Set<string>();
  for (const p of permanent) out.add(p.toLowerCase());
  for (const [trigger, cand] of Object.entries(candidates)) {
    if (!cand.doNotIgnore && cand.count >= threshold) {
      out.add(trigger.toLowerCase());
    }
  }
  return [...out];
}
