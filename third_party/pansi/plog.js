/**
 * plog.js — product logger (pansi) for Node/Bun.
 * ESM primary; sync `require()` via Node require(esm) / Bun (no TLA in this graph).
 * Destinations are per-level action pipelines (D064); file bytes are always ANSI.
 * GJS: import `./plog.gjs.js` instead (Gio `toFile`; no `node:fs`).
 */

import { createPlog } from "./plog-core.js";
import { createNodeRuntime } from "./plog-runtime-node.js";

const api = createPlog(createNodeRuntime());

export const PLOG_VERSION = api.PLOG_VERSION;
export const LEVELS = api.LEVELS;
export const STOCK_LEVELS = api.STOCK_LEVELS;
export const actions = api.actions;
export const defaults = api.defaults;
export const log = api.log;
export const plog = api.plog;
export const logInit = api.logInit;
export default log;

// CJS shim for hosts that define module.exports while evaluating this graph
if (typeof module !== "undefined" && module.exports) {
  module.exports = log;
  module.exports.log = log;
  module.exports.plog = log;
  module.exports.default = log;
  module.exports.logInit = logInit;
  module.exports.PLOG_VERSION = PLOG_VERSION;
  module.exports.LEVELS = LEVELS;
  module.exports.STOCK_LEVELS = STOCK_LEVELS;
  module.exports.actions = actions;
  module.exports.defaults = defaults;
}
