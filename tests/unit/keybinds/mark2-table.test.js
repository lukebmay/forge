import { describe, expect, it } from "vitest";
import { ACTIONS, ACTION_SET } from "../../../lib/keybinds/actions.js";
import { MARK2_TABLE } from "../../../lib/keybinds/mark2.js";
import { PROTO_OVERLAY } from "../../../lib/keybinds/proto-overlay.js";
import { asAccels, stripSuper, stripSuperTable } from "../../../lib/keybinds/strip-super.js";
import { defaultVimMinusSuper } from "../../../prototypes/container-motion/src/keybinds.mjs";
import { KITS } from "../../../lib/shared/keybind-presets.js";

function sortedChords(arr) {
  return [...arr].map((c) => String(c).toLowerCase()).sort();
}

describe("stripSuper", () => {
  it("drops Super/Meta and keeps Ctrl/Shift/Alt/key", () => {
    expect(stripSuper("<Super>h")).toBe("h");
    expect(stripSuper("<Shift><Super>h")).toBe("Shift+h");
    expect(stripSuper("<Ctrl><Super>h")).toBe("Ctrl+h");
    expect(stripSuper("<Alt><Super>Return")).toBe("Alt+Return");
    expect(stripSuper("<Ctrl><Shift><Super>h")).toBe("Ctrl+Shift+h");
    expect(stripSuper("<Meta>h")).toBe("h");
    expect(stripSuper("<Control><Super>h")).toBe("Ctrl+h");
  });

  it("maps GNOME arrows to proto Arrow* and keeps Return", () => {
    expect(stripSuper("<Super>Left")).toBe("ArrowLeft");
    expect(stripSuper("<Super>Right")).toBe("ArrowRight");
    expect(stripSuper("<Super>Up")).toBe("ArrowUp");
    expect(stripSuper("<Super>Down")).toBe("ArrowDown");
    expect(stripSuper("<Shift><Super>Left")).toBe("Shift+ArrowLeft");
    expect(stripSuper("<Super>Return")).toBe("Return");
  });

  it("folds Shift+bracket/semicolon like proto eventToChord", () => {
    expect(stripSuper("<Shift><Super>bracketleft")).toBe("{");
    expect(stripSuper("<Shift><Super>bracketright")).toBe("}");
    expect(stripSuper("<Shift><Super>semicolon")).toBe(":");
    expect(stripSuper("<Super>semicolon")).toBe(";");
  });
});

describe("MARK2_TABLE", () => {
  it("gives every table id at least one accel", () => {
    for (const [id, accels] of Object.entries(MARK2_TABLE)) {
      const list = asAccels(accels);
      expect(list.length, id).toBeGreaterThan(0);
      for (const accel of list) {
        expect(stripSuper(accel).length, `${id} ${accel}`).toBeGreaterThan(0);
      }
    }
  });

  it("uses shared action ids", () => {
    expect(ACTIONS.length).toBeGreaterThan(0);
    for (const id of Object.keys(MARK2_TABLE)) {
      expect(ACTION_SET.has(id), id).toBe(true);
    }
  });

  it("maps join.left to Ctrl+Super+h", () => {
    expect(asAccels(MARK2_TABLE["join.left"])).toEqual(["<Ctrl><Super>h"]);
  });

  it("vim kit chords match MARK2_TABLE for focus/move/join/parent/child", () => {
    const vim = KITS.vim.bindings;
    const keys = {
      "focus.left": "window-focus-left",
      "focus.down": "window-focus-down",
      "focus.up": "window-focus-up",
      "focus.right": "window-focus-right",
      "focus.parent": "window-focus-parent",
      "focus.child": "window-focus-child",
      "move.left": "window-move-left",
      "move.down": "window-move-down",
      "move.up": "window-move-up",
      "move.right": "window-move-right",
      "join.left": "window-swap-left",
      "join.down": "window-swap-down",
      "join.up": "window-swap-up",
      "join.right": "window-swap-right",
    };
    for (const [id, key] of Object.entries(keys)) {
      expect(vim[key], id).toEqual(asAccels(MARK2_TABLE[id]));
    }
  });

  it("puts proto right-hand reach on the table", () => {
    expect(asAccels(MARK2_TABLE["focus.parent"])).toEqual(["<Super>p"]);
    expect(asAccels(MARK2_TABLE["focus.child"])).toEqual(["<Shift><Super>p"]);
    expect(asAccels(MARK2_TABLE.toggleSplit)).toEqual(["<Super>m"]);
    expect(asAccels(MARK2_TABLE.toggleTabStack)).toEqual(["<Super>n"]);
    expect(asAccels(MARK2_TABLE["layout.cycle-"])).toEqual(["<Super>bracketleft"]);
    expect(asAccels(MARK2_TABLE["size.nudge.x-"])).toEqual(["<Alt><Super>h"]);
    expect(asAccels(MARK2_TABLE["size.share"])).toEqual(["<Alt><Super>y"]);
    expect(asAccels(MARK2_TABLE["size.shareParent"])).toEqual(["<Alt><Super>n"]);
    expect(asAccels(MARK2_TABLE["size.preset.7"])).toEqual(["<Alt><Super>7"]);
  });
});

describe("proto ≡ stripSuper(Forge Mark 2 table)", () => {
  it("matches generated shared-id chords to stripSuper(table)", () => {
    const binds = defaultVimMinusSuper();
    const stripped = stripSuperTable(MARK2_TABLE);
    for (const [id, want] of Object.entries(stripped)) {
      const got = binds.filter((b) => b.action === id).map((b) => b.chord);
      expect(sortedChords([...new Set(got)]), id).toEqual(sortedChords([...new Set(want)]));
    }
  });

  it("keeps overlay a/q off the core table", () => {
    const core = new Set(
      Object.values(MARK2_TABLE)
        .flatMap((v) => asAccels(v))
        .map((a) => stripSuper(a).toLowerCase())
    );
    expect(core.has("a")).toBe(false);
    expect(core.has("q")).toBe(false);
    const overlayChords = new Set(PROTO_OVERLAY.map((b) => b.chord.toLowerCase()));
    expect(overlayChords.has("a")).toBe(true);
    expect(overlayChords.has("q")).toBe(true);
    expect(overlayChords.has("y")).toBe(false);
    expect(overlayChords.has("p")).toBe(false);
  });
});
