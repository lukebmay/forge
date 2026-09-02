// @ts-check
/**
 * Epoch T6 snapshot / restore. Host-free.
 */

export {
  SNAPSHOT_VERSION,
  collectWindowIds,
  findLeafDescForWindow,
  isWindowDescriptor,
  windowIdOf,
} from "./schema.js";

export { findMonitorAncestor, hasAncestor, windowsUnder } from "./walk.js";

export { resolveTargetMonitor } from "./resolve-target.js";

export {
  applyMonitorPercents,
  applyMonitorSnapshot,
  applyPercentsByWindows,
  expectedTopology,
  extractOuterLayoutGroups,
  liveTopology,
  monitorTopologyMatches,
  pruneEmptyConsUnder,
  rebuildNode,
  renormalizeChildPercents,
  // restoreForest*: quarantined for unit POJO tests (D096 G7). Live WM → forest-restore.
  restoreForest,
  restoreForestIfNeeded,
  topologyEqual,
} from "./restore.js";
