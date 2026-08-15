#!/usr/bin/env node
/**
 * forge keybind — Node body (CN2).
 * Live map via gsettings/dconf; kits from lib/shared/keybind-presets.js.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  KEYBINDING_PRESET_KEYS,
  buildProfileProps,
  getKit,
  isReservedKitName,
  listKits,
  matchKitId,
  sanitizeProfileName,
} from "../lib/shared/keybind-presets.js";
import { resolveForgeConfigHome } from "../lib/shared/paths.js";

const SCHEMA_KBD = "org.gnome.shell.extensions.forge.keybindings";
const DCONF_KBD = "/org/gnome/shell/extensions/forge/keybindings/";
const MOD_MASK_KEY = "mod-mask-mouse-tile";
/** Closest-kit walk order (stable ties). */
const KIT_IDS = ["vim", "safe", "i3"];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_SCHEMA_CANDIDATES = [
  path.join(os.homedir(), ".local/share/gnome-shell/extensions/forge@jmmaranan.com/schemas"),
  path.join(REPO_ROOT, "schemas"),
];

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
 * @param {string} p
 * @returns {string}
 */
export function expandUser(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/**
 * Profiles dir: FORGE_KEYBIND_PROFILES_DIR → FORGE_CONFIG_HOME/… → XDG default.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveProfilesDir(env = process.env) {
  const raw = (env.FORGE_KEYBIND_PROFILES_DIR || "").trim();
  if (raw) return path.resolve(expandUser(raw));
  const cfgHome = resolveForgeConfigHome({
    env,
    userConfigDir: path.join(os.homedir(), ".config"),
  });
  return path.resolve(expandUser(cfgHome), "config", "keybinding-profiles");
}

/**
 * @param {string} name
 * @returns {string|null}
 */
export function profileStem(name) {
  return sanitizeProfileName(name);
}

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function parseGvariantStrv(raw) {
  const s = (raw || "").trim();
  if (!s || s === "@as []" || s === "[]") return [];
  let j = s;
  if (j.startsWith("@as ")) j = j.slice(4).trim();
  j = j.replace(/'/g, '"');
  const out = JSON.parse(j);
  if (!Array.isArray(out)) throw new Error(`cannot parse strv: ${raw}`);
  return out.map(String);
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function parseGvariantString(raw) {
  const s = (raw || "").trim();
  if (s.length >= 2 && s[0] === s[s.length - 1] && (s[0] === "'" || s[0] === '"')) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * @param {string[]} accels
 * @returns {string}
 */
export function formatStrv(accels) {
  if (!accels.length) return "@as []";
  const inner = accels.map((a) => `'${String(a).replace(/'/g, "\\'")}'`).join(", ");
  return `[${inner}]`;
}

/**
 * @param {RunFn} run
 * @param {string|null} schemaDir
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
function gsettingsEnv(run, schemaDir, env) {
  const e = { ...env };
  if (schemaDir) e.GSETTINGS_SCHEMA_DIR = schemaDir;
  return e;
}

/**
 * @param {RunFn} run
 * @param {NodeJS.ProcessEnv} env
 * @param {{ preferSource?: boolean }} [opts]
 * @returns {string|null}
 */
export function resolveSchemaDir(run, env, opts = {}) {
  const override = (env.FORGE_GSETTINGS_SCHEMA_DIR || "").trim();
  if (override) {
    const p = expandUser(override);
    if (fs.existsSync(path.join(p, "gschemas.compiled"))) return p;
  }
  let candidates = [...DEFAULT_SCHEMA_CANDIDATES];
  if (opts.preferSource) {
    candidates = [candidates[candidates.length - 1], ...candidates.slice(0, -1)];
  }
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "gschemas.compiled"))) return c;
  }
  return null;
}

/**
 * @param {RunFn} run
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function compileSourceSchemas(run, env) {
  const schemaDir = path.join(REPO_ROOT, "schemas");
  if (!fs.existsSync(schemaDir)) {
    throw new Error(`schemas dir missing: ${schemaDir}`);
  }
  const r = run(["glib-compile-schemas", schemaDir], { env });
  if (r.code !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    if (/not found|ENOENT|No such file/i.test(err) || r.code === 127) {
      throw new Error("glib-compile-schemas not found (needed for Phase 1 key schema)");
    }
    throw new Error(`glib-compile-schemas failed: ${err}`);
  }
  const compiled = path.join(schemaDir, "gschemas.compiled");
  if (!fs.existsSync(compiled)) {
    throw new Error(`compile failed: missing ${compiled}`);
  }
  return schemaDir;
}

/**
 * @param {RunFn} run
 * @param {string|null} schemaDir
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function gsettingsListKeys(run, schemaDir, env) {
  const r = run(["gsettings", "list-keys", SCHEMA_KBD], {
    env: gsettingsEnv(run, schemaDir, env),
  });
  if (r.code !== 0) return [];
  return r.stdout
    .split("\n")
    .map((ln) => ln.trim())
    .filter(Boolean);
}

/**
 * @param {RunFn} run
 * @param {string} key
 * @param {string|null} schemaDir
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null}
 */
function gsettingsGet(run, key, schemaDir, env) {
  const r = run(["gsettings", "get", SCHEMA_KBD, key], {
    env: gsettingsEnv(run, schemaDir, env),
  });
  if (r.code !== 0) return null;
  return r.stdout.trim();
}

/**
 * @param {RunFn} run
 * @param {string} key
 * @param {string} gvariant
 * @param {string|null} schemaDir
 * @param {NodeJS.ProcessEnv} env
 */
function gsettingsSet(run, key, gvariant, schemaDir, env) {
  const r = run(["gsettings", "set", SCHEMA_KBD, key, gvariant], {
    env: gsettingsEnv(run, schemaDir, env),
  });
  if (r.code !== 0) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(`gsettings set ${key}: ${err || "failed"}`);
  }
}

/**
 * @param {RunFn} run
 * @param {NodeJS.ProcessEnv} env
 * @returns {Record<string, string>}
 */
function dconfDumpKbd(run, env) {
  const r = run(["dconf", "dump", DCONF_KBD], { env });
  if (r.code !== 0) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of r.stdout.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("[") || !s.includes("=")) continue;
    const eq = s.indexOf("=");
    out[s.slice(0, eq).trim()] = s.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Live snapshot in camelCase for matchKitId + kebab for JSON.
 * @param {RunFn} run
 * @param {NodeJS.ProcessEnv} env
 * @param {string|null} [schemaDir]
 */
export function loadLiveSnapshot(run, env, schemaDir = null) {
  const dir = schemaDir ?? resolveSchemaDir(run, env);
  /** @type {Record<string, string[]>} */
  const bindings = {};
  let modMask = "None";
  const dconfRaw = dconfDumpKbd(run, env);

  for (const key of KEYBINDING_PRESET_KEYS) {
    let raw = null;
    if (dir) raw = gsettingsGet(run, key, dir, env);
    if (raw == null && key in dconfRaw) raw = dconfRaw[key];
    if (raw == null) {
      bindings[key] = [];
      continue;
    }
    try {
      bindings[key] = parseGvariantStrv(raw);
    } catch {
      bindings[key] = [];
    }
  }

  let rawMod = null;
  if (dir) rawMod = gsettingsGet(run, MOD_MASK_KEY, dir, env);
  if (rawMod == null && MOD_MASK_KEY in dconfRaw) rawMod = dconfRaw[MOD_MASK_KEY];
  if (rawMod != null) modMask = parseGvariantString(rawMod) || "None";

  return {
    "mod-mask-mouse-tile": modMask || "None",
    modMaskMouseTile: modMask || "None",
    bindings,
  };
}

/**
 * @param {Record<string, string[]>} kitBindings
 * @param {Record<string, string[]>} liveBindings
 * @returns {{ key: string, kit: string[], live: string[] }[]}
 */
export function bindingDiffs(kitBindings, liveBindings) {
  /** @type {{ key: string, kit: string[], live: string[] }[]} */
  const out = [];
  for (const key of KEYBINDING_PRESET_KEYS) {
    const kitV = Array.isArray(kitBindings[key]) ? kitBindings[key].map(String) : [];
    const liveV = Array.isArray(liveBindings[key]) ? liveBindings[key].map(String) : [];
    if (kitV.length !== liveV.length || kitV.some((v, i) => v !== liveV[i])) {
      out.push({ key, kit: kitV, live: liveV });
    }
  }
  return out;
}

/**
 * @param {{ bindings?: Record<string, string[]>, modMaskMouseTile?: string }} snap
 * @returns {[string, { key: string, kit: string[], live: string[] }[]]}
 */
export function closestKit(snap) {
  const liveBind = snap.bindings || {};
  let bestId = "vim";
  /** @type {{ key: string, kit: string[], live: string[] }[]} */
  let bestDiffs = [];
  let bestN = null;
  for (const kid of KIT_IDS) {
    const kit = getKit(kid);
    if (!kit) continue;
    const diffs = bindingDiffs(kit.bindings, liveBind);
    const n = diffs.length;
    if (bestN === null || n < bestN) {
      bestN = n;
      bestId = kid;
      bestDiffs = diffs;
    }
  }
  return [bestId, bestDiffs];
}

/**
 * @param {RunFn} run
 * @param {NodeJS.ProcessEnv} env
 * @param {{ schemaDir?: string|null, snap?: object }} [opts]
 */
export function inspectLiveKit(run, env, opts = {}) {
  const snap = opts.snap ?? loadLiveSnapshot(run, env, opts.schemaDir ?? null);
  const matchSnap = {
    modMaskMouseTile: snap.modMaskMouseTile ?? snap["mod-mask-mouse-tile"] ?? "None",
    bindings: snap.bindings || {},
  };
  const matched = matchKitId(matchSnap);
  const [closest, diffs] = closestKit(matchSnap);
  return {
    matched,
    closest,
    diffCount: diffs.length,
    diffs,
    hint: "./install --kit=vim  (or: forge keybind load vim)",
  };
}

/**
 * @param {RunFn} run
 * @param {NodeJS.ProcessEnv} env
 * @param {object} props
 * @param {{ schemaDir?: string|null, dryRun?: boolean }} [opts]
 * @returns {string[]}
 */
export function applyProfileProps(run, env, props, opts = {}) {
  let schemaDir = opts.schemaDir ?? null;
  if (schemaDir == null) {
    schemaDir = resolveSchemaDir(run, env, { preferSource: true });
    const known = schemaDir ? gsettingsListKeys(run, schemaDir, env) : [];
    if (!schemaDir || !known.includes("con-stack-tab-layout-toggle")) {
      try {
        schemaDir = compileSourceSchemas(run, env);
      } catch (e) {
        if (!schemaDir) {
          throw new Error(`no usable GSettings schema dir (${e.message || e})`);
        }
      }
    }
  }

  const bindings = props.bindings || {};
  if (typeof bindings !== "object" || Array.isArray(bindings)) {
    throw new Error("profile bindings must be an object");
  }
  let modMask = props["mod-mask-mouse-tile"] ?? "None";
  if (typeof modMask !== "string") modMask = "None";

  const known = new Set(gsettingsListKeys(run, schemaDir, env));
  if (!known.size) {
    throw new Error(`schema ${SCHEMA_KBD} not available (schema_dir=${schemaDir})`);
  }

  /** @type {string[]} */
  const applied = [];
  const dry = Boolean(opts.dryRun);

  if (known.has(MOD_MASK_KEY)) {
    if (!dry) gsettingsSet(run, MOD_MASK_KEY, modMask, schemaDir, env);
    applied.push(MOD_MASK_KEY);
  }

  for (const [key, accels] of Object.entries(bindings)) {
    if (!known.has(key)) continue;
    if (!Array.isArray(accels)) continue;
    const strAccels = accels.map(String);
    if (!dry) gsettingsSet(run, key, formatStrv(strAccels), schemaDir, env);
    applied.push(key);
  }
  return applied;
}

/**
 * @param {string} kitId
 * @param {RunFn} run
 * @param {NodeJS.ProcessEnv} env
 * @param {{ dryRun?: boolean }} [opts]
 */
function applyKit(kitId, run, env, opts = {}) {
  const id = String(kitId).trim().toLowerCase();
  const kit = getKit(id);
  if (!kit) {
    const ids = listKits()
      .map((k) => k.id)
      .join("|");
    throw new Error(`unknown kit: ${kitId} (${ids})`);
  }
  const props = buildProfileProps({
    modMaskMouseTile: kit.modMaskMouseTile,
    bindings: kit.bindings,
    name: kit.id,
  });
  const applied = applyProfileProps(run, env, props, { dryRun: opts.dryRun });
  return { props, applied };
}

/**
 * @param {string} name
 * @param {string} [outDir]
 * @returns {["kit", string]|["profile", string]}
 */
export function resolveLoadName(name, outDir) {
  const raw = (name || "").trim();
  if (!raw) throw new Error("need a kit or profile name");

  if (raw.includes("/") || raw.includes("\\") || fs.existsSync(expandUser(raw))) {
    const p = path.resolve(expandUser(raw));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return ["profile", p];
    if (raw.includes("/") || raw.includes("\\")) {
      throw new Error(`profile not found: ${raw}`);
    }
  }

  const stem = profileStem(raw);
  if (!stem) throw new Error(`invalid name: ${JSON.stringify(name)}`);

  if (isReservedKitName(stem)) return ["kit", stem.toLowerCase()];

  const destDir = outDir || resolveProfilesDir();
  const dest = path.join(destDir, `${stem}.json`);
  if (fs.existsSync(dest) && fs.statSync(dest).isFile()) return ["profile", dest];
  throw new Error(
    `unknown kit or profile ${JSON.stringify(stem)} ` +
      `(kits: ${KIT_IDS.join(", ")}; no ${path.basename(dest)})`
  );
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
export function listProfiles(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  /** @type {string[]} */
  const names = [];
  for (const ent of fs.readdirSync(dir).sort()) {
    if (!ent.endsWith(".json")) continue;
    const stem = sanitizeProfileName(ent.slice(0, -5));
    if (!stem) continue;
    if (isReservedKitName(stem)) continue;
    names.push(stem);
  }
  return names;
}

/**
 * @param {string[]} argv
 * @returns {{ cmd: string|null, name: string|null, dir: string|null, dryRun: boolean, verbose: boolean, json: boolean, help: boolean, rest: string[] }}
 */
export function parseArgv(argv) {
  /** @type {string[]} */
  const rest = [];
  let cmd = null;
  let name = null;
  let dir = null;
  let dryRun = false;
  let verbose = false;
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      help = true;
      continue;
    }
    if (a === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (a === "-v" || a === "--verbose") {
      verbose = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--dir") {
      dir = argv[++i] ?? null;
      continue;
    }
    if (a.startsWith("--dir=")) {
      dir = a.slice("--dir=".length);
      continue;
    }
    if (!cmd) {
      cmd = a;
      continue;
    }
    if (name == null && (cmd === "save" || cmd === "load")) {
      name = a;
      continue;
    }
    rest.push(a);
  }
  return { cmd, name, dir, dryRun, verbose, json, help, rest };
}

function printHelp(out) {
  out.write(`Usage: forge keybind <save|load|status|list|dir> [options]

Save live Forge keybindings to a profile JSON, or load a built-in
kit (vim|safe|i3) / saved profile.

Dir: FORGE_KEYBIND_PROFILES_DIR or ~/.config/forge/config/keybinding-profiles
Schema: extension schemas/ or repo schemas/ (auto-compiles source if needed).

Commands:
  save <name>     Save live keybindings to <name>.json (not vim|safe|i3)
  load <name>     Load built-in kit or saved profile
  status          Does live gsettings match vim/safe/i3?
  list            List saved profile names
  dir             Print resolved profiles directory

Options:
  --dir PATH      Override profiles directory
  --dry-run       Resolve only; do not write gsettings (load)
  -v, --verbose   List keys loaded (load)
  --json          Machine JSON (status; exit 2 when custom)
  -h, --help      Show this help
`);
}

/**
 * Injectable CLI entry for tests.
 * @param {string[]} argv
 * @param {{
 *   run?: RunFn,
 *   env?: NodeJS.ProcessEnv,
 *   stdout?: { write: (s: string) => void },
 *   stderr?: { write: (s: string) => void },
 * }} [deps]
 * @returns {number}
 */
export function run(argv, deps = {}) {
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

  const opts = parseArgv(argv);
  if (opts.help || !opts.cmd) {
    printHelp(stdout);
    return opts.help ? 0 : 1;
  }

  const profilesDir = opts.dir ? path.resolve(expandUser(opts.dir)) : resolveProfilesDir(env);

  try {
    switch (opts.cmd) {
      case "dir": {
        writeOut(profilesDir);
        return 0;
      }
      case "list": {
        writeOut(`# ${profilesDir}`);
        for (const n of listProfiles(profilesDir)) writeOut(n);
        return 0;
      }
      case "status": {
        const info = inspectLiveKit(runCmd, env);
        const slim = {
          matched: info.matched,
          closest: info.closest,
          diffCount: info.diffCount,
          hint: info.hint,
          diffs: info.diffs.slice(0, 12),
        };
        if (opts.json) {
          writeOut(JSON.stringify(slim));
          return info.matched !== "custom" ? 0 : 2;
        }
        if (info.matched !== "custom") {
          writeOut(`live kit: ${info.matched}`);
          return 0;
        }
        writeOut("live kit: custom (does not match vim|safe|i3)");
        writeOut(`closest: ${info.closest} (${info.diffCount} keys differ)`);
        for (const d of info.diffs.slice(0, 8)) {
          writeOut(`  ${d.key}: live=${JSON.stringify(d.live)}  kit=${JSON.stringify(d.kit)}`);
        }
        writeOut(`re-apply: ${info.hint}`);
        return 2;
      }
      case "save": {
        if (!opts.name || !String(opts.name).trim()) {
          writeErr("forge keybind save: need a profile name");
          return 1;
        }
        const safe = profileStem(opts.name);
        if (!safe) {
          writeErr(`forge keybind save: invalid profile name: ${JSON.stringify(opts.name)}`);
          return 1;
        }
        if (isReservedKitName(safe)) {
          writeErr(
            `forge keybind save: '${safe}' is a built-in kit name ` +
              `(reserved: ${KIT_IDS.join(", ")})`
          );
          return 1;
        }
        fs.mkdirSync(profilesDir, { recursive: true });
        const dest = path.join(profilesDir, `${safe}.json`);
        const snap = loadLiveSnapshot(runCmd, env);
        const props = buildProfileProps({
          modMaskMouseTile: snap.modMaskMouseTile || "None",
          bindings: snap.bindings || {},
          name: safe,
        });
        fs.writeFileSync(dest, `${JSON.stringify(props, null, 2)}\n`, "utf8");
        writeOut(dest);
        return 0;
      }
      case "load": {
        if (!opts.name || !String(opts.name).trim()) {
          writeErr("forge keybind load: need a kit or profile name");
          return 1;
        }
        const [kind, target] = resolveLoadName(opts.name, profilesDir);
        let applied;
        let label;
        if (kind === "kit") {
          ({ applied } = applyKit(target, runCmd, env, { dryRun: opts.dryRun }));
          label = `kit:${target}`;
        } else {
          const data = JSON.parse(fs.readFileSync(target, "utf8"));
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error(`profile not an object: ${target}`);
          }
          applied = applyProfileProps(runCmd, env, data, { dryRun: opts.dryRun });
          label = target;
        }
        const mode = opts.dryRun ? "dry-run " : "";
        writeErr(`forge keybind: ${mode}loaded ${label} (${applied.length} keys)`);
        if (opts.verbose) {
          for (const k of applied) writeOut(k);
        }
        return 0;
      }
      default:
        writeErr(`forge keybind: unknown action ${JSON.stringify(opts.cmd)}`);
        return 1;
    }
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    writeErr(`forge keybind ${opts.cmd}: ${msg}`);
    return 1;
  }
}

const isMain =
  process.argv[1] != null && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  process.exit(run(process.argv.slice(2)));
}
