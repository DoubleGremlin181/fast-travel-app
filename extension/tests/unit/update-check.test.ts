import { describe, it, expect } from "vitest";
import {
  compareVersions,
  shouldPromptUpdate,
  parseLatestRelease,
  isUpdateCheckDue,
  RELEASES_PAGE_URL,
  UPDATE_CHECK_INTERVAL_MS,
  type LatestRelease,
} from "../../src/core/update-check.js";

const latest = (version: string): LatestRelease => ({
  version,
  url: `https://github.com/DoubleGremlin181/fast-travel-app/releases/tag/v${version}`,
  checkedAt: 1_700_000_000_000,
});

describe("compareVersions", () => {
  it("orders plain semver-style versions", () => {
    expect(compareVersions("2.1.8", "2.1.9")).toBeLessThan(0);
    expect(compareVersions("2.2.0", "2.1.9")).toBeGreaterThan(0);
    expect(compareVersions("3.0.0", "2.99.99")).toBeGreaterThan(0);
    expect(compareVersions("2.1.8", "2.1.8")).toBe(0);
  });

  it("compares segments numerically, not lexically", () => {
    expect(compareVersions("2.1.10", "2.1.9")).toBeGreaterThan(0);
  });

  it("strips a leading v", () => {
    expect(compareVersions("v2.1.9", "2.1.8")).toBeGreaterThan(0);
    expect(compareVersions("2.1.8", "v2.1.8")).toBe(0);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("2.1.8", "2.1.8.0")).toBe(0);
    // PR beta builds get a 4th segment and sort above their base release
    expect(compareVersions("2.1.8.73", "2.1.8")).toBeGreaterThan(0);
  });

  it("treats malformed versions as equal (fail closed)", () => {
    expect(compareVersions("abc", "2.1.8")).toBe(0);
    expect(compareVersions("2.1.8", "")).toBe(0);
  });
});

describe("shouldPromptUpdate", () => {
  it("prompts when the latest release is newer and nothing was dismissed", () => {
    expect(shouldPromptUpdate("2.1.8", latest("2.1.9"), undefined)).toBe(true);
  });

  it("does not prompt without a stored latest release", () => {
    expect(shouldPromptUpdate("2.1.8", undefined, undefined)).toBe(false);
  });

  it("does not prompt when up to date or ahead (dev/beta builds)", () => {
    expect(shouldPromptUpdate("2.1.9", latest("2.1.9"), undefined)).toBe(false);
    expect(shouldPromptUpdate("2.2.0", latest("2.1.9"), undefined)).toBe(false);
    expect(shouldPromptUpdate("2.1.9.12", latest("2.1.9"), undefined)).toBe(false);
  });

  it("stays dismissed for the dismissed version", () => {
    expect(shouldPromptUpdate("2.1.8", latest("2.1.9"), "2.1.9")).toBe(false);
  });

  it("prompts again when a version newer than the dismissed one ships", () => {
    // user skipped 3.14 and 3.15; only 3.16 (the latest) prompts — once
    expect(shouldPromptUpdate("3.13.0", latest("3.16.0"), "3.14.0")).toBe(true);
    expect(shouldPromptUpdate("3.13.0", latest("3.16.0"), "3.16.0")).toBe(false);
  });

  it("fails closed on a malformed stored version", () => {
    expect(shouldPromptUpdate("2.1.8", latest("garbage"), undefined)).toBe(false);
  });
});

describe("isUpdateCheckDue", () => {
  const NOW = 1_700_000_000_000;
  const checked = (ageMs: number): LatestRelease => ({ ...latest("2.1.9"), checkedAt: NOW - ageMs });

  it("is due when no check has ever completed", () => {
    expect(isUpdateCheckDue(undefined, NOW)).toBe(true);
  });

  it("is not due within a day of the last check", () => {
    expect(isUpdateCheckDue(checked(0), NOW)).toBe(false);
    expect(isUpdateCheckDue(checked(UPDATE_CHECK_INTERVAL_MS - 1), NOW)).toBe(false);
  });

  it("is due once the last check is a day old", () => {
    expect(isUpdateCheckDue(checked(UPDATE_CHECK_INTERVAL_MS), NOW)).toBe(true);
  });
});

describe("parseLatestRelease", () => {
  const NOW = 1_700_000_000_000;

  it("extracts version and url from a release payload", () => {
    const parsed = parseLatestRelease(
      { tag_name: "v2.1.9", html_url: "https://github.com/DoubleGremlin181/fast-travel-app/releases/tag/v2.1.9" },
      NOW,
    );
    expect(parsed).toEqual({
      version: "2.1.9",
      url: "https://github.com/DoubleGremlin181/fast-travel-app/releases/tag/v2.1.9",
      checkedAt: NOW,
    });
  });

  it("falls back to the releases page when html_url is missing", () => {
    expect(parseLatestRelease({ tag_name: "v2.1.9" }, NOW)?.url).toBe(RELEASES_PAGE_URL);
  });

  it("rejects payloads without a version-shaped tag", () => {
    expect(parseLatestRelease({ tag_name: "nightly" }, NOW)).toBeNull();
    expect(parseLatestRelease({ message: "Not Found" }, NOW)).toBeNull();
    expect(parseLatestRelease(null, NOW)).toBeNull();
    expect(parseLatestRelease("v2.1.9", NOW)).toBeNull();
  });
});
