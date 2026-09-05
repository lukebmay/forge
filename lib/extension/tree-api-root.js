// @ts-check
/**
 * ROOT spine: managers + workspace/monitor invent. Not GObject Tree.
 */

import { MonitorManager } from "./monitor.js";
import { WorkspaceManager } from "./workspace.js";
import { NODE_TYPES } from "./tree-types.js";
import * as Utils from "./utils.js";

/** Names createLiveTree must not copy from Tree.prototype. */
export const ROOT_SPINE_NAMES = new Set([
  "extWm",
  "monitorManager",
  "workspaceManager",
  "_initWorkspaces",
  "addWorkspace",
  "removeWorkspace",
  "addMonitor",
  "nodeWorkpaces",
  "nodeWindows",
  "reload",
  "destroy",
  "_removeScaffoldBins",
]);

/** @param {any} root */
export function rootExtWm(root) {
  return root._extWm;
}

/** @param {any} root */
export function rootMonitorManager(root) {
  return root._monitorManager;
}

/** @param {any} root */
export function rootWorkspaceManager(root) {
  return root._workspaceManager;
}

/**
 * @param {any} root
 * @param {any} extWm
 */
export function attachRootManagers(root, extWm) {
  root._monitorManager = new MonitorManager(root, extWm);
  root._workspaceManager = new WorkspaceManager(root, extWm);
}

/** @param {any} root */
export function initWorkspaces(root) {
  const wsManager = global.display.get_workspace_manager();
  const workspaces = wsManager.get_n_workspaces();
  for (let i = 0; i < workspaces; i++) {
    addWorkspace(root, i);
  }
}

/**
 * @param {any} root
 * @param {number} wsIndex
 */
export function addMonitor(root, wsIndex) {
  root._monitorManager.addMonitor(wsIndex);
}

/**
 * @param {any} root
 * @param {number} wsIndex
 */
export function addWorkspace(root, wsIndex) {
  return root._workspaceManager.addWorkspace(wsIndex);
}

/**
 * @param {any} root
 * @param {number} wsIndex
 */
export function removeWorkspace(root, wsIndex) {
  return root._workspaceManager.removeWorkspace(wsIndex);
}

/** @param {any} root */
export function nodeWorkpaces(root) {
  return root.getNodeByType(NODE_TYPES.WORKSPACE);
}

/** @param {any} root */
export function nodeWindows(root) {
  return root.getNodeByType(NODE_TYPES.WINDOW);
}

/** forge-h6jc: drop workspace/monitor actorBins; keep ROOT bin. */
export function removeScaffoldBins(root) {
  const nodeBins = [
    ...(root.getNodeByType(NODE_TYPES.WORKSPACE) || []),
    ...(root.getNodeByType(NODE_TYPES.MONITOR) || []),
  ];
  for (const node of nodeBins) {
    const bin = node.actorBin;
    try {
      if (bin && global.window_group.contains(bin)) {
        global.window_group.remove_child(bin);
      }
    } catch (_e) {
      /* fixtures / disposed */
    }
  }
}

/** @param {any} root */
export function rootReload(root) {
  Utils._disableDecorations(root.extWm?.decorationManager);
  removeScaffoldBins(root);
  root.childNodes.length = 0;
  root.attachNode = undefined;
  root._initWorkspaces();
}

/** @param {any} root */
export function rootDestroy(root) {
  removeScaffoldBins(root);
  const rootBin = root.nodeValue;
  try {
    if (rootBin && global.window_group.contains(rootBin)) {
      global.window_group.remove_child(rootBin);
    }
  } catch (_e) {
    /* fixtures / disposed */
  }
}

const SPINE_DESCRIPTORS = {
  extWm: {
    get() {
      return rootExtWm(this);
    },
    configurable: true,
  },
  monitorManager: {
    get() {
      return rootMonitorManager(this);
    },
    configurable: true,
  },
  workspaceManager: {
    get() {
      return rootWorkspaceManager(this);
    },
    configurable: true,
  },
  nodeWorkpaces: {
    get() {
      return nodeWorkpaces(this);
    },
    configurable: true,
  },
  nodeWindows: {
    get() {
      return nodeWindows(this);
    },
    configurable: true,
  },
  _initWorkspaces: {
    value: function _initWorkspaces() {
      initWorkspaces(this);
    },
    writable: true,
    configurable: true,
  },
  addWorkspace: {
    value: function rootAddWorkspace(wsIndex) {
      return addWorkspace(this, wsIndex);
    },
    writable: true,
    configurable: true,
  },
  removeWorkspace: {
    value: function rootRemoveWorkspace(wsIndex) {
      return removeWorkspace(this, wsIndex);
    },
    writable: true,
    configurable: true,
  },
  addMonitor: {
    value: function rootAddMonitor(wsIndex) {
      addMonitor(this, wsIndex);
    },
    writable: true,
    configurable: true,
  },
  reload: {
    value: function rootReloadFn() {
      rootReload(this);
    },
    writable: true,
    configurable: true,
  },
  destroy: {
    value: function rootDestroyFn() {
      rootDestroy(this);
    },
    writable: true,
    configurable: true,
  },
  _removeScaffoldBins: {
    value: function rootRemoveScaffoldBins() {
      removeScaffoldBins(this);
    },
    writable: true,
    configurable: true,
  },
};

/** @param {any} root */
export function attachRootSpineApi(root) {
  Object.defineProperties(root, SPINE_DESCRIPTORS);
}
