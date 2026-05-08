import { describe, it, expect } from "vitest";
import { effectiveIgnoreList } from "../../src/core/effective-ignore-list.js";

const c = (count: number, doNotIgnore = false) => ({ count, doNotIgnore });

describe("effectiveIgnoreList", () => {
  it("permanent entries are always included", () => {
    expect(effectiveIgnoreList(["cat", "dog"], {}, 3)).toEqual(["cat", "dog"]);
  });

  it("candidate at or above threshold is included (boundary count == threshold)", () => {
    expect(effectiveIgnoreList([], { fcb: c(3) }, 3)).toEqual(["fcb"]);
    expect(effectiveIgnoreList([], { fcb: c(5) }, 3)).toEqual(["fcb"]);
  });

  it("candidate below threshold is excluded", () => {
    expect(effectiveIgnoreList([], { fcb: c(2) }, 3)).toEqual([]);
  });

  it("do-not-ignore candidate is excluded regardless of count", () => {
    expect(effectiveIgnoreList([], { fcb: c(10, true) }, 3)).toEqual([]);
  });

  it("permanent wins even if also flagged DNI as candidate (single entry in output)", () => {
    expect(
      effectiveIgnoreList(["fcb"], { fcb: c(0, true) }, 3),
    ).toEqual(["fcb"]);
  });

  it("result is lowercase and deduplicated", () => {
    expect(
      effectiveIgnoreList(["CAT", "cat"], { cat: c(5) }, 3),
    ).toEqual(["cat"]);
  });

  it("empty inputs return empty array", () => {
    expect(effectiveIgnoreList([], {}, 3)).toEqual([]);
  });
});
