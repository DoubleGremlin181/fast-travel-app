// Frecency ranking for the empty-input "top commands" suggestions, shared in
// behaviour with the Android side (sh.kavi.fasttravel.core.Frecency) via
// shared/test-fixtures/frecency.fixtures.json.
//
// Each past use of a command contributes an exponentially-decaying weight
// (1-week half-life), so a command's score rewards both how often and how
// recently it was used. Never-used commands score 0 and keep config order,
// which also gives a sensible cold-start (no history -> config order).

export interface FrecencyHistoryEntry {
  commandId: string | null;
  timestamp: number;
}

const HALF_LIFE_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Rank `commandIds` (already in config order) by frecency, most relevant first.
 * Ties — including the all-zero cold-start case — fall back to config order.
 */
export function rankByFrecency(
  commandIds: string[],
  history: FrecencyHistoryEntry[],
  now: number,
): string[] {
  const score = new Map<string, number>();
  for (const id of commandIds) score.set(id, 0);

  for (const entry of history) {
    const id = entry.commandId;
    if (id == null || !score.has(id)) continue;
    const ageDays = Math.max(0, (now - entry.timestamp) / DAY_MS);
    score.set(id, (score.get(id) as number) + Math.pow(0.5, ageDays / HALF_LIFE_DAYS));
  }

  return commandIds
    .map((id, index) => ({ id, index, s: score.get(id) as number }))
    .sort((a, b) => b.s - a.s || a.index - b.index)
    .map((x) => x.id);
}
