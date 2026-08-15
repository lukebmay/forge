/**
 * Shared _with_first / _cmd_result helpers for thin DBus verbs (CN5).
 */

import { EXIT_GDBUS_MISSING, callMethod, createDefaultRun, gdbusMissingMessage } from "./dbus.mjs";

/**
 * If first, wrap plain selector as JSON with first:true (Python `_with_first`).
 * @param {string} selector
 * @param {boolean} first
 * @returns {string}
 */
export function withFirst(selector, first) {
  if (!first) return selector;
  const s = String(selector).trim();
  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        obj.first = true;
        return JSON.stringify(obj);
      }
    } catch {
      /* fall through */
    }
  }
  return JSON.stringify({ selector, first: true });
}

/**
 * @param {unknown} data
 * @param {boolean} [compact]
 * @returns {string}
 */
export function formatJson(data, compact = false) {
  return compact ? JSON.stringify(data) : JSON.stringify(data, null, 2);
}

/**
 * Call DBus method and print JSON like Python `_cmd_result`.
 * @param {string} method
 * @param {string[]} dbusArgs
 * @param {string} label
 * @param {{
 *   run?: import("./dbus.mjs").RunFn,
 *   env?: NodeJS.ProcessEnv,
 *   which?: () => string | null,
 *   stdout?: { write: (s: string) => void },
 *   stderr?: { write: (s: string) => void },
 * }} [deps]
 * @returns {number}
 */
export function cmdResult(method, dbusArgs, label, deps = {}) {
  const env = deps.env ?? process.env;
  const runCmd = deps.run ?? createDefaultRun(env);
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const writeOut = (s) => {
    stdout.write(s.endsWith("\n") ? s : `${s}\n`);
  };
  const writeErr = (s) => {
    stderr.write(s.endsWith("\n") ? s : `${s}\n`);
  };

  let raw;
  try {
    raw = callMethod(method, dbusArgs, {
      run: runCmd,
      env,
      which: deps.which,
    });
  } catch (e) {
    const code =
      e && typeof e === "object" && "exitCode" in e
        ? /** @type {{ exitCode?: number }} */ (e).exitCode
        : undefined;
    if (code === EXIT_GDBUS_MISSING) {
      writeErr(gdbusMissingMessage());
      return EXIT_GDBUS_MISSING;
    }
    const msg = e && e.message ? e.message : String(e);
    writeErr(`forge ${label}: bus call failed (is the extension enabled?): ${msg}`);
    return 1;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    writeOut(raw);
    return 1;
  }

  if (data && typeof data === "object" && !Array.isArray(data) && data.error) {
    const err = data.error;
    writeErr(`forge ${label}: ${err}`);
    if (data.candidates) {
      writeOut(formatJson({ error: err, candidates: data.candidates }, false));
    } else {
      writeOut(formatJson(data, false));
    }
    return 1;
  }

  writeOut(formatJson(data, false));
  if (data && typeof data === "object" && !Array.isArray(data) && data.ok === false) {
    return 1;
  }
  if (data && typeof data === "object" && !Array.isArray(data) && data.ok === true) {
    return 0;
  }
  if (data && typeof data === "object" && !Array.isArray(data) && !("error" in data)) {
    return 0;
  }
  return 1;
}

export { EXIT_GDBUS_MISSING, callMethod, createDefaultRun, gdbusMissingMessage };
