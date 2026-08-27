// @ts-check
import {
  buildGiven,
  normalizeTreeStr,
  parseAction,
  parseActions,
  parseGiven,
  serializeForest,
} from "../src/tom/shorthand.mjs";

/** @typedef {import('./harness.mjs').Case} Case */

/** @type {Case[]} */
export const SHORTHAND_CASES = [
  {
    id: "sh-roundtrip-nested",
    layer: "shorthand",
    given: "Mon1(H(V(A,B),V(C,D))) Mon2(H(E,TAB(F,G)))",
    expect: "Mon1(H(V(A,B),V(C,D))) Mon2(H(E,TAB(F,G)))",
    run() {
      const g = parseGiven("Mon1(H(V(A,B),V(C,D))) Mon2(H(E,TAB(F,G)))");
      if (g.length !== 2) return "expected 2 mons";
      if (g[0].kids.length !== 1) return "mon1 one root";
    },
  },
  {
    id: "sh-implicit-mon1",
    layer: "shorthand",
    given: "H(A,B)",
    expect: "Mon1(H(A,B))",
  },
  {
    id: "sh-mon-multi-child",
    layer: "shorthand",
    given: "Mon1(A,B)",
    expect: "Mon1(A,B)",
  },
  {
    id: "sh-layout-aliases",
    layer: "shorthand",
    given: "Mon1(HSPLIT(TABBED(A,B),STACKED(C,D)))",
    expect: "Mon1(H(TAB(A,B),STACK(C,D)))",
  },
  {
    id: "sh-parse-actions",
    layer: "shorthand",
    given: "Mon1(H(A,B))",
    expect: "Mon1(H(A,B))",
    run() {
      const steps = parseActions("Select(A); Move(left); Join(right); ToggleSplit()");
      if (steps.map((s) => s.op).join(",") !== "Select,Move,Join,ToggleSplit") {
        return "action parse mismatch";
      }
      const a = parseAction("SetLayout(TAB)");
      if (a.layout !== "TABBED") return "SetLayout alias";
      const l = parseAction("Launch()");
      if (l.op !== "Launch" || l.monIndex != null) return "Launch()";
      const l2 = parseAction("Launch(Mon2)");
      if (l2.op !== "Launch" || l2.monIndex !== 1) return "Launch(Mon2)";
    },
  },
  {
    id: "sh-normalize-bare",
    layer: "shorthand",
    given: "Mon1(H(A,B))",
    expect: "H(A,B)",
    run() {
      const { f, api } = buildGiven("Mon1(H(A,B))");
      const s = serializeForest(f, api);
      if (normalizeTreeStr("H(A,B)") !== normalizeTreeStr(s)) return "normalize";
    },
  },
];
