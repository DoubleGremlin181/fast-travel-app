/**
 * TypeScript interfaces mirroring the Fast Travel companion daemon wire
 * protocol. Field names match the JSON exactly — do not rename.
 *
 * Authoritative schema: shared/companion-protocol/protocol.schema.json
 */

// ── Enums / unions ──────────────────────────────────────────────────────────

export type QueryMode = "simple" | "wildcard" | "regex";

export type FileType =
  | "document"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "folder"
  | "other";

export type SortField = "relevance" | "created" | "modified";
export type SortDir = "asc" | "desc";

export type CompanionOs = "linux" | "windows" | "macos" | "android";

/** Machine-readable error codes returned in ErrorResponse.error. */
export type ErrorCode =
  | "unauthorized"
  | "pairing_closed"
  | "bad_request"
  | "indexer_unavailable"
  | "unsupported_mode"
  | "internal";

// ── Sub-objects ──────────────────────────────────────────────────────────────

export interface Capabilities {
  booleanOps: boolean;
  prefixWildcard: boolean;
  infixWildcard: boolean;
  regex: boolean;
  pathScope: boolean;
  content: boolean;
}

export interface IndexerInfo {
  id: string;
  name: string;
  available: boolean;
  capabilities: Capabilities;
}

export interface Sort {
  field: SortField;
  dir: SortDir;
}

export interface DateRange {
  from?: number;
  to?: number;
}

export interface Filters {
  types?: FileType[];
  createdRange?: DateRange;
  modifiedRange?: DateRange;
  pathPrefix?: string;
  titleOnly?: boolean;
  content?: boolean;
}

// ── Request / Response shapes ────────────────────────────────────────────────

export interface PingResponse {
  name: string;
  version: string;
  protocolVersion: number;
  os: CompanionOs;
  paired: boolean;
  pairingOpen: boolean;
  defaultIndexer: string;
  indexers: IndexerInfo[];
}

export interface PairRequest {
  clientName: string;
}

export interface PairResponse {
  token: string;
}

export interface SearchRequest {
  query: string;
  queryMode: QueryMode;
  sort: Sort;
  filters: Filters;
  page: number;
  pageSize: number;
  history?: string[];
}

export interface FileResult {
  id: string;
  name: string;
  path: string;
  dir: string;
  ext: string;
  mime: string;
  type: FileType;
  size: number;
  createdAt: number;
  modifiedAt: number;
  score: number;
  iconHint?: string;
}

export interface SearchResponse {
  results: FileResult[];
  total: number;
  page: number;
  tookMs: number;
  indexer: string;
  degraded?: boolean;
}

export interface OpenRequest {
  path: string;
  reveal?: boolean;
}

export interface OpenResponse {
  ok: true;
}

export interface ErrorResponse {
  error: ErrorCode;
  message: string;
}
