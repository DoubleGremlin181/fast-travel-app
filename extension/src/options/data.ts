/** Shared data accessors for option screens. Thin wrappers over chrome.storage
 * + runtime messages so screens don't have to care about the plumbing. */

import type { Command, FastTravelConfig, Group } from "../core/types.js";
import { lintConfig } from "../core/config-linter.js";

export type RefreshInterval = "manual" | "daily" | "weekly";

export async function getConfig(): Promise<FastTravelConfig | null> {
  try {
    return await chrome.runtime.sendMessage({ type: "getConfig" });
  } catch {
    return null;
  }
}

export async function setConfig(cfg: FastTravelConfig): Promise<RefreshResult> {
  const result = await chrome.runtime.sendMessage({ type: "setConfig", config: cfg });
  return result ?? { ok: false, reason: "No response from background" };
}

export interface HistoryEntry {
  query: string;
  commandId: string | null;
  timestamp: number;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return (await chrome.runtime.sendMessage({ type: "getHistory" })) ?? [];
}

export async function clearHistory(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "clearHistory" });
}

export interface RefreshResult {
  ok: boolean;
  reason?: string;
}

export async function refreshConfig(): Promise<RefreshResult> {
  const result: RefreshResult = await chrome.runtime.sendMessage({ type: "refreshConfig" });
  return result ?? { ok: false, reason: "No response from background" };
}

export interface ConfigSourceState {
  url: string;
  interval: RefreshInterval;
  lastSynced: number | null;
  dirty: boolean;
}

export async function getConfigSourceState(): Promise<ConfigSourceState> {
  const result = await chrome.runtime.sendMessage({ type: "getConfigSourceState" });
  return result ?? { url: "", interval: "daily" as RefreshInterval, lastSynced: null, dirty: false };
}

export async function importFromUrl(url: string, interval: RefreshInterval): Promise<RefreshResult> {
  const result = await chrome.runtime.sendMessage({ type: "importFromUrl", url, interval });
  return result ?? { ok: false, reason: "No response" };
}

export async function resetToRemote(): Promise<RefreshResult> {
  const result = await chrome.runtime.sendMessage({ type: "resetToRemote" });
  return result ?? { ok: false, reason: "No response" };
}

export function findCommandById(cfg: FastTravelConfig, id: string): { cmd: Command; group: Group; color?: string } | null {
  for (const group of cfg.groups) {
    const cmd = group.commands?.find((c) => c.id === id);
    if (cmd) return { cmd, group, color: group.color };
  }
  return null;
}

export function flattenGroups(cfg: FastTravelConfig): Group[] {
  return cfg.groups.slice();
}

export function findGroupById(cfg: FastTravelConfig, id: string): Group | null {
  return cfg.groups.find((g) => g.id === id) ?? null;
}

export function validateCommand(cmd: Command): string[] {
  // Run a subset of lintConfig by putting the command into a minimal config.
  const probe: FastTravelConfig = {
    version: 2,
    defaultCommand: cmd.triggers[0] ?? "g",
    groups: [{ id: "_probe", name: "Probe", commands: [cmd] }],
    ignoreList: [],
  };
  const errors = lintConfig(probe);
  return errors
    .filter((e) => e.message !== `defaultCommand "${cmd.triggers[0]}" does not match any command trigger`)
    .map((e) => e.message);
}
