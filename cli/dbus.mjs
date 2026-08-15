#!/usr/bin/env node
/**
 * Session-bus adapter via gdbus (CN4). Methods return a single JSON string.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const BUS_NAME = "org.gnome.Shell.Extensions.Forge";
export const OBJECT_PATH = "/org/gnome/Shell/Extensions/Forge";
export const INTERFACE = "org.gnome.Shell.Extensions.Forge";

/** Mirror scripts/forge/forge `_METHOD_IN_ARGS` (string in-args; one string out). */
export const METHOD_IN_ARGS = Object.freeze({
  Ping: 0,
  GetTree: 1,
  Focus: 1,
  Swap: 2,
  Move: 2,
  PlaceNext: 1,
  GetSetting: 1,
  SetSetting: 2,
  SettingsSave: 1,
  SettingsLoad: 1,
  RunSteps: 1,
  LayoutBatch: 1,
  SaveSessionLayout: 0,
  GetThrashCatalog: 0,
});

export const EXIT_GDBUS_MISSING = 127;

/** @typedef {{ stdout: string, stderr: string, code: number }} RunResult */
/** @typedef {(cmd: string[], opts?: { env?: NodeJS.ProcessEnv }) => RunResult} RunFn */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {RunFn}
 */
export function createDefaultRun(env = process.env) {
  return (cmd, opts = {}) => {
    const r = spawnSync(cmd[0], cmd.slice(1), {
      encoding: "utf8",
      env: opts.env ?? env,
    });
    return {
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      code: typeof r.status === "number" ? r.status : 1,
    };
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function findGdbus(env = process.env) {
  const pathEnv = env.PATH || process.env.PATH || "";
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, "gdbus");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

/** User-facing missing-binary message (scripting.md exit 127). */
export function gdbusMissingMessage() {
  return (
    "gdbus not found on PATH (required for forge DBus CLI). " +
    "Install: glib2 / libglib2.0-bin (Debian/Ubuntu: sudo apt install libglib2.0-bin). " +
    "Preferred full stack: python3-gi (unmigrated forge commands) plus gdbus."
  );
}

/**
 * Decode a Python/unicode_escape-ish string body (no surrounding quotes).
 * @param {string} body
 * @returns {string}
 */
export function decodePythonStringBody(body) {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\" || i + 1 >= body.length) {
      out += c;
      continue;
    }
    const n = body[++i];
    switch (n) {
      case "n":
        out += "\n";
        break;
      case "r":
        out += "\r";
        break;
      case "t":
        out += "\t";
        break;
      case "\\":
        out += "\\";
        break;
      case "'":
        out += "'";
        break;
      case '"':
        out += '"';
        break;
      case "u": {
        const hex = body.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          out += `\\${n}`;
        }
        break;
      }
      case "x": {
        const hex = body.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 2;
        } else {
          out += `\\${n}`;
        }
        break;
      }
      default:
        out += n;
    }
  }
  return out;
}

/**
 * Parse gdbus stdout the same way as Python `_call_gdbus` (single string result).
 * @param {string} stdout
 * @returns {string}
 */
export function parseGdbusStdout(stdout) {
  const out = String(stdout ?? "").trim();
  if (!(out.startsWith("(") && out.endsWith(")"))) {
    return out;
  }

  // Prefer a structured parse of ('…',) / ("…",) / (…,)
  const innerAll = out.slice(1, -1).trim();
  // Drop trailing comma after the sole element: '…',  or "…",
  let inner = innerAll.replace(/,\s*$/, "").trim();

  if (inner.startsWith("'")) {
    // Find matching close single-quote with escapes
    let i = 1;
    let body = "";
    while (i < inner.length) {
      const c = inner[i];
      if (c === "\\" && i + 1 < inner.length) {
        body += c + inner[i + 1];
        i += 2;
        continue;
      }
      if (c === "'") {
        // rest should be empty or only whitespace
        const rest = inner.slice(i + 1).trim();
        if (rest === "" || rest === ",") {
          return decodePythonStringBody(body);
        }
        break;
      }
      body += c;
      i++;
    }
    // Fallback: naive strip (Python unicode_escape path)
    if (inner.endsWith("'") && inner.length >= 2) {
      return decodePythonStringBody(inner.slice(1, -1));
    }
  }

  if (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2) {
    try {
      return JSON.parse(inner);
    } catch {
      return inner.slice(1, -1);
    }
  }

  return out;
}

/**
 * Build gdbus argv for a Forge method (no process spawn).
 * @param {string} method
 * @param {string[]} [args]
 * @returns {string[]}
 */
export function buildGdbusCallArgv(method, args = []) {
  const n = METHOD_IN_ARGS[method];
  if (n === undefined) {
    throw new Error(`unknown method ${method}`);
  }
  /** @type {string[]} */
  const cmd = [
    "gdbus",
    "call",
    "--session",
    "--dest",
    BUS_NAME,
    "--object-path",
    OBJECT_PATH,
    "--method",
    `${INTERFACE}.${method}`,
  ];
  for (let i = 0; i < n; i++) {
    cmd.push(i < args.length ? String(args[i] ?? "") : "");
  }
  return cmd;
}

/**
 * Call a Forge DBus method; returns the unpacked JSON string payload.
 * @param {string} method
 * @param {string[]} [args]
 * @param {{
 *   run?: RunFn,
 *   env?: NodeJS.ProcessEnv,
 *   which?: () => string | null,
 *   timeoutMs?: number,
 * }} [deps]
 * @returns {string}
 */
export function callMethod(method, args = [], deps = {}) {
  const env = deps.env ?? process.env;
  const run = deps.run ?? createDefaultRun(env);
  const which = deps.which ?? (() => findGdbus(env));
  const gdbusPath = which();
  if (!gdbusPath) {
    const err = new Error(gdbusMissingMessage());
    // @ts-expect-error attach exit code
    err.exitCode = EXIT_GDBUS_MISSING;
    throw err;
  }

  const argv = buildGdbusCallArgv(method, args);
  // Prefer absolute gdbus when found
  if (gdbusPath !== "gdbus" && argv[0] === "gdbus") {
    argv[0] = gdbusPath;
  }

  const result = run(argv, { env });
  if (result.code !== 0) {
    const err = (result.stderr || result.stdout || "").trim() || `exit ${result.code}`;
    throw new Error(err);
  }
  return parseGdbusStdout(result.stdout);
}
