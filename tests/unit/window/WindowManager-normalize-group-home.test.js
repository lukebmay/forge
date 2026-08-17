import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NODE_TYPES, LAYOUT_TYPES, Node } from "../../../lib/extension/tree.js";
import { WINDOW_MODES } from "../../../lib/extension/window.js";
import {
  createMockWindow,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
} from "../../mocks/helpers/index.js";
import { Bin } from "../../mocks/gnome/St.js";

/**
 * D044: mixed-mon TABBED/STACKED Meta members rehome to CON tree home.
 */
describe("normalizeGroupToHomeMonitor (D044)", () => {
  let ctx;
  const dualGeoms = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1920, height: 1080 },
  ];

  beforeEach(() => {
    ctx = createWindowManagerFixture({
      globals: {
        display: {
          monitorCount: 2,
          monitorGeometries: dualGeoms,
        },
      },
      settings: {
        "tabbed-tiling-mode-enabled": true,
        "tiling-mode-enabled": true,
      },
    });
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("mixed-mon Meta on a TABBED group rehomes to CON MONITOR ancestor", () => {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const tab = new Node(NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    mon0.appendChild(tab);

    const metaA = createMockWindow({
      id: "a",
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    const metaB = createMockWindow({
      id: "b",
      monitor: 1, // Meta lag / thrash — tree still mon0
      workspace: ctx.workspaces[0],
    });
    const a = new Node(NODE_TYPES.WINDOW, metaA);
    const b = new Node(NODE_TYPES.WINDOW, metaB);
    a.mode = WINDOW_MODES.TILE;
    b.mode = WINDOW_MODES.TILE;
    tab.appendChild(a);
    tab.appendChild(b);
    tab.lastTabFocus = metaA;

    expect(ctx.tree.groupHomeMonitor(tab)).toBe(0);
    expect(metaB.get_monitor()).toBe(1);

    const changed = ctx.windowManager.normalizeGroupToHomeMonitor(tab);

    expect(changed).toBe(true);
    expect(metaB.get_monitor()).toBe(0);
    expect(metaA.get_monitor()).toBe(0);
    expect(a.parentNode).toBe(tab);
    expect(b.parentNode).toBe(tab);
    expect(tab.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(tab.lastTabFocus).toBe(metaA);
    expect(tab.childNodes.length).toBe(2);
  });

  it("merge-group across mons then normalize keeps one TABBED on dest", () => {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const mon1 = getWorkspaceAndMonitor(ctx, 0, 1).monitor;
    mon0.layout = LAYOUT_TYPES.HSPLIT;
    mon1.layout = LAYOUT_TYPES.HSPLIT;

    const metaF = createMockWindow({
      id: "focus",
      monitor: 0,
      workspace: ctx.workspaces[0],
    });
    const metaP = createMockWindow({
      id: "partner",
      monitor: 1,
      workspace: ctx.workspaces[0],
    });
    const focus = ctx.tree.createNode(mon0.nodeValue, NODE_TYPES.WINDOW, metaF);
    const partner = ctx.tree.createNode(mon1.nodeValue, NODE_TYPES.WINDOW, metaP);
    focus.mode = WINDOW_MODES.TILE;
    partner.mode = WINDOW_MODES.TILE;

    const group = ctx.tree.mergeWindowsIntoGroup(focus, partner, LAYOUT_TYPES.TABBED);
    ctx.windowManager.normalizeGroupToHomeMonitor(group);

    expect(group.layout).toBe(LAYOUT_TYPES.TABBED);
    expect(ctx.tree.groupHomeMonitor(group)).toBe(0);
    expect(metaP.get_monitor()).toBe(0);
    expect(metaF.get_monitor()).toBe(0);
    expect(mon1.contains(partner)).toBe(false);
    expect(focus.parentNode).toBe(group);
    expect(partner.parentNode).toBe(group);
  });

  it("no-op when Meta already on home", () => {
    const mon0 = getWorkspaceAndMonitor(ctx, 0, 0).monitor;
    const tab = new Node(NODE_TYPES.CON, new Bin());
    tab.layout = LAYOUT_TYPES.TABBED;
    mon0.appendChild(tab);

    const metaA = createMockWindow({ id: "a", monitor: 0, workspace: ctx.workspaces[0] });
    const metaB = createMockWindow({ id: "b", monitor: 0, workspace: ctx.workspaces[0] });
    const a = new Node(NODE_TYPES.WINDOW, metaA);
    const b = new Node(NODE_TYPES.WINDOW, metaB);
    a.mode = WINDOW_MODES.TILE;
    b.mode = WINDOW_MODES.TILE;
    tab.appendChild(a);
    tab.appendChild(b);

    expect(ctx.windowManager.normalizeGroupToHomeMonitor(tab)).toBe(false);
  });
});
