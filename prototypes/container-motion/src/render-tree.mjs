import cytoscape from "cytoscape";
import { mergeTagsOf } from "./session.mjs";

/** @type {import('cytoscape').Core|null} */
let cy = null;

/** @type {(id: string) => void} */
let onSelectCb = () => {};

/**
 * @param {HTMLElement} container
 * @param {import('./tree.mjs').Forest} forest
 * @param {import('./tree.mjs').TreeApi} api
 * @param {(id: string) => void} onSelect
 */
export function renderTreeGraph(container, forest, api, onSelect) {
  onSelectCb = onSelect;
  const elements = buildElements(forest);

  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w < 8 || h < 8) {
    // Pane not laid out yet (desk height just changed) — retry once after reflow.
    requestAnimationFrame(() => {
      if (container.clientWidth >= 8 && container.clientHeight >= 8) {
        renderTreeGraph(container, forest, api, onSelect);
      }
    });
    return;
  }

  if (!cy || cy.destroyed() || cy.container() !== container) {
    if (cy && !cy.destroyed()) cy.destroy();
    cy = cytoscape({
      container,
      elements,
      style: graphStyles(),
      layout: layoutConfig(forest),
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });
    cy.on("tap", "node", (evt) => {
      const id = evt.target.id();
      const kind = evt.target.data("kind");
      if (!id || kind === "ROOT" || kind === "WORKSPACE") return;
      onSelectCb(id);
    });
  } else {
    cy.json({ elements });
  }

  applyHighlights(forest);

  // Critical after desk pane resizes the leftover tree area.
  cy.resize();
  cy.layout(layoutConfig(forest, cy)).run();
  cy.fit(undefined, 20);
}

export function destroyTreeGraph() {
  if (cy && !cy.destroyed()) cy.destroy();
  cy = null;
}

/** @param {import('./tree.mjs').Forest} forest */
function applyHighlights(forest) {
  if (!cy || cy.destroyed()) return;
  cy.batch(() => {
    cy.nodes().removeClass("focus selection tag empty");
    for (const n of Object.values(forest.nodes)) {
      const node = cy.getElementById(n.id);
      if (!node.nonempty()) continue;
      if (n.kind === "CON" && n.childIds.length === 0) node.addClass("empty");
      if (n.id === forest.focusId) node.addClass("focus");
      if (n.id === forest.selectionId) node.addClass("selection");
      if (mergeTagsOf(forest).includes(n.id)) node.addClass("tag");
    }
  });
}

/**
 * @param {import('./tree.mjs').Forest} forest
 * @param {import('cytoscape').Core} [core]
 */
function layoutConfig(forest, core) {
  /** @type {object} */
  const cfg = {
    name: "breadthfirst",
    directed: true,
    padding: 16,
    spacingFactor: 1.05,
    animate: false,
  };
  if (forest.rootId) {
    if (core) {
      const r = core.getElementById(forest.rootId);
      if (r.nonempty()) cfg.roots = r;
    } else {
      cfg.roots = `#${forest.rootId}`;
    }
  }
  return cfg;
}

function graphStyles() {
  return [
    {
      selector: "node",
      style: {
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": 11,
        "font-family": "ui-monospace, monospace",
        color: "#e8e6e3",
        "background-color": "#3a3a42",
        "border-width": 2,
        "border-color": "#666",
        width: 86,
        height: 36,
        shape: "roundrectangle",
        "text-wrap": "wrap",
        "text-max-width": 80,
      },
    },
    {
      selector: "node[kind = 'ROOT']",
      style: {
        "background-color": "#1a1a1e",
        "border-color": "#888",
        width: 88,
        height: 32,
      },
    },
    {
      selector: "node[kind = 'WORKSPACE']",
      style: {
        "background-color": "#243044",
        "border-color": "#6a8aaa",
        width: 88,
        height: 32,
      },
    },
    {
      selector: "node[kind = 'MONITOR']",
      style: {
        "background-color": "#1e3a5f",
        "border-color": "#4a90d9",
        width: 100,
        height: 40,
      },
    },
    {
      selector: "node[kind = 'CON']",
      style: {
        "background-color": "#2a3340",
        "border-color": "#7a8a9a",
      },
    },
    {
      selector: "node[kind = 'WINDOW']",
      style: {
        "background-color": "#3b01e0",
        "border-color": "#7c5cff",
      },
    },
    {
      selector: "node.empty",
      style: {
        "background-color": "#444",
        "border-style": "dashed",
        "border-color": "#888",
        color: "#aaa",
      },
    },
    {
      selector: "node.focus",
      style: {
        "border-color": "#c4b5fd",
        "border-width": 3,
        "background-color": "#5b21b6",
      },
    },
    {
      selector: "node.selection",
      style: {
        "border-color": "#e879f9",
        "border-width": 3,
      },
    },
    {
      selector: "node.tag",
      style: {
        "border-color": "#22d3ee",
        "border-width": 3,
      },
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "#555",
        "target-arrow-color": "#555",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
      },
    },
  ];
}

/** @param {import('./tree.mjs').Forest} forest */
function buildElements(forest) {
  /** @type {object[]} */
  const elements = [];
  for (const n of Object.values(forest.nodes)) {
    elements.push({
      data: { id: n.id, label: nodeLabel(forest, n), kind: n.kind },
    });
  }
  for (const n of Object.values(forest.nodes)) {
    for (const cid of n.childIds) {
      if (!forest.nodes[cid]) continue;
      elements.push({
        data: { id: `${n.id}->${cid}`, source: n.id, target: cid },
      });
    }
  }
  return elements;
}

/** @param {import('./tree.mjs').Forest} forest @param {import('./tree.mjs').Node} n */
function nodeLabel(forest, n) {
  const pct = shareLabel(forest, n);
  if (n.kind === "ROOT") return "ROOT";
  if (n.kind === "WORKSPACE") return n.label || n.id || "WS";
  if (n.kind === "MONITOR") return `${n.id}\nMONITOR`;
  if (n.kind === "WINDOW") {
    return pct ? `${n.label || "?"}\n${pct}` : `${n.label || "?"}`;
  }
  if (n.kind === "CON") {
    const empty = n.childIds.length === 0 ? " ∅" : "";
    const lay = (n.layout || "CON").replace("SPLIT", "");
    return pct ? `${lay}${empty}\n${pct}` : `${lay}${empty}`;
  }
  return n.id;
}

/** @param {import('./tree.mjs').Forest} forest @param {import('./tree.mjs').Node} n */
function shareLabel(forest, n) {
  const p = n.parentId ? forest.nodes[n.parentId] : null;
  if (!p || (p.layout !== "HSPLIT" && p.layout !== "VSPLIT")) return "";
  const pct = Math.round((n.percent ?? 0) * 1000) / 10;
  const mark = n.userSized ? "*" : "";
  return `${pct}%${mark}`;
}
