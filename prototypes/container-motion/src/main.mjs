import { createTreeApi, nextAppLabel, dumpForest } from "./tree.mjs";
import { seedBlackDesk, MONITOR_PRESETS, BLACK_MONITORS } from "./presets.mjs";
import { renderDesk } from "./render-desk.mjs";
import { renderTreeGraph, destroyTreeGraph } from "./render-tree.mjs";
import { defaultVimMinusSuper, eventToChord, matchBind, isTypingTarget } from "./keybinds.mjs";
import { loadState, saveState, clearState } from "./storage.mjs";

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
let launchMon = 0;

const saved = loadState();
if (saved?.forest?.nodes && saved.forest.monitors?.length) {
  try {
    forest = saved.forest;
    api.hydrateSeq(forest);
    if (!forest.decisions) forest.decisions = { peelModel: "B", edgeMove: "noop" };
    if (!forest.mergeTags) forest.mergeTags = [];
  } catch {
    forest = seedBlackDesk(api);
    api.hydrateSeq(forest);
  }
}
if (Array.isArray(saved?.macros)) macros = saved.macros;
if (Array.isArray(saved?.keybinds)) keybinds = saved.keybinds;
if (saved?.viewMode === "desk" || saved?.viewMode === "tree" || saved?.viewMode === "split") {
  viewMode = saved.viewMode;
}

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
const deskEl = () => /** @type {HTMLElement} */ ($("#desk-view"));
const treeEl = () => /** @type {HTMLElement} */ ($("#tree-view"));

function persist() {
  saveState({ forest, macros, keybinds, viewMode });
}

function log(msg) {
  console.log(`[motion] ${msg}`);
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
    tags: f.mergeTags,
    decisions: f.decisions,
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

/** @param {string} action */
function runAction(action) {
  /** @type {import('./tree.mjs').Dir} */
  let dir;
  let r;
  if (action.startsWith("focus:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice(6));
    r = api.focusDir(forest, dir);
  } else if (action.startsWith("move:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice(5));
    r = api.moveDir(forest, dir);
  } else if (action.startsWith("swap:")) {
    dir = /** @type {import('./tree.mjs').Dir} */ (action.slice(5));
    r = api.swapDir(forest, dir);
  } else if (action.startsWith("setLayout:")) {
    r = api.setLayout(forest, /** @type {any} */ (action.slice(10)));
  } else if (action.startsWith("wrap:")) {
    r = api.wrap(forest, /** @type {any} */ (action.slice(5)), forest.mergeTags.length > 0);
  } else if (action.startsWith("launch:")) {
    const mon = Number(action.slice(7));
    const label = nextAppLabel(forest);
    r = api.launch(forest, label, mon);
  } else if (action === "focusParent") r = api.focusParent(forest);
  else if (action === "focusChild") r = api.focusChild(forest);
  else if (action === "moveIn") r = api.moveIn(forest);
  else if (action === "moveOut") r = api.moveOut(forest);
  else if (action === "group") r = api.group(forest);
  else if (action === "ungroup") r = api.ungroup(forest);
  else if (action === "flatten") r = api.flatten(forest, false);
  else if (action === "flattenAll") r = api.flatten(forest, true);
  else if (action === "close") r = api.close(forest);
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
  } else if (action === "cycleGroupChrome") {
    const cur = api.selectionNode(forest);
    const con = cur?.kind === "CON" ? cur : cur ? api.parent(forest, cur) : null;
    if (con && (con.layout === "TABBED" || con.layout === "STACKED")) {
      r = api.setLayout(forest, con.layout === "TABBED" ? "STACKED" : "TABBED");
    } else r = { ok: false, reason: "not a bag" };
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
  const peel = /** @type {HTMLSelectElement} */ ($("#dec-peel"));
  const edge = /** @type {HTMLSelectElement} */ ($("#dec-edge"));
  if (peel) peel.value = forest.decisions.peelModel;
  if (edge) edge.value = forest.decisions.edgeMove;
}

function syncMonitorPanel() {
  const list = $("#mon-list");
  if (!list) return;
  list.replaceChildren();
  forest.monitors.forEach((m, i) => {
    const g = m.geom || { x: 0, y: 0, width: 1920, height: 1080, primary: false };
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

  const launchSel = /** @type {HTMLSelectElement|null} */ ($("#launch-mon"));
  if (launchSel) {
    launchSel.replaceChildren();
    forest.monitors.forEach((m, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = m.id;
      if (i === launchMon) o.selected = true;
      launchSel.appendChild(o);
    });
  }
}

function rebuildMonitors(count) {
  const geoms = [];
  for (let i = 0; i < count; i++) {
    const existing = forest.monitors[i]?.geom;
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
  next.decisions = forest.decisions;
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
  const copy = { ...n, childIds: [], geom: n.geom ? { ...n.geom } : undefined };
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
    console.log("[motion] tree dump", summarize(forest));
    console.log("[motion] forest raw", dumpForest(forest));
  });

  $("#dec-peel")?.addEventListener("change", (e) => {
    forest.decisions.peelModel = /** @type {any} */ (
      /** @type {HTMLSelectElement} */ (e.target).value
    );
    log(`peelModel=${forest.decisions.peelModel}`);
    persist();
  });
  $("#dec-edge")?.addEventListener("change", (e) => {
    forest.decisions.edgeMove = /** @type {any} */ (
      /** @type {HTMLSelectElement} */ (e.target).value
    );
    log(`edgeMove=${forest.decisions.edgeMove}`);
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
    forest.decisions = { peelModel: "B", edgeMove: "noop" };
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
    if (!mon?.geom) return;
    if (f === "primary") {
      mon.geom.primary = t.checked;
      for (const m of forest.monitors) if (m !== mon && m.geom) m.geom.primary = false;
    } else {
      mon.geom[f] = Number(t.value);
    }
    refresh();
  });

  $("#mon-list")?.addEventListener("click", (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const i = t.getAttribute("data-orient");
    if (i == null) return;
    const mon = forest.monitors[Number(i)];
    if (!mon?.geom) return;
    const g = mon.geom;
    const w = g.width;
    g.width = g.height;
    g.height = w;
    log(`orient ${mon.id} → ${g.width}×${g.height}`);
    refresh();
  });

  $("#launch-mon")?.addEventListener("change", (e) => {
    launchMon = Number(/** @type {HTMLSelectElement} */ (e.target).value);
  });

  $("#btn-launch")?.addEventListener("click", () => {
    runAction(`launch:${launchMon}`);
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
log("container-motion proto ready — Vim keys without Super (h/j/k/l …)");

// Avoid unused import warning in some setups
void BLACK_MONITORS;
void destroyTreeGraph;
