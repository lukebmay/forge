/*
 * Compatibility shim — prefer `plog` / plog-adapter for new code.
 * Forwards to lib/shared/plog-adapter.js (GJS-safe; not Node third_party plog).
 */

import * as adapter from "./plog-adapter.js";

export class Logger {
  static LOG_LEVELS = adapter.LOG_LEVELS;

  static init(settings, opts) {
    adapter.init(settings, opts);
  }

  static format(msg, ...params) {
    return adapter.format(msg, ...params);
  }

  static fatal(...args) {
    adapter.fatal(...args);
  }

  static error(...args) {
    adapter.error(...args);
  }

  static warn(...args) {
    adapter.warn(...args);
  }

  static info(...args) {
    adapter.info(...args);
  }

  static isDebugEnabled() {
    return adapter.isDebugEnabled();
  }

  static debug(...args) {
    adapter.debug(...args);
  }

  static trace(...args) {
    adapter.trace(...args);
  }

  static log(...args) {
    adapter.log(...args);
  }
}
