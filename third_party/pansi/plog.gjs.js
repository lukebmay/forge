/**
 * plog.gjs.js — GJS entry for plog (D064 / K12).
 * Native `toFile` via Gio append; do not import `./plog.js` under GJS (node:fs).
 * Zero-config: `console.log|warn|error` when present; else Shell `log` / `print`.
 */

import { createPlog } from "./plog-core.js";
import { createGjsRuntime } from "./plog-runtime-gjs.js";

const api = createPlog(createGjsRuntime());

export const PLOG_VERSION = api.PLOG_VERSION;
export const LEVELS = api.LEVELS;
export const STOCK_LEVELS = api.STOCK_LEVELS;
export const actions = api.actions;
export const defaults = api.defaults;
export const log = api.log;
export const plog = api.plog;
export const logInit = api.logInit;
export default log;
