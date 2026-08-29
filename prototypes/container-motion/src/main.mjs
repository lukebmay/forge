import { createTreeApi, nextAppLabel, dumpForest } from "./tree.mjs";
import { seedBlackDesk, MONITOR_PRESETS, BLACK_MONITORS } from "./presets.mjs";
import { renderDesk } from "./render-desk.mjs";
import { renderTreeGraph, destroyTreeGraph } from "./render-tree.mjs";
import { defaultVimMinusSuper, eventToChord, matchBind, isTypingTarget } from "./keybinds.mjs";
import { loadState, saveState, clearState } from "./storage.mjs";
import { ensureMark2Decisions, getOpSet, runOpAbstract } from "./opsets/index.mjs";
import { monitorsSiblingAxis } from "./monitors.mjs";
import { initMotionPlog, motionLog } from "./plog.mjs";
import { attachSession, copySession, mergeTagsOf, sessionOf } from "./session.mjs";
import { attachWorld, geomOf, worldOf } from "./world.mjs";

initMotionPlog({ level: "debug", sessionId: "motion", console: true });

/** @param {(draft: import('./tree.mjs').Forest) => any} fn */
function opsetTxn(fn) {
  return runOpAbstract(forest, api, (draft) => fn(draft));
}

function activeOpSet() {
  return getOpSet(sessionOf(forest).decisions.opsetId || "mark2");
}

const api = createTreeApi();

/** @type {import('./tree.mjs').Forest} */
let forest = seedBlackDesk(api);
api.hydrateSeq(forest);

/** @type {{ name: string, steps: string[] }[]} */
let macros = [];
/** @type {import('./keybinds.mjs').Keybind[]} */
let keybinds = defaultVimMinusSuper();
/** @type {'split'|'desk'|'tree'} */
let viewMode = "split";

const saved = loadState();
if (saved?.forest?.nodes && saved.forest.monitors?.length) {
  try {
    forest = saved.forest;
    api.hydrateSeq(forest);
    if (saved.session) attachSession(forest, saved.session);
    if (saved.world) attachWorld(forest, saved.world);
    else worldOf(forest);
    ensureMark2Decisions(forest);
  } catch {
    forest = seedBlackDesk(api);
    api.hydrateSeq(forest);
  }
}
if (Array.isArray(saved?.macros)) macros = saved.macros;
if (Array.isArray(saved?.keybinds)) keybinds = migrateKeybinds(saved.keybinds);
if (saved?.viewMode === "desk" || saved?.viewMode === "tree" || saved?.viewMode === "split") {
  viewMode = saved.viewMode;
}

/** Bring persisted keybinds up to current defaults for renamed/new actions. */
function migrateKeybinds(savedBinds) {
  /** @type {import('./keybinds.mjs').Keybind[]} */
  let binds = savedBinds.map((b) => ({ ...b }));
  for (const b of binds) {
    if (b.action === "focusParent" && b.chord.toLowerCase() === "a") {
      b.chord = "p";
      b.label = "Focus parent";
    }
    if (b.action === "focusChild" && b.chord.toLowerCase() === "shift+a") {
      b.chord = "Shift+p";
      b.label = "Focus child";
    }
  }
  for (const b of binds) {
    b.action = b.action
      .replace(/^molecularMove:/, "opset:move:")
      .replace(/^molecularJoin:/, "opset:join:");
    if (b.action === "molecularRemoveNode") b.action = "opset:remove";
    if (b.action === "molecularToggleSplit") b.action = "opset:toggleSplit";
    if (b.action === "molecularToggleTabStack") b.action = "opset:toggleTabStack";
    if (b.action === "molecularPromoteChildren") b.action = "opset:promote";
    if (b.action === "molecularPromoteRecursive") b.action = "opset:promoteRecursive";
    b.label = b.label.replace(/Molecular/g, "OpSet").replace(/Mark2 /g, "Mark 2 ");
  }
  // Refresh hjkl / yuio directional cluster when stale (old mol-on-bare-h eras).
  const hBind = binds.find((b) => b.chord.toLowerCase() === "h");
  const hjklStale =
    hBind &&
    (hBind.action === "opset:move:left" ||
      hBind.action === "molecularMove:left" ||
      (hBind.action === "focus:left" &&
        !binds.some(
          (b) =>
            b.chord.toLowerCase() === "shift+h" &&
            (b.action === "opset:move:left" || b.action === "molecularMove:left")
        )));
  if (hjklStale || (hBind && hBind.action === "opset:move:left")) {
    const dirChords = new Set([
      "h",
      "j",
      "k",
      "l",
      "y",
      "u",
      "i",
      "o",
      "shift+h",
      "shift+j",
      "shift+k",
      "shift+l",
      "shift+y",
      "shift+u",
      "shift+i",
      "shift+o",
      "ctrl+h",
      "ctrl+j",
      "ctrl+k",
      "ctrl+l",
      "ctrl+y",
      "ctrl+u",
      "ctrl+i",
      "ctrl+o",
    ]);
    binds = binds.filter((b) => !dirChords.has(b.chord.toLowerCase()));
    for (const d of defaultVimMinusSuper()) {
      if (dirChords.has(d.chord.toLowerCase())) binds.push({ ...d });
    }
  }
  // unset size left `u` when yuio took focus-down
  for (const b of binds) {
    if (b.action === "unsetSizeInAxis" && b.chord.toLowerCase() === "u") {
      b.chord = ";";
    }
    if (b.action === "unsetSizeCrossAxis" && b.chord.toLowerCase() === "shift+u") {
      b.chord = ":";
    }
  }
  for (const b of binds) {
    if (b.chord.toLowerCase() === "q" && b.action === "deleteNode") {
      b.action = "opset:remove";
      b.label = "OpSet remove (with settle)";
    }
  }
  if (!binds.some((b) => b.chord.toLowerCase() === "q")) {
    binds.push({ chord: "q", action: "opset:remove", label: "OpSet remove (with settle)" });
  }
  if (!binds.some((b) => b.action === "launch" || b.chord.toLowerCase() === "a")) {
    binds.push({ chord: "a", action: "launch", label: "Launch (selected)" });
  }
  if (!binds.some((b) => b.action === "deleteNode")) {
    binds.push({ chord: "Delete", action: "deleteNode", label: "TreeOp destroy node" });
  }
  const altN = binds.find((b) => b.chord.toLowerCase() === "alt+n");
  if (altN && altN.action === "size:share") {
    const floatChords = new Set([
      "alt+y",
      "alt+u",
      "alt+i",
      "alt+o",
      "alt+n",
      "alt+m",
      "alt+,",
      "alt+.",
      "alt+/",
    ]);
    binds = binds.filter((b) => !floatChords.has(b.chord.toLowerCase()));
    for (const d of defaultVimMinusSuper()) {
      if (floatChords.has(d.chord.toLowerCase())) binds.push({ ...d });
    }
  }
  const extras = defaultVimMinusSuper().filter(
    (d) =>
      !binds.some((b) => b.action === d.action || b.chord.toLowerCase() === d.chord.toLowerCase())
  );
  return binds.concat(extras);
}

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
const deskEl = () => /** @type {HTMLElement} */ ($("#desk-view"));
const treeEl = () => /** @type {HTMLElement} */ ($("#tree-view"));

function persist() {
  const s = sessionOf(forest);
  const w = worldOf(forest);
  saveState({
    forest: dumpForest(forest),
    session: { mergeTags: [...s.mergeTags], decisions: { ...s.decisions } },
    world: {
      geoms: Object.fromEntries(Object.entries(w.geoms).map(([id, g]) => [id, { ...g }])),
    },
    macros,
    keybinds,
    viewMode,
  });
}

function log(msg) {
  motionLog.info(msg);
}

/**
 * @param {HTMLElement|null} el
 * @param {HTMLElement|null} btn
 * @param {boolean} [force]
 */
function deskFit() {
  return viewMode === "split" ? "split" : "contain";
}

function paintViews() {
  if (viewMode !== "tree") renderDesk(deskEl(), forest, api, selectNode, { fit: deskFit() });
  // Flush desk height so the tree pane gets a real clientHeight before cytoscape.
  void deskEl().offsetHeight;
  if (viewMode !== "desk") renderTreeGraph(treeEl(), forest, api, selectNode);
}

/** Relayout after atomics width change (now + after transition). */
function paintViewsAfterLayout() {
  requestAnimationFrame(() => {
    paintViews();
    requestAnimationFrame(() => paintViews());
  });
}

/**
 * @param {HTMLElement|null} el
 * @param {HTMLElement|null} btn
 * @param {{ force?: boolean, relayout?: boolean }} [opts]
 */
function toggleDrawer(el, btn, opts = {}) {
  if (!el) return;
  const open = opts.force != null ? opts.force : el.hasAttribute("hidden");
  if (open) el.removeAttribute("hidden");
  else el.setAttribute("hidden", "");
  btn?.classList.toggle("active", open);
  if (!opts.relayout) return;

  paintViewsAfterLayout();
  const onEnd = (e) => {
    if (e.target !== el || e.propertyName !== "width") return;
    el.removeEventListener("transitionend", onEnd);
    paintViews();
  };
  el.addEventListener("transitionend", onEnd);
}

function refresh() {
  applyViewMode();
  paintViews();
  syncDecisionToggles();
  syncMonitorPanel();
  persist();
}

/** @param {import('./tree.mjs').Forest} f */
function summarize(f) {
  function node(n) {
    if (n.kind === "WINDOW") return n.label;
    if (n.kind === "MONITOR") {
      return { mon: n.id, layout: n.layout, children: api.children(f, n).map(node) };
    }
    return {
      [n.layout || "CON"]: api.children(f, n).map(node),
      ...(n.childIds.length === 0 ? { empty: true } : {}),
      id: n.id,
    };
  }
  return {
    focus: f.focusId,
    selection: f.selectionId,
    tags: mergeTagsOf(f),
    decisions: sessionOf(f).decisions,
    monitors: f.monitors.map(node),
  };
}

/** @param {string} id */
function selectNode(id) {
  const n = forest.nodes[id];
  if (!n || n.id === "__root__") return;
  if (n.kind === "WINDOW") api.setFocus(forest, id);
  else {
    forest.selectionId = id;
    // If CON bag, also set focus to open leaf when present
    if (n.kind === "CON" && n.childIds.length) {
      const open =
        n.lastTabFocusId && forest.nodes[n.lastTabFocusId]
          ? forest.nodes[n.lastTabFocusId]
          : forest.nodes[n.childIds[0]];
      if (open?.kind === "WINDOW") forest.focusId = open.id;
    }
  }
  log(`select ${n.kind} ${n.label || n.layout || n.id}`);
  refresh();
}

/**
 * Dock launch: `dockMonIndex` is that monitor (selected slot only if on it).
 * Guake / `a`: omit index — use the selected node's monitor.
 * @param {number|null} dockMonIndex
 */
function launchApp(dockMonIndex) {
  let monIndex = dockMonIndex;
  if (monIndex == null || Number.isNaN(monIndex)) {
    const cur = api.selectionNode(forest) || api.focusNode(forest);
    const mon = cur ? api.ancestorMonitor(forest, cur) : forest.monitors[0];
    monIndex = Math.max(
      0,
      forest.monitors.findIndex((m) => m.id === mon?.id)
    );
  }
  const label = nextAppLabel(forest);
  if (sessionOf(forest).decisions.policyEnabled !== false && activeOpSet().ops.launch) {
    return opsetTxn((draft) => activeOpSet().ops.launch(draft, api, { label, monIndex }));
  }
  return api.launch(forest, label, monIndex);
}

/** @param {string} action */
function runAction(action) {
  /** @type {import('./tree.mjs').Dir} */
  let dir;
  let r;
  if (action.startsWith("size.float") || action.startsWith("size:float")) {
    action = action.replace(/^size\.float/, "size.share").replace(/^size:float/, "size:share");
  }
  if (action.startsWith("focus.") || action.startsWith("focus:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice(6));
    r = api.focusDir(forest, dir);
  } else if (action.startsWith("move.")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice(5));
    r = opsetTxn((draft) => activeOpSet().ops.move(draft, api, dir));
  } else if (action.startsWith("move:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice(5));
    if (sessionOf(forest).decisions.policyEnabled !== false) {
      const set = activeOpSet();
      r = opsetTxn((draft) => set.ops.move(draft, api, dir));
    } else {
      r = api.moveDir(forest, dir);
    }
  } else if (action.startsWith("swap:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice(5));
    r = api.swapDir(forest, dir);
  } else if (action.startsWith("breakout:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice("breakout:".length));
    r = api.breakoutDir(forest, dir);
  } else if (action.startsWith("join.") || action.startsWith("opset:join:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (
      action.startsWith("join.") ? action.slice(5) : action.slice("opset:join:".length)
    );
    r = opsetTxn((draft) => activeOpSet().ops.join(draft, api, dir));
  } else if (action.startsWith("opset:move:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice("opset:move:".length));
    r = opsetTxn((draft) => activeOpSet().ops.move(draft, api, dir));
  } else if (action.startsWith("setLayout:")) {
    r = api.setLayout(forest, /** @type {any} */ (action.slice(10)));
  } else if (action.startsWith("wrap:")) {
    r = api.wrap(forest, /** @type {any} */ (action.slice(5)), mergeTagsOf(forest).length > 0);
  } else if (action === "launch" || action.startsWith("launch:")) {
    r = launchApp(action === "launch" ? null : Number(action.slice(7)));
  } else if (action === "focus.parent" || action === "focusParent") r = api.focusParent(forest);
  else if (action === "focus.child" || action === "focusChild") r = api.focusChild(forest);
  else if (action === "moveIn") r = api.moveIn(forest);
  else if (action === "moveOut") r = api.moveOut(forest);
  else if (action === "group") r = api.group(forest);
  else if (action === "ungroup") r = api.ungroup(forest);
  else if (action === "flatten") r = api.flatten(forest, false);
  else if (action === "flattenAll") r = api.flatten(forest, true);
  else if (action === "close") r = api.close(forest);
  else if (action === "deleteNode") r = api.deleteNode(forest);
  else if (action === "remove" || action === "opset:remove")
    r = opsetTxn((draft) => activeOpSet().ops.remove(draft, api));
  else if (action === "equalizeChildren") r = api.equalizeChildren(forest);
  else if (action === "unsetSizeInAxis") r = api.unsetSizeInAxis(forest);
  else if (action === "unsetSizeCrossAxis") r = api.unsetSizeCrossAxis(forest);
  else if (action === "size.nudge.x-" || action === "size:x:-")
    r = api.nudgeSize(forest, "x", -api.sizeStep());
  else if (action === "size.nudge.x+" || action === "size:x:+")
    r = api.nudgeSize(forest, "x", api.sizeStep());
  else if (action === "size.nudge.y-" || action === "size:y:-")
    r = api.nudgeSize(forest, "y", -api.sizeStep());
  else if (action === "size.nudge.y+" || action === "size:y:+")
    r = api.nudgeSize(forest, "y", api.sizeStep());
  else if (action === "size.share" || action === "size:share")
    r = api.shareCombo(forest, { self: true });
  else if (action === "size.shareSiblings" || action === "size:shareSiblings")
    r = api.shareCombo(forest, { self: true, siblings: true });
  else if (action === "size.shareSiblingsOnly" || action === "size:shareSiblingsOnly")
    r = api.shareCombo(forest, { siblings: true });
  else if (action === "size.shareSelfSiblingsParent" || action === "size:shareSelfSiblingsParent")
    r = api.shareCombo(forest, { self: true, siblings: true, parent: true });
  else if (action === "size.shareParent" || action === "size:shareParent")
    r = api.shareCombo(forest, { parent: true });
  else if (action === "size.shareParentGroup" || action === "size:shareParentGroup")
    r = api.shareCombo(forest, { parent: true, parentSiblings: true });
  else if (action === "size.shareParentSiblingsOnly" || action === "size:shareParentSiblingsOnly")
    r = api.shareCombo(forest, { parentSiblings: true });
  else if (action === "size.shareBothGroups" || action === "size:shareBothGroups")
    r = api.shareCombo(forest, {
      self: true,
      siblings: true,
      parent: true,
      parentSiblings: true,
    });
  else if (action === "size.shareAll" || action === "size:shareAll") r = api.shareAllSizes(forest);
  else if (action.startsWith("size.preset.") || action.startsWith("size:preset:")) {
    const key = Number(
      action.startsWith("size.preset.")
        ? action.slice("size.preset.".length)
        : action.slice("size:preset:".length)
    );
    r = api.sizePreset(forest, key);
  } else if (
    action === "layout.cycle+" ||
    action === "cycleLayout:+1" ||
    action === "cycleLayout:1"
  )
    r = api.cycleLayout(forest, 1);
  else if (action === "layout.cycle-" || action === "cycleLayout:-1")
    r = api.cycleLayout(forest, -1);
  else if (action === "toggleSplit" || action === "opset:toggleSplit")
    r = opsetTxn((draft) => activeOpSet().ops.toggleSplit(draft, api));
  else if (action === "toggleTabStack" || action === "opset:toggleTabStack")
    r = opsetTxn((draft) => activeOpSet().ops.toggleTabStack(draft, api));
  else if (action === "promote" || action === "opset:promote")
    r = opsetTxn((draft) => activeOpSet().ops.promote(draft, api));
  else if (action === "promoteRecursive" || action === "opset:promoteRecursive")
    r = opsetTxn((draft) => activeOpSet().ops.promoteRecursive(draft, api));
  else if (action === "createGroup") r = api.createGroup(forest, "TABBED");
  else if (action === "createStack") r = api.createGroup(forest, "STACKED");
  else if (action === "toggleTag") {
    const id = forest.selectionId || forest.focusId;
    if (id) {
      api.toggleMergeTag(forest, id);
      r = { ok: true, op: "toggleTag", id };
    } else r = { ok: false, reason: "no selection" };
  } else if (action === "clearTags") {
    api.clearMergeTags(forest);
    r = { ok: true, op: "clearTags" };
  } else if (action.startsWith("macro:")) {
    const name = action.slice(6);
    const m = macros.find((x) => x.name === name);
    if (!m) r = { ok: false, reason: "no macro" };
    else {
      for (const step of m.steps) runAction(step);
      return;
    }
  } else {
    r = { ok: false, reason: `unknown ${action}` };
  }

  if (r?.ok) log(`${r.op || action} ✓ ${JSON.stringify(r)}`);
  else log(`${action} ✗ ${r?.reason || "?"}`);
  refresh();
}

function applyViewMode() {
  const split = /** @type {HTMLElement} */ ($("#views"));
  split.dataset.mode = viewMode;
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-view") === viewMode);
  });
}

function syncDecisionToggles() {
  ensureMark2Decisions(forest);
  const peel = /** @type {HTMLSelectElement} */ ($("#dec-peel"));
  const edge = /** @type {HTMLSelectElement} */ ($("#dec-edge"));
  const tie = /** @type {HTMLSelectElement} */ ($("#dec-tie"));
  const join = /** @type {HTMLSelectElement} */ ($("#dec-join"));
  const policy = /** @type {HTMLInputElement} */ ($("#dec-policy"));
  const d = sessionOf(forest).decisions;
  if (peel) peel.value = d.peelModel;
  if (edge) edge.value = d.edgeMove;
  if (tie) tie.value = d.aspectTieBreak || "HSPLIT";
  if (join) join.value = d.defaultJoinContainer || "SPLIT";
  if (policy) policy.checked = d.policyEnabled !== false;
}

function syncMonitorPanel() {
  const list = $("#mon-list");
  if (!list) return;
  list.replaceChildren();
  const axisEl = $("#mon-sibling-axis");
  if (axisEl) axisEl.textContent = monitorsSiblingAxis(forest);
  forest.monitors.forEach((m, i) => {
    const g = geomOf(forest, m) || {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      primary: false,
    };
    const row = document.createElement("div");
    row.className = "mon-row";
    row.innerHTML = `
      <strong>${m.id}</strong>
      <label>W <input type="number" data-mon="${i}" data-f="width" value="${g.width}"></label>
      <label>H <input type="number" data-mon="${i}" data-f="height" value="${g.height}"></label>
      <label>X <input type="number" data-mon="${i}" data-f="x" value="${g.x}"></label>
      <label>Y <input type="number" data-mon="${i}" data-f="y" value="${g.y}"></label>
      <label><input type="checkbox" data-mon="${i}" data-f="primary" ${
      g.primary ? "checked" : ""
    }> primary</label>
      <button type="button" data-orient="${i}">⇄ orient</button>
    `;
    list.appendChild(row);
  });
  const count = /** @type {HTMLInputElement|null} */ ($("#mon-count"));
  if (count) count.value = String(forest.monitors.length);

  const docks = $("#launch-docks");
  if (docks) {
    docks.replaceChildren();
    forest.monitors.forEach((m, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `Dock launch ${m.id}`;
      btn.addEventListener("click", () => runAction(`launch:${i}`));
      docks.appendChild(btn);
    });
  }
}

function rebuildMonitors(count) {
  const geoms = [];
  for (let i = 0; i < count; i++) {
    const existing = forest.monitors[i] ? geomOf(forest, forest.monitors[i]) : null;
    if (existing) geoms.push({ ...existing, id: `mon${i}` });
    else {
      geoms.push({
        id: `mon${i}`,
        x: i * 2560,
        y: 0,
        width: 2560,
        height: 1440,
        primary: i === 0,
      });
    }
  }
  // Keep windows: naive — new forest, lose structure if count shrinks mid-play; OK for proto
  const old = dumpForest(forest);
  const next = api.createForest(geoms);
  copySession(forest, next);
  // Try to preserve children of overlapping monitors by index
  for (let i = 0; i < Math.min(forest.monitors.length, next.monitors.length); i++) {
    const src = forest.monitors[i];
    const dst = next.monitors[i];
    for (const cid of src.childIds) {
      const subtree = cloneSubtree(forest, cid, next);
      if (subtree) {
        subtree.parentId = dst.id;
        dst.childIds.push(subtree.id);
      }
    }
  }
  next.focusId = next.nodes[old.focusId] ? old.focusId : null;
  next.selectionId = next.nodes[old.selectionId] ? old.selectionId : next.focusId;
  forest = next;
  api.hydrateSeq(forest);
  log(`monitors → ${count}`);
  refresh();
}

/** @param {import('./tree.mjs').Forest} src @param {string} id @param {import('./tree.mjs').Forest} dst */
function cloneSubtree(src, id, dst) {
  const n = src.nodes[id];
  if (!n) return null;
  const copy = { ...n, childIds: [] };
  delete copy.geom;
  dst.nodes[copy.id] = copy;
  for (const cid of n.childIds) {
    const ch = cloneSubtree(src, cid, dst);
    if (ch) {
      ch.parentId = copy.id;
      copy.childIds.push(ch.id);
    }
  }
  return copy;
}

function renderKeybindTable() {
  const tbody = $("#keybind-body");
  if (!tbody) return;
  tbody.replaceChildren();
  // dedupe by action for display of unique primary
  const seen = new Set();
  for (const b of keybinds) {
    if (seen.has(b.action) && b.chord.startsWith("Arrow")) continue;
    seen.add(b.chord + b.action);
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><kbd>${b.chord}</kbd></td><td>${b.label}</td><td><code>${b.action}</code></td>`;
    tbody.appendChild(tr);
  }
}

function renderMacros() {
  const box = $("#macro-list");
  if (!box) return;
  box.replaceChildren();
  for (const m of macros) {
    const row = document.createElement("div");
    row.className = "macro-row";
    row.innerHTML = `<button type="button" data-run-macro="${m.name}">▶ ${m.name}</button>
      <code>${m.steps.join(" → ")}</code>
      <button type="button" data-del-macro="${m.name}" class="danger">✕</button>`;
    box.appendChild(row);
  }
}

function wire() {
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = btn.getAttribute("data-action");
      if (a) runAction(a);
    });
  });

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      viewMode = /** @type {any} */ (btn.getAttribute("data-view"));
      refresh();
    });
  });

  $("#btn-toggle-settings")?.addEventListener("click", () => {
    toggleDrawer($("#drawer-settings"), $("#btn-toggle-settings"));
  });
  $("#btn-toggle-atomics")?.addEventListener("click", () => {
    toggleDrawer($("#drawer-atomics"), $("#btn-toggle-atomics"), { relayout: true });
  });
  $("#btn-toggle-keys")?.addEventListener("click", () => {
    toggleDrawer($("#drawer-keys"), $("#btn-toggle-keys"));
  });
  $("#btn-dump-tree")?.addEventListener("click", () => {
    motionLog.info("tree dump", { summary: summarize(forest) });
    console.log("[motion] forest raw", dumpForest(forest));
    console.log("[motion] plog ring", motionLog.getLines().slice(-40));
  });

  $("#dec-peel")?.addEventListener("change", (e) => {
    const d = sessionOf(forest).decisions;
    d.peelModel = /** @type {any} */ (/** @type {HTMLSelectElement} */ (e.target).value);
    log(`peelModel=${d.peelModel}`);
    persist();
  });
  $("#dec-edge")?.addEventListener("change", (e) => {
    const d = sessionOf(forest).decisions;
    d.edgeMove = /** @type {any} */ (/** @type {HTMLSelectElement} */ (e.target).value);
    d._edgeNoopMigrated = true;
    log(`edgeMove=${d.edgeMove}`);
    persist();
  });
  $("#dec-policy")?.addEventListener("change", (e) => {
    const d = sessionOf(forest).decisions;
    d.policyEnabled = /** @type {HTMLInputElement} */ (e.target).checked;
    log(`policyEnabled=${d.policyEnabled}`);
    persist();
  });
  $("#dec-tie")?.addEventListener("change", (e) => {
    const d = sessionOf(forest).decisions;
    d.aspectTieBreak = /** @type {any} */ (/** @type {HTMLSelectElement} */ (e.target).value);
    log(`aspectTieBreak=${d.aspectTieBreak}`);
    persist();
  });
  $("#dec-join")?.addEventListener("change", (e) => {
    const d = sessionOf(forest).decisions;
    d.defaultJoinContainer = /** @type {any} */ (/** @type {HTMLSelectElement} */ (e.target).value);
    log(`defaultJoinContainer=${d.defaultJoinContainer}`);
    persist();
  });

  $("#btn-reset")?.addEventListener("click", () => {
    clearState();
    forest = seedBlackDesk(api);
    api.hydrateSeq(forest);
    macros = [];
    keybinds = defaultVimMinusSuper();
    log("reset → black seed");
    renderKeybindTable();
    renderMacros();
    refresh();
  });

  $("#btn-seed")?.addEventListener("click", () => {
    forest = seedBlackDesk(api);
    api.hydrateSeq(forest);
    log("reseed black desk");
    refresh();
  });

  $("#mon-count")?.addEventListener("change", (e) => {
    const n = Math.max(
      1,
      Math.min(4, Number(/** @type {HTMLInputElement} */ (e.target).value) || 1)
    );
    rebuildMonitors(n);
  });

  $("#mon-preset")?.addEventListener("change", (e) => {
    const key = /** @type {HTMLSelectElement} */ (e.target).value;
    const preset = MONITOR_PRESETS[key];
    if (!preset) return;
    forest = api.createForest(preset.monitors.map((m) => ({ ...m })));
    attachSession(forest, {
      decisions: {
        peelModel: "B",
        edgeMove: "wrap",
        aspectTieBreak: "HSPLIT",
        defaultJoinContainer: "SPLIT",
        policyEnabled: true,
      },
    });
    if (key === "black") forest = seedBlackDesk(api);
    api.hydrateSeq(forest);
    log(`preset ${key}`);
    refresh();
  });

  $("#mon-list")?.addEventListener("change", (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const i = Number(t.dataset.mon);
    const f = t.dataset.f;
    if (f == null || Number.isNaN(i)) return;
    const mon = forest.monitors[i];
    const g = mon ? geomOf(forest, mon) : null;
    if (!g) return;
    if (f === "primary") {
      g.primary = t.checked;
      for (const m of forest.monitors) {
        if (m !== mon) {
          const og = geomOf(forest, m);
          if (og) og.primary = false;
        }
      }
    } else {
      g[f] = Number(t.value);
    }
    refresh();
  });

  $("#mon-list")?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const i = t.getAttribute("data-orient");
    if (i == null) return;
    const mon = forest.monitors[Number(i)];
    const g = mon ? geomOf(forest, mon) : null;
    if (!g) return;
    const w = g.width;
    g.width = g.height;
    g.height = w;
    log(`orient ${mon.id} → ${g.width}×${g.height}`);
    refresh();
  });

  $("#btn-add-macro")?.addEventListener("click", () => {
    const name = /** @type {HTMLInputElement} */ ($("#macro-name")).value.trim();
    const steps = /** @type {HTMLInputElement} */ ($("#macro-steps")).value
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name || !steps.length) return;
    macros = macros.filter((m) => m.name !== name);
    macros.push({ name, steps });
    log(`macro saved ${name}`);
    renderMacros();
    persist();
  });

  $("#macro-list")?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const run = t.getAttribute("data-run-macro");
    const del = t.getAttribute("data-del-macro");
    if (run) runAction(`macro:${run}`);
    if (del) {
      macros = macros.filter((m) => m.name !== del);
      renderMacros();
      persist();
    }
  });

  $("#btn-reset-keys")?.addEventListener("click", () => {
    keybinds = defaultVimMinusSuper();
    renderKeybindTable();
    persist();
    log("keybinds reset Vim−Super");
  });

  window.addEventListener("keydown", (e) => {
    if (isTypingTarget(e)) return;
    const chord = eventToChord(e);
    const bind = matchBind(keybinds, chord);
    if (!bind) return;
    e.preventDefault();
    runAction(bind.action);
  });

  window.addEventListener("resize", () => {
    paintViews();
  });
}

function fillPresetSelect() {
  const sel = /** @type {HTMLSelectElement} */ ($("#mon-preset"));
  if (!sel) return;
  for (const [k, v] of Object.entries(MONITOR_PRESETS)) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = v.label;
    if (k === "black") o.selected = true;
    sel.appendChild(o);
  }
}

fillPresetSelect();
wire();
renderKeybindTable();
renderMacros();
refresh();
log("TOM proto ready — Mark 2 OpSet · Vim keys without Super (h/j/k/l …)");

// Avoid unused import warning in some setups
void BLACK_MONITORS;
void destroyTreeGraph;
