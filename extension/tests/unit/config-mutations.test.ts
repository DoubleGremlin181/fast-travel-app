import { describe, it, expect } from "vitest";
import {
  withCommandAdded,
  withCommandUpdated,
  withCommandUpsertedInGroup,
  withCommandDeleted,
  withGroupAdded,
  withGroupUpdated,
  withGroupDeleted,
  withIgnoreAdded,
  withIgnoreRemoved,
} from "../../src/core/config-mutations.js";
import type { Command, FastTravelConfig, Group } from "../../src/core/types.js";

const sampleCmd: Command = {
  id: "test-cmd",
  name: "Test",
  triggers: ["t"],
  type: "standard",
  routes: [{ devices: "*", defaultUrl: "https://example.com" }],
};

const baseCfg: FastTravelConfig = {
  version: 2,
  defaultCommand: "search",
  groups: [
    {
      id: "g1",
      name: "Group One",
      commands: [],
    },
    {
      id: "g2",
      name: "Group Two",
      commands: [sampleCmd],
    },
  ],
  ignoreList: [],
};

// ── withCommandAdded ─────────────────────────────────────────────────────────

describe("withCommandAdded", () => {
  it("appends command to the matching group", () => {
    const out = withCommandAdded(baseCfg, "g1", sampleCmd);
    const g1 = out.groups.find((g) => g.id === "g1")!;
    expect(g1.commands).toHaveLength(1);
    expect(g1.commands![0].id).toBe("test-cmd");
  });

  it("does not mutate groups that don't match", () => {
    const out = withCommandAdded(baseCfg, "g1", sampleCmd);
    const g2 = out.groups.find((g) => g.id === "g2")!;
    expect(g2.commands).toHaveLength(1); // unchanged
  });

  it("returns a new config object (immutability)", () => {
    const out = withCommandAdded(baseCfg, "g1", sampleCmd);
    expect(out).not.toBe(baseCfg);
  });

});

// ── withCommandUpdated ───────────────────────────────────────────────────────

describe("withCommandUpdated", () => {
  it("replaces the command with the matching id", () => {
    const updated: Command = { ...sampleCmd, name: "Updated Name" };
    const out = withCommandUpdated(baseCfg, updated);
    const g2 = out.groups.find((g) => g.id === "g2")!;
    expect(g2.commands![0].name).toBe("Updated Name");
  });

  it("leaves groups without the command unchanged", () => {
    const updated: Command = { ...sampleCmd, name: "Updated Name" };
    const out = withCommandUpdated(baseCfg, updated);
    const g1 = out.groups.find((g) => g.id === "g1")!;
    expect(g1.commands).toHaveLength(0);
  });

  it("is a no-op when the id does not exist", () => {
    const ghost: Command = { ...sampleCmd, id: "nonexistent" };
    const out = withCommandUpdated(baseCfg, ghost);
    expect(out.groups).toEqual(baseCfg.groups);
  });
});

// ── withCommandUpsertedInGroup ───────────────────────────────────────────────

describe("withCommandUpsertedInGroup", () => {
  it("moves a command from one group to another", () => {
    // sampleCmd is in g2; move it to g1
    const out = withCommandUpsertedInGroup(baseCfg, "g1", sampleCmd);
    const g1 = out.groups.find((g) => g.id === "g1")!;
    const g2 = out.groups.find((g) => g.id === "g2")!;
    expect(g1.commands?.some((c) => c.id === sampleCmd.id)).toBe(true);
    expect(g2.commands?.some((c) => c.id === sampleCmd.id)).toBe(false);
  });

  it("adds a brand-new command to the target group", () => {
    const newCmd: Command = { ...sampleCmd, id: "brand-new" };
    const out = withCommandUpsertedInGroup(baseCfg, "g1", newCmd);
    const g1 = out.groups.find((g) => g.id === "g1")!;
    expect(g1.commands?.some((c) => c.id === "brand-new")).toBe(true);
  });
});

// ── withCommandDeleted ───────────────────────────────────────────────────────

describe("withCommandDeleted", () => {
  it("removes the command from whichever group holds it", () => {
    const out = withCommandDeleted(baseCfg, "test-cmd");
    const g2 = out.groups.find((g) => g.id === "g2")!;
    expect(g2.commands).toHaveLength(0);
  });

  it("is a no-op for an id that doesn't exist", () => {
    const out = withCommandDeleted(baseCfg, "ghost-id");
    expect(out.groups).toEqual(baseCfg.groups);
  });

});

// ── withGroupAdded ───────────────────────────────────────────────────────────

describe("withGroupAdded", () => {
  const newGroup: Group = { id: "g3", name: "Group Three", color: "#ff0000" };

  it("appends the new group with empty commands array", () => {
    const out = withGroupAdded(baseCfg, newGroup);
    const g3 = out.groups.find((g) => g.id === "g3")!;
    expect(g3).toBeDefined();
    expect(g3.commands).toEqual([]);
  });

  it("is a no-op when a group with the same id already exists", () => {
    const duplicate: Group = { id: "g1", name: "Duplicate" };
    const out = withGroupAdded(baseCfg, duplicate);
    expect(out).toBe(baseCfg); // exact same reference
  });
});

// ── withGroupUpdated ─────────────────────────────────────────────────────────

describe("withGroupUpdated", () => {
  it("updates name and color of the matching group", () => {
    const out = withGroupUpdated(baseCfg, "g1", "Renamed", "#123456");
    const g1 = out.groups.find((g) => g.id === "g1")!;
    expect(g1.name).toBe("Renamed");
    expect(g1.color).toBe("#123456");
  });

  it("clears color when undefined is passed", () => {
    const cfgWithColor: FastTravelConfig = {
      ...baseCfg,
      groups: [{ id: "g1", name: "Group One", color: "#aabbcc", commands: [] }],
    };
    const out = withGroupUpdated(cfgWithColor, "g1", "Group One", undefined);
    expect(out.groups[0].color).toBeUndefined();
  });
});

// ── withGroupDeleted ─────────────────────────────────────────────────────────

describe("withGroupDeleted", () => {
  it("removes an empty group with the matching id", () => {
    const out = withGroupDeleted(baseCfg, "g1");
    expect(out.groups.find((g) => g.id === "g1")).toBeUndefined();
    expect(out.groups).toHaveLength(1);
  });

  it("is a no-op when the id doesn't exist", () => {
    const out = withGroupDeleted(baseCfg, "ghost");
    expect(out.groups).toEqual(baseCfg.groups);
  });

  it("is a no-op when the group has commands (non-empty guard)", () => {
    // g2 contains sampleCmd, so deletion must be refused
    const out = withGroupDeleted(baseCfg, "g2");
    expect(out).toBe(baseCfg);
  });

});

// ── withIgnoreAdded ──────────────────────────────────────────────────────────

describe("withIgnoreAdded", () => {
  it("appends a new word to the ignore list (stored lowercase)", () => {
    const out = withIgnoreAdded(baseCfg, "Spam");
    expect(out.ignoreList).toEqual(["spam"]);
  });

  it("trims whitespace before storing", () => {
    const out = withIgnoreAdded(baseCfg, "  spam  ");
    expect(out.ignoreList).toEqual(["spam"]);
  });

  it("is a no-op for an empty or whitespace-only word", () => {
    const out = withIgnoreAdded(baseCfg, "   ");
    expect(out).toBe(baseCfg);
  });

  it("is a no-op when the word is already present (exact match)", () => {
    const prev: FastTravelConfig = { ...baseCfg, ignoreList: ["spam"] };
    const out = withIgnoreAdded(prev, "spam");
    expect(out).toBe(prev);
  });

  it("is a no-op when the word is already present (case-insensitive dedup)", () => {
    const prev: FastTravelConfig = { ...baseCfg, ignoreList: ["spam"] };
    const out = withIgnoreAdded(prev, "SPAM");
    expect(out).toBe(prev);
  });

  it("is a no-op when the word is already present (mixed case + whitespace)", () => {
    const prev: FastTravelConfig = { ...baseCfg, ignoreList: ["spam"] };
    const out = withIgnoreAdded(prev, "  Spam  ");
    expect(out).toBe(prev);
  });
});

// ── withIgnoreRemoved ────────────────────────────────────────────────────────

describe("withIgnoreRemoved", () => {
  it("removes the matching word from the ignore list", () => {
    const prev: FastTravelConfig = { ...baseCfg, ignoreList: ["spam", "ads"] };
    const out = withIgnoreRemoved(prev, "spam");
    expect(out.ignoreList).toEqual(["ads"]);
  });

  it("removes case-insensitively (uppercase input against lowercase storage)", () => {
    const prev: FastTravelConfig = { ...baseCfg, ignoreList: ["spam", "ads"] };
    const out = withIgnoreRemoved(prev, "SPAM");
    expect(out.ignoreList).toEqual(["ads"]);
  });

  it("trims whitespace before comparing", () => {
    const prev: FastTravelConfig = { ...baseCfg, ignoreList: ["spam", "ads"] };
    const out = withIgnoreRemoved(prev, "  spam  ");
    expect(out.ignoreList).toEqual(["ads"]);
  });

  it("is a no-op when the word is not in the list", () => {
    const out = withIgnoreRemoved(baseCfg, "nonexistent");
    expect(out.ignoreList).toEqual([]);
  });
});
