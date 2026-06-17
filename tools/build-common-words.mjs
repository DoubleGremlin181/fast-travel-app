#!/usr/bin/env node
/**
 * Regenerates shared/config/common-words.json — the list of words that are
 * skipped during typo detection so they're never offered as "did you mean a
 * command?" suggestions (see extension/src/core/parser.ts findTypoSuggestion).
 *
 * Why short words only: a word is only ever flagged as a typo of a command when
 * it's within edit distance of a trigger (distance 1 for inputs <=5 chars,
 * distance 2 for longer). Triggers are 1-4 chars, so words of 6+ letters can
 * essentially never collide and are dead weight. We therefore keep only words
 * of length 2-5 (plus the single letters "a"/"i", which DO collide with the
 * single-char triggers g/w/r).
 *
 * Data source: tools/common-words-source.txt — the public-domain
 * google-10000-english (USA) frequency-ranked word list
 * (https://github.com/first20hours/google-10000-english). We take the most
 * frequent FREQ_CUTOFF entries, then filter by length.
 *
 * A small curated supplement adds web/UI vocabulary and the real English words
 * we freed from being command triggers (file, time, news, maps, docs, ...),
 * guaranteeing those never produce a typo nag.
 *
 * Usage: node tools/build-common-words.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(__dirname, "common-words-source.txt");
const OUTPUT = join(__dirname, "..", "shared", "config", "common-words.json");

const FREQ_CUTOFF = 2000; // most-frequent N source entries to consider
const MIN_LEN = 2;
const MAX_LEN = 5;

// Single letters that collide with single-char triggers (g, w, r).
const SINGLE_LETTERS = ["a", "i"];

// Web/UI vocabulary + real words freed from being command triggers in this
// config. All <=5 chars. Kept explicit so freeing a trigger never re-introduces
// a typo nag for the plain word.
const SUPPLEMENT = [
  // freed command words
  "file", "time", "news", "maps", "map", "docs", "doc", "apps", "app",
  "gist", "paste", "anime", "manga",
  // common web / UI vocabulary
  "login", "email", "video", "music", "movie", "image", "photo", "price",
  "buy", "shop", "post", "chat", "blog", "wiki", "menu", "cart", "help",
  "faq", "wifi", "game", "song", "film", "show", "live", "feed", "like",
  "tag", "tags", "url", "pdf", "png", "jpg", "gif", "mp3", "mp4", "api",
  "date", "week", "day", "year", "free", "best", "top", "new",
];

const isWord = (w) => /^[a-z]+$/.test(w) && w.length >= MIN_LEN && w.length <= MAX_LEN;

const source = readFileSync(SOURCE, "utf8")
  .split("\n")
  .map((w) => w.trim().toLowerCase())
  .filter(Boolean);

const ranked = source.slice(0, FREQ_CUTOFF).filter(isWord);

// Merge, dedupe, preserve order: single letters, then frequency-ranked, then
// any supplement words not already present.
const seen = new Set();
const out = [];
for (const w of [...SINGLE_LETTERS, ...ranked, ...SUPPLEMENT.map((w) => w.toLowerCase())]) {
  if ((w.length === 1 ? SINGLE_LETTERS.includes(w) : isWord(w)) && !seen.has(w)) {
    seen.add(w);
    out.push(w);
  }
}

// Format 10 words per line for a readable diff (matches prior file style).
const lines = [];
for (let i = 0; i < out.length; i += 10) {
  const chunk = out.slice(i, i + 10).map((w) => JSON.stringify(w));
  lines.push("  " + chunk.join(", "));
}
const json = "[\n" + lines.join(",\n") + "\n]\n";

writeFileSync(OUTPUT, json);
console.log(`Wrote ${out.length} words to ${OUTPUT}`);
