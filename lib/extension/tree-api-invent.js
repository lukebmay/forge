// @ts-check
/**
 * GObject invent peeled off class Tree. `Node` is injected to avoid
 * a circular import with tree.js.
 */

import St from "gi://St";

import { Logger } from "../shared/logger.js";
import { WINDOW_MODES } from "./window-modes.js";
import { NODE_TYPES, LAYOUT_TYPES, ORIENTATION_TYPES } from "./tree-types.js";
import { ensureLiveListMutators } from "./live-compat.js";
import { createPlaceholderStub, markPlaceholderNode } from "./layout-placeholder.js";

/** Names createLiveTree must not copy from Node/Tree.prototype. */
export const INVENT_NAMES = new Set([
  "createPlaceholderLeaf",
  "_createNodeGObject",
  "_snapshotCreateCon",
  "_splitGObject",
  "_mergeWindowsIntoGroupGObject",
]);

/**
 * Unseeded / invent-lock GObject invent. Production ROOT returns null.
 * @param {any} tree
 * @param {any} Node
 */
export function treeCreateNodeGObject(
  tree,
  Node,
  parentObj,
  type,
  value,
  mode = WINDOW_MODES.TILE
) {
  if (!tree.extWm?._allowGObjectCreateNode) return null;
  const parentNode = tree.findNode(parentObj);
  if (!parentNode) return undefined;
  const child = new Node(type, value);
  child.settings = tree.settings;
  if (child.isWindow()) child.mode = mode;
  if (typeof parentNode.appendChild !== "function") {
    ensureLiveListMutators(parentNode);
  }
  if (parentNode.isWindow()) {
    const grandParentNode = parentNode.parentNode;
    if (grandParentNode && typeof grandParentNode.insertBefore !== "function") {
      ensureLiveListMutators(grandParentNode);
    }
    grandParentNode.insertBefore(child, parentNode.nextSibling);
    Logger.debug(
      `Parent is a window, attaching to this window's parent ${grandParentNode.nodeType}`
    );
  } else {
    parentNode.appendChild(child);
  }
  return child;
}

/**
 * @param {any} tree
 * @param {any} Node
 */
export function treeCreatePlaceholderLeaf(tree, Node, parentObj, opts = {}) {
  const parentNode =
    parentObj && typeof parentObj === "object" && parentObj.nodeType != null
      ? parentObj
      : tree.findNode(parentObj);
  if (!parentNode) return null;

  const layoutSlot = opts.layoutSlot != null ? String(opts.layoutSlot) : null;
  const layoutRole = opts.layoutRole != null ? String(opts.layoutRole) : null;
  const stub = createPlaceholderStub({
    id: opts.id,
    title: opts.title,
    reason: opts.reason ?? null,
    layoutSlot,
    layoutRole,
  });
  const child = new Node(NODE_TYPES.WINDOW, stub);
  child.settings = tree.settings;
  child.mode = WINDOW_MODES.TILE;
  markPlaceholderNode(child, { reason: opts.reason ?? null });
  if (layoutSlot) child.layoutSlot = layoutSlot;
  if (layoutRole) child.layoutRole = layoutRole;
  if (typeof opts.percent === "number" && Number.isFinite(opts.percent)) {
    child.percent = opts.percent;
  }
  if (opts.userSized) child.userSized = true;
  if (opts.rect) child.rect = opts.rect;

  const before = opts.beforeNode ?? null;
  if (before && before.parentNode === parentNode) {
    parentNode.insertBefore(child, before);
  } else {
    parentNode.appendChild(child);
  }
  return child;
}

/** Unseeded GObject invent. Seeded path is forestMergeWindowsIntoGroup. */
export function treeMergeWindowsIntoGroupGObject(
  tree,
  Node,
  focusNode,
  partnerNode,
  layout = LAYOUT_TYPES.TABBED,
  opts = {}
) {
  if (!focusNode || !partnerNode || focusNode === partnerNode) return null;
  if (focusNode.nodeType !== NODE_TYPES.WINDOW || partnerNode.nodeType !== NODE_TYPES.WINDOW) {
    return null;
  }

  const parent = focusNode.parentNode;
  if (!parent) return null;

  const applyGroupLayout = (con) => {
    const chrome =
      layout === LAYOUT_TYPES.TABBED
        ? { lastTabFocus: focusNode.nodeValue }
        : layout === LAYOUT_TYPES.STACKED
        ? { lastTabFocus: null }
        : {};
    tree.setLayout(con, layout, chrome);
  };

  const destGroup =
    opts.group ||
    (opts.insertIndex != null && parent.isStackedOrTabbed?.() && parent.nodeType === NODE_TYPES.CON
      ? parent
      : null);

  if (destGroup && partnerNode.parentNode !== destGroup) {
    const group = tree.insertWindowIntoGroup(destGroup, partnerNode, opts.insertIndex);
    if (
      group &&
      layout &&
      group.layout !== layout &&
      (layout === LAYOUT_TYPES.TABBED || layout === LAYOUT_TYPES.STACKED)
    ) {
      const chrome =
        layout === LAYOUT_TYPES.TABBED
          ? { lastTabFocus: partnerNode.nodeValue }
          : { lastTabFocus: null };
      tree.setLayout(group, layout, chrome);
    }
    return group;
  }

  if (
    partnerNode.parentNode === parent &&
    parent.isStackedOrTabbed() &&
    parent.nodeType === NODE_TYPES.CON
  ) {
    if (opts.insertIndex != null) {
      return tree.insertWindowIntoGroup(parent, partnerNode, opts.insertIndex);
    }
    tree._afterMergeGroup(parent);
    return parent;
  }

  if (
    partnerNode.parentNode === parent &&
    (parent.isHSplit() || parent.isVSplit()) &&
    parent.nodeType === NODE_TYPES.CON
  ) {
    const tiled = tree
      .getTiledChildren(parent.childNodes)
      .filter((n) => n.nodeType === NODE_TYPES.WINDOW);
    const members = new Set(tiled);
    if (focusNode.parentNode === parent) members.add(focusNode);
    if (partnerNode.parentNode === parent) members.add(partnerNode);
    if (members.size === 2 && members.has(focusNode) && members.has(partnerNode)) {
      applyGroupLayout(parent);
      tree.resetSiblingPercent(parent);
      tree.attachNode = parent;
      if (opts.insertIndex != null) {
        return tree.insertWindowIntoGroup(parent, partnerNode, opts.insertIndex);
      }
      tree._afterMergeGroup(parent);
      return parent;
    }
  }

  const oldPartnerParent = partnerNode.parentNode;
  const container = new St.Bin();
  const con = new Node(NODE_TYPES.CON, container);
  con.settings = tree.settings;
  con.percent = focusNode.percent;
  con.userSized = !!focusNode.userSized;
  con.rect = focusNode.rect;
  applyGroupLayout(con);

  parent.insertBefore(con, focusNode);
  con.appendChild(focusNode);
  con.appendChild(partnerNode);
  if (opts.insertIndex === 0) {
    con.replaceChildren([partnerNode, focusNode]);
  }

  tree.resetSiblingPercent(con);
  tree.resetSiblingPercent(parent);
  if (oldPartnerParent && oldPartnerParent !== parent && oldPartnerParent !== con) {
    tree.resetSiblingPercent(oldPartnerParent);
    if (oldPartnerParent.nodeType === NODE_TYPES.CON) {
      oldPartnerParent.resetLayoutSingleChild();
    }
  }

  tree.attachNode = con;
  tree._afterMergeGroup(con);
  return con;
}

/** Unseeded wrap/toggle split. Production seeded path is forestSplit. */
export function treeSplitGObject(tree, Node, node, orientation, forceSplit = false) {
  if (!node) return null;
  const type = node.nodeType;

  if (type === NODE_TYPES.WINDOW && node.mode === WINDOW_MODES.FLOAT && !forceSplit) {
    return null;
  }

  if (!(type === NODE_TYPES.MONITOR || type === NODE_TYPES.CON || type === NODE_TYPES.WINDOW)) {
    return null;
  }

  const parentNode = node.parentNode;
  const numChildren = parentNode.childNodes.length;

  if (
    !forceSplit &&
    numChildren === 1 &&
    (parentNode.layout === LAYOUT_TYPES.HSPLIT || parentNode.layout === LAYOUT_TYPES.VSPLIT)
  ) {
    parentNode.layout =
      orientation === ORIENTATION_TYPES.HORIZONTAL ? LAYOUT_TYPES.HSPLIT : LAYOUT_TYPES.VSPLIT;
    tree.attachNode = parentNode;
    Logger.trace(`tree.split branch=toggle orient=${orientation} kids=1`);
    return null;
  }

  const container = new St.Bin();
  const newConNode = new Node(NODE_TYPES.CON, container);
  newConNode.settings = tree.settings;
  newConNode.layout =
    orientation === ORIENTATION_TYPES.HORIZONTAL ? LAYOUT_TYPES.HSPLIT : LAYOUT_TYPES.VSPLIT;
  newConNode.rect = node.rect;
  newConNode.percent = node.percent;
  newConNode.userSized = !!node.userSized;
  parentNode.insertBefore(newConNode, node);
  newConNode.appendChild(node);
  tree.attachNode = newConNode;
  Logger.trace(
    `tree.split branch=wrap orient=${orientation} kids=${numChildren} force=${!!forceSplit}`
  );
  return newConNode;
}

/** GObject CON invent for T6 restore / group rebuild. Not Forest. */
export function treeSnapshotCreateCon(tree, Node) {
  const con = new Node(NODE_TYPES.CON, new St.Bin());
  con.settings = tree.settings;
  return con;
}

/** @param {any} root @param {any} Node */
export function attachRootInventApi(root, Node) {
  Object.defineProperties(root, {
    createPlaceholderLeaf: {
      value: function inventCreatePlaceholderLeaf(parentObj, opts = {}) {
        return treeCreatePlaceholderLeaf(this, Node, parentObj, opts);
      },
      writable: true,
      configurable: true,
    },
    _createNodeGObject: {
      value: function inventCreateNodeGObject(parentObj, type, value, mode = WINDOW_MODES.TILE) {
        return treeCreateNodeGObject(this, Node, parentObj, type, value, mode);
      },
      writable: true,
      configurable: true,
    },
    _snapshotCreateCon: {
      value: function inventSnapshotCreateCon() {
        return treeSnapshotCreateCon(this, Node);
      },
      writable: true,
      configurable: true,
    },
    _splitGObject: {
      value: function inventSplitGObject(node, orientation, forceSplit = false) {
        return treeSplitGObject(this, Node, node, orientation, forceSplit);
      },
      writable: true,
      configurable: true,
    },
    _mergeWindowsIntoGroupGObject: {
      value: function inventMergeWindowsIntoGroupGObject(focusNode, partnerNode, layout, opts) {
        return treeMergeWindowsIntoGroupGObject(this, Node, focusNode, partnerNode, layout, opts);
      },
      writable: true,
      configurable: true,
    },
  });
}
