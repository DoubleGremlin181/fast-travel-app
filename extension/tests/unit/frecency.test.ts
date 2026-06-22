import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { rankByFrecency } from "../../src/core/frecency.js";

const DAY_MS = 86_400_000;

interface FrecencyFixture {
  description: string;
  commandIds: string[];
  nowMs: number;
  history: { commandId: string; ageDays: number }[];
  expected: string[];
}

const fixtures: FrecencyFixture[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/test-fixtures/frecency.fixtures.json"),
    "utf-8",
  ),
);

describe("rankByFrecency - shared fixtures", () => {
  for (const fixture of fixtures) {
    it(fixture.description, () => {
      const history = fixture.history.map((h) => ({
        commandId: h.commandId,
        timestamp: fixture.nowMs - h.ageDays * DAY_MS,
      }));
      expect(rankByFrecency(fixture.commandIds, history, fixture.nowMs)).toEqual(
        fixture.expected,
      );
    });
  }
});
