// @ts-check
import { SIZE_MIN, SIZE_STEP, crossAxisSplit, paneRect } from "../src/tom/sizing.mjs";

/** @typedef {import('./harness.mjs').Case} Case */

function near(a, b) {
  return Math.abs(a - b) < 1e-6;
}

/** @type {Case[]} */
export const SIZING_CASES = [
  {
    id: "size-default-equal",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,B,C))",
    check(t) {
      if (!near(t.win("A").percent, 1 / 3)) return "A not equal share";
      if (t.win("A").userSized) return "A should float";
    },
  },
  {
    id: "size-preset-50-pair",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.setInAxisShare(t.f, 0.5);
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (!near(t.win("A").percent, 0.5) || !t.win("A").userSized) return "A not 50% sized";
      if (!near(t.win("B").percent, 0.5) || t.win("B").userSized) return "B should float 50%";
    },
  },
  {
    id: "size-preset-75-pair",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.sizePreset(t.f, 7);
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (!near(t.win("A").percent, 0.75)) return "A not 75%";
      if (!near(t.win("B").percent, 0.25)) return "B not 25% float";
    },
  },
  {
    id: "size-floater-min-blocks",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const before = t.win("A").percent;
      const r = t.api.setInAxisShare(t.f, 0.91);
      if (r.ok) return "91% should noop (B would be 9%)";
      if (!near(t.win("A").percent, before)) return "A mutated on noop";
    },
  },
  {
    id: "size-75-three-floaters-ok",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,B,C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.setInAxisShare(t.f, 0.75);
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (!near(t.win("A").percent, 0.75)) return "A not 75%";
      if (!near(t.win("B").percent, 0.125)) return "B not 12.5%";
      if (!near(t.win("C").percent, 0.125)) return "C not 12.5%";
    },
  },
  {
    id: "size-75-four-kids-noop",
    layer: "atomics",
    given: "Mon1(H(A,B,C,D))",
    expect: "Mon1(H(A,B,C,D))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.setInAxisShare(t.f, 0.75);
      if (r.ok) return "75% with 3 floaters is 8.3% each — noop";
    },
  },
  {
    id: "size-nudge-x-hsplit",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.nudgeSize(t.f, "x", SIZE_STEP);
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (!near(t.win("A").percent, 0.5 + SIZE_STEP)) return "A not nudged x";
      if (!near(t.win("B").percent, 0.5 - SIZE_STEP)) return "B not the remainder";
    },
  },
  {
    id: "size-nudge-y-in-hsplit-is-cross-axis",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.nudgeSize(t.f, "y", SIZE_STEP);
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (!near(t.win("A").percent, 0.5 + SIZE_STEP)) return "A y is in-axis of V";
      if (!near(t.win("B").percent, 0.5 - SIZE_STEP)) return "B remainder";
      const v = t.parent(t.win("A"));
      if (!near(v.percent, 0.5)) return "V x-share should be unchanged";
    },
  },
  {
    id: "size-nudge-x-from-v-child-resizes-parent",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.nudgeSize(t.f, "x", SIZE_STEP);
      if (!r.ok) return r.reason;
    },
    check(t) {
      const v = t.parent(t.win("A"));
      if (!near(v.percent, 0.5 + SIZE_STEP) || !v.userSized) return "V should grow in H";
      if (!near(t.win("C").percent, 0.5 - SIZE_STEP)) return "C remainder";
      if (!near(t.win("A").percent, 0.5)) return "A in-axis y unchanged";
    },
  },
  {
    id: "size-y-on-pure-hsplit-noop",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.nudgeSize(t.f, "y", SIZE_STEP);
      if (r.ok) return "no VSPLIT ancestor — y should noop";
    },
  },
  {
    id: "size-float-one",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,B,C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      t.api.setInAxisShare(t.f, 0.5);
      const r = t.api.floatSize(t.f);
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (t.win("A").userSized) return "A should float";
      if (!near(t.win("A").percent, 1 / 3)) return "all float → equal";
    },
  },
  {
    id: "size-float-siblings",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,B,C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      t.api.setInAxisShare(t.f, 0.5);
      t.api.setFocus(t.f, t.win("B").id);
      t.api.setInAxisShare(t.f, 0.3);
      const r = t.api.floatSiblingSizes(t.f);
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (t.win("A").userSized || t.win("B").userSized) return "all should float";
      if (!near(t.win("A").percent, 1 / 3)) return "not equalized";
    },
  },
  {
    id: "size-tab-preset-sizes-tab-slot",
    layer: "atomics",
    given: "Mon1(H(TAB(A,B),C))",
    expect: "Mon1(H(TAB(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.sizePreset(t.f, 7);
      if (!r.ok) return r.reason;
    },
    check(t) {
      const tab = t.parent(t.win("A"));
      if (!near(tab.percent, 0.75) || !tab.userSized) return "TAB slot not 75%";
      if (!near(t.win("C").percent, 0.25)) return "C not 25%";
    },
  },
  {
    id: "size-min-floor",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    check() {
      if (SIZE_MIN !== 0.1) return "SIZE_MIN";
    },
  },
  {
    id: "size-pane-rect-hsplit",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    check(t) {
      const r = paneRect(t.f, t.win("A"));
      if (!r) return "no paneRect";
      if (!near(r.w, 960) || !near(r.h, 1080)) return `A rect ${r.w}x${r.h}`;
    },
  },
  {
    id: "size-cross-axis-parent-is-v",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(V(A,B),C))",
    check(t) {
      const x = crossAxisSplit(t.f, t.win("A"));
      const v = t.parent(t.win("A"));
      if (!x || x.target.id !== v.id) return "cross-axis parent should be V";
    },
  },
  {
    id: "size-float-siblings-only",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,B,C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      t.api.setInAxisShare(t.f, 0.5);
      t.api.setFocus(t.f, t.win("B").id);
      t.api.setInAxisShare(t.f, 0.3);
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.floatCombo(t.f, { siblings: true });
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (!t.win("A").userSized || !near(t.win("A").percent, 0.5)) {
        return "A should stay 50% sized";
      }
      if (t.win("B").userSized || t.win("C").userSized) return "sibs should float";
      if (!near(t.win("B").percent, 0.25) || !near(t.win("C").percent, 0.25)) {
        return "sib floaters should share leftover";
      }
    },
  },
  {
    id: "size-float-parent-only",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      t.api.setInAxisShare(t.f, 0.7);
      const v = t.parent(t.win("A"));
      t.f.selectionId = v.id;
      const r = t.api.setInAxisShare(t.f, 0.7);
      if (!r.ok) return r.reason;
      t.api.setFocus(t.f, t.win("A").id);
      const f = t.api.floatCombo(t.f, { parent: true });
      if (!f.ok) return f.reason;
    },
    check(t) {
      const v = t.parent(t.win("A"));
      if (v.userSized) return "V should float";
      if (!near(v.percent, 0.5)) return "V/C should equalize";
      if (!t.win("A").userSized || !near(t.win("A").percent, 0.7)) {
        return "A in-axis should stay sized";
      }
    },
  },
  {
    id: "size-float-parent-siblings-only",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(V(A,B),C))",
    run(t) {
      const v = t.parent(t.win("A"));
      t.f.selectionId = v.id;
      const r = t.api.setInAxisShare(t.f, 0.6);
      if (!r.ok) return r.reason;
      t.api.setFocus(t.f, t.win("C").id);
      t.api.setInAxisShare(t.f, 0.4);
      t.api.setFocus(t.f, t.win("A").id);
      const f = t.api.floatCombo(t.f, { parentSiblings: true });
      if (!f.ok) return f.reason;
    },
    check(t) {
      const v = t.parent(t.win("A"));
      if (!v.userSized || !near(v.percent, 0.6)) return "V should stay 60%";
      if (t.win("C").userSized) return "C should float";
      if (!near(t.win("C").percent, 0.4)) return "C leftover 40%";
    },
  },
  {
    id: "size-float-self-siblings-parent",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      t.api.setInAxisShare(t.f, 0.7);
      const v = t.parent(t.win("A"));
      t.f.selectionId = v.id;
      const rv = t.api.setInAxisShare(t.f, 0.6);
      if (!rv.ok) return rv.reason;
      t.api.setFocus(t.f, t.win("C").id);
      const rc = t.api.setInAxisShare(t.f, 0.4);
      if (!rc.ok) return rc.reason;
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.floatCombo(t.f, { self: true, siblings: true, parent: true });
      if (!r.ok) return r.reason;
    },
    check(t) {
      const v = t.parent(t.win("A"));
      if (t.win("A").userSized || t.win("B").userSized) return "V kids should float";
      if (!near(t.win("A").percent, 0.5)) return "A/B should equalize";
      if (v.userSized) return "V should float";
      if (!t.win("C").userSized || !near(t.win("C").percent, 0.4)) {
        return "C should stay 40% sized";
      }
      if (!near(v.percent, 0.6)) return "V leftover 60%";
    },
  },
  {
    id: "size-float-both-groups",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      t.api.setInAxisShare(t.f, 0.7);
      const v = t.parent(t.win("A"));
      t.f.selectionId = v.id;
      t.api.setInAxisShare(t.f, 0.7);
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.floatCombo(t.f, {
        self: true,
        siblings: true,
        parent: true,
        parentSiblings: true,
      });
      if (!r.ok) return r.reason;
    },
    check(t) {
      const v = t.parent(t.win("A"));
      if (t.win("A").userSized || t.win("B").userSized) return "V kids should float";
      if (v.userSized || t.win("C").userSized) return "H kids should float";
      if (!near(t.win("A").percent, 0.5)) return "A not equal in V";
      if (!near(v.percent, 0.5)) return "V not equal in H";
    },
  },
  {
    id: "size-float-parent-on-pure-h-fails",
    layer: "atomics",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.floatCombo(t.f, { parent: true });
      if (r.ok) return "no cross-axis parent — should fail";
    },
  },
  {
    id: "size-nudge-x-from-tab-child-resizes-tab",
    layer: "atomics",
    given: "Mon1(H(TAB(A,B),C))",
    expect: "Mon1(H(TAB(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.nudgeSize(t.f, "x", SIZE_STEP);
      if (!r.ok) return r.reason;
    },
    check(t) {
      const tab = t.parent(t.win("A"));
      if (!near(tab.percent, 0.5 + SIZE_STEP) || !tab.userSized) {
        return "TAB slot should grow in H";
      }
      if (!near(t.win("C").percent, 0.5 - SIZE_STEP)) return "C remainder";
      if (t.win("A").userSized) return "tab leaf must not be userSized";
    },
  },
  {
    id: "size-nudge-x-from-stack-child-resizes-stack",
    layer: "atomics",
    given: "Mon1(H(STACK(A,B),C))",
    expect: "Mon1(H(STACK(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.nudgeSize(t.f, "x", SIZE_STEP);
      if (!r.ok) return r.reason;
    },
    check(t) {
      const stack = t.parent(t.win("A"));
      if (!near(stack.percent, 0.5 + SIZE_STEP) || !stack.userSized) {
        return "STACK slot should grow in H";
      }
      if (!near(t.win("C").percent, 0.5 - SIZE_STEP)) return "C remainder";
    },
  },
  {
    id: "size-equalize-selected-h-equalizes-its-kids",
    layer: "atomics",
    given: "Mon1(V(H(A,B),C))",
    expect: "Mon1(V(H(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const sized = t.api.setInAxisShare(t.f, 0.7);
      if (!sized.ok) return sized.reason;
      const h = t.parent(t.win("A"));
      t.f.selectionId = h.id;
      const r = t.api.equalizeChildren(t.f);
      if (!r.ok) return r.reason;
    },
    check(t) {
      const h = t.parent(t.win("A"));
      if (!near(t.win("A").percent, 0.5) || t.win("A").userSized) {
        return "H kids should equalize";
      }
      if (!near(t.win("B").percent, 0.5)) return "B should equalize";
      if (!near(h.percent, 0.5) || h.userSized) return "H slot in V should be unchanged";
    },
  },
  {
    id: "size-equalize-from-tab-leaf-equalizes-tab-slot",
    layer: "atomics",
    given: "Mon1(H(TAB(A,B),C))",
    expect: "Mon1(H(TAB(A,B),C))",
    run(t) {
      const tab = t.parent(t.win("A"));
      t.f.selectionId = tab.id;
      const sized = t.api.setInAxisShare(t.f, 0.7);
      if (!sized.ok) return sized.reason;
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.equalizeChildren(t.f);
      if (!r.ok) return r.reason;
    },
    check(t) {
      const tab = t.parent(t.win("A"));
      if (!near(tab.percent, 0.5) || tab.userSized) return "TAB/C should equalize";
      if (!near(t.win("C").percent, 0.5) || t.win("C").userSized) {
        return "C should equalize";
      }
    },
  },
  {
    id: "size-equalize-from-tab-con-equalizes-tab-slot",
    layer: "atomics",
    given: "Mon1(H(TAB(A,B),C))",
    expect: "Mon1(H(TAB(A,B),C))",
    run(t) {
      const tab = t.parent(t.win("A"));
      t.f.selectionId = tab.id;
      const sized = t.api.setInAxisShare(t.f, 0.7);
      if (!sized.ok) return sized.reason;
      t.f.selectionId = tab.id;
      const r = t.api.equalizeChildren(t.f);
      if (!r.ok) return r.reason;
    },
    check(t) {
      const tab = t.parent(t.win("A"));
      if (!near(tab.percent, 0.5) || tab.userSized) return "TAB slot should equalize";
      if (!near(t.win("C").percent, 0.5)) return "C should equalize";
    },
  },
  {
    id: "size-float-all",
    layer: "atomics",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(V(A,B),C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const ra = t.api.setInAxisShare(t.f, 0.7);
      if (!ra.ok) return ra.reason;
      const v = t.parent(t.win("A"));
      t.f.selectionId = v.id;
      const rv = t.api.setInAxisShare(t.f, 0.7);
      if (!rv.ok) return rv.reason;
      const r = t.api.floatAllSizes(t.f);
      if (!r.ok) return r.reason;
    },
    check(t) {
      const v = t.parent(t.win("A"));
      if (t.win("A").userSized || t.win("B").userSized) return "V kids should float";
      if (v.userSized || t.win("C").userSized) return "H kids should float";
      if (!near(t.win("A").percent, 0.5)) return "A not equal in V";
      if (!near(v.percent, 0.5)) return "V not equal in H";
    },
  },
  {
    id: "size-rescale-when-last-floater-removed",
    layer: "atomics",
    given: "Mon1(H(A,B,C))",
    expect: "Mon1(H(A,B))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const ra = t.api.setInAxisShare(t.f, 0.25);
      if (!ra.ok) return ra.reason;
      t.api.setFocus(t.f, t.win("B").id);
      const rb = t.api.setInAxisShare(t.f, 0.5);
      if (!rb.ok) return rb.reason;
      const r = t.api.deleteNode(t.f, t.win("C").id);
      if (!r.ok) return r.reason;
    },
    check(t) {
      if (!t.win("A").userSized || !near(t.win("A").percent, 0.25 / 0.75)) {
        return `A should rescale to 1/3, got ${t.win("A").percent}`;
      }
      if (!t.win("B").userSized || !near(t.win("B").percent, 0.5 / 0.75)) {
        return `B should rescale to 2/3, got ${t.win("B").percent}`;
      }
    },
  },
  {
    id: "size-leave-resets-userSized",
    layer: "opset",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(A,B,C))",
    run(t) {
      t.api.setFocus(t.f, t.win("A").id);
      const r = t.api.setInAxisShare(t.f, 0.7);
      if (!r.ok) return r.reason;
    },
    actions: ["Select(A)", "Move(left)"],
    check(t) {
      if (t.win("A").userSized) return "A must float after leaving V";
    },
  },
  {
    id: "size-unary-collapse-keeps-con-share",
    layer: "opset",
    given: "Mon1(H(V(A,B),C))",
    expect: "Mon1(H(A,C))",
    run(t) {
      const v = t.parent(t.win("A"));
      t.f.selectionId = v.id;
      const r = t.api.setInAxisShare(t.f, 0.7);
      if (!r.ok) return r.reason;
    },
    actions: ["Select(B)", "Remove()"],
    check(t) {
      if (!t.win("A").userSized || !near(t.win("A").percent, 0.7)) {
        return `A should inherit V's 70% slot, got ${t.win("A").percent} sized=${
          t.win("A").userSized
        }`;
      }
      if (!near(t.win("C").percent, 0.3) || t.win("C").userSized) {
        return "C should stay 30% float";
      }
    },
  },
];
