import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  KEYBINDING_PRESET_KEYS,
  KITS,
  PRESETS,
  listKits,
  listPresets,
  getKit,
  getPreset,
  applyKit,
  applyPreset,
  applyBindings,
  bindingsFromSettings,
  bindingsEqual,
  matchKitId,
  isBareSuperLetterOrNumber,
  isBareSuperAccel,
  kitUsesBareSuper,
  isReservedKitName,
  sanitizeProfileName,
  buildProfileProps,
  liveProfileProps,
} from "../../../lib/shared/keybind-presets.js";
import { KEYBINDING_KEYS } from "../../../lib/shared/config-sync.js";
import {
  normalizeAccel,
  findInternalBindingConflicts,
  findExternalBindingConflicts,
  analyzeBindingConflicts,
  collectSchemaStrvBindings,
} from "../../../lib/shared/keybind-conflicts.js";

function createMockKbdSettings(initial = {}) {
  const store = { ...initial };
  return {
    get_strv: vi.fn((key) => store[key] ?? []),
    set_strv: vi.fn((key, value) => {
      store[key] = [...value];
    }),
    get_string: vi.fn((key) => store[key] ?? "None"),
    set_string: vi.fn((key, value) => {
      store[key] = value;
    }),
    _store: store,
  };
}

describe("keybind kits", () => {
  describe("listKits / getKit", () => {
    it("lists safe, vim, and i3", () => {
      const ids = listKits()
        .map((p) => p.id)
        .sort();
      expect(ids).toEqual(["i3", "safe", "vim"]);
    });

    it("marks safe as not recommended; vim and i3 recommended", () => {
      expect(getKit("safe").recommended).toBe(false);
      expect(getKit("vim").recommended).toBe(true);
      expect(getKit("i3").recommended).toBe(true);
    });

    it("aliases presets API", () => {
      expect(PRESETS).toBe(KITS);
      expect(
        listPresets()
          .map((p) => p.id)
          .sort()
      ).toEqual(["i3", "safe", "vim"]);
      expect(getPreset("vim")?.id).toBe("vim");
    });

    it("KEYBINDING_PRESET_KEYS matches config-sync KEYBINDING_KEYS", () => {
      expect([...KEYBINDING_PRESET_KEYS]).toEqual([...KEYBINDING_KEYS]);
    });
  });

  describe("isBareSuperAccel / letter-or-number", () => {
    it("detects bare Super letter/digit", () => {
      expect(isBareSuperLetterOrNumber("<Super>h")).toBe(true);
      expect(isBareSuperLetterOrNumber("<Meta>5")).toBe(true);
      expect(isBareSuperAccel("<Super>h")).toBe(true);
    });

    it("detects bare Super arrows and symbols", () => {
      expect(isBareSuperAccel("<Super>Left")).toBe(true);
      expect(isBareSuperAccel("<Super>equal")).toBe(true);
      expect(isBareSuperLetterOrNumber("<Super>Left")).toBe(false);
    });

    it("rejects multi-mod", () => {
      expect(isBareSuperAccel("<Ctrl><Super>c")).toBe(false);
      expect(isBareSuperAccel("<Shift><Super>x")).toBe(false);
      expect(isBareSuperAccel("")).toBe(false);
    });
  });

  describe("safe kit invariant", () => {
    it("only bare Super accel is Super+Delete lock", () => {
      const bare = [];
      for (const [key, accels] of Object.entries(KITS.safe.bindings)) {
        for (const accel of accels) {
          if (isBareSuperAccel(accel)) bare.push(`${key}: ${accel}`);
        }
      }
      expect(bare).toEqual(["prefs-lock-screen: <Super>Delete"]);
    });

    it("uses primary Ctrl+Super for focus arrows", () => {
      expect(KITS.safe.bindings["window-focus-left"]).toEqual(["<Ctrl><Super>Left"]);
      expect(KITS.safe.bindings["window-focus-right"]).toEqual(["<Ctrl><Super>Right"]);
    });

    it("uses secondary Ctrl+Shift+Super for move twins", () => {
      expect(KITS.safe.bindings["window-move-left"]).toEqual(["<Ctrl><Shift><Super>Left"]);
    });

    it("float uses Alt+Super+Enter (Safe)", () => {
      expect(KITS.safe.bindings["window-toggle-float"]).toEqual(["<Alt><Super>Return"]);
    });

    it("covers every KEYBINDING_KEYS entry", () => {
      for (const key of KEYBINDING_KEYS) {
        expect(KITS.safe.bindings).toHaveProperty(key);
        expect(Array.isArray(KITS.safe.bindings[key])).toBe(true);
      }
    });

    it("has no internal accelerator duplicates", () => {
      expect(findInternalBindingConflicts(KITS.safe.bindings)).toEqual([]);
    });
  });

  describe("shared low-frequency chords", () => {
    it("all kits lock with Super+Delete", () => {
      for (const id of ["safe", "vim", "i3"]) {
        expect(KITS[id].bindings["prefs-lock-screen"]).toEqual(["<Super>Delete"]);
      }
    });

    it("shared rare chords; float is Alt+Super+Enter on Safe/Vim", () => {
      for (const id of ["safe", "vim", "i3"]) {
        expect(KITS[id].bindings["focus-border-toggle"]).toEqual(["<Ctrl><Super>b"]);
        expect(KITS[id].bindings["prefs-tiling-toggle"]).toEqual(["<Ctrl><Super>e"]);
        expect(KITS[id].bindings["window-toggle-always-float"]).toEqual([
          "<Ctrl><Shift><Super>space",
        ]);
        expect(KITS[id].bindings["prefs-lock-screen"]).toEqual(["<Super>Delete"]);
      }
      expect(KITS.safe.bindings["window-toggle-float"]).toEqual(["<Alt><Super>Return"]);
      expect(KITS.vim.bindings["window-toggle-float"]).toEqual(["<Alt><Super>Return"]);
      expect(KITS.i3.bindings["window-toggle-float"]).toEqual(["<Shift><Super>space"]);
    });
  });

  describe("vim and i3 kits", () => {
    it("vim has Super+h on focus-left, Enter zoom, Super+Space run", () => {
      expect(KITS.vim.bindings["window-focus-left"]).toContain("<Super>h");
      expect(KITS.vim.bindings["window-toggle-float"]).toEqual(["<Alt><Super>Return"]);
      expect(KITS.vim.bindings["window-zoom-toggle"]).toEqual(["<Super>Return"]);
      expect(KITS.vim.bindings["window-zoom-horizontal"]).toEqual(["<Ctrl><Super>Return"]);
      expect(KITS.vim.bindings["window-zoom-vertical"]).toEqual(["<Shift><Super>Return"]);
      expect(KITS.vim.bindings["prefs-app-launch"]).toEqual(["<Super>space"]);
      expect(kitUsesBareSuper(KITS.vim)).toBe(true);
    });

    it("vim parent is Super+p; Ctrl+Super+h stays on window-swap-left (Join)", () => {
      expect(KITS.vim.bindings["window-focus-parent"]).toEqual(["<Super>p"]);
      expect(KITS.vim.bindings["window-focus-child"]).toEqual(["<Shift><Super>p"]);
      expect(KITS.vim.bindings["window-swap-left"]).toEqual(["<Ctrl><Super>h"]);
    });

    it("vim Mark 2 overlay uses Super+m/n, [ ] cycle, and Alt size", () => {
      expect(KITS.vim.bindings["con-split-layout-toggle"]).toEqual(["<Super>m"]);
      expect(KITS.vim.bindings["con-stack-tab-layout-toggle"]).toEqual(["<Super>n"]);
      expect(KITS.vim.bindings["con-layout-cycle-prev"]).toEqual(["<Super>bracketleft"]);
      expect(KITS.vim.bindings["con-layout-cycle-next"]).toEqual(["<Super>bracketright"]);
      expect(KITS.vim.bindings["window-ungroup"]).toEqual([
        "<Super>braceleft",
        "<Shift><Super>bracketleft",
      ]);
      expect(KITS.vim.bindings["size-nudge-x-minus"]).toEqual(["<Alt><Super>h"]);
      expect(KITS.vim.bindings["window-expand"]).toEqual([]);
      expect(KITS.vim.bindings["window-shrink"]).toEqual([]);
    });

    it("i3 has Super+hjkl focus, Enter zoom, Shift+Super+Space float", () => {
      expect(KITS.i3.bindings["window-focus-left"]).toContain("<Super>h");
      expect(KITS.i3.bindings["con-split-horizontal"]).toEqual(["<Super>b"]);
      expect(KITS.i3.bindings["con-split-vertical"]).toEqual(["<Super>v"]);
      expect(KITS.i3.bindings["window-toggle-float"]).toEqual(["<Shift><Super>space"]);
      expect(KITS.i3.bindings["window-zoom-toggle"]).toEqual(["<Super>Return"]);
      expect(KITS.i3.bindings["prefs-app-launch"]).toEqual(["<Super>space"]);
      expect(kitUsesBareSuper(KITS.i3)).toBe(true);
    });

    it("covers every KEYBINDING_KEYS entry", () => {
      for (const kitId of ["vim", "i3"]) {
        for (const key of KEYBINDING_KEYS) {
          expect(KITS[kitId].bindings, kitId).toHaveProperty(key);
        }
      }
    });

    it("has no internal duplicates", () => {
      expect(findInternalBindingConflicts(KITS.vim.bindings)).toEqual([]);
      expect(findInternalBindingConflicts(KITS.i3.bindings)).toEqual([]);
    });
  });

  describe("matchKitId / bindingsEqual", () => {
    it("matches each built-in kit snapshot", () => {
      for (const id of ["safe", "vim", "i3"]) {
        const kit = KITS[id];
        expect(
          matchKitId({
            modMaskMouseTile: kit.modMaskMouseTile,
            bindings: kit.bindings,
          })
        ).toBe(id);
      }
    });

    it("returns custom when any binding differs", () => {
      const bindings = { ...KITS.safe.bindings };
      bindings["window-focus-left"] = ["<Super>x"];
      expect(
        matchKitId({
          modMaskMouseTile: KITS.safe.modMaskMouseTile,
          bindings,
        })
      ).toBe("custom");
    });

    it("bindingsEqual is order-sensitive per key", () => {
      expect(bindingsEqual(KITS.vim.bindings, KITS.vim.bindings)).toBe(true);
      expect(bindingsEqual(KITS.vim.bindings, KITS.i3.bindings)).toBe(false);
    });
  });

  describe("applyKit / applyBindings", () => {
    let kbd;

    beforeEach(() => {
      kbd = createMockKbdSettings();
    });

    it("applyKit safe sets Ctrl+Super focus and Super+Delete lock", () => {
      expect(applyKit(kbd, "safe")).toBe(true);
      expect(kbd.set_string).toHaveBeenCalledWith("mod-mask-mouse-tile", "None");
      expect(kbd.set_strv).toHaveBeenCalledWith("window-focus-left", ["<Ctrl><Super>Left"]);
      expect(kbd.set_strv).toHaveBeenCalledWith("window-toggle-float", ["<Alt><Super>Return"]);
      expect(kbd.set_strv).toHaveBeenCalledWith("prefs-lock-screen", ["<Super>Delete"]);
      expect(kbd.set_strv).toHaveBeenCalledWith("focus-border-toggle", ["<Ctrl><Super>b"]);
      expect(kbd.set_strv).toHaveBeenCalledWith("prefs-tiling-toggle", ["<Ctrl><Super>e"]);
    });

    it("applyPreset alias still works for vim", () => {
      expect(applyPreset(kbd, "vim")).toBe(true);
      expect(kbd.set_strv).toHaveBeenCalledWith("window-focus-left", ["<Super>h", "<Super>Left"]);
      expect(kbd.set_strv).toHaveBeenCalledWith("window-toggle-float", ["<Alt><Super>Return"]);
      expect(kbd.set_strv).toHaveBeenCalledWith("window-zoom-toggle", ["<Super>Return"]);
      expect(kbd.set_strv).toHaveBeenCalledWith("prefs-app-launch", ["<Super>space"]);
      expect(kbd.set_strv).toHaveBeenCalledWith("prefs-lock-screen", ["<Super>Delete"]);
    });

    it("applyKit returns false for unknown id", () => {
      expect(applyKit(kbd, "missing")).toBe(false);
    });

    it("bindingsFromSettings snapshots store", () => {
      kbd = createMockKbdSettings({
        "window-focus-left": ["<Ctrl><Super>Left"],
        "mod-mask-mouse-tile": "Ctrl",
      });
      const snap = bindingsFromSettings(kbd);
      expect(snap.modMaskMouseTile).toBe("Ctrl");
      expect(snap.bindings["window-focus-left"]).toEqual(["<Ctrl><Super>Left"]);
    });
  });

  describe("sanitizeProfileName / buildProfileProps", () => {
    it("accepts simple stems", () => {
      expect(sanitizeProfileName("my-kit")).toBe("my-kit");
    });

    it("strips trailing .json", () => {
      expect(sanitizeProfileName("my-kit.json")).toBe("my-kit");
    });

    it("rejects pathy names", () => {
      expect(sanitizeProfileName("../evil")).toBeNull();
    });

    it("reserves built-in kit ids", () => {
      expect(isReservedKitName("vim")).toBe(true);
      expect(isReservedKitName("SAFE")).toBe(true);
      expect(isReservedKitName("i3.json")).toBe(true);
      expect(isReservedKitName("my-kit")).toBe(false);
    });

    it("buildProfileProps shape", () => {
      expect(
        buildProfileProps({
          modMaskMouseTile: "None",
          bindings: { "window-focus-left": ["<Ctrl><Super>Left"] },
          name: "desk",
        })
      ).toEqual({
        version: 1,
        "mod-mask-mouse-tile": "None",
        bindings: { "window-focus-left": ["<Ctrl><Super>Left"] },
        name: "desk",
      });
    });

    it("liveProfileProps matches buildProfileProps from a store snapshot", () => {
      const kbd = {
        get_strv: (key) => (key === "window-focus-left" ? ["<Super>h"] : []),
        get_string: () => "None",
      };
      const props = liveProfileProps(kbd, "desk");
      expect(props.version).toBe(1);
      expect(props.name).toBe("desk");
      expect(props["mod-mask-mouse-tile"]).toBe("None");
      expect(props.bindings["window-focus-left"]).toEqual(["<Super>h"]);
      expect(props).not.toHaveProperty("savedAt");
      expect(props).not.toHaveProperty("note");
    });
  });
});

describe("keybind-conflicts", () => {
  it("normalizeAccel unifies mod order and case", () => {
    expect(normalizeAccel("<Ctrl><Super>h")).toBe(normalizeAccel("<Super><Ctrl>H"));
    expect(normalizeAccel("<Control><Super>a")).toBe(normalizeAccel("<Ctrl><Super>a"));
  });

  it("finds internal duplicates", () => {
    const conflicts = findInternalBindingConflicts({
      a: ["<Ctrl><Super>h"],
      b: ["<Ctrl><Super>h"],
    });
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].forgeKey).toBe("a");
    expect(conflicts[0].otherId).toBe("b");
  });

  it("finds external gnome conflicts", () => {
    const conflicts = findExternalBindingConflicts({ "window-focus-left": ["<Super>Left"] }, [
      { accel: "<Super>Left", id: "move-to-workspace-left", label: "GNOME: move", source: "wm" },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].otherId).toBe("move-to-workspace-left");
  });

  it("analyzeBindingConflicts combines", () => {
    const report = analyzeBindingConflicts({ a: ["<Super>x"], b: ["<Super>x"] }, [
      { accel: "<Super>x", id: "close", label: "close", source: "wm" },
    ]);
    expect(report.internal.length).toBe(1);
    expect(report.external.length).toBe(2); // both a and b
    expect(report.all.length).toBe(3);
  });

  it("collectSchemaStrvBindings maps keys", () => {
    const entries = collectSchemaStrvBindings(
      "org.example",
      ["switch-windows"],
      (k) => (k === "switch-windows" ? ["<Alt>Tab"] : []),
      "wm"
    );
    expect(entries).toEqual([
      {
        accel: "<Alt>Tab",
        id: "switch-windows",
        label: "wm: switch-windows",
        source: "org.example",
      },
    ]);
  });
});
