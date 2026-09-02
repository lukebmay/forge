/*
 * Window mode / grab-type enums (peeled from window.js — D100c c0).
 */

import { createEnum } from "./enum.js";

export const WINDOW_MODES = createEnum(["FLOAT", "TILE", "GRAB_TILE", "DEFAULT"]);

export const GRAB_TYPES = createEnum(["RESIZING", "MOVING", "UNKNOWN"]);
