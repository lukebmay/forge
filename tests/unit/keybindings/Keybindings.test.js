import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Keybindings } from "../../../lib/extension/keybindings.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GLib from "gi://GLib";

/**
 * Keybindings behavioral tests
 *
 * Tests for allowDragDropTile() which determines whether a window drag should
 * trigger tiling based on the configured modifier key and current modifier state.
 * Uses Clutter modifier bitmask values: Super=64, Alt=8, Ctrl=4, Shift=2, grabbed=256.
 */
describe("Keybindings", () => {
  let keybindings;
  let mockExt;

  beforeEach(() => {
    mockExt = {
      extWm: {
        command: vi.fn(),
        getPointer: vi.fn(() => [0, 0, 0]),
      },
      kbdSettings: {
        get_string: vi.fn(() => "Super"),
        get_strv: vi.fn(() => []),
      },
      settings: {
        get_uint: vi.fn(() => 10),
        get_string: vi.fn(() => ""),
        get_boolean: vi.fn(() => false),
      },
    };

    keybindings = new Keybindings(mockExt);
    Main.openRunDialog?.mockClear?.();
    GLib.spawn_command_line_async = vi.fn(() => true);
  });

  describe("buildBindingDefinitions()", () => {
    it("should define all expected keybinding keys", () => {
      const expectedKeys = [
        "window-toggle-float",
        "window-toggle-always-float",
        "window-focus-left",
        "window-focus-down",
        "window-focus-up",
        "window-focus-right",
        "window-swap-left",
        "window-swap-down",
        "window-swap-up",
        "window-swap-right",
        "window-move-left",
        "window-move-down",
        "window-move-up",
        "window-move-right",
        "con-split-layout-toggle",
        "con-split-vertical",
        "con-split-horizontal",
        "con-stacked-layout-toggle",
        "con-tabbed-layout-toggle",
        "con-stack-tab-layout-toggle",
        "con-layout-cycle-prev",
        "con-layout-cycle-next",
        "window-merge-group",
        "window-ungroup",
        "window-ungroup-recursive",
        "window-focus-parent",
        "window-focus-child",
        "window-move-in",
        "window-move-out",
        "con-tabbed-showtab-decoration-toggle",
        "focus-border-toggle",
        "prefs-tiling-toggle",
        "window-gap-size-increase",
        "window-gap-size-decrease",
        "workspace-active-tile-toggle",
        "window-reset-sizes",
        "prefs-open",
        "window-swap-last-active",
        "window-zoom-toggle",
        "window-zoom-horizontal",
        "window-zoom-vertical",
        "window-focus-next",
        "window-focus-prev",
        "window-swap-next",
        "window-swap-prev",
        "window-snap-one-third-right",
        "window-snap-two-third-right",
        "window-snap-one-third-left",
        "window-snap-two-third-left",
        "window-snap-center",
        "window-resize-top-increase",
        "window-resize-top-decrease",
        "window-resize-bottom-increase",
        "window-resize-bottom-decrease",
        "window-resize-left-increase",
        "window-resize-left-decrease",
        "window-resize-right-increase",
        "window-resize-right-decrease",
        "prefs-config-reload",
        "prefs-config-export",
        "window-pointer-to-focus",
        "window-expand",
        "window-shrink",
        "prefs-app-launch",
        "prefs-cheatsheet-toggle",
        "prefs-lock-screen",
        "layout-debug-overlay-toggle",
        "size-nudge-x-minus",
        "size-nudge-x-plus",
        "size-nudge-y-minus",
        "size-nudge-y-plus",
        "size-share",
        "size-share-siblings",
        "size-share-siblings-only",
        "size-share-self-siblings-parent",
        "size-share-parent",
        "size-share-parent-group",
        "size-share-parent-siblings-only",
        "size-share-both-groups",
        "size-share-all",
        "size-preset-7",
        "size-preset-8",
        "size-preset-9",
        "size-preset-0",
        // window-unfocus abandoned — no product keybind
      ];

      for (const key of expectedKeys) {
        expect(keybindings._bindings[key], `Missing binding: ${key}`).toBeDefined();
        expect(typeof keybindings._bindings[key]).toBe("function");
      }
    });

    it("should define bindings as callable functions", () => {
      for (const key of Object.keys(keybindings._bindings)) {
        expect(typeof keybindings._bindings[key]).toBe("function");
      }
    });
  });

  describe("command dispatch", () => {
    it("window-focus-left should dispatch focus.left", () => {
      keybindings._bindings["window-focus-left"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "focus.left" });
    });

    it("window-swap-right should dispatch join.right", () => {
      keybindings._bindings["window-swap-right"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "join.right" });
    });

    it("window-move-left should dispatch move.left", () => {
      keybindings._bindings["window-move-left"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "move.left" });
    });

    it("window-focus-parent should dispatch focus.parent", () => {
      keybindings._bindings["window-focus-parent"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "focus.parent" });
    });

    it("window-focus-child should dispatch focus.child", () => {
      keybindings._bindings["window-focus-child"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "focus.child" });
    });

    it("con-split-layout-toggle should dispatch toggleSplit", () => {
      keybindings._bindings["con-split-layout-toggle"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "toggleSplit" });
    });

    it("con-stack-tab-layout-toggle should dispatch toggleTabStack", () => {
      keybindings._bindings["con-stack-tab-layout-toggle"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "toggleTabStack" });
    });

    it("window-ungroup should dispatch promote", () => {
      keybindings._bindings["window-ungroup"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "promote" });
    });

    it("window-ungroup-recursive should dispatch promoteRecursive", () => {
      keybindings._bindings["window-ungroup-recursive"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "promoteRecursive" });
    });

    it("con-layout-cycle-next should dispatch layout.cycle+", () => {
      keybindings._bindings["con-layout-cycle-next"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "layout.cycle+" });
    });

    it("size-nudge-x-plus should dispatch size.nudge.x+", () => {
      keybindings._bindings["size-nudge-x-plus"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "size.nudge.x+" });
    });

    it("window-toggle-float should dispatch FloatToggle command", () => {
      keybindings._bindings["window-toggle-float"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith(
        expect.objectContaining({ name: "FloatToggle", mode: "float" })
      );
    });

    it("window-toggle-always-float should dispatch FloatClassToggle command", () => {
      keybindings._bindings["window-toggle-always-float"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith(
        expect.objectContaining({ name: "FloatClassToggle", mode: "float" })
      );
    });

    it("con-split-vertical should dispatch toggleSplit", () => {
      keybindings._bindings["con-split-vertical"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "toggleSplit" });
    });

    it("window-gap-size-increase should dispatch GapSize +1", () => {
      keybindings._bindings["window-gap-size-increase"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "GapSize", amount: 1 });
    });

    it("window-gap-size-decrease should dispatch GapSize -1", () => {
      keybindings._bindings["window-gap-size-decrease"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "GapSize", amount: -1 });
    });

    it("prefs-app-launch with empty command opens GNOME run dialog", () => {
      mockExt.settings.get_string.mockReturnValue("");
      keybindings.buildBindingDefinitions();
      keybindings._bindings["prefs-app-launch"]();
      expect(Main.openRunDialog).toHaveBeenCalled();
    });

    it("prefs-app-launch with a command spawns it", () => {
      mockExt.settings.get_string.mockReturnValue("ghostty");
      keybindings.buildBindingDefinitions();
      keybindings._bindings["prefs-app-launch"]();
      expect(GLib.spawn_command_line_async).toHaveBeenCalledWith("ghostty");
      expect(Main.openRunDialog).not.toHaveBeenCalled();
    });

    it("window-zoom keys dispatch Zoom commands", () => {
      keybindings._bindings["window-zoom-toggle"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "ZoomToggle" });
      mockExt.extWm.command.mockClear();
      keybindings._bindings["window-zoom-horizontal"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "ZoomHorizontal" });
      mockExt.extWm.command.mockClear();
      keybindings._bindings["window-zoom-vertical"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "ZoomVertical" });
    });

    it("window-unfocus is not a product keybind (abandoned)", () => {
      expect(keybindings._bindings["window-unfocus"]).toBeUndefined();
    });

    it("window-resize-top-increase should use resize-amount from settings", () => {
      mockExt.settings.get_uint.mockReturnValue(25);
      keybindings.buildBindingDefinitions();
      keybindings._bindings["window-resize-top-increase"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "WindowResizeTop", amount: 25 });
    });

    it("window-resize-top-decrease should negate resize-amount", () => {
      mockExt.settings.get_uint.mockReturnValue(25);
      keybindings.buildBindingDefinitions();
      keybindings._bindings["window-resize-top-decrease"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "WindowResizeTop", amount: -25 });
    });
  });

  describe("enable()", () => {
    it("should call addKeybinding for each binding", () => {
      const addKeybinding = vi.fn();

      Main.wm.addKeybinding = addKeybinding;

      keybindings.enable();

      const bindingCount = Object.keys(keybindings._bindings).length;
      expect(addKeybinding).toHaveBeenCalledTimes(bindingCount);
    });

    it("should pass kbdSettings to addKeybinding", () => {
      const addKeybinding = vi.fn();

      Main.wm.addKeybinding = addKeybinding;

      keybindings.enable();

      // Check the second argument of each call is kbdSettings
      for (const call of addKeybinding.mock.calls) {
        expect(call[1]).toBe(mockExt.kbdSettings);
      }
    });
  });

  describe("disable()", () => {
    it("should call removeKeybinding for each binding", () => {
      const removeKeybinding = vi.fn();

      Main.wm.addKeybinding = vi.fn();
      Main.wm.removeKeybinding = removeKeybinding;

      keybindings.enable();
      keybindings.disable();

      const bindingCount = Object.keys(keybindings._bindings).length;
      expect(removeKeybinding).toHaveBeenCalledTimes(bindingCount);
    });

    it("should remove all binding keys by name", () => {
      const removedKeys = [];

      Main.wm.addKeybinding = vi.fn();
      Main.wm.removeKeybinding = (key) => removedKeys.push(key);

      keybindings.enable();
      keybindings.disable();

      for (const key of Object.keys(keybindings._bindings)) {
        expect(removedKeys).toContain(key);
      }
    });

    it("should hide cheatsheet if visible", () => {
      const hideFn = vi.fn();
      keybindings.cheatsheet = { visible: true, hide: hideFn };

      Main.wm.removeKeybinding = vi.fn();

      keybindings.disable();

      expect(hideFn).toHaveBeenCalled();
    });

    it("should not hide cheatsheet if not visible", () => {
      const hideFn = vi.fn();
      keybindings.cheatsheet = { visible: false, hide: hideFn };

      Main.wm.removeKeybinding = vi.fn();

      keybindings.disable();

      expect(hideFn).not.toHaveBeenCalled();
    });

    it("should not throw if cheatsheet is null", () => {
      keybindings.cheatsheet = null;

      Main.wm.removeKeybinding = vi.fn();

      expect(() => keybindings.disable()).not.toThrow();
    });
  });

  describe("allowDragDropTile()", () => {
    describe("Super modifier", () => {
      beforeEach(() => {
        mockExt.kbdSettings.get_string.mockReturnValue("Super");
      });

      it("should allow tiling when Super is held (state=64)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 64]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should allow tiling when Super+grabbed (state=320)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 320]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should not allow tiling with no modifier (state=0)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 0]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });

      it("should not allow tiling when Alt is held instead (state=8)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 8]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });

      it("should not allow tiling when Ctrl is held instead (state=4)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 4]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });
    });

    describe("Alt modifier", () => {
      beforeEach(() => {
        mockExt.kbdSettings.get_string.mockReturnValue("Alt");
      });

      it("should allow tiling when Alt is held (state=8)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 8]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should allow tiling when Alt+grabbed (state=264)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 264]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should not allow tiling with no modifier (state=0)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 0]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });

      it("should not allow tiling when Super is held instead (state=64)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 64]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });

      it("should not allow tiling when Ctrl is held instead (state=4)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 4]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });
    });

    describe("Ctrl modifier", () => {
      beforeEach(() => {
        mockExt.kbdSettings.get_string.mockReturnValue("Ctrl");
      });

      it("should allow tiling when Ctrl is held (state=4)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 4]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should allow tiling when Ctrl+grabbed (state=260)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 260]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should not allow tiling with no modifier (state=0)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 0]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });

      it("should not allow tiling when Super is held instead (state=64)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 64]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });

      it("should not allow tiling when Alt is held instead (state=8)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 8]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });
    });

    describe("None modifier", () => {
      beforeEach(() => {
        mockExt.kbdSettings.get_string.mockReturnValue("None");
      });

      it("should always allow tiling regardless of state (state=0)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 0]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should always allow tiling regardless of state (state=64)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 64]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should always allow tiling regardless of state (state=256)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 256]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });
    });

    describe("Shift modifier", () => {
      beforeEach(() => {
        mockExt.kbdSettings.get_string.mockReturnValue("Shift");
      });

      it("should allow tiling when Shift is held (state=2)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 2]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should allow tiling when Shift is held while grabbed (state=258)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 258]);
        expect(keybindings.allowDragDropTile()).toBe(true);
      });

      it("should not allow tiling with no modifier (state=0)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 0]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });

      it("should not allow tiling with the wrong modifier (state=64 Super)", () => {
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 64]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });
    });

    describe("unknown modifier value", () => {
      it("should not allow tiling for an unknown modifier string", () => {
        mockExt.kbdSettings.get_string.mockReturnValue("Hyper");
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 64]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });

      it("should not allow tiling for empty modifier string", () => {
        mockExt.kbdSettings.get_string.mockReturnValue("");
        mockExt.extWm.getPointer.mockReturnValue([0, 0, 0]);
        expect(keybindings.allowDragDropTile()).toBe(false);
      });
    });
  });

  describe("_directionalBindings()", () => {
    it("should generate 4 bindings for each direction", () => {
      const bindings = keybindings._directionalBindings("Focus", "window-focus");
      expect(Object.keys(bindings)).toEqual([
        "window-focus-left",
        "window-focus-down",
        "window-focus-up",
        "window-focus-right",
      ]);
    });

    it("should dispatch dotted join ids", () => {
      const bindings = keybindings._directionalBindings("join", "window-swap");
      bindings["window-swap-up"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "join.up" });
    });

    it("should dispatch all four move directions as dotted ids", () => {
      const bindings = keybindings._directionalBindings("move", "window-move");
      const expected = [
        ["window-move-left", "move.left"],
        ["window-move-down", "move.down"],
        ["window-move-up", "move.up"],
        ["window-move-right", "move.right"],
      ];
      for (const [key, name] of expected) {
        mockExt.extWm.command.mockClear();
        bindings[key]();
        expect(mockExt.extWm.command).toHaveBeenCalledWith({ name });
      }
    });
  });

  describe("_simpleCommandBindings()", () => {
    it("should generate bindings from key-action map", () => {
      const bindings = keybindings._simpleCommandBindings({
        "my-key": { name: "TestCmd" },
        "other-key": { name: "OtherCmd", extra: 42 },
      });
      expect(Object.keys(bindings)).toEqual(["my-key", "other-key"]);
    });

    it("should dispatch the exact action object", () => {
      const bindings = keybindings._simpleCommandBindings({
        "my-key": { name: "TestCmd", extra: 42 },
      });
      bindings["my-key"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "TestCmd", extra: 42 });
    });
  });

  describe("_resizeBindings()", () => {
    it("should generate 8 bindings (4 directions x increase/decrease)", () => {
      const bindings = keybindings._resizeBindings();
      const keys = Object.keys(bindings);
      expect(keys).toHaveLength(8);
      expect(keys).toContain("window-resize-top-increase");
      expect(keys).toContain("window-resize-top-decrease");
      expect(keys).toContain("window-resize-bottom-increase");
      expect(keys).toContain("window-resize-bottom-decrease");
      expect(keys).toContain("window-resize-left-increase");
      expect(keys).toContain("window-resize-left-decrease");
      expect(keys).toContain("window-resize-right-increase");
      expect(keys).toContain("window-resize-right-decrease");
    });

    it("should read resize-amount at invocation time (increase)", () => {
      mockExt.settings.get_uint.mockReturnValue(15);
      const bindings = keybindings._resizeBindings();
      bindings["window-resize-left-increase"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({
        name: "WindowResizeLeft",
        amount: 15,
      });
    });

    it("should negate resize-amount for decrease", () => {
      mockExt.settings.get_uint.mockReturnValue(20);
      const bindings = keybindings._resizeBindings();
      bindings["window-resize-right-decrease"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({
        name: "WindowResizeRight",
        amount: -20,
      });
    });

    it("should use current settings value each invocation", () => {
      const bindings = keybindings._resizeBindings();
      mockExt.settings.get_uint.mockReturnValue(5);
      bindings["window-resize-top-increase"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "WindowResizeTop", amount: 5 });

      mockExt.extWm.command.mockClear();
      mockExt.settings.get_uint.mockReturnValue(30);
      bindings["window-resize-top-increase"]();
      expect(mockExt.extWm.command).toHaveBeenCalledWith({ name: "WindowResizeTop", amount: 30 });
    });
  });
});
