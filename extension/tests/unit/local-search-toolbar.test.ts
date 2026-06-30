/**
 * Unit tests for the pure helpers in newtab/local-search-toolbar.ts.
 *
 * Covers:
 *   - datePresetToRange: epoch-ms range for each preset, including "any"
 *   - toggleType: add/remove semantics, pure result, no mutation
 *
 * No DOM or chrome.storage interaction — all helpers under test are pure
 * functions that take data and return a value.
 */

import { describe, it, expect } from "vitest";
import {
  datePresetToRange,
  toggleType,
} from "../../src/newtab/local-search-toolbar.js";

// ── datePresetToRange ─────────────────────────────────────────────────────────

describe("datePresetToRange", () => {
  const NOW = 1_700_000_000_000; // fixed epoch-ms anchor (≈ Nov 2023)
  const DAY = 86_400_000;

  it("returns undefined for 'any' (no filter)", () => {
    expect(datePresetToRange("any", NOW)).toBeUndefined();
  });

  it("returns { from: now - 7 days } for 'week' (epoch ms)", () => {
    const result = datePresetToRange("week", NOW);
    expect(result).toEqual({ from: NOW - 7 * DAY });
  });

  it("returns { from: now - 30 days } for 'month' (epoch ms)", () => {
    const result = datePresetToRange("month", NOW);
    expect(result).toEqual({ from: NOW - 30 * DAY });
  });

  it("returns { from: now - 365 days } for 'year' (epoch ms)", () => {
    const result = datePresetToRange("year", NOW);
    expect(result).toEqual({ from: NOW - 365 * DAY });
  });

  it("'week' from is strictly less than 'month' from (week is more recent)", () => {
    const week = datePresetToRange("week", NOW)!;
    const month = datePresetToRange("month", NOW)!;
    expect(week.from).toBeGreaterThan(month.from);
  });

  it("'month' from is strictly less than 'year' from (month is more recent)", () => {
    const month = datePresetToRange("month", NOW)!;
    const year = datePresetToRange("year", NOW)!;
    expect(month.from).toBeGreaterThan(year.from);
  });

  it("does not include a 'to' field (open-ended upper bound)", () => {
    const result = datePresetToRange("week", NOW);
    expect(result).not.toHaveProperty("to");
  });

  it("uses the exact `now` value provided (not Date.now() internally)", () => {
    const t1 = 1_000_000_000_000;
    const t2 = 2_000_000_000_000;
    const r1 = datePresetToRange("month", t1)!;
    const r2 = datePresetToRange("month", t2)!;
    expect(r1.from).toBe(t1 - 30 * DAY);
    expect(r2.from).toBe(t2 - 30 * DAY);
    expect(r1.from).not.toBe(r2.from);
  });
});

// ── toggleType ────────────────────────────────────────────────────────────────

describe("toggleType", () => {
  it("adds a type to an empty array", () => {
    expect(toggleType([], "document")).toEqual(["document"]);
  });

  it("adds a type when undefined is passed (treats as empty)", () => {
    expect(toggleType(undefined, "image")).toEqual(["image"]);
  });

  it("adds a type that is not already present", () => {
    expect(toggleType(["document"], "image")).toEqual(["document", "image"]);
  });

  it("removes a type that is already present", () => {
    expect(toggleType(["document", "image"], "image")).toEqual(["document"]);
  });

  it("removes the sole type, resulting in an empty array", () => {
    expect(toggleType(["document"], "document")).toEqual([]);
  });

  it("does not mutate the original array (pure)", () => {
    const original = ["document", "image"];
    const result = toggleType(original, "image");
    expect(original).toEqual(["document", "image"]); // unchanged
    expect(result).toEqual(["document"]);
  });

  it("preserves insertion order when adding", () => {
    const result = toggleType(["code", "image"], "audio");
    expect(result).toEqual(["code", "image", "audio"]);
  });

  it("preserves relative order of remaining items when removing from middle", () => {
    const result = toggleType(["document", "image", "video"], "image");
    expect(result).toEqual(["document", "video"]);
  });

  it("works with all FileType values", () => {
    const types = ["document", "image", "video", "audio", "archive", "code", "folder", "other"];
    let current: string[] = [];
    // Add all
    for (const t of types) {
      current = toggleType(current, t);
    }
    expect(current).toEqual(types);
    // Remove all
    for (const t of types) {
      current = toggleType(current, t);
    }
    expect(current).toEqual([]);
  });
});
