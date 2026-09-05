import { describe, it, expect } from "vitest";
import {
  CHEATSHEET_CATEGORY_DEFS,
  OVERLAY_MONITOR_FRACTION,
  TALL_ASPECT_MAX,
  ULTRAWIDE_ASPECT_MIN,
  WINDOW_TOGGLE_FLOAT_KEY,
  overlayLayoutForMonitor,
  clampOverlaySize,
  overlayPosition,
  groupCheatsheetBindings,
  splitGroupsIntoColumns,
  initialSectionExpanded,
  toggleSectionExpanded,
  formatCheatsheetShortcut,
} from "../../../lib/shared/cheatsheet-layout.js";

describe("overlayLayoutForMonitor", () => {
  it("caps size to 90% of the AABB", () => {
    const layout = overlayLayoutForMonitor({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(layout.maxWidth).toBe(Math.floor(1920 * OVERLAY_MONITOR_FRACTION));
    expect(layout.maxHeight).toBe(Math.floor(1080 * OVERLAY_MONITOR_FRACTION));
    expect(layout.columns).toBe(2);
  });

  it("uses one column on a tall / portrait head", () => {
    const layout = overlayLayoutForMonitor({ width: 1080, height: 1920 });
    expect(layout.aspect).toBeLessThan(TALL_ASPECT_MAX);
    expect(layout.columns).toBe(1);
    expect(layout.maxWidth).toBe(Math.floor(1080 * OVERLAY_MONITOR_FRACTION));
    expect(layout.maxHeight).toBe(Math.floor(1920 * OVERLAY_MONITOR_FRACTION));
  });

  it("uses three columns on ultrawide", () => {
    const layout = overlayLayoutForMonitor({ width: 3440, height: 1440 });
    expect(layout.aspect).toBeGreaterThanOrEqual(ULTRAWIDE_ASPECT_MIN);
    expect(layout.columns).toBe(3);
  });

  it("treats missing AABB as empty max size", () => {
    const layout = overlayLayoutForMonitor(null);
    expect(layout.maxWidth).toBe(0);
    expect(layout.maxHeight).toBe(0);
    expect(layout.columns).toBe(2);
  });
});

describe("clampOverlaySize / overlayPosition", () => {
  it("keeps a sheet that already fits", () => {
    expect(
      clampOverlaySize({ width: 400, height: 300 }, { maxWidth: 1728, maxHeight: 972 })
    ).toEqual({ width: 400, height: 300 });
  });

  it("clamps each axis independently", () => {
    expect(
      clampOverlaySize({ width: 5000, height: 200 }, { maxWidth: 900, maxHeight: 720 })
    ).toEqual({ width: 900, height: 200 });
  });

  it("centers the clamped size in the AABB", () => {
    expect(
      overlayPosition({ x: 100, y: 50, width: 1000, height: 800 }, { width: 900, height: 720 })
    ).toEqual({ x: 150, y: 90 });
  });
});

describe("groupCheatsheetBindings", () => {
  const cats = CHEATSHEET_CATEGORY_DEFS;

  it("puts window-toggle-float under Window Toggle when bound", () => {
    const groups = groupCheatsheetBindings(
      [
        {
          key: WINDOW_TOGGLE_FLOAT_KEY,
          type: "as",
          shortcuts: ["<Alt><Super>Return"],
          summary: "Toggle float",
        },
      ],
      cats
    );
    const winToggle = groups.find(([name]) => name === "Window Toggle");
    expect(winToggle).toBeTruthy();
    expect(winToggle[1]).toEqual([
      {
        key: WINDOW_TOGGLE_FLOAT_KEY,
        shortcut: "Alt+Super+Return",
        description: "Toggle float",
      },
    ]);
  });

  it("keeps i3 float chord in the same group", () => {
    const groups = groupCheatsheetBindings(
      [
        {
          key: WINDOW_TOGGLE_FLOAT_KEY,
          type: "as",
          shortcuts: ["<Shift><Super>space"],
          summary: "Toggle float",
        },
      ],
      cats
    );
    expect(groups[0][1][0].shortcut).toBe("Shift+Super+space");
  });

  it("omits window-toggle-float when unbound", () => {
    const groups = groupCheatsheetBindings(
      [{ key: WINDOW_TOGGLE_FLOAT_KEY, type: "as", shortcuts: [], summary: "Toggle float" }],
      cats
    );
    expect(groups).toEqual([]);
  });

  it("skips non-as keys", () => {
    const groups = groupCheatsheetBindings(
      [
        { key: "mod-mask-mouse-tile", type: "s", shortcuts: ["x"], summary: "nope" },
        {
          key: "window-focus-left",
          type: "as",
          shortcuts: ["<Super>h"],
          summary: "Focus window left",
        },
      ],
      cats
    );
    expect(groups).toEqual([
      [
        "Focus",
        [{ key: "window-focus-left", shortcut: "Super+h", description: "Focus window left" }],
      ],
    ]);
  });

  it("does not let Join regex steal window-toggle-*", () => {
    const groups = groupCheatsheetBindings(
      [
        {
          key: "window-swap-left",
          type: "as",
          shortcuts: ["<Super>j"],
          summary: "Join left",
        },
        {
          key: WINDOW_TOGGLE_FLOAT_KEY,
          type: "as",
          shortcuts: ["<Alt><Super>Return"],
          summary: "Toggle float",
        },
      ],
      cats
    );
    expect(groups.map(([name]) => name)).toEqual(["Join", "Window Toggle"]);
  });
});

describe("splitGroupsIntoColumns", () => {
  it("puts every group in one column when tall", () => {
    const groups = [
      ["A", [1, 2]],
      ["B", [3]],
    ];
    expect(splitGroupsIntoColumns(groups, 1)).toEqual([
      [
        ["A", [1, 2]],
        ["B", [3]],
      ],
    ]);
  });

  it("balances two columns by header + row count", () => {
    const groups = [
      ["A", [1, 2, 3]],
      ["B", [4]],
      ["C", [5]],
    ];
    const cols = splitGroupsIntoColumns(groups, 2);
    expect(cols).toHaveLength(2);
    expect(cols[0].map(([n]) => n)).toEqual(["A"]);
    expect(cols[1].map(([n]) => n)).toEqual(["B", "C"]);
  });
});

describe("section collapse", () => {
  it("defaults to all expanded", () => {
    const state = initialSectionExpanded(["Focus", "Join", "Window Toggle"]);
    expect([...state.values()]).toEqual([true, true, true]);
  });

  it("can expand only the first N", () => {
    const state = initialSectionExpanded(["A", "B", "C"], { firstN: 2 });
    expect(state.get("A")).toBe(true);
    expect(state.get("B")).toBe(true);
    expect(state.get("C")).toBe(false);
  });

  it("toggles one section without mutating the input map", () => {
    const start = initialSectionExpanded(["A", "B"]);
    const next = toggleSectionExpanded(start, "A");
    expect(start.get("A")).toBe(true);
    expect(next.get("A")).toBe(false);
    expect(next.get("B")).toBe(true);
  });
});

describe("formatCheatsheetShortcut", () => {
  it("renders Return chords used by float toggle", () => {
    expect(formatCheatsheetShortcut("<Alt><Super>Return")).toBe("Alt+Super+Return");
  });
});
