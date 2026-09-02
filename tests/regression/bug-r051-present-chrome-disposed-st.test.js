import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import * as PresentChrome from "../../lib/extension/present-chrome.js";
import {
  createTreeFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
  parentOf,
} from "../mocks/helpers/index.js";

/**
 * R051: Wayland `forge layout dev` SIGSEGV — present-chrome add_child on a
 * C-disposed St.BoxLayout. try/catch cannot catch native SEGV; never St-call
 * `_forgeDisposed` actors. Mock St stays silent after destroy; per-actor stubs
 * throw the real GJS disposed string. Do not `expect(actor)` after dispose —
 * Vitest pretty-print reads St fields and rethrows.
 */
const DISPOSED_MSG = "Object St.BoxLayout has been already disposed — impossible to access it.";

function markDisposed(actor) {
  if (!actor) return actor;
  actor._forgeDisposed = true;
  const boom = () => {
    throw new Error(DISPOSED_MSG);
  };
  for (const key of [
    "hide",
    "show",
    "get_parent",
    "add_child",
    "remove_child",
    "destroy",
    "destroy_all_children",
    "get_children",
    "set_size",
    "set_position",
    "set_height",
    "contains",
    "get_child_at_index",
    "get_theme_node",
    "connect",
    "add_style_class_name",
    "remove_style_class_name",
  ]) {
    actor[key] = boom;
  }
  for (const prop of ["y_expand", "x_expand", "reactive", "visible", "orientation", "vertical"]) {
    Object.defineProperty(actor, prop, {
      configurable: true,
      get: boom,
      set: boom,
    });
  }
  return actor;
}

function isLiveActor(actor) {
  return !!(actor && !actor._forgeDisposed);
}

describe("R051: present-chrome must not St-call disposed TABBED chrome", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({
      fullExtWm: true,
      settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
    });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  function buildTabbedPair() {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    const tabbedCon = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    const a = createWindowNode(ctx.tree, tabbedCon).nodeWindow;
    const b = createWindowNode(ctx.tree, tabbedCon).nodeWindow;
    PresentChrome.processNode(ctx.tree, tabbedCon);
    return { tabbedCon, a, b };
  }

  it("rebuilds live decoration + tab chips in the same processNode pass", () => {
    const { tabbedCon, a, b } = buildTabbedPair();
    expect(tabbedCon.decoration).toBeTruthy();
    expect(a.tab).toBeTruthy();
    expect(b.tab).toBeTruthy();

    const deadDeco = markDisposed(tabbedCon.decoration);
    const deadA = markDisposed(a.tab);
    const deadB = markDisposed(b.tab);

    expect(() => PresentChrome.processNode(ctx.tree, tabbedCon)).not.toThrow();

    const deco = tabbedCon.decoration;
    const tabA = a.tab;
    const tabB = b.tab;
    expect(!!deco && !deco._forgeDisposed).toBe(true);
    expect(deco !== deadDeco).toBe(true);
    expect(!!tabA && !tabA._forgeDisposed).toBe(true);
    expect(!!tabB && !tabB._forgeDisposed).toBe(true);
    expect(tabA !== deadA).toBe(true);
    expect(tabB !== deadB).toBe(true);
    expect(parentOf(ctx.extWm, a)).toBe(tabbedCon);
    expect(parentOf(ctx.extWm, b)).toBe(tabbedCon);
    expect(isLiveActor(deco) && deco.contains(tabA)).toBe(true);
    expect(isLiveActor(deco) && deco.contains(tabB)).toBe(true);
  });

  it("strip-path throw does not leave child.tab pointing at the destroyed actor", () => {
    const { tabbedCon, a, b } = buildTabbedPair();
    const deadA = a.tab;
    const deadB = b.tab;
    expect(deadA).toBeTruthy();
    expect(deadB).toBeTruthy();

    // C disposed the host's children without the JS destroy signal / flag.
    markDisposed(deadA);
    markDisposed(deadB);
    expect(a.tab).toBe(deadA);
    expect(b.tab).toBe(deadB);

    const deco = tabbedCon.decoration;
    deco.get_children = () => {
      throw new Error(DISPOSED_MSG);
    };
    deco.remove_child = () => {
      throw new Error(DISPOSED_MSG);
    };

    expect(() => PresentChrome.processNode(ctx.tree, tabbedCon)).not.toThrow();

    const tabA = a.tab;
    const tabB = b.tab;
    const host = tabbedCon.decoration;
    expect(tabA !== deadA).toBe(true);
    expect(tabB !== deadB).toBe(true);
    expect(!!tabA && !tabA._forgeDisposed).toBe(true);
    expect(!!tabB && !tabB._forgeDisposed).toBe(true);
    expect(!!host && !host._forgeDisposed).toBe(true);
    expect(parentOf(ctx.extWm, a)).toBe(tabbedCon);
    expect(parentOf(ctx.extWm, b)).toBe(tabbedCon);
    expect(isLiveActor(host) && host.contains(tabA)).toBe(true);
    expect(isLiveActor(host) && host.contains(tabB)).toBe(true);
  });

  it("real St destroy signal (no mock auto-flag) does not reuse the bag chip", () => {
    const { tabbedCon, a, b } = buildTabbedPair();
    const deadA = a.tab;
    expect(deadA).toBeTruthy();
    const added = [];
    const deco = tabbedCon.decoration;
    const realAdd = deco.add_child.bind(deco);
    deco.add_child = (child) => {
      added.push(child);
      return realAdd(child);
    };

    // Real St: destroy signal without Widget.destroy()'s mock _forgeDisposed.
    deadA.destroy = () => {
      deadA.emit?.("destroy");
    };
    deadA.destroy();

    expect(deadA._forgeDisposed).toBe(true);
    expect(a.tab === deadA).toBe(false);

    expect(() => PresentChrome.processNode(ctx.tree, tabbedCon)).not.toThrow();

    const tabA = a.tab;
    expect(!!tabA && !tabA._forgeDisposed).toBe(true);
    expect(tabA !== deadA).toBe(true);
    expect(added.includes(deadA)).toBe(false);
    expect(parentOf(ctx.extWm, a)).toBe(tabbedCon);
    expect(parentOf(ctx.extWm, b)).toBe(tabbedCon);
  });
});
