/** Local-override mutations for Groups. Kept separate from config-mutations.ts
 * to keep each file focused. */

import type { Group, LocalOverrides } from "./types.js";

export interface GroupAddition {
  group: string;
  commands: never[];
  name: string;
  color?: string;
}

/** Store an "extra group" marker via the addCommands bucket (empty commands).
 * The merge step already iterates addCommands buckets; we overload it so a
 * bucket with zero commands and a `name` field represents a brand-new group. */
export function withGroupUpserted(
  overrides: LocalOverrides,
  group: { id: string; name: string; color?: string },
  isExisting: boolean,
): LocalOverrides {
  const out = clone(overrides);
  if (isExisting) {
    // Existing (remote) group — store as override. Since our schema has no
    // direct overrideGroups field, we attach a minimal addCommands entry with
    // metadata so mergeConfig can apply it. See mergeGroupOverrides().
    out.groupOverrides = out.groupOverrides ?? [];
    const idx = out.groupOverrides.findIndex((g) => g.id === group.id);
    if (idx >= 0) out.groupOverrides[idx] = group;
    else out.groupOverrides.push(group);
    return out;
  }

  out.addGroups = out.addGroups ?? [];
  const idx = out.addGroups.findIndex((g) => g.id === group.id);
  if (idx >= 0) out.addGroups[idx] = group;
  else out.addGroups.push(group);
  return out;
}

export function withGroupDeleted(
  overrides: LocalOverrides,
  groupId: string,
  isRemote: boolean,
): LocalOverrides {
  const out = clone(overrides);
  if (out.addGroups) {
    out.addGroups = out.addGroups.filter((g) => g.id !== groupId);
    if (out.addGroups.length === 0) delete out.addGroups;
  }
  if (out.groupOverrides) {
    out.groupOverrides = out.groupOverrides.filter((g) => g.id !== groupId);
    if (out.groupOverrides.length === 0) delete out.groupOverrides;
  }
  if (isRemote) {
    out.removeGroups = out.removeGroups ?? [];
    if (!out.removeGroups.includes(groupId)) out.removeGroups.push(groupId);
  }
  // Also strip any commands added under this group
  if (out.addCommands) {
    out.addCommands = out.addCommands.filter((b) => b.group !== groupId);
    if (out.addCommands.length === 0) delete out.addCommands;
  }
  return out;
}

/** Reorder top-level groups by id. */
export function withGroupsReordered(
  overrides: LocalOverrides,
  orderedIds: string[],
): LocalOverrides {
  const out = clone(overrides);
  out.groupOrder = [...orderedIds];
  return out;
}

/** Flatten an effective group list with overrides applied. Returns a copy of
 * every top-level group (including newly-added ones from addGroups). */
export function effectiveGroups(
  baseGroups: Group[],
  overrides: LocalOverrides,
): Group[] {
  const removed = new Set(overrides.removeGroups ?? []);
  const overridesById = new Map((overrides.groupOverrides ?? []).map((g) => [g.id, g]));

  const groups: Group[] = [];
  for (const base of baseGroups) {
    if (removed.has(base.id)) continue;
    const patch = overridesById.get(base.id);
    groups.push(patch ? { ...base, ...patch } : base);
  }
  for (const added of overrides.addGroups ?? []) {
    if (groups.some((g) => g.id === added.id)) continue;
    groups.push({ id: added.id, name: added.name, color: added.color });
  }
  if (overrides.groupOrder && overrides.groupOrder.length > 0) {
    const order = new Map(overrides.groupOrder.map((id, i) => [id, i]));
    groups.sort((a, b) => {
      const ai = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }
  return groups;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v ?? {}));
}
