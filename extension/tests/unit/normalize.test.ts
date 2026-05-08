import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalizeArgs } from "../../src/core/parser.js";
import type { NormalizeStep } from "../../src/core/types.js";

interface NormalizeFixture {
  description: string;
  input: string;
  steps: NormalizeStep[];
  expected: string;
}

const fixtures: NormalizeFixture[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/test-fixtures/normalize.fixtures.json"),
    "utf-8",
  ),
);

describe("normalizeArgs - shared fixtures", () => {
  for (const fixture of fixtures) {
    it(fixture.description, () => {
      expect(normalizeArgs(fixture.input, fixture.steps)).toBe(fixture.expected);
    });
  }
});
