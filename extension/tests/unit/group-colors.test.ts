import { describe, it, expect } from "vitest";
import { resolveGroupTint } from "../../src/ui/group-colors.js";

describe("resolveGroupTint", () => {
  it("maps canonical Google brand colors to the matching tint", () => {
    expect(resolveGroupTint("#4285F4").fg).toBe("var(--tint-blue-fg)");
    expect(resolveGroupTint("#DB4437").fg).toBe("var(--tint-red-fg)");
    expect(resolveGroupTint("#0F9D58").fg).toBe("var(--tint-green-fg)");
  });

  it("falls back to hue buckets for non-canonical hex", () => {
    // Cyan-ish
    expect(resolveGroupTint("#17A2B8").fg).toBe("var(--tint-cyan-fg)");
    // Purple-ish
    expect(resolveGroupTint("#8B5CF6").fg).toBe("var(--tint-purple-fg)");
  });

  it("returns neutral for near-gray inputs", () => {
    expect(resolveGroupTint("#CCCCCC").fg).toBe("var(--tint-neutral-fg)");
  });

  it("returns neutral for undefined or bogus input", () => {
    expect(resolveGroupTint(undefined).fg).toBe("var(--tint-neutral-fg)");
    expect(resolveGroupTint("not-a-color").fg).toBe("var(--tint-neutral-fg)");
  });

  it("is case-insensitive and handles 3-char hex", () => {
    expect(resolveGroupTint("#4285f4").fg).toBe("var(--tint-blue-fg)");
    const short = resolveGroupTint("#08F");
    expect(short.fg).toBe("var(--tint-blue-fg)");
  });
});
