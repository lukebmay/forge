// @ts-check
/**
 * WINDOW/CON chrome peel off class Node (G8n). Not ROOT API.
 * createLiveTree skips CHROME_NAMES — do not dump onto ROOT.
 */

import { initWindowApp } from "./live-handle.js";
import * as NodeChrome from "./node-chrome.js";

/** Names createLiveTree must not copy from Node.prototype onto ROOT. */
export const CHROME_NAMES = new Set([
  "_activateFromTab",
  "_armTabDragForWindow",
  "_buildTabBase",
  "_cancelTabDragIfWindow",
  "_createDecoration",
  "_createWindowTab",
  "_destroyDecoration",
  "_destroyTab",
  "_ensureConTab",
  "_getTitle",
  "_initMetaWindow",
  "_releaseDecorationActor",
  "_resetTabForReparent",
  "_titleForMeta",
  "refreshApp",
]);

/** @param {any} node */
export function nodeInitMetaWindow(node) {
  return initWindowApp(node);
}

/** @param {any} node */
export function nodeRefreshApp(node) {
  return NodeChrome.refreshApp(node);
}

/** @param {any} app @param {any} labelText */
export function nodeBuildTabBase(app, labelText) {
  return NodeChrome.buildTabBase(app, labelText);
}

/** @param {any} node */
export function nodeCreateWindowTab(node) {
  return NodeChrome.createWindowTab(node);
}

/** @param {any} node */
export function nodeEnsureConTab(node) {
  return NodeChrome.ensureConTab(node);
}

/** @param {any} node @param {any} metaWin @param {any} event */
export function nodeArmTabDragForWindow(node, metaWin, event) {
  return NodeChrome.armTabDragForWindow(node._resolveExtWm(), node, metaWin, event);
}

/** @param {any} node @param {any} metaWin */
export function nodeCancelTabDragIfWindow(node, metaWin) {
  return NodeChrome.cancelTabDragIfWindow(node._resolveExtWm(), node, metaWin);
}

/** @param {any} node @param {any} metaWin */
export function nodeActivateFromTab(node, metaWin) {
  return NodeChrome.activateFromTab(node._resolveExtWm(), node, metaWin);
}

/** @param {any} node */
export function nodeDestroyTab(node) {
  return NodeChrome.destroyTab(node);
}

/** @param {any} node */
export function nodeResetTabForReparent(node) {
  return NodeChrome.resetTabForReparent(node);
}

/** @param {any} node */
export function nodeCreateDecoration(node) {
  return NodeChrome.createDecoration(node);
}

/** @param {any} node */
export function nodeReleaseDecorationActor(node) {
  return NodeChrome.releaseDecorationActor(node);
}

/** @param {any} node */
export function nodeDestroyDecoration(node) {
  return NodeChrome.destroyDecoration(node);
}

/** @param {any} node */
export function nodeGetTitle(node) {
  return NodeChrome.getTitle(node);
}

/** @param {any} metaWin @param {any} app */
export function nodeTitleForMeta(metaWin, app) {
  return NodeChrome.titleForMeta(metaWin, app);
}
