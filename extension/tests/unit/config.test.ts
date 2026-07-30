import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { mergeConfig, flattenCommands } from "../../src/core/config.js";
import type { FastTravelConfig, LocalOverrides } from "../../src/core/types.js";

const config: FastTravelConfig = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/config/default-config.json"),
    "utf-8",
  ),
);

interface MergeFixture {
  description: string;
  overrides: LocalOverrides;
  expected: {
    commandExists?: string;
    inGroup?: string;
    commandId?: string;
    triggers?: string[];
    commandMissing?: string;
    ignoreListContains?: string[];
  };
}

const mergeFixtures: MergeFixture[] = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../shared/test-fixtures/config-merge.fixtures.json"),
    "utf-8",
  ),
);

describe("mergeConfig - shared fixtures", () => {
  for (const fixture of mergeFixtures) {
    it(fixture.description, () => {
      const merged = mergeConfig(config, fixture.overrides);
      const allCommands = flattenCommands(merged);

      if (fixture.expected.commandExists) {
        const cmd = allCommands.find(
          (c) => c.id === fixture.expected.commandExists,
        );
        expect(cmd).toBeDefined();

        if (fixture.expected.inGroup) {
          const group = merged.groups.find(
            (g) => g.id === fixture.expected.inGroup,
          );
          expect(group).toBeDefined();
          expect(
            group!.commands?.some(
              (c) => c.id === fixture.expected.commandExists,
            ),
          ).toBe(true);
        }
      }

      if (fixture.expected.commandId) {
        const cmd = allCommands.find(
          (c) => c.id === fixture.expected.commandId,
        );
        expect(cmd).toBeDefined();
        if (fixture.expected.triggers) {
          expect(cmd!.triggers).toEqual(fixture.expected.triggers);
        }
      }

      if (fixture.expected.commandMissing) {
        const cmd = allCommands.find(
          (c) => c.id === fixture.expected.commandMissing,
        );
        expect(cmd).toBeUndefined();
      }

      if (fixture.expected.ignoreListContains) {
        for (const item of fixture.expected.ignoreListContains) {
          expect(
            merged.ignoreList.some(
              (i) => i.toLowerCase() === item.toLowerCase(),
            ),
          ).toBe(true);
        }
      }
    });
  }
});

describe("mergeConfig - does not mutate original", () => {
  it("original config is unchanged after merge", () => {
    const originalCommandCount = flattenCommands(config).length;
    mergeConfig(config, {
      addCommands: [
        {
          group: "search-engines",
          commands: [
            {
              id: "test-cmd",
              triggers: ["test"],
              name: "Test",
              type: "standard",
              routes: [
                { devices: "*", defaultUrl: "https://test.com" },
              ],
            },
          ],
        },
      ],
    });
    expect(flattenCommands(config).length).toBe(originalCommandCount);
  });
});

describe("flattenCommands", () => {
  it("returns all commands from all groups", () => {
    const commands = flattenCommands(config);
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.some((c) => c.id === "google")).toBe(true);
    expect(commands.some((c) => c.id === "stock-quote")).toBe(true);
    expect(commands.some((c) => c.id === "github")).toBe(true);
  });
});

describe("config schema validation", () => {
  it("config has version 2", () => {
    expect(config.version).toBe(2);
  });

  it("config has a valid defaultCommand", () => {
    const commands = flattenCommands(config);
    const defaultCmd = commands.find((c) =>
      c.triggers.includes(config.defaultCommand),
    );
    expect(defaultCmd).toBeDefined();
  });

  it("all commands have required fields", () => {
    const commands = flattenCommands(config);
    for (const cmd of commands) {
      expect(cmd.id).toBeTruthy();
      expect(cmd.triggers.length).toBeGreaterThan(0);
      expect(cmd.name).toBeTruthy();
      expect(["standard", "prefix", "redirect"]).toContain(cmd.type);
      expect(cmd.routes.length).toBeGreaterThan(0);
    }
  });

  it("all routes have required fields", () => {
    const commands = flattenCommands(config);
    for (const cmd of commands) {
      for (const route of cmd.routes) {
        expect(route.devices).toBeDefined();
        expect(route.defaultUrl).toBeTruthy();
      }
    }
  });

  it("no duplicate triggers across all commands", () => {
    const commands = flattenCommands(config);
    const seen = new Set<string>();
    for (const cmd of commands) {
      for (const trigger of cmd.triggers) {
        const lower = trigger.toLowerCase();
        expect(seen.has(lower)).toBe(false);
        seen.add(lower);
      }
    }
  });

  it("no duplicate command ids", () => {
    const commands = flattenCommands(config);
    const ids = commands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("mergeConfig - luckyUrl preservation", () => {
  it("keeps the default command's luckyUrl through an unrelated override", () => {
    const merged = mergeConfig(config, {
      overrideCommands: [{ id: "google", name: "Google Renamed" }],
    });
    const google = flattenCommands(merged).find((c) => c.id === "google");
    expect(google?.name).toBe("Google Renamed");
    expect(google?.luckyUrl).toBe("https://www.google.com/search?q={query}&btnI");
  });
});
