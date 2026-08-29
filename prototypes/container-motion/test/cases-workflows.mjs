// @ts-check
/**
 * Capability suite — tiling jobs every OpSet must be able to perform.
 * How is per-OpSet; Given → Expect is the contract.
 */

/** @typedef {import('./harness.mjs').Case} Case */

/** @type {Case[]} */
export const WORKFLOW_CASES = [
  {
    id: "wf-swap-hsplit-pair",
    layer: "workflow",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(B,A))",
    byOpSet: { mark2: ["Select(A)", "Move(right)"] },
  },
  {
    id: "wf-swap-vsplit-pair",
    layer: "workflow",
    given: "Mon1(V(A,B))",
    expect: "Mon1(V(B,A))",
    byOpSet: { mark2: ["Select(A)", "Move(down)"] },
  },
  {
    id: "wf-reorder-tab-strip",
    layer: "workflow",
    given: "Mon1(TAB(A,B,C))",
    expect: "Mon1(TAB(B,A,C))",
    byOpSet: { mark2: ["Select(A)", "Move(right)"] },
  },
  {
    id: "wf-rotate-at-hsplit-edge",
    layer: "workflow",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(B,C,A))",
    byOpSet: { mark2: ["Select(A)", "Move(left)"] },
  },
  {
    id: "wf-flip-split-axis",
    layer: "workflow",
    given: "Mon1(H(A,B))",
    expect: "Mon1(V(A,B))",
    byOpSet: { mark2: ["Select(A)", "ToggleSplit()"] },
  },
  {
    id: "wf-tabify-split-pair",
    layer: "workflow",
    given: "Mon1(H(A,B))",
    expect: "Mon1(TAB(A,B))",
    byOpSet: { mark2: ["Select(A)", "ToggleTabStack()"] },
  },
  {
    id: "wf-split-tab-pair",
    layer: "workflow",
    given: "Mon1(TAB(A,B))",
    expect: "Mon1(V(A,B))",
    byOpSet: { mark2: ["Select(A)", "ToggleSplit()"] },
  },
  {
    id: "wf-peel-tab-member-beside",
    layer: "workflow",
    given: "Mon1(H(A,TAB(B,C)))",
    expect: "Mon1(H(A,V(B,C)))",
    byOpSet: { mark2: ["Select(B)", "Join(right)"] },
  },
  {
    id: "wf-join-leaf-into-adjacent-tab",
    layer: "workflow",
    given: "Mon1(H(TAB(A,B),TAB(C,D)))",
    expect: "Mon1(H(TAB(A,B,C),D))",
    byOpSet: { mark2: ["JoinMove(C, left)"] },
  },
  {
    id: "wf-flatten-nested-grid",
    layer: "workflow",
    given: "Mon1(H(V(A,B),V(C,D)))",
    expect: "Mon1(H(A,B,C,D))",
    byOpSet: { mark2: ["Select(C)", "Join(left)"] },
  },
  {
    id: "wf-edge-does-not-steal-monitor",
    layer: "workflow",
    given: "Mon1(H(A,B)) Mon2(H(C,D))",
    expect: "Mon1(H(B,A)) Mon2(H(C,D))",
    byOpSet: { mark2: ["Select(B)", "Move(right)"] },
  },
  {
    id: "wf-move-to-other-monitor",
    layer: "workflow",
    given: "Mon1(A) Mon2(B)",
    expect: "Mon1() Mon2(V(A,B))",
    byOpSet: { mark2: ["Select(A)", "Move(right)"] },
  },
  {
    id: "wf-close-middle-keep-split",
    layer: "workflow",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,C))",
    byOpSet: { mark2: ["Select(B)", "Remove()"] },
  },
  {
    id: "wf-nest-two-of-three",
    layer: "workflow",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,V(B,C)))",
    byOpSet: { mark2: ["Select(B)", "Join(right)"] },
  },
  {
    id: "wf-promote-nested-con",
    layer: "workflow",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(A,B,C))",
    byOpSet: { mark2: ["Select(A)", "SelectParent()", "Promote()"] },
  },
  {
    id: "wf-three-way-reorder",
    layer: "workflow",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,C,B))",
    byOpSet: { mark2: ["Select(B)", "Move(right)"] },
  },
  {
    id: "wf-launch-beside-tab",
    layer: "workflow",
    given: "Mon1(TAB(A,B))",
    expect: "Mon1(TAB(A,C,B))",
    byOpSet: { mark2: ["Select(A)", "Launch()"] },
  },
  {
    id: "wf-launch-split-taller-wrap",
    layer: "workflow",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(V(A,C),B))",
    byOpSet: { mark2: ["Select(A)", "Launch()"] },
  },
  {
    id: "wf-launch-under-selected-tab",
    layer: "workflow",
    given: "Mon1(H(TAB(A,B),C))",
    expect: "Mon1(H(V(TAB(A,B),D),C))",
    byOpSet: { mark2: ["Select(A)", "SelectParent()", "Launch()"] },
  },
  {
    id: "wf-close-share-rescales-sized",
    layer: "workflow",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const ra = t.api.setInAxisShare(t.f, 0.25);
      if (!ra.ok) return ra.reason;
      t.api.setFocus(t.f, t.win("B").id);
      const rb = t.api.setInAxisShare(t.f, 0.5);
      if (!rb.ok) return rb.reason;
    },
    byOpSet: { mark2: ["Select(C)", "Remove()"] },
    check(t) {
      const a = t.win("A").percent;
      const b = t.win("B").percent;
      if (Math.abs(a - 1 / 3) > 1e-6 || Math.abs(b - 2 / 3) > 1e-6) {
        return `expected 1/3 + 2/3, got ${a} + ${b}`;
      }
    },
  },
];
