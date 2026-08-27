// @ts-check
/** @typedef {import('./harness.mjs').Case} Case */

/** @type {Case[]} */
export const ATOMIC_CASES = [
  {
    id: "atom-spine-root-ws-monitor",
    layer: "atomics",
    given: "Mon1(H(A,B)) Mon2(C)",
    expect: "Mon1(H(A,B)) Mon2(C)",
    run(t) {
      const root = t.f.nodes[t.f.rootId];
      if (!root || root.kind !== "ROOT") return "missing ROOT";
      const ws = t.parent(t.f.monitors[0]);
      if (!ws || ws.kind !== "WORKSPACE") return "monitor parent is not WORKSPACE";
      if (t.parent(ws) !== root) return "WORKSPACE parent is not ROOT";
      if (t.parent(t.f.monitors[1]) !== ws) return "monitors not siblings under WS";
    },
  },
  {
    id: "atom-replaceChildren-reorder",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    run(t) {
      const p = t.parent(t.win("A"));
      t.api.replaceChildren(t.f, p, [t.win("C"), t.win("A"), t.win("B")]);
    },
    expect: "Mon1(H(C,A,B))",
  },
  {
    id: "atom-append-detaches-from-old-parent",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    run(t) {
      const h = t.parent(t.win("A"));
      const wrap = t.api.makeCon("VSPLIT", []);
      t.api._registerTree(t.f, wrap);
      t.api.appendChild(t.f, h, wrap);
      t.api.appendChild(t.f, wrap, t.win("B"));
    },
    expect: "Mon1(H(A,V(B)))",
  },
  {
    id: "atom-insertBefore-start",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    run(t) {
      const p = t.parent(t.win("A"));
      t.api.insertBefore(t.f, p, t.win("C"), t.win("A"));
    },
    expect: "Mon1(H(C,A,B))",
  },
  {
    id: "atom-insertAfter-middle",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    run(t) {
      const p = t.parent(t.win("A"));
      t.api.insertAfter(t.f, p, t.win("A"), t.win("B"));
    },
    expect: "Mon1(H(B,A,C))",
  },
  {
    id: "atom-removeChild-unlinks-keeps-map",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    run(t) {
      const p = t.parent(t.win("B"));
      t.api.removeChild(t.f, p, t.win("B"));
      if (!t.f.nodes[t.win("B").id]) return "B dropped from map";
      if (t.win("B").parentId) return "B still parented";
    },
    expect: "Mon1(H(A,C))",
  },
  {
    id: "atom-replaceChild",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    run(t) {
      const p = t.parent(t.win("A"));
      const wrap = t.api.makeCon("TABBED", []);
      t.api._registerTree(t.f, wrap);
      t.api.replaceChild(t.f, p, t.win("B"), wrap);
      t.api.appendChild(t.f, wrap, t.win("B"));
    },
    expect: "Mon1(H(A,TAB(B)))",
  },
  {
    id: "atom-destroy-window",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    actions: ["Select(B)", "Delete()"],
    expect: "Mon1(H(A,C))",
  },
  {
    id: "atom-destroy-con-cascades",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    run(t) {
      const aId = t.win("A").id;
      const bId = t.win("B").id;
      const v = t.parent(t.win("A"));
      t.api.deleteNode(t.f, v.id);
      if (t.f.nodes[aId] || t.f.nodes[bId]) {
        return "cascade missed leaves";
      }
    },
    expect: "Mon1(H(C))",
  },
  {
    id: "atom-destroy-monitor-fails",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    run(t) {
      const r = t.api.deleteNode(t.f, t.f.monitors[0].id);
      if (r.ok) return "should refuse monitor delete";
    },
    expect: "Mon1(H(A,B))",
  },
  {
    id: "atom-setLayout-field-only",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    run(t) {
      const h = t.parent(t.win("A"));
      t.win("A").percent = 0.75;
      t.win("B").percent = 0.25;
      t.api.setLayoutField(h, "VSPLIT");
    },
    expect: "Mon1(V(A,B))",
    check(t) {
      if (Math.abs(t.win("A").percent - 0.75) > 1e-9) return "percent mutated";
    },
  },
  {
    id: "atom-setLayout-bag-equalizes",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      t.win("A").percent = 0.8;
      t.api.setLayout(t.f, "TABBED");
    },
    expect: "Mon1(TAB(A,B))",
    check(t) {
      if (Math.abs(t.win("A").percent - 0.5) > 1e-9) return "bag should equalize";
    },
  },
  {
    id: "atom-setFocus-marks-open-leaf",
    layer: "atomics",
    given: "Mon1(TAB(A,B,C))",
    run(t) {
      t.api.setFocus(t.f, t.win("C").id);
    },
    expect: "Mon1(TAB(A,B,C))",
    check(t) {
      const tab = t.parent(t.win("A"));
      if (tab.lastTabFocusId !== t.win("C").id) return "lastTabFocus not C";
    },
  },
  {
    id: "atom-mon-multi-child-allowed",
    layer: "atomics",
    given: "Mon1(A,B)",
    expect: "Mon1(A,B)",
    check(t) {
      if (t.f.monitors[0].childIds.length !== 2) return "expected 2 mon children";
    },
  },
  {
    id: "atom-equalize-respects-userSized",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    run(t) {
      const p = t.parent(t.win("A"));
      t.win("A").percent = 0.8;
      t.win("A").userSized = true;
      t.win("B").percent = 0.2;
      t.api.equalizeChildren(t.f, p.id, false);
    },
    expect: "Mon1(H(A,B))",
    check(t) {
      if (Math.abs(t.win("A").percent - 0.8) > 1e-9) return "should skip userSized";
    },
  },
  {
    id: "atom-equalize-force",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    run(t) {
      const p = t.parent(t.win("A"));
      t.win("A").percent = 0.8;
      t.win("A").userSized = true;
      t.api.equalizeChildren(t.f, p.id, true);
    },
    expect: "Mon1(H(A,B))",
    check(t) {
      if (Math.abs(t.win("A").percent - 0.5) > 1e-9) return "force should equalize";
      if (t.win("A").userSized) return "force should clear userSized";
    },
  },
];
