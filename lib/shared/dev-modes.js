/*
 * Composable ./install --dev=mode1,mode2 tokens (D095 L7 / S4).
 * Pure helper — no Gio — so unit tests and install scripts can import it.
 */

/** @type {readonly string[]} */
export const DEV_MODE_TOKENS = Object.freeze([
  "strict-geometry",
  "geom-epsilon-measure",
  "fault-inject-geometry",
  "geom-trace",
]);

const TOKEN_SET = new Set(DEV_MODE_TOKENS);

/**
 * Parse a comma-separated modes string (empty → []).
 * @param {string|null|undefined} raw
 * @returns {{ ok: true, modes: string[] } | { ok: false, error: string, modes: string[] }}
 */
export function parseDevModesArg(raw) {
  if (raw == null || raw === "") {
    return { ok: true, modes: [] };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: "dev-modes must be a string", modes: [] };
  }
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const unknown = [];
  const modes = [];
  const seen = new Set();
  for (const p of parts) {
    if (!TOKEN_SET.has(p)) {
      unknown.push(p);
      continue;
    }
    if (seen.has(p)) continue;
    seen.add(p);
    modes.push(p);
  }
  if (unknown.length) {
    return {
      ok: false,
      error: `unknown dev mode(s): ${unknown.join(", ")} (allowed: ${DEV_MODE_TOKENS.join(", ")})`,
      modes: [],
    };
  }
  return { ok: true, modes };
}

/**
 * Parse a single argv token: `--dev`, `--dev=`, or `--dev=a,b`.
 * @param {string} arg
 * @returns {{ kind: "dev", modes: string[] } | { kind: "error", error: string } | null}
 */
export function parseInstallDevFlag(arg) {
  if (typeof arg !== "string") return null;
  if (arg === "--dev" || arg === "--dev=") {
    return { kind: "dev", modes: [] };
  }
  if (arg.startsWith("--dev=")) {
    const parsed = parseDevModesArg(arg.slice("--dev=".length));
    if (!parsed.ok) return { kind: "error", error: parsed.error };
    return { kind: "dev", modes: parsed.modes };
  }
  return null;
}

/**
 * Read persisted modes from Gio.Settings-like object or a string/array list.
 * @param {object|string[]|string|null|undefined} settingsOrList
 * @returns {string[]}
 */
export function readDevModes(settingsOrList) {
  if (settingsOrList == null) return [];
  if (Array.isArray(settingsOrList)) {
    return settingsOrList.filter((m) => typeof m === "string" && m.length > 0);
  }
  if (typeof settingsOrList === "string") {
    const parsed = parseDevModesArg(settingsOrList);
    return parsed.ok ? parsed.modes : [];
  }
  const settings = settingsOrList;
  if (typeof settings.get_strv === "function") {
    try {
      const v = settings.get_strv("dev-modes");
      return Array.isArray(v) ? v.filter((m) => typeof m === "string" && m.length > 0) : [];
    } catch (_e) {
      /* schema missing in older installs */
    }
  }
  if (typeof settings.get_string === "function") {
    try {
      const parsed = parseDevModesArg(settings.get_string("dev-modes"));
      return parsed.ok ? parsed.modes : [];
    } catch (_e) {
      /* */
    }
  }
  return [];
}

/**
 * @param {object|string[]|string|null|undefined} settingsOrList
 * @param {string} name
 * @returns {boolean}
 */
export function hasDevMode(settingsOrList, name) {
  if (!name) return false;
  return readDevModes(settingsOrList).includes(name);
}

/** @param {string[]} modes */
export function formatGSettingsStrv(modes) {
  const list = Array.isArray(modes) ? modes.filter(Boolean) : [];
  if (!list.length) return "@as []";
  return `[${list.map((m) => `'${String(m).replace(/'/g, "")}'`).join(", ")}]`;
}
