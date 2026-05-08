import type {
  Command,
  FastTravelConfig,
  Group,
  LocalOverrides,
} from "./types.js";

/**
 * Deep merge local overrides into the default config.
 *
 * Merge strategy:
 * - addCommands: append commands to existing group by group id
 * - overrideCommands: replace matching command fields by command id
 * - addIgnoreList: union with existing ignoreList
 * - removeCommands: remove commands by id
 */
export function mergeConfig(
  defaultConfig: FastTravelConfig,
  overrides: LocalOverrides,
): FastTravelConfig {
  // Deep clone to avoid mutating original
  const config: FastTravelConfig = JSON.parse(JSON.stringify(defaultConfig));

  // Remove groups (strip entirely, including their commands)
  if (overrides.removeGroups?.length) {
    const toRemove = new Set(overrides.removeGroups);
    config.groups = config.groups.filter((g) => !toRemove.has(g.id));
  }

  // Override existing groups (name / color)
  if (overrides.groupOverrides?.length) {
    for (const patch of overrides.groupOverrides) {
      const target = findGroupById(config.groups, patch.id);
      if (target) Object.assign(target, patch);
    }
  }

  // Add new top-level groups (skip ids that already exist)
  if (overrides.addGroups?.length) {
    for (const added of overrides.addGroups) {
      if (!findGroupById(config.groups, added.id)) {
        config.groups.push({ id: added.id, name: added.name, color: added.color });
      }
    }
  }

  // Reorder top-level groups according to user preference
  if (overrides.groupOrder?.length) {
    const order = new Map(overrides.groupOrder.map((id, i) => [id, i] as const));
    config.groups.sort((a, b) => {
      const ai = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }

  // Remove commands
  if (overrides.removeCommands?.length) {
    const removeSet = new Set(overrides.removeCommands);
    removeCommandsFromGroups(config.groups, removeSet);
  }

  // Override existing commands by id
  if (overrides.overrideCommands?.length) {
    for (const override of overrides.overrideCommands) {
      if (!override.id) continue;
      const existing = findCommandById(config.groups, override.id);
      if (existing) {
        Object.assign(existing, override);
      }
    }
  }

  // Add new commands to groups
  if (overrides.addCommands?.length) {
    for (const addition of overrides.addCommands) {
      const group = findGroupById(config.groups, addition.group);
      if (group) {
        group.commands = group.commands ?? [];
        group.commands.push(...addition.commands);
      }
    }
  }

  // Reorder commands within groups
  if (overrides.commandOrder) {
    for (const [groupId, orderedIds] of Object.entries(overrides.commandOrder)) {
      const group = findGroupById(config.groups, groupId);
      if (!group?.commands) continue;
      const byId = new Map(group.commands.map((c) => [c.id, c]));
      const ordered: typeof group.commands = [];
      for (const id of orderedIds) {
        const cmd = byId.get(id);
        if (cmd) {
          ordered.push(cmd);
          byId.delete(id);
        }
      }
      // Append any commands that weren't in the explicit order list.
      for (const cmd of byId.values()) ordered.push(cmd);
      group.commands = ordered;
    }
  }

  // Extend ignore list
  if (overrides.addIgnoreList?.length) {
    const existing = new Set(
      config.ignoreList.map((s) => s.toLowerCase()),
    );
    for (const item of overrides.addIgnoreList) {
      if (!existing.has(item.toLowerCase())) {
        config.ignoreList.push(item);
      }
    }
  }

  return config;
}

function findCommandById(
  groups: Group[],
  id: string,
): Command | null {
  for (const group of groups) {
    const cmd = group.commands?.find((c) => c.id === id);
    if (cmd) return cmd;
  }
  return null;
}

function findGroupById(
  groups: Group[],
  id: string,
): Group | null {
  return groups.find((g) => g.id === id) ?? null;
}

function removeCommandsFromGroups(
  groups: Group[],
  removeIds: Set<string>,
): void {
  for (const group of groups) {
    if (group.commands) {
      group.commands = group.commands.filter((c) => !removeIds.has(c.id));
    }
  }
}

/**
 * Flatten all commands from the config into a single array.
 */
export function flattenCommands(config: FastTravelConfig): Command[] {
  return config.groups.flatMap((g) => g.commands ?? []);
}
