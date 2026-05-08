import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resolveIconUrl } from "../../src/core/icon.js";
import type { Command, DeviceType } from "../../src/core/types.js";

interface IconResolutionFixture {
  name: string;
  command: Partial<Command>;
  device: DeviceType;
  expected: string | null;
}

const fixtures: { cases: IconResolutionFixture[] } = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/test-fixtures/icon-resolution.fixtures.json"),
    "utf-8",
  ),
);

describe("resolveIconUrl - shared fixtures", () => {
  for (const fixture of fixtures.cases) {
    it(fixture.name, () => {
      const result = resolveIconUrl(fixture.command as Command, fixture.device);
      expect(result ?? null).toBe(fixture.expected);
    });
  }
});
