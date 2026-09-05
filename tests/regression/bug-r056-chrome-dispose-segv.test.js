import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Clutter from "gi://Clutter";
import St from "gi://St";
import { LAYOUT_TYPES } from "../../lib/extension/tree.js";
import * as PresentChrome from "../../lib/extension/present-chrome.js";
import {
  createTreeFixture,
  createWindowManagerFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
  createContainerNode,
} from "../mocks/helpers/index.js";

/**
 * R056: second Shell SEGV class (chrome/dispose), distinct from sleep-wake
 * session-layout raw move_to_monitor. Journal:
 *   node-chrome.js:203/232 tab-close → Meta.delete
 *   decoration.js:782+ _destroyActorBorder contains/hide/destroy on St.Bin
 * try/catch cannot catch native SEGV; never St-call `_forgeDisposed` actors.
 */
const DISPOSED_MSG = "Object St.Bin has been already disposed — impossible to access it.";

function markDisposed(actor) {
  if (!actor) return actor;
  actor._forgeDisposed = true;
  actor._forgeStHits = 0;
  const boom = () => {
    actor._forgeStHits += 1;
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
    "set_style_class_name",
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

function makeButtonEvent(button, source = null) {
  return {
    get_button: () => button,
    get_source: () => source,
  };
}

function findCloseButton(tab) {
  return tab.get_children().find((c) => c.style_class === "window-tabbed-tab-close");
}

function emitPress(actor, event) {
  const handlers = actor._signals?.["button-press-event"] ?? [];
  let last = Clutter.EVENT_PROPAGATE;
  for (const { callback } of handlers) {
    last = callback(actor, event);
  }
  return last;
}

describe("R056: chrome dispose must not St-call dead tab/border actors", () => {
  describe("tab close / click (node-chrome.js:203/232)", () => {
    let ctx;

    beforeEach(() => {
      ctx = createTreeFixture({
        fullExtWm: true,
        settings: { "tiling-mode-enabled": true, "showtab-decoration-enabled": true },
      });
    });

    afterEach(() => {
      ctx.cleanup?.();
      vi.restoreAllMocks();
    });

    function buildTabbedWindow() {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const tabbed = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      return createWindowNode(ctx.tree, tabbed);
    }

    it("close press on a disposed chip does not delete and does not throw", () => {
      const { nodeWindow, metaWindow } = buildTabbedWindow();
      const tab = nodeWindow.tab;
      const closeButton = findCloseButton(tab);
      expect(closeButton).toBeTruthy();
      const deleteSpy = vi.spyOn(metaWindow, "delete");

      markDisposed(closeButton);
      markDisposed(tab);

      expect(() =>
        emitPress(closeButton, makeButtonEvent(Clutter.BUTTON_PRIMARY, closeButton))
      ).not.toThrow();
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(closeButton._forgeStHits).toBe(0);
      expect(tab._forgeStHits).toBe(0);
    });

    it("close press skips Meta.delete when the window is already dead", () => {
      const { nodeWindow, metaWindow } = buildTabbedWindow();
      const closeButton = findCloseButton(nodeWindow.tab);
      const deleteSpy = vi.spyOn(metaWindow, "delete");
      metaWindow.get_id = () => {
        throw new Error("Object Meta.Window has been already disposed");
      };

      expect(() =>
        emitPress(closeButton, makeButtonEvent(Clutter.BUTTON_PRIMARY, closeButton))
      ).not.toThrow();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("tab body press on a disposed chip does not throw", () => {
      const { nodeWindow } = buildTabbedWindow();
      const tab = nodeWindow.tab;
      markDisposed(tab);
      expect(() => emitPress(tab, makeButtonEvent(Clutter.BUTTON_PRIMARY, tab))).not.toThrow();
      expect(tab._forgeStHits).toBe(0);
    });
  });

  describe("border teardown (decoration.js:782+)", () => {
    let ctx;

    beforeEach(() => {
      ctx = createWindowManagerFixture({
        settings: {
          "tiling-mode-enabled": true,
          "focus-border-toggle": true,
          "focus-border-hidden-on-single": false,
          "window-gap-size": 4,
        },
      });
    });

    afterEach(() => {
      ctx.cleanup();
      vi.restoreAllMocks();
    });

    const wm = () => ctx.windowManager;

    it("_destroyActorBorder skips St on a C-disposed St.Bin and clears the slot", () => {
      const border = new St.Bin();
      global.window_group.add_child(border);
      const meta = { id: "m1", get_compositor_private: () => actor };
      const actor = { border, meta_window: meta };
      wm().hostBag.set("nid-1", { meta, border });

      const origContains = global.window_group.contains.bind(global.window_group);
      global.window_group.contains = (child) => {
        if (child?._forgeDisposed) throw new Error(DISPOSED_MSG);
        return origContains(child);
      };
      markDisposed(border);

      expect(() => wm()._destroyActorBorder(actor, "border")).not.toThrow();
      expect(border._forgeStHits).toBe(0);
      expect(actor.border).toBeUndefined();
      expect(wm().hostBag.get("nid-1")?.border).toBeUndefined();
    });

    it("hideWindowBorders skips a disposed bag border", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const { metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: "b1", wm_class: "TestApp" },
      });
      const border = new St.Bin();
      const actor = metaWindow.get_compositor_private();
      actor.border = border;
      const bagId = wm().hostBag?.idFromMeta?.(metaWindow);
      if (bagId) wm().hostBag.set(bagId, { border, meta: metaWindow });
      markDisposed(border);

      expect(() => wm().hideWindowBorders()).not.toThrow();
      expect(border._forgeStHits).toBe(0);
    });

    it("showWindowBorders skips a disposed focus border", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      monitor.layout = LAYOUT_TYPES.HSPLIT;
      const { metaWindow } = createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: "focused", wm_class: "TestApp" },
      });
      createWindowNode(ctx.tree, monitor, {
        windowOverrides: { id: "sibling", wm_class: "TestApp" },
      });
      const border = new St.Bin();
      metaWindow.get_compositor_private().border = border;
      metaWindow.appears_focused = true;
      metaWindow.minimized = false;
      global.display.get_focus_window.mockReturnValue(metaWindow);
      markDisposed(border);

      expect(() => wm().showWindowBorders()).not.toThrow();
      expect(border._forgeStHits).toBe(0);
    });
  });

  describe("present-chrome theme node on disposed window border", () => {
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

    it("processNode does not get_theme_node a disposed actor.border", () => {
      const { monitor } = getWorkspaceAndMonitor(ctx);
      const tabbedCon = createContainerNode(monitor, LAYOUT_TYPES.TABBED, {
        x: 0,
        y: 0,
        width: 800,
        height: 600,
      });
      const a = createWindowNode(ctx.tree, tabbedCon).nodeWindow;
      createWindowNode(ctx.tree, tabbedCon);
      PresentChrome.processNode(ctx.tree, tabbedCon);

      const deadBorder = new St.Bin();
      a._actor = { ...(a._actor || {}), border: deadBorder };
      markDisposed(deadBorder);

      expect(() => PresentChrome.processNode(ctx.tree, tabbedCon)).not.toThrow();
      expect(deadBorder._forgeStHits).toBe(0);
    });
  });
});
