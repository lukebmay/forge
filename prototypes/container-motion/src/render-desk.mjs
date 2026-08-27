/**
 * @typedef {'contain'|'split'} DeskFit
 *
 * @param {HTMLElement} root
 * @param {import('./tree.mjs').Forest} forest
 * @param {import('./tree.mjs').TreeApi} api
 * @param {(id: string) => void} onSelect
 * @param {{ fit?: DeskFit }} [opts]
 *   `split` — scale to pane width (and cap height so tree stays visible); pane shrink-wraps.
 *   `contain` — fit width+height inside the pane (desk-only).
 */

export function renderDesk(root, forest, api, onSelect, opts = {}) {
  root.replaceChildren();
  root.className = "desk";

  const geoms = forest.monitors.map((m) => m.geom).filter(Boolean);
  if (!geoms.length) return;

  const minX = Math.min(...geoms.map((g) => g.x));
  const minY = Math.min(...geoms.map((g) => g.y));
  const maxX = Math.max(...geoms.map((g) => g.x + g.width));
  const maxY = Math.max(...geoms.map((g) => g.y + g.height));
  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);

  const stage = document.createElement("div");
  stage.className = "desk-stage";
  root.appendChild(stage);

  const fit = opts.fit ?? "contain";
  const pad = 0.98;
  const pane = root.parentElement;
  const views = root.closest("#views");
  const availW = Math.max(
    1,
    (pane?.clientWidth ?? views?.clientWidth ?? root.clientWidth ?? 800) - 4
  );

  let scale;
  if (fit === "split") {
    // Fit full desk in width; cap height so tree keeps a real share of the stage.
    const viewsH = Math.max(1, views?.clientHeight ?? 600);
    // Keep at least half the stage for the tree graph.
    const minTreeH = Math.max(200, Math.floor(viewsH * 0.5));
    const maxDeskH = Math.max(48, viewsH - minTreeH);
    scale = Math.min(availW / worldW, maxDeskH / worldH) * pad;
  } else {
    root.style.height = "";
    root.style.maxHeight = "";
    const availH = Math.max(1, root.clientHeight || pane?.clientHeight || 480);
    scale = Math.min(availW / worldW, availH / worldH) * pad;
  }

  const stageW = worldW * scale;
  const stageH = worldH * scale;
  stage.style.width = `${stageW}px`;
  stage.style.height = `${stageH}px`;
  stage.style.position = "relative";

  // Lock desk chrome to the stage — no leftover empty vertical band.
  if (fit === "split") {
    root.style.height = `${Math.ceil(stageH)}px`;
    root.style.maxHeight = `${Math.ceil(stageH)}px`;
  }

  for (const mon of forest.monitors) {
    const g = mon.geom;
    if (!g) continue;
    const el = document.createElement("div");
    el.className = "monitor";
    el.dataset.id = mon.id;
    el.style.left = `${(g.x - minX) * scale}px`;
    el.style.top = `${(g.y - minY) * scale}px`;
    el.style.width = `${g.width * scale}px`;
    el.style.height = `${g.height * scale}px`;

    const label = document.createElement("div");
    label.className = "monitor-label";
    label.textContent = `${mon.id}${g.primary ? " · primary" : ""} · ${g.width}×${g.height}`;
    el.appendChild(label);

    const body = document.createElement("div");
    body.className = "monitor-body";
    const kids = api.children(forest, mon);
    if (!kids.length) {
      body.classList.add("empty");
      body.textContent = "empty";
    } else {
      for (const ch of kids) body.appendChild(renderNode(ch, forest, api, onSelect, true));
      body.style.flexDirection = mon.layout === "VSPLIT" ? "column" : "row";
    }
    el.appendChild(body);
    stage.appendChild(el);
  }
}

/**
 * @param {import('./tree.mjs').Node} node
 * @param {import('./tree.mjs').Forest} forest
 * @param {import('./tree.mjs').TreeApi} api
 * @param {(id: string) => void} onSelect
 * @param {boolean} isMonChild
 * @param {{ fill?: boolean }} [opts] — fill: sole tab/stack pane child; ignore sibling percent
 */
function renderNode(node, forest, api, onSelect, isMonChild, opts = {}) {
  const el = document.createElement("div");
  el.dataset.id = node.id;
  // Tab/stack peers share one full content slot. Stale 0.5 percents from a
  // former H/V split must not shrink the open pane (forge half-width tab bug).
  const pct = opts.fill ? 1 : node.percent ?? 1;
  el.style.flex = `${pct} 1 0`;
  el.style.minWidth = "0";
  el.style.minHeight = "0";

  const isFocus = forest.focusId === node.id;
  const isSel = forest.selectionId === node.id;
  const isTag = forest.mergeTags.includes(node.id);

  if (node.kind === "WINDOW") {
    el.className = "leaf";
    if (isFocus) el.classList.add("is-focus");
    if (isSel) el.classList.add("is-selection");
    if (isTag) el.classList.add("is-tag");
    el.innerHTML = `<span class="leaf-label">${escapeHtml(
      node.label || "?"
    )}</span><span class="leaf-class">${escapeHtml(node.wmClass || "")}</span>`;
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      onSelect(node.id);
    });
    return el;
  }

  const layout = node.layout || "HSPLIT";
  el.className = `con con-${layout.toLowerCase()}`;
  if (isSel) el.classList.add("is-selection");
  if (isTag) el.classList.add("is-tag");

  const chrome = document.createElement("div");
  chrome.className = "con-chrome";
  chrome.textContent = layout.replace("SPLIT", "");
  chrome.addEventListener("click", (e) => {
    e.stopPropagation();
    onSelect(node.id);
  });
  el.appendChild(chrome);

  const kids = api.children(forest, node);

  if (layout === "TABBED" || layout === "STACKED") {
    const strip = document.createElement("div");
    strip.className = layout === "TABBED" ? "tab-strip" : "stack-strip";
    const openId =
      node.lastTabFocusId && kids.some((k) => k.id === node.lastTabFocusId)
        ? node.lastTabFocusId
        : kids[0]?.id;

    if (!kids.length) {
      const spacer = document.createElement("div");
      spacer.className = "spacer-leaf";
      spacer.textContent = "empty group";
      spacer.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(node.id);
      });
      el.appendChild(spacer);
      return el;
    }

    for (const k of kids) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
      if (k.id === openId) tab.classList.add("active");
      if (forest.focusId === k.id) tab.classList.add("is-focus");
      if (forest.mergeTags.includes(k.id)) tab.classList.add("is-tag");
      tab.textContent = k.kind === "WINDOW" ? k.label || "?" : (k.layout || "CON").slice(0, 4);
      tab.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(k.id);
      });
      strip.appendChild(tab);
    }
    el.appendChild(strip);

    const pane = document.createElement("div");
    pane.className = "tab-pane";
    const open = kids.find((k) => k.id === openId) || kids[0];
    pane.appendChild(renderNode(open, forest, api, onSelect, false, { fill: true }));
    el.appendChild(pane);
    el.style.display = "flex";
    el.style.flexDirection = layout === "STACKED" ? "row" : "column";
    if (layout === "STACKED") {
      strip.style.flexDirection = "column";
      strip.style.width = "72px";
      strip.style.flexShrink = "0";
    }
    return el;
  }

  const body = document.createElement("div");
  body.className = "con-body";
  body.style.flexDirection = layout === "VSPLIT" ? "column" : "row";
  if (!kids.length) {
    const spacer = document.createElement("div");
    spacer.className = "spacer-leaf";
    spacer.textContent = "empty";
    body.appendChild(spacer);
  } else {
    for (const k of kids) body.appendChild(renderNode(k, forest, api, onSelect, false));
  }
  el.appendChild(body);
  return el;
}

/** @param {string} s */
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
