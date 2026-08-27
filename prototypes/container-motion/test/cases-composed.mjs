// @ts-check
/** @typedef {import('./harness.mjs').Case} Case */

/** @type {Case[]} */
export const COMPOSED_CASES = [
  {
    id: "cmp-swap-siblings",
    layer: "composed",
    given: "Mon1(H(A,B,C))",
    run(t) {
      t.api.swapSiblings(t.f, t.win("A"), t.win("C"));
    },
    expect: "Mon1(H(C,B,A))",
  },
  {
    id: "cmp-swap-not-siblings",
    layer: "composed",
    given: "Mon1(H(V(A,B),C))",
    run(t) {
      const r = t.api.swapSiblings(t.f, t.win("A"), t.win("C"));
      if (r.ok) return "should fail across parents";
    },
    expect: "Mon1(H(V(A,B),C))",
  },
  {
    id: "cmp-rotate-to-end",
    layer: "composed",
    given: "Mon1(H(A,B,C))",
    run(t) {
      t.api.rotateChild(t.f, t.parent(t.win("A")), t.win("A"), "end");
    },
    expect: "Mon1(H(B,C,A))",
  },
  {
    id: "cmp-rotate-to-start",
    layer: "composed",
    given: "Mon1(H(A,B,C))",
    run(t) {
      t.api.rotateChild(t.f, t.parent(t.win("C")), t.win("C"), "start");
    },
    expect: "Mon1(H(C,A,B))",
  },
  {
    id: "cmp-breakout-before",
    layer: "composed",
    given: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.breakout(t.f, t.win("A"), "before");
    },
    expect: "Mon1(H(A,V(B),C))",
  },
  {
    id: "cmp-breakout-after",
    layer: "composed",
    given: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.breakout(t.f, t.win("B"), "after");
    },
    expect: "Mon1(H(V(A),B,C))",
  },
  {
    id: "cmp-breakout-monitor-child-fails",
    layer: "composed",
    given: "Mon1(H(A,B))",
    run(t) {
      const h = t.parent(t.win("A"));
      const r = t.api.breakout(t.f, h, "after");
      if (r.ok) return "should not break out of monitor";
    },
    expect: "Mon1(H(A,B))",
  },
  {
    id: "cmp-breakout-allows-mon-sole-child-leaf",
    layer: "composed",
    note: "mon-sole-child guard is OpSet policy, not TreeOp",
    given: "Mon1(H(A,B))",
    run(t) {
      const r = t.api.breakout(t.f, t.win("A"), "after");
      if (!r.ok) return r.reason;
    },
    expect: "Mon1(H(B),A)",
  },
  {
    id: "cmp-wrapNodes-pair",
    layer: "composed",
    given: "Mon1(H(A,B,C))",
    run(t) {
      const host = t.parent(t.win("A"));
      const wrap = t.api.makeCon("VSPLIT", []);
      t.api._registerTree(t.f, wrap);
      t.api.wrapNodes(t.f, host, [t.win("B"), t.win("C")], wrap);
    },
    expect: "Mon1(H(A,V(B,C)))",
  },
  {
    id: "cmp-promote-children",
    layer: "composed",
    given: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.promoteChildren(t.f, t.parent(t.win("A")));
    },
    expect: "Mon1(H(A,B,C))",
  },
  {
    id: "cmp-collapse-unary-no-coerce",
    layer: "composed",
    note: "generic unary does not TAB same-type",
    given: "Mon1(H(H(A,B)))",
    run(t) {
      t.api.collapseUnary(t.f, t.f.monitors[0]);
    },
    expect: "Mon1(H(A,B))",
  },
  {
    id: "cmp-prune-empty",
    layer: "composed",
    given: "Mon1(H(A,B))",
    run(t) {
      const host = t.parent(t.win("A"));
      const empty = t.api.makeCon("TABBED", []);
      t.api._registerTree(t.f, empty);
      t.api.appendChild(t.f, host, empty);
      t.api.pruneEmptyCons(t.f, t.f.monitors[0]);
    },
    expect: "Mon1(H(A,B))",
  },
  {
    id: "cmp-cleanup-unary-and-empty",
    layer: "composed",
    given: "Mon1(H(V(A)))",
    run(t) {
      t.api.cleanupStructure(t.f, t.f.monitors[0]);
    },
    expect: "Mon1(A)",
  },
  {
    id: "cmp-ungroup-action",
    layer: "composed",
    given: "Mon1(H(TAB(A,B),C))",
    actions: ["Select(A)", "SelectParent()", "Ungroup()"],
    expect: "Mon1(H(A,B,C))",
  },
];
