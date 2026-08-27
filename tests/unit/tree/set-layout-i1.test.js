import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { LAYOUT_TYPES, NODE_TYPES } from "../../../lib/extension/tree.js";
import { SessionApi } from "../../../lib/extension/session-api.js";
import {
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createMockWindow,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";

/**
 * FCC C1 / invariant I1: setLayout never reparents or flattens children.
 * Child node identity and order stay stable across H↔tab↔stack cycles.
 */
describe("setLayout I1 — child identity stable", () => {
  let ctx;

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      settings: {
        "tiling-mode-enabled": true,
        "showtab-decoration-enabled": true,
        "tabbed-tiling-mode-enabled": true,
        "stacked-tiling-mode-enabled": true,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ctx.cleanup();
  });

  const tree = () => ctx.windowManager.tree;

  function nestedGroup() {
    const { monitor } = getWorkspaceAndMonitor(ctx, 0, 0);
    const con = tree().createNode(monitor.nodeValue, NODE_TYPES.CON, new Bin());
    con.layout = LAYOUT_TYPES.HSPLIT;
    const w1 = createMockWindow({ id: 101, wm_class: "A" });
    const w2 = createMockWindow({ id: 102, wm_class: "B" });
    const n1 = tree().createNode(con.nodeValue, NODE_TYPES.WINDOW, w1);
    const inner = tree().createNode(con.nodeValue, NODE_TYPES.CON, new Bin());
    inner.layout = LAYOUT_TYPES.VSPLIT;
    const w3 = createMockWindow({ id: 103, wm_class: "C" });
    const n3 = tree().createNode(inner.nodeValue, NODE_TYPES.WINDOW, w3);
    n1.mode = WINDOW_MODES.TILE;
    n3.mode = WINDOW_MODES.TILE;
    const w2n = tree().createNode(con.nodeValue, NODE_TYPES.WINDOW, w2);
    w2n.mode = WINDOW_MODES.TILE;
    return { con, inner, n1, n3, w2n, kids: () => [...con.childNodes] };
  }

  it("Node.setLayout only writes layout (+ optional lastTabFocus)", () => {
    const { con, kids } = nestedGroup();
    const before = kids();
    expect(con.setLayout(LAYOUT_TYPES.TABBED, { lastTabFocus: before[0].nodeValue })).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(con.lastTabFocus).toBe(before[0].nodeValue);
    expect(con.childNodes).toEqual(before);
    expect(con.childNodes[1].nodeType).toBe(NODE_TYPES.CON);
  });

  it("Tree.setLayout H → TABBED → H keeps nested CON child", () => {
    const { con, inner, kids } = nestedGroup();
    const before = kids();
    const beforeIds = before.map((c) => c);

    expect(tree().setLayout(con, LAYOUT_TYPES.TABBED)).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(con.childNodes).toEqual(beforeIds);
    expect(inner.parentNode).toBe(con);

    expect(tree().setLayout(con, LAYOUT_TYPES.HSPLIT, { resetPercents: true })).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.HSPLIT);
    expect(con.childNodes).toEqual(beforeIds);
    expect(inner.parentNode).toBe(con);
    expect(inner.childNodes).toHaveLength(1);
  });

  it("Tree.setLayout into TABBED/STACKED clears stale sibling percents", () => {
    const { con, kids } = nestedGroup();
    const before = kids();
    before[0].percent = 0.5;
    before[0].userSized = true;
    before[1].percent = 0.3;
    before[1].userSized = true;
    before[2].percent = 0.2;
    before[2].userSized = true;

    expect(tree().setLayout(con, LAYOUT_TYPES.TABBED)).toBe(true);
    for (const c of con.childNodes) {
      expect(c.percent).toBe(0);
      expect(c.userSized).toBe(false);
    }

    before[0].percent = 0.7;
    before[0].userSized = true;
    expect(tree().setLayout(con, LAYOUT_TYPES.STACKED, { lastTabFocus: null })).toBe(true);
    for (const c of con.childNodes) {
      expect(c.percent).toBe(0);
      expect(c.userSized).toBe(false);
    }
  });

  it("Tree.setLayout TABBED → STACKED keeps child order and nested CON", () => {
    const { con, inner, kids } = nestedGroup();
    tree().setLayout(con, LAYOUT_TYPES.TABBED);
    const before = kids();

    expect(tree().setLayout(con, LAYOUT_TYPES.STACKED, { lastTabFocus: null })).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.STACKED);
    expect(con.lastTabFocus).toBeNull();
    expect(con.childNodes).toEqual(before);
    expect(inner.parentNode).toBe(con);
  });

  it("rejects WINDOW nodes and unknown layouts", () => {
    const { n1 } = nestedGroup();
    expect(n1.setLayout(LAYOUT_TYPES.TABBED)).toBe(false);
    const { con } = nestedGroup();
    expect(tree().setLayout(con, "PRESET")).toBe(false);
    expect(tree().setLayout(con, null)).toBe(false);
  });

  it("layout-cycle group does not flatten nested CONs", () => {
    const { con, inner } = nestedGroup();
    tree().setLayout(con, LAYOUT_TYPES.TABBED);
    const before = [...con.childNodes];

    const api = new SessionApi({
      extWm: ctx.windowManager,
      settings: ctx.settings,
    });
    const out = api._layoutCycleOp("group", "id:101", { quiet: true });
    expect(out.ok).toBe(true);
    expect(out.changed).toBe(true);
    expect(con.layout).toBe(LAYOUT_TYPES.STACKED);
    expect(con.childNodes).toEqual(before);
    expect(inner.parentNode).toBe(con);
  });
});
