/**
 * Pure blending of typed-query suggestion sources (#61): Fast Travel history,
 * the suggestions API, and browser history — approach "sections + top hit".
 *
 * Layout produced (command matches are rendered separately by the caller and
 * always sit above this list):
 *
 *   [top hit]          one frecency-promoted history entry (either kind),
 *                      only when it prefix-matches the query AND clears a
 *                      score floor — otherwise the slot collapses
 *   [FT history ≤2]    substring matches, newest first, promoted entry excluded
 *   [API ≤4]           server order, deduped against FT history text
 *   [browser ≤2]       input order, deduped by URL, promoted entry excluded
 *
 * No DOM, no chrome.* — deterministic given `now`, heavily unit-tested.
 */

import { decayScore } from "./frecency.js";

export interface FtHistoryEntry {
  query: string;
  commandId: string | null;
  timestamp: number;
}

export interface BrowserHistoryEntry {
  url: string;
  title: string;
  lastVisitTime: number;
  visitCount: number;
}

export interface BlendPrefs {
  blendFtHistory: boolean;
  includeBrowserHistory: boolean;
}

export interface BlendInput {
  query: string;
  /** Suggestion texts from the suggestions API, in server order. */
  api: string[];
  /** Full FT history (unfiltered); blend does the query matching. */
  ftHistory: FtHistoryEntry[];
  /** Browser history matches (already query-matched by chrome.history). */
  browserHistory: BrowserHistoryEntry[];
  prefs: BlendPrefs;
  now: number;
}

export type BlendedItem =
  | { kind: "history"; entry: FtHistoryEntry; topHit: boolean }
  | { kind: "api"; text: string; topHit: false }
  | { kind: "browser"; entry: BrowserHistoryEntry; topHit: boolean };

const MAX_FT = 2;
const MAX_API = 4;
const MAX_BROWSER = 2;
const MAX_TOTAL = 8;

/** Minimum frecency-style score for the top-hit slot to appear. */
const TOP_HIT_SCORE_FLOOR = 0.3;
/** visitCount contribution saturates here so one obsession can't dominate. */
const VISIT_COUNT_CAP = 10;

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Hostname of a URL with scheme and leading www. stripped, lowercased. */
function hostOf(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  let host = (m ? m[1] : url).toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  return host;
}

function ftScore(entry: FtHistoryEntry, now: number): number {
  return decayScore([entry.timestamp], now);
}

function browserScore(entry: BrowserHistoryEntry, now: number): number {
  const recency = decayScore([entry.lastVisitTime], now);
  const weight = Math.min(entry.visitCount, VISIT_COUNT_CAP) / VISIT_COUNT_CAP;
  return recency * weight;
}

function ftPrefixMatches(entry: FtHistoryEntry, q: string): boolean {
  return entry.query.toLowerCase().startsWith(q);
}

function browserPrefixMatches(entry: BrowserHistoryEntry, q: string): boolean {
  return (
    hostOf(entry.url).startsWith(q) || entry.title.toLowerCase().startsWith(q)
  );
}

export function blendSuggestions(input: BlendInput): BlendedItem[] {
  const q = normalizeText(input.query);
  if (q === "") return [];

  const ftAll = input.prefs.blendFtHistory
    ? input.ftHistory
        .filter((e) => normalizeText(e.query).includes(q))
        .sort((a, b) => b.timestamp - a.timestamp)
    : [];

  const browserAll = input.prefs.includeBrowserHistory
    ? input.browserHistory.filter(
        (e, i, arr) => arr.findIndex((x) => x.url === e.url) === i,
      )
    : [];

  // Top hit: best-scoring history entry (either kind) that prefix-matches
  // the query and clears the floor.
  let topHit: BlendedItem | null = null;
  let topScore = TOP_HIT_SCORE_FLOOR;
  for (const entry of ftAll) {
    const s = ftScore(entry, input.now);
    if (s > topScore && ftPrefixMatches(entry, q)) {
      topScore = s;
      topHit = { kind: "history", entry, topHit: true };
    }
  }
  for (const entry of browserAll) {
    const s = browserScore(entry, input.now);
    if (s > topScore && browserPrefixMatches(entry, q)) {
      topScore = s;
      topHit = { kind: "browser", entry, topHit: true };
    }
  }

  const promotedFt = topHit?.kind === "history" ? topHit.entry : null;
  const promotedBrowser = topHit?.kind === "browser" ? topHit.entry : null;

  const ftSection = ftAll.filter((e) => e !== promotedFt).slice(0, MAX_FT);

  // API dedupes against FT history text (identical query → the history copy
  // wins, it carries the user's own context). Browser URLs are a different
  // destination (navigate vs search) and never dedupe against API text.
  const ftTexts = new Set(ftAll.map((e) => normalizeText(e.query)));
  const apiSection = input.api
    .filter((text) => !ftTexts.has(normalizeText(text)))
    .slice(0, MAX_API);

  const browserSection = browserAll
    .filter((e) => e !== promotedBrowser)
    .slice(0, MAX_BROWSER);

  const out: BlendedItem[] = [];
  if (topHit) out.push(topHit);
  for (const entry of ftSection) out.push({ kind: "history", entry, topHit: false });
  for (const text of apiSection) out.push({ kind: "api", text, topHit: false });
  for (const entry of browserSection) out.push({ kind: "browser", entry, topHit: false });
  return out.slice(0, MAX_TOTAL);
}

/** First index of each consecutive run of equal kinds. */
export function sectionStarts(kinds: string[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < kinds.length; i++) {
    if (i === 0 || kinds[i] !== kinds[i - 1]) starts.push(i);
  }
  return starts;
}

/**
 * Index to jump to when moving one section down (dir=1) or up (dir=-1) from
 * `currentIndex`. Down goes to the next section's first item; up goes to the
 * previous section start (a mid-section index first snaps to its own section
 * start). Clamps at the ends.
 */
export function nextSectionStart(
  kinds: string[],
  currentIndex: number,
  dir: 1 | -1,
): number {
  const starts = sectionStarts(kinds);
  if (starts.length === 0) return currentIndex;
  if (dir === 1) {
    for (const s of starts) if (s > currentIndex) return s;
    return currentIndex;
  }
  for (let i = starts.length - 1; i >= 0; i--) {
    if (starts[i] < currentIndex) return starts[i];
  }
  return currentIndex <= 0 ? 0 : currentIndex;
}
