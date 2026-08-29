// @ts-check
/**
 * OpSet/Host session bag — not TOM, not GNOME session restore.
 */

/** @typedef {import('../tom/kernel.js').Forest} Forest */

/**
 * @typedef {Object} Decisions
 * @property {'B'|'A'} peelModel
 * @property {'noop'|'wrap'|'pop'} edgeMove
 * @property {'HSPLIT'|'VSPLIT'} [aspectTieBreak]
 * @property {'SPLIT'|'TAB'} [defaultJoinContainer]
 * @property {boolean} [policyEnabled]
 * @property {boolean} [_edgeNoopMigrated]
 * @property {string} [opsetId]
 *
 * @typedef {Object} ForestSession
 * @property {string[]} mergeTags
 * @property {Decisions} decisions
 */

/** @type {WeakMap<Forest, ForestSession>} */
const bags = new WeakMap();

/** @returns {Decisions} */
export function defaultDecisions() {
  return {
    peelModel: "B",
    edgeMove: "wrap",
    aspectTieBreak: "HSPLIT",
    defaultJoinContainer: "SPLIT",
    policyEnabled: true,
    opsetId: "mark2",
  };
}

/**
 * Pull leftover TOM fields (old dumps) then delete them on `f`.
 * @param {Forest} f
 * @returns {ForestSession}
 */
function takeAttached(f) {
  const raw = /** @type {any} */ (f);
  const decisions = raw.decisions
    ? { ...defaultDecisions(), ...raw.decisions }
    : defaultDecisions();
  const mergeTags = Array.isArray(raw.mergeTags) ? [...raw.mergeTags] : [];
  delete raw.decisions;
  delete raw.mergeTags;
  return { mergeTags, decisions };
}

/**
 * @param {Forest} f
 * @returns {ForestSession}
 */
export function sessionOf(f) {
  let s = bags.get(f);
  if (!s) {
    s = takeAttached(f);
    bags.set(f, s);
  }
  return s;
}

/**
 * @param {Forest} f
 * @param {Partial<ForestSession>} [bag]
 * @returns {ForestSession}
 */
export function attachSession(f, bag = {}) {
  const s = {
    mergeTags: Array.isArray(bag.mergeTags) ? [...bag.mergeTags] : [],
    decisions: { ...defaultDecisions(), ...bag.decisions },
  };
  bags.set(f, s);
  takeAttached(f);
  return s;
}

/**
 * @param {Forest} from
 * @param {Forest} to
 * @returns {ForestSession}
 */
export function copySession(from, to) {
  const src = bags.get(from) || takeAttached(from);
  if (!bags.has(from)) bags.set(from, src);
  const dst = {
    mergeTags: [...src.mergeTags],
    decisions: { ...src.decisions },
  };
  bags.set(to, dst);
  takeAttached(to);
  return dst;
}

/** @param {Forest} f */
export function mergeTagsOf(f) {
  const s = sessionOf(f);
  if (s.mergeTags.length && f.nodes) {
    s.mergeTags = s.mergeTags.filter((id) => f.nodes[id]);
  }
  return s.mergeTags;
}

/** @param {Forest} f @param {string} id */
export function toggleMergeTag(f, id) {
  const tags = mergeTagsOf(f);
  const i = tags.indexOf(id);
  if (i >= 0) tags.splice(i, 1);
  else tags.push(id);
}

/** @param {Forest} f */
export function clearMergeTags(f) {
  sessionOf(f).mergeTags = [];
}
