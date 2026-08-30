// @ts-check
/**
 * Adapter host bag — Meta/St keyed by node nanoid. Not TOM.
 */

/**
 * @typedef {Object} HostBagEntry
 * @property {object} [meta]
 * @property {object} [actor]
 * @property {string|number} [windowId]
 * @property {boolean} [floating] mode↔FLOATS mirror until C7
 */

/**
 * @typedef {Object} HostBag
 * @property {(id: string) => HostBagEntry|undefined} get
 * @property {(id: string, partial: Partial<HostBagEntry>) => HostBagEntry} set
 * @property {(id: string) => boolean} delete
 * @property {() => void} clear
 * @property {() => IterableIterator<[string, HostBagEntry]>} entries
 * @property {(id: string) => boolean} has
 * @property {number} size
 * @property {(meta: object) => string|undefined} idFromMeta
 * @property {(windowId: string|number) => string|undefined} idFromWindowId
 */

/**
 * @param {HostBagEntry|undefined} entry
 * @param {string} id
 * @param {WeakMap<object, string>} metaToId
 * @param {Map<string, string>} windowIdToId
 */
function unlinkReverse(entry, id, metaToId, windowIdToId) {
  if (!entry) return;
  if (entry.meta && typeof entry.meta === "object") {
    if (metaToId.get(entry.meta) === id) metaToId.delete(entry.meta);
  }
  if (entry.windowId != null && entry.windowId !== "") {
    const wid = String(entry.windowId);
    if (windowIdToId.get(wid) === id) windowIdToId.delete(wid);
  }
}

/**
 * @param {HostBagEntry} entry
 * @param {string} id
 * @param {WeakMap<object, string>} metaToId
 * @param {Map<string, string>} windowIdToId
 */
function linkReverse(entry, id, metaToId, windowIdToId) {
  if (entry.meta && typeof entry.meta === "object") {
    metaToId.set(entry.meta, id);
  }
  if (entry.windowId != null && entry.windowId !== "") {
    windowIdToId.set(String(entry.windowId), id);
  }
}

/** @returns {HostBag} */
export function createHostBag() {
  /** @type {Map<string, HostBagEntry>} */
  const byId = new Map();
  /** @type {WeakMap<object, string>} */
  const metaToId = new WeakMap();
  /** @type {Map<string, string>} */
  const windowIdToId = new Map();

  return {
    get(id) {
      return byId.get(id);
    },

    set(id, partial) {
      const prev = byId.get(id);
      /** @type {HostBagEntry} */
      const next = prev ? { ...prev, ...partial } : { ...partial };
      unlinkReverse(prev, id, metaToId, windowIdToId);
      byId.set(id, next);
      linkReverse(next, id, metaToId, windowIdToId);
      return next;
    },

    delete(id) {
      const prev = byId.get(id);
      if (!prev) return false;
      unlinkReverse(prev, id, metaToId, windowIdToId);
      return byId.delete(id);
    },

    clear() {
      for (const [id, entry] of byId) {
        unlinkReverse(entry, id, metaToId, windowIdToId);
      }
      byId.clear();
      windowIdToId.clear();
    },

    entries() {
      return byId.entries();
    },

    has(id) {
      return byId.has(id);
    },

    get size() {
      return byId.size;
    },

    idFromMeta(meta) {
      if (!meta || typeof meta !== "object") return undefined;
      return metaToId.get(meta);
    },

    idFromWindowId(windowId) {
      if (windowId == null || windowId === "") return undefined;
      return windowIdToId.get(String(windowId));
    },
  };
}
