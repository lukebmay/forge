/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure allowlist + value coercion for session settings get/set (FC3).
 * No GObject / Gio — unit-testable without mocks.
 */

import { SETTINGS_KEYS, KEYBINDING_KEYS, KEYBINDING_STRING_KEYS } from "./settings-keys.js";

/** @typedef {"settings" | "keybindings"} SchemaKind */

/**
 * @typedef {Object} ResolvedKey
 * @property {SchemaKind} schema
 * @property {string} key
 * @property {string} typeHint - GSettings type string when known statically
 */

const SETTINGS_FLAT = (() => {
  /** @type {Set<string>} */
  const s = new Set();
  for (const cat of Object.keys(SETTINGS_KEYS)) {
    for (const k of SETTINGS_KEYS[cat]) s.add(k);
  }
  return s;
})();

const KEYBINDING_FLAT = new Set(KEYBINDING_KEYS);
const KEYBINDING_STRING_FLAT = new Set(KEYBINDING_STRING_KEYS);

/**
 * All portable settings keys (main schema whitelist).
 * @returns {string[]}
 */
export function allSettingsKeys() {
  return [...SETTINGS_FLAT];
}

/**
 * All portable keybinding keys (strv + string keys).
 * @returns {string[]}
 */
export function allKeybindingKeys() {
  return [...KEYBINDING_FLAT, ...KEYBINDING_STRING_FLAT];
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isSettingsKey(key) {
  return SETTINGS_FLAT.has(key);
}

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isKeybindingKey(key) {
  return KEYBINDING_FLAT.has(key) || KEYBINDING_STRING_FLAT.has(key);
}

/**
 * Parse optional schema prefix: settings:, keybindings:, kbd:
 * @param {string} raw
 * @returns {{ schema: SchemaKind | null, key: string }}
 */
export function parseKeyRef(raw) {
  if (raw == null || typeof raw !== "string") {
    return { schema: null, key: "" };
  }
  const trimmed = raw.trim();
  const m = /^(settings|keybindings|kbd):(.*)$/i.exec(trimmed);
  if (m) {
    const prefix = m[1].toLowerCase();
    const schema = prefix === "settings" ? "settings" : "keybindings";
    return { schema, key: m[2].trim() };
  }
  return { schema: null, key: trimmed };
}

/**
 * Resolve a portable key to schema + key. Rejects unknown / ambiguous names.
 * @param {string} raw
 * @returns {{ ok: true, resolved: ResolvedKey } | { ok: false, error: string }}
 */
export function resolvePortableKey(raw) {
  const { schema: forced, key } = parseKeyRef(raw);
  if (!key) {
    return { ok: false, error: "empty key" };
  }

  const inSettings = SETTINGS_FLAT.has(key);
  const inKbd = KEYBINDING_FLAT.has(key) || KEYBINDING_STRING_FLAT.has(key);

  if (forced === "settings") {
    if (!inSettings) {
      return { ok: false, error: `unknown settings key: ${key}` };
    }
    return {
      ok: true,
      resolved: { schema: "settings", key, typeHint: "" },
    };
  }
  if (forced === "keybindings") {
    if (!inKbd) {
      return { ok: false, error: `unknown keybindings key: ${key}` };
    }
    return {
      ok: true,
      resolved: {
        schema: "keybindings",
        key,
        typeHint: KEYBINDING_STRING_FLAT.has(key) ? "s" : "as",
      },
    };
  }

  // Unprefixed: settings wins if only there; kbd if only there; ambiguous → error
  if (inSettings && inKbd) {
    return {
      ok: false,
      error: `ambiguous key "${key}" (use settings:${key} or kbd:${key})`,
    };
  }
  if (inSettings) {
    return {
      ok: true,
      resolved: { schema: "settings", key, typeHint: "" },
    };
  }
  if (inKbd) {
    return {
      ok: true,
      resolved: {
        schema: "keybindings",
        key,
        typeHint: KEYBINDING_STRING_FLAT.has(key) ? "s" : "as",
      },
    };
  }
  return { ok: false, error: `unknown key: ${key}` };
}

/**
 * Parse CLI / DBus value text into a JS value.
 * JSON first; bare true/false/null/numbers; else string.
 * @param {string} text
 * @returns {{ ok: true, value: any } | { ok: false, error: string }}
 */
export function parseSettingValueText(text) {
  if (text == null) {
    return { ok: false, error: "missing value" };
  }
  const s = String(text);
  const trimmed = s.trim();
  if (trimmed === "") {
    // Empty string is a valid string value for set_string
    return { ok: true, value: "" };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (_e) {
    // not JSON
  }
  // bare words that JSON would accept without quotes
  if (trimmed === "true") return { ok: true, value: true };
  if (trimmed === "false") return { ok: true, value: false };
  if (trimmed === "null") return { ok: true, value: null };
  if (/^-?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isSafeInteger(n)) return { ok: true, value: n };
  }
  if (/^-?\d+\.\d+([eE][+-]?\d+)?$/.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return { ok: true, value: n };
  }
  return { ok: true, value: s };
}

/**
 * Coerce a JS value to match a GSettings type string.
 * @param {any} value
 * @param {string} typeString - b | u | i | s | d | as
 * @returns {{ ok: true, value: any } | { ok: false, error: string }}
 */
export function coerceForGSettingsType(value, typeString) {
  const t = typeString || "";
  switch (t) {
    case "b": {
      if (typeof value === "boolean") return { ok: true, value };
      if (value === 0 || value === "0" || value === "false") return { ok: true, value: false };
      if (value === 1 || value === "1" || value === "true") return { ok: true, value: true };
      return { ok: false, error: `expected boolean for type b, got ${typeof value}` };
    }
    case "u": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return { ok: false, error: `expected non-negative integer for type u` };
      }
      return { ok: true, value: n };
    }
    case "i": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { ok: false, error: `expected integer for type i` };
      }
      return { ok: true, value: n };
    }
    case "d": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) {
        return { ok: false, error: `expected number for type d` };
      }
      return { ok: true, value: n };
    }
    case "s": {
      if (value == null) return { ok: false, error: "expected string for type s" };
      if (typeof value === "string") return { ok: true, value };
      if (typeof value === "number" || typeof value === "boolean") {
        return { ok: true, value: String(value) };
      }
      return { ok: false, error: `expected string for type s, got ${typeof value}` };
    }
    case "as": {
      if (Array.isArray(value)) {
        if (!value.every((x) => typeof x === "string")) {
          return { ok: false, error: "expected string array for type as" };
        }
        return { ok: true, value };
      }
      if (typeof value === "string") {
        // single accel as bare string → one-element strv
        return { ok: true, value: [value] };
      }
      return { ok: false, error: `expected string[] for type as, got ${typeof value}` };
    }
    default:
      return { ok: false, error: `unsupported GSettings type: ${t || "(empty)"}` };
  }
}
