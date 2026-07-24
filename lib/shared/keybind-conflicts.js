/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure conflict analysis for Forge keybindings vs each other and vs external
 * (GNOME Settings) bindings. Prefs injects live GSettings readers.
 */

/**
 * @typedef {{ accel: string, id: string, label: string, source: string }} ExternalBinding
 * @typedef {{ accel: string, forgeKey: string, otherId: string, otherLabel: string, source: string }} Conflict
 */

/**
 * Normalize accelerator string for equality (case-insensitive mods, stable mod order).
 * @param {string} accel
 * @returns {string}
 */
export function normalizeAccel(accel) {
  if (!accel || typeof accel !== "string") return "";
  const mods = [];
  const modRe = /<([^>]+)>/g;
  let match;
  while ((match = modRe.exec(accel)) !== null) {
    let m = match[1].toLowerCase();
    if (m === "control") m = "ctrl";
    if (m === "meta") m = "super";
    mods.push(m);
  }
  mods.sort();
  const key = accel
    .replace(/<[^>]+>/g, "")
    .trim()
    .toLowerCase();
  return `${mods.map((m) => `<${m}>`).join("")}${key}`;
}

/**
 * Internal Forge duplicates: same chord on two actions.
 * @param {Record<string, string[]>} bindings
 * @returns {Conflict[]}
 */
export function findInternalBindingConflicts(bindings) {
  /** @type {Map<string, string[]>} */
  const byAccel = new Map();
  for (const [forgeKey, accels] of Object.entries(bindings ?? {})) {
    for (const accel of accels ?? []) {
      if (!accel) continue;
      const n = normalizeAccel(accel);
      if (!byAccel.has(n)) byAccel.set(n, []);
      byAccel.get(n).push(forgeKey);
    }
  }

  /** @type {Conflict[]} */
  const out = [];
  for (const [n, keys] of byAccel) {
    if (keys.length < 2) continue;
    const unique = [...new Set(keys)];
    if (unique.length < 2) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        out.push({
          accel: n,
          forgeKey: unique[i],
          otherId: unique[j],
          otherLabel: unique[j],
          source: "forge",
        });
      }
    }
  }
  return out;
}

/**
 * Forge bindings that collide with external (GNOME) bindings.
 * @param {Record<string, string[]>} forgeBindings
 * @param {ExternalBinding[]} external
 * @returns {Conflict[]}
 */
export function findExternalBindingConflicts(forgeBindings, external) {
  /** @type {Map<string, ExternalBinding[]>} */
  const extByAccel = new Map();
  for (const entry of external ?? []) {
    if (!entry?.accel) continue;
    const n = normalizeAccel(entry.accel);
    if (!extByAccel.has(n)) extByAccel.set(n, []);
    extByAccel.get(n).push(entry);
  }

  /** @type {Conflict[]} */
  const out = [];
  for (const [forgeKey, accels] of Object.entries(forgeBindings ?? {})) {
    for (const accel of accels ?? []) {
      if (!accel) continue;
      const n = normalizeAccel(accel);
      const hits = extByAccel.get(n) ?? [];
      for (const hit of hits) {
        out.push({
          accel: n,
          forgeKey,
          otherId: hit.id,
          otherLabel: hit.label || hit.id,
          source: hit.source || "gnome",
        });
      }
    }
  }
  return out;
}

/**
 * Combined report for a binding map.
 * @param {Record<string, string[]>} forgeBindings
 * @param {ExternalBinding[]} [external]
 * @returns {{ internal: Conflict[], external: Conflict[], all: Conflict[] }}
 */
export function analyzeBindingConflicts(forgeBindings, external = []) {
  const internal = findInternalBindingConflicts(forgeBindings);
  const externalConflicts = findExternalBindingConflicts(forgeBindings, external);
  return {
    internal,
    external: externalConflicts,
    all: [...internal, ...externalConflicts],
  };
}

/**
 * Collect strv keys from a GSettings-like object into ExternalBinding[].
 * @param {string} schemaId
 * @param {string[]} keys
 * @param {(key: string) => string[]} getStrv
 * @param {string} [sourceLabel]
 * @returns {ExternalBinding[]}
 */
export function collectSchemaStrvBindings(schemaId, keys, getStrv, sourceLabel) {
  const source = sourceLabel || schemaId;
  const out = [];
  for (const key of keys) {
    let accels;
    try {
      accels = getStrv(key);
    } catch {
      continue;
    }
    for (const accel of accels ?? []) {
      if (!accel) continue;
      out.push({
        accel,
        id: key,
        label: `${source}: ${key}`,
        source: schemaId,
      });
    }
  }
  return out;
}

/** Schemas prefs/shell can scan for GNOME-side conflicts. */
export const GNOME_STRV_SCHEMAS = [
  "org.gnome.desktop.wm.keybindings",
  "org.gnome.shell.keybindings",
  "org.gnome.mutter.keybindings",
];

/**
 * Build external list from live Gio.Settings factories (prefs injects).
 * @param {object} opts
 * @param {(schemaId: string) => { list_keys: () => string[], get_value: (k: string) => { get_type_string: () => string }, get_strv: (k: string) => string[] } | null} opts.openSchema
 * @param {() => ExternalBinding[]} [opts.extra] custom/media-keys
 * @returns {ExternalBinding[]}
 */
export function collectGnomeExternalBindings({ openSchema, extra }) {
  const out = [];
  for (const schemaId of GNOME_STRV_SCHEMAS) {
    const settings = openSchema(schemaId);
    if (!settings) continue;
    let keys = [];
    try {
      keys = settings.list_keys().filter((key) => {
        try {
          return settings.get_value(key)?.get_type_string() === "as";
        } catch {
          return false;
        }
      });
    } catch {
      continue;
    }
    out.push(...collectSchemaStrvBindings(schemaId, keys, (k) => settings.get_strv(k)));
  }
  if (typeof extra === "function") {
    try {
      out.push(...(extra() ?? []));
    } catch {
      /* ignore */
    }
  }
  return out;
}
