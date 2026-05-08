/** Pure functions over FastTravelConfig. Mirrors Android ConfigMutations.kt —
 * callers receive a new config object to persist. */

import type { Command, FastTravelConfig, Group } from "./types.js";

function mapGroups(groups: Group[], fn: (g: Group) => Group): Group[] {
  return groups.map((g) => fn(g));
}

export function withCommandAdded(cfg: FastTravelConfig, groupId: string, cmd: Command): FastTravelConfig {
  return { ...cfg, groups: mapGroups(cfg.groups, (g) =>
    g.id === groupId ? { ...g, commands: [...(g.commands ?? []), cmd] } : g
  )};
}

export function withCommandUpdated(cfg: FastTravelConfig, cmd: Command): FastTravelConfig {
  return { ...cfg, groups: mapGroups(cfg.groups, (g) => {
    if (!(g.commands ?? []).some((c) => c.id === cmd.id)) return g;
    return { ...g, commands: g.commands!.map((c) => (c.id === cmd.id ? cmd : c)) };
  })};
}

export function withCommandUpsertedInGroup(cfg: FastTravelConfig, groupId: string, cmd: Command): FastTravelConfig {
  const removed = withCommandDeleted(cfg, cmd.id);
  return withCommandAdded(removed, groupId, cmd);
}

export function withCommandDeleted(cfg: FastTravelConfig, id: string): FastTravelConfig {
  return { ...cfg, groups: mapGroups(cfg.groups, (g) => {
    if (!(g.commands ?? []).some((c) => c.id === id)) return g;
    return { ...g, commands: g.commands!.filter((c) => c.id !== id) };
  })};
}

export function withGroupAdded(cfg: FastTravelConfig, group: Group): FastTravelConfig {
  const allIds = new Set(getAllGroupIds(cfg.groups));
  if (allIds.has(group.id)) return cfg;
  return { ...cfg, groups: [...cfg.groups, { ...group, commands: [] }] };
}

export function withGroupUpdated(cfg: FastTravelConfig, id: string, name: string, color: string | undefined): FastTravelConfig {
  return { ...cfg, groups: mapGroups(cfg.groups, (g) =>
    g.id === id ? { ...g, name, color } : g
  )};
}

export function withGroupDeleted(cfg: FastTravelConfig, id: string): FastTravelConfig {
  const target = cfg.groups.find((g) => g.id === id);
  if (!target) return cfg;
  if ((target.commands ?? []).length > 0) return cfg;
  return { ...cfg, groups: cfg.groups.filter((g) => g.id !== id) };
}

export function withIgnoreAdded(cfg: FastTravelConfig, word: string): FastTravelConfig {
  const trimmed = word.trim().toLowerCase();
  if (!trimmed) return cfg;
  if (cfg.ignoreList.some((w) => w.toLowerCase() === trimmed)) return cfg;
  return { ...cfg, ignoreList: [...cfg.ignoreList, trimmed] };
}

export function withIgnoreRemoved(cfg: FastTravelConfig, word: string): FastTravelConfig {
  const lower = word.trim().toLowerCase();
  return { ...cfg, ignoreList: cfg.ignoreList.filter((w) => w.toLowerCase() !== lower) };
}

function getAllGroupIds(groups: Group[]): string[] {
  return groups.map((g) => g.id);
}
