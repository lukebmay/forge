/*
 * This file is part of the Forge extension for GNOME
 *
 * Pure drop-intent (D0 + D024). No GObject.
 * No-op only when parent + order + layout already match.
 */

/**
 * @param {object|null|undefined} node
 * @returns {boolean}
 */
function isHSplit(node) {
  return !!(node?.isHSplit?.() || node?.layout === "HSPLIT");
}

/**
 * @param {object|null|undefined} node
 * @returns {boolean}
 */
function isVSplit(node) {
  return !!(node?.isVSplit?.() || node?.layout === "VSPLIT");
}

/**
 * @param {object|null|undefined} node
 * @returns {boolean}
 */
function isGrouped(node) {
  return !!(
    node?.isStackedOrTabbed?.() ||
    node?.isTabbed?.() ||
    node?.isStacked?.() ||
    node?.layout === "TABBED" ||
    node?.layout === "STACKED"
  );
}

/**
 * CENTER into an already TABBED/STACKED parent of both nodes.
 * @param {object} parent
 * @param {object} operation
 * @param {object} [ctx]
 * @returns {boolean}
 */
function isSameGroupParent(parent, operation, ctx) {
  if (ctx?.stackedOrTabbed && parent === operation.containerNode) return true;
  return isGrouped(parent);
}

/**
 * D0+D024: true when the drop would change parent, order, or layout.
 * CENTER on H/V siblings is a group op — never “already after target.”
 *
 * @param {object|null|undefined} source dragged WINDOW node
 * @param {object|null|undefined} target WINDOW node under the pointer
 * @param {object|null|undefined} operation from _buildDropOperation
 * @param {object} [ctx]
 * @returns {boolean}
 */
export function dropChangesStructure(source, target, operation, ctx) {
  if (!source || !target || !operation) return false;
  if (source === target) return false;

  const parent = source.parentNode;
  if (!parent || parent !== target.parentNode) return true;

  if (operation.isCenter) {
    if (operation.isSwap) return true;
    if (isSameGroupParent(parent, operation, ctx)) return false;
    return true;
  }

  if (operation.isSwap) return true;
  if (operation.shouldWrapTargetCon || operation.shouldDetachWindow) return true;

  if (operation.shouldCreateCon) {
    if ((parent.childNodes?.length ?? 0) !== 2) return true;
    const wantH = !!operation.isHorizontal;
    if (wantH && !isHSplit(parent)) return true;
    if (!wantH && !isVSplit(parent)) return true;
  } else if (operation.isHorizontal && isVSplit(parent)) {
    return true;
  } else if (!operation.isHorizontal && isHSplit(parent)) {
    return true;
  }

  if (operation.isBefore) {
    return source.nextSibling !== target;
  }
  return target.nextSibling !== source;
}

/**
 * CENTER that groups two H/V CON siblings via mergeWindowsIntoGroup.
 * @param {object|null|undefined} source
 * @param {object|null|undefined} target
 * @param {object|null|undefined} operation
 * @returns {boolean}
 */
export function shouldMergeCenterGroup(source, target, operation) {
  if (!source || !target || !operation?.isCenter || operation.isSwap) return false;
  const parent = source.parentNode;
  if (!parent || parent !== target.parentNode) return false;
  if (parent.nodeType && parent.nodeType !== "CON") return false;
  return isHSplit(parent) || isVSplit(parent);
}
