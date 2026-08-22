/**
 * TypeScript declarations for plog.js (pansi product logger).
 * Keep in sync with JSDoc typedefs in plog-core.js.
 * GJS entry `plog.gjs.js` exports the same public surface (Gio-backed toFile).
 */

export type PlogLevel = "trace" | "debug" | "info" | "warn" | "error";
export type PlogTee = "none" | "stderr" | "stdout" | "both";

/** Variadic p-style args (tokens + text). No trailing options object in v1. */
export type PlogWriteArg = string | number | boolean | bigint | symbol | object | null | undefined;

export interface PlogRecord {
  level: string;
  ansiText: string;
  plainText: string;
  timestamp: string;
  sessionId: string;
  pid: number;
  originalArgs: PlogWriteArg[];
}

export type PlogAction = (record: PlogRecord) => unknown;

export interface PlogInitOptions {
  /** Log file path; null | false | "" disables. No default home file. */
  file?: string | null | false;
  /** Extra error-file; null | false | "" disables. */
  errorFile?: string | null | false;
  level?: PlogLevel | string;
  /** With file sugar: keep console after toFile (file then console). */
  console?: boolean;
  /** Legacy; non-none maps to console:true with file sugar. */
  tee?: PlogTee | string;
  /** Ordered level names (default stock). */
  levels?: string[];
  /** Per-level action pipelines (non-array value → one-element array). */
  actions?: Record<string, PlogAction | PlogAction[]>;
  /** Explicit session id (omit on init to clear sticky). */
  sessionId?: string;
  /** Session fg hex (rrggbb); pass with sessionBg in tests. */
  sessionFg?: string;
  sessionBg?: string;
  /** Test hook: timestamp `YYYY-MM-DD_HH:MM:SS`. */
  now?: () => string;
  /** Test hook: generated 5-char id (≥1 letter). */
  randomId?: () => string;
}

export interface PlogAddActionOpts {
  index?: number;
  name?: string;
}

export interface PlogViewOptions {
  all?: boolean;
  list?: boolean;
  file?: string | null | false;
  /** Tail N lines (default 30); mutex with list/sessions/regex/all. */
  lines?: number;
  regex?: string | RegExp;
  sessions?: string[];
  stripHeaders?: boolean;
  color?: "auto" | "always" | "never" | string;
  /** Return string; do not write stdout (tests). */
  str?: boolean;
}

export interface PlogClearOptions {
  file?: string | null | false;
  /** Drop only these sessions; empty/omit = truncate in place. */
  sessions?: string[];
}

export interface PlogOptionsSnapshot {
  file: string | null;
  errorFile: string | null;
  level: PlogLevel | string;
  tee: PlogTee | string;
  console: boolean;
  sessionId: string | null;
}

export interface Plog {
  init(opts?: PlogInitOptions | null): Plog;
  addAction(level: string, action: PlogAction, opts?: PlogAddActionOpts | null): string;
  removeAction(level: string, idOrFn: string | PlogAction): boolean;
  setActions(level: string, actions: PlogAction | PlogAction[]): void;
  clearActions(level?: string): void;
  listActions(level?: string): PlogAction[] | Record<string, PlogAction[]>;
  trace(...args: PlogWriteArg[]): string;
  debug(...args: PlogWriteArg[]): string;
  info(...args: PlogWriteArg[]): string;
  warn(...args: PlogWriteArg[]): string;
  error(...args: PlogWriteArg[]): string;
  view(opts?: PlogViewOptions | null): string;
  clear(opts?: PlogClearOptions | null): void;
  filePath(path: string): string;
  fileName(path: string): string;
  dirPath(path: string): string;
  dirName(path: string): string;
  fileExt(path: string): string;
  fileBase(path: string): string;
  fileNamePretty(path: string): string;
  readonly dest: string | null;
  readonly options: PlogOptionsSnapshot;
}

export const PLOG_VERSION: string;

export const LEVELS: Readonly<{
  trace: 10;
  debug: 20;
  info: 30;
  warn: 40;
  error: 50;
}>;

export const STOCK_LEVELS: readonly string[];

export const actions: Readonly<{
  toConsole: PlogAction;
  toStdio: PlogAction;
  toFile: (path: string) => PlogAction;
}>;

export const defaults: Readonly<{
  pipelines: Readonly<Record<string, readonly PlogAction[]>>;
}>;

export const log: Plog;
export const plog: Plog;
export default log;

export function logInit(opts?: PlogInitOptions | null): Plog;
