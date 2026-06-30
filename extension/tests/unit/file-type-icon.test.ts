/**
 * Unit tests for extension/src/newtab/file-type-icon.ts
 *
 * Covers the pure fileTypeIconDescriptor function:
 *   - each of the 8 FileType categories maps to a distinct iconId
 *   - each category yields a distinct fillVar (no two categories share the same background tint)
 *   - unknown type → "other" (unknown-type fallback)
 *   - ext argument is accepted (future extensibility) without breaking results
 *
 * No DOM or chrome.storage interaction — all helpers under test are pure.
 */

import { describe, it, expect } from "vitest";
import {
  fileTypeIconDescriptor,
  type FileTypeIconDescriptor,
} from "../../src/newtab/file-type-icon.js";
import type { FileType } from "../../src/core/companion-types.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ALL_TYPES: FileType[] = [
  "document",
  "image",
  "video",
  "audio",
  "archive",
  "code",
  "folder",
  "other",
];

// ── fileTypeIconDescriptor — per-category mapping ─────────────────────────────

describe("fileTypeIconDescriptor", () => {
  // --- each known type resolves to the correct iconId ------------------------

  it.each(ALL_TYPES)("type '%s' → iconId matches", (type) => {
    const result = fileTypeIconDescriptor(type);
    expect(result.iconId).toBe(type);
  });

  // --- all 8 iconIds are distinct -------------------------------------------

  it("all 8 categories yield distinct iconIds", () => {
    const ids = ALL_TYPES.map((t) => fileTypeIconDescriptor(t).iconId);
    expect(new Set(ids).size).toBe(ALL_TYPES.length);
  });

  // --- all 8 fillVars are distinct (no two categories share a background) ---

  it("all 8 categories yield distinct fillVar tints", () => {
    const fills = ALL_TYPES.map((t) => fileTypeIconDescriptor(t).fillVar);
    expect(new Set(fills).size).toBe(ALL_TYPES.length);
  });

  // --- all 8 fgVars are distinct -------------------------------------------

  it("all 8 categories yield distinct fgVar tints", () => {
    const fgs = ALL_TYPES.map((t) => fileTypeIconDescriptor(t).fgVar);
    expect(new Set(fgs).size).toBe(ALL_TYPES.length);
  });

  // --- fillVar and fgVar reference CSS custom properties -------------------

  it.each(ALL_TYPES)("type '%s' fillVar is a CSS custom property", (type) => {
    const { fillVar } = fileTypeIconDescriptor(type);
    expect(fillVar).toMatch(/^var\(--tint-/);
  });

  it.each(ALL_TYPES)("type '%s' fgVar is a CSS custom property", (type) => {
    const { fgVar } = fileTypeIconDescriptor(type);
    expect(fgVar).toMatch(/^var\(--tint-/);
  });

  // --- unknown type → "other" fallback ------------------------------------

  it("completely unknown type string → iconId 'other'", () => {
    const result = fileTypeIconDescriptor("spreadsheet");
    expect(result.iconId).toBe("other");
  });

  it("empty string type → iconId 'other'", () => {
    const result = fileTypeIconDescriptor("");
    expect(result.iconId).toBe("other");
  });

  it("unknown type → fillVar matches 'other' tint", () => {
    const unknown = fileTypeIconDescriptor("binary");
    const other = fileTypeIconDescriptor("other");
    expect(unknown.fillVar).toBe(other.fillVar);
    expect(unknown.fgVar).toBe(other.fgVar);
  });

  // --- ext argument is accepted without altering type-level result ---------

  it("passing an ext does not change the type-level result for known types", () => {
    const withExt = fileTypeIconDescriptor("document", "pdf");
    const withoutExt = fileTypeIconDescriptor("document");
    const result: FileTypeIconDescriptor = withExt;
    expect(result.iconId).toBe(withoutExt.iconId);
    expect(result.fillVar).toBe(withoutExt.fillVar);
    expect(result.fgVar).toBe(withoutExt.fgVar);
  });

  it("passing an ext to unknown type still falls back to 'other'", () => {
    const result = fileTypeIconDescriptor("binary", "exe");
    expect(result.iconId).toBe("other");
  });

  // --- spot checks for individual type tints (human-readable assertions) ---

  it("folder uses amber tint", () => {
    const { fillVar, fgVar } = fileTypeIconDescriptor("folder");
    expect(fillVar).toContain("amber");
    expect(fgVar).toContain("amber");
  });

  it("image uses green tint", () => {
    const { fillVar, fgVar } = fileTypeIconDescriptor("image");
    expect(fillVar).toContain("green");
    expect(fgVar).toContain("green");
  });

  it("video uses purple tint", () => {
    const { fillVar, fgVar } = fileTypeIconDescriptor("video");
    expect(fillVar).toContain("purple");
    expect(fgVar).toContain("purple");
  });

  it("audio uses cyan tint", () => {
    const { fillVar, fgVar } = fileTypeIconDescriptor("audio");
    expect(fillVar).toContain("cyan");
    expect(fgVar).toContain("cyan");
  });

  it("archive uses orange tint", () => {
    const { fillVar, fgVar } = fileTypeIconDescriptor("archive");
    expect(fillVar).toContain("orange");
    expect(fgVar).toContain("orange");
  });

  it("code uses blue tint", () => {
    const { fillVar, fgVar } = fileTypeIconDescriptor("code");
    expect(fillVar).toContain("blue");
    expect(fgVar).toContain("blue");
  });

  it("document uses red tint", () => {
    const { fillVar, fgVar } = fileTypeIconDescriptor("document");
    expect(fillVar).toContain("red");
    expect(fgVar).toContain("red");
  });

  it("other uses neutral tint", () => {
    const { fillVar, fgVar } = fileTypeIconDescriptor("other");
    expect(fillVar).toContain("neutral");
    expect(fgVar).toContain("neutral");
  });

  // --- return type is stable -----------------------------------------------

  it("same inputs always yield the same descriptor (referentially stable values)", () => {
    const a = fileTypeIconDescriptor("code", "ts");
    const b = fileTypeIconDescriptor("code", "ts");
    expect(a.iconId).toBe(b.iconId);
    expect(a.fillVar).toBe(b.fillVar);
    expect(a.fgVar).toBe(b.fgVar);
  });
});
