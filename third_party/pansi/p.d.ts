/**
 * TypeScript declarations for p.js (pansi printer).
 * Keep in sync with JSDoc typedefs in p.js.
 */

export interface POptions {
  sep?: string;
  end?: string;
  color?: "auto" | "always" | "never" | string;
  str?: boolean;
  as_str?: boolean;
  stderr?: boolean;
  "--stderr"?: boolean;
  escaped?: boolean;
  default?: string;
}

export type PArg = string | number | boolean | bigint | symbol | POptions | null | undefined;

/** Contract implementation version — pinable for vendoring. */
export const PANSI_VERSION: string;

/**
 * Colored print (or string build when `{ str: true }` / `{ as_str: true }`).
 */
export function p(...args: PArg[]): string;

/** Build a styled string without printing. */
export function pstr(...args: PArg[]): string;

/** Alias of {@link pstr}. */
export const ps: typeof pstr;

/** Strip ANSI CSI sequences from a string. */
export function ansiStrip(str?: string): string;

/** Escape control characters for readable dumps. */
export function ansiEscape(str?: string): string;

/** Inverse of {@link ansiEscape}. */
export function ansiUnescape(str?: string): string;

export {};
