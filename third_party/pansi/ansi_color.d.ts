/**
 * TypeScript declarations for ansi_color.js (color enablement contract).
 * Keep in sync with JSDoc in ansi_color.js.
 */

export const ANSI_COLOR_VERSION: string;

export type ColorMode = "always" | "never" | "auto";

export interface ColorResolveOpts {
  env?: Record<string, string | undefined>;
  toolColorKeys?: string[];
}

export interface ColorEnabledOpts extends ColorResolveOpts {
  cliMode?: string | null;
  /** Optional override for {@link colorCodes}. */
  enabled?: boolean;
}

export interface ColorCodes {
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  reset: string;
  bold: string;
  dim: string;
}

export function resolveColorMode(
  cliMode: string | null | undefined,
  opts?: ColorResolveOpts
): ColorMode;

export function colorEnabled(
  stream: { isTTY?: boolean } | null | undefined,
  opts?: ColorEnabledOpts
): boolean;

/** Role sequences, or empty strings when color is off. */
export function colorCodes(
  stream: { isTTY?: boolean } | null | undefined,
  opts?: ColorEnabledOpts
): ColorCodes;

/** Snake_case alias of {@link colorCodes}. */
export const color_codes: typeof colorCodes;
