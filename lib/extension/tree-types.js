/**
 * Pure tiling type enums (shared by Tree and Forest callers).
 */

import { createEnum } from "./enum.js";

export const NODE_TYPES = createEnum([
  "ROOT",
  "MONITOR", // Output in i3
  "CON", // Container in i3
  "WINDOW",
  "WORKSPACE",
]);

export const LAYOUT_TYPES = createEnum(["STACKED", "TABBED", "ROOT", "HSPLIT", "VSPLIT", "PRESET"]);

export const ORIENTATION_TYPES = createEnum(["NONE", "HORIZONTAL", "VERTICAL"]);

export const POSITION = createEnum(["BEFORE", "AFTER", "UNKNOWN"]);
