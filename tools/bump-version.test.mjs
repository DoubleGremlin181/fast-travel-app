import { test } from "node:test";
import assert from "node:assert/strict";

import { bumpSemver, betaVersions, parseArgs } from "./bump-version.mjs";

test("bumpSemver handles patch/minor/major", () => {
  assert.equal(bumpSemver("2.0.0", "patch"), "2.0.1");
  assert.equal(bumpSemver("2.0.0", "minor"), "2.1.0");
  assert.equal(bumpSemver("2.0.0", "major"), "3.0.0");
});

test("bumpSemver accepts an explicit X.Y.Z", () => {
  assert.equal(bumpSemver("2.0.0", "5.6.7"), "5.6.7");
});

test("bumpSemver rejects an invalid type", () => {
  assert.throws(() => bumpSemver("2.0.0", "nonsense"), /Invalid bump type/);
});

test("betaVersions builds the display and manifest strings", () => {
  assert.deepEqual(betaVersions("2.0.0", 19), {
    displayVersion: "2.0.0-beta-19",
    manifestVersion: "2.0.0.19",
  });
});

test("parseArgs handles bump mode", () => {
  assert.deepEqual(parseArgs(["bump", "patch"]), {
    mode: "bump",
    bumpType: "patch",
  });
});

test("parseArgs handles beta mode", () => {
  assert.deepEqual(parseArgs(["beta", "19"]), { mode: "beta", pr: 19 });
});

test("parseArgs rejects bump with no type", () => {
  assert.throws(() => parseArgs(["bump"]), /Usage/);
});

test("parseArgs rejects beta with no pr number", () => {
  assert.throws(() => parseArgs(["beta"]), /Usage/);
});

test("parseArgs rejects beta with a non-integer pr number", () => {
  assert.throws(() => parseArgs(["beta", "abc"]), /Usage/);
  assert.throws(() => parseArgs(["beta", "1.5"]), /Usage/);
  assert.throws(() => parseArgs(["beta", "0"]), /Usage/);
});

test("parseArgs rejects an unknown or missing mode", () => {
  assert.throws(() => parseArgs(["frobnicate"]), /Usage/);
  assert.throws(() => parseArgs([]), /Usage/);
});
