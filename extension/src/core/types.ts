// Device types supported by Fast Travel
export type DeviceType =
  | "Windows"
  | "MacOS"
  | "Linux"
  | "Android"
  | "iOS"
  | "Unknown";

export type Browser = "Chrome" | "Firefox" | "Safari" | "Edge" | "Other";

// Config schema types
export interface FastTravelConfig {
  version: 2;
  defaultCommand: string;
  defaultSuggestionsApi?: string;
  defaultLuckyUrl?: string;
  groups: Group[];
  ignoreList: string[];
}

export interface Group {
  id: string;
  name: string;
  color?: string;
  commands?: Command[];
}

export type NormalizeStep =
  | "trim"
  | "collapseSpaces"
  | "stripSpaces"
  | "lower"
  | "upper"
  | "snake"
  | "camel";

export interface IconOverride {
  devices: DeviceType[];
  iconUrl: string;
}

export interface Command {
  id: string;
  triggers: string[];
  name: string;
  type: "standard" | "prefix" | "redirect";
  iconUrl?: string;
  iconOverrides?: IconOverride[];
  suggestionsApi?: string;
  normalize?: NormalizeStep[];
  routes: Route[];
}

export interface Route {
  devices: "*" | DeviceType[];
  browsers?: Browser[];
  defaultUrl: string;
  searchUrl?: string;
  patterns?: Pattern[];
}

export interface Pattern {
  match: string;
  url: string;
}

// Parser input/output types
export interface ParseInput {
  rawQuery: string;
  device: DeviceType;
  config: FastTravelConfig;
  ignoreList?: string[];
}

export type MatchType =
  | "exact"
  | "prefix"
  | "pattern"
  | "search"
  | "url"
  | "default-search";

export interface ParseResult {
  type: "redirect" | "typo";
  url: string;
  commandId: string | null;
  matchType: MatchType;
}

export interface TypoResult {
  type: "typo";
  originalQuery: string;
  suggestedTrigger: string;
  suggestedCommand: Command;
  correctedUrl: string;
}

// Merged parse output: either a redirect or a typo suggestion
export type ParseOutput = ParseResult | TypoResult;

// Config merge types
export interface LocalOverrides {
  addCommands?: { group: string; commands: Command[] }[];
  overrideCommands?: Partial<Command>[];
  addIgnoreList?: string[];
  removeCommands?: string[];
  addGroups?: { id: string; name: string; color?: string }[];
  groupOverrides?: { id: string; name: string; color?: string }[];
  removeGroups?: string[];
  groupOrder?: string[];
  /** Per-group command ordering. Keyed by group id; values are command ids in
   * the desired display order. Commands not listed keep their original order
   * after the listed ones. */
  commandOrder?: Record<string, string[]>;
}
