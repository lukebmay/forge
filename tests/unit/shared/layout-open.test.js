/**
 * AL6: launch fields, Ghostty rewrite, chrome-family serialize, map-pin (D034).
 */
import { describe, it, expect } from "vitest";
import {
  GHOSTTY_MULTI_INSTANCE_FLAG,
  assignOpenRolePins,
  chromeSerialWaitPins,
  desktopLaunchTryIds,
  ghosttyMultiInstanceArgv,
  isGhosttyLaunchTarget,
  isPathLikeLaunchApp,
  openActionIsChromeFamily,
  openActionToLaunchFields,
  pendingPinsWithoutTitle,
  pickDesktopSearchResult,
  pinEntryFromOpenAction,
  placeNextHasDest,
  placeNextOptionsFromLaunchFields,
  rewriteGhosttyLaunchApp,
  waitForOpenRolePins,
  windowHasMapId,
  windowMatchesPinTitle,
} from "../../../lib/shared/layout-open.js";
import { classEq, isChromeFamilyClass } from "../../../lib/shared/layout-plan.js";

describe("DesktopAppInfo search pick (YouTube vs YouTube TV)", () => {
  const youtube = "chrome-agimnkijcaahngcdmfeangaknmldooml-Default.desktop";
  const youtubeTv = "chrome-nlmaamaoahjiilibgbafebhafkeccjac-Default.desktop";
  const names = {
    [youtube]: "YouTube",
    [youtubeTv]: "YouTube TV",
  };

  it("prefers exact Name over substring (YouTube not YouTube TV)", () => {
    // Host search returns both in one relevance group; first can be either.
    const groups = [[youtubeTv, youtube]];
    expect(pickDesktopSearchResult("YouTube", groups, names)).toBe(youtube);
    expect(pickDesktopSearchResult("YouTube TV", groups, names)).toBe(youtubeTv);
  });

  it("falls back to first hit when names unknown", () => {
    expect(pickDesktopSearchResult("YouTube", [[youtubeTv, youtube]], {})).toBe(youtubeTv);
  });
});

describe("ApplyLayout spawn resolution (multi-word desktop Names)", () => {
  it("does not treat multi-word desktop Names as path/argv", () => {
    expect(isPathLikeLaunchApp("Google Voice")).toBe(false);
    expect(isPathLikeLaunchApp("Grok")).toBe(false);
    expect(isPathLikeLaunchApp("ghostty --gtk-single-instance=false")).toBe(false);
    expect(isPathLikeLaunchApp("/usr/bin/ghostty")).toBe(true);
    expect(isPathLikeLaunchApp("./local-tool")).toBe(true);
    expect(isPathLikeLaunchApp("")).toBe(false);
  });

  it("prefers chrome PWA desktop id from class for Google Voice", () => {
    const ids = desktopLaunchTryIds("Google Voice", {
      wm_class: "chrome-bojjonegeadjcbekpnkhoalecdkdohbo-Default",
    });
    expect(ids[0]).toBe("chrome-bojjonegeadjcbekpnkhoalecdkdohbo-Default.desktop");
    expect(ids).toContain("Google Voice.desktop");
    expect(ids).toContain("Google Voice");
  });

  it("maps multi-word app field without shell-splitting in launch fields", () => {
    const fields = openActionToLaunchFields({
      op: "open",
      role: "Google-Voice",
      slot: "mon1.tab",
      open: {
        app: "Google Voice",
        wmClass: "chrome-bojjonegeadjcbekpnkhoalecdkdohbo-Default",
      },
      match: {
        class: "chrome-bojjonegeadjcbekpnkhoalecdkdohbo-Default",
        "title~=": "Voice",
      },
    });
    expect(fields.app).toBe("Google Voice");
    expect(fields.wm_class).toBe("chrome-bojjonegeadjcbekpnkhoalecdkdohbo-Default");
    // Spawn must keep the full Name string for DesktopAppInfo.search — not "Google".
    expect(fields.app.split(/\s+/)[0]).not.toBe(fields.app);
  });
});

describe("ghostty multi-instance rewrite", () => {
  it("detects ghostty launch targets", () => {
    expect(isGhosttyLaunchTarget("ghostty")).toBe(true);
    expect(isGhosttyLaunchTarget("Ghostty")).toBe(true);
    expect(isGhosttyLaunchTarget("com.mitchellh.ghostty")).toBe(true);
    expect(isGhosttyLaunchTarget("com.mitchellh.ghostty.desktop")).toBe(true);
    expect(
      isGhosttyLaunchTarget("ghostty", "/usr/share/applications/com.mitchellh.ghostty.desktop")
    ).toBe(true);
    expect(isGhosttyLaunchTarget("ghostty --gtk-single-instance=false")).toBe(true);
    expect(isGhosttyLaunchTarget("/usr/bin/ghostty")).toBe(true);
    expect(isGhosttyLaunchTarget("firefox")).toBe(false);
    expect(isGhosttyLaunchTarget("google-chrome")).toBe(false);
    expect(isGhosttyLaunchTarget("")).toBe(false);
  });

  it("builds multi-instance argv and drops stock single-instance flag", () => {
    expect(ghosttyMultiInstanceArgv("ghostty")).toEqual(["ghostty", GHOSTTY_MULTI_INSTANCE_FLAG]);
    const argv2 = ghosttyMultiInstanceArgv("ghostty --gtk-single-instance=true --foo=1");
    expect(argv2[0]).toBe("ghostty");
    expect(argv2[1]).toBe(GHOSTTY_MULTI_INSTANCE_FLAG);
    expect(argv2).toContain("--foo=1");
    expect(argv2).not.toContain("--gtk-single-instance=true");
    expect(
      ghosttyMultiInstanceArgv("com.mitchellh.ghostty", { exePath: "/usr/bin/ghostty" })
    ).toEqual(["/usr/bin/ghostty", GHOSTTY_MULTI_INSTANCE_FLAG]);
  });

  it("rewrites app string only for ghostty", () => {
    expect(rewriteGhosttyLaunchApp("ghostty")).toBe(`ghostty ${GHOSTTY_MULTI_INSTANCE_FLAG}`);
    expect(rewriteGhosttyLaunchApp("firefox")).toBe("firefox");
  });
});

describe("openActionToLaunchFields", () => {
  it("maps grok open + slot monitor/tree", () => {
    const fields = openActionToLaunchFields({
      op: "open",
      role: "grok",
      slot: "mon1.comms",
      open: { app: "Grok", wmClass: "Google-chrome", timeout: 25000 },
    });
    expect(fields.app).toBe("Grok");
    expect(fields.wm_class).toBe("Google-chrome");
    expect(fields.timeout).toBe(25000);
    expect(fields.monitor).toBe(1);
    expect(fields.tree_path).toBe("mo1ws0");
  });

  it("uses action workspace on tree path; param workspace when unstamped", () => {
    expect(
      openActionToLaunchFields({
        op: "open",
        role: "term",
        open: { app: "ghostty" },
        slot: "mon1.term",
        workspace: 1,
      }).tree_path
    ).toBe("mo1ws1");
    expect(
      openActionToLaunchFields(
        {
          op: "open",
          role: "term",
          open: { app: "ghostty" },
          slot: "mon0.term",
        },
        { workspace: 2 }
      ).tree_path
    ).toBe("mo0ws2");
  });

  it("respects explicit treePath and rewrites ghostty", () => {
    const fields = openActionToLaunchFields({
      op: "open",
      slot: "mon0.term",
      open: { app: "ghostty", treePath: "mo0ws0/1" },
    });
    expect(fields.tree_path).toBe("mo0ws0/1");
    expect(fields.monitor).toBe(0);
    expect(fields.app.split(/\s+/)).toContain(GHOSTTY_MULTI_INSTANCE_FLAG);
    expect(fields.app.startsWith("ghostty")).toBe(true);
  });

  it("rewrites desktop-id ghostty to PATH argv", () => {
    const fields = openActionToLaunchFields({
      op: "open",
      role: "ghostty-2",
      slot: "mon1.ghostty-2",
      open: { app: "com.mitchellh.ghostty", wmClass: "com.mitchellh.ghostty" },
    });
    expect(fields.monitor).toBe(1);
    expect(fields.wm_class).toBe("com.mitchellh.ghostty");
    const parts = fields.app.split(/\s+/);
    expect(parts[0]).toBe("ghostty");
    expect(parts[1]).toBe(GHOSTTY_MULTI_INSTANCE_FLAG);
    expect(fields.app).not.toContain("--gtk-single-instance=true");
  });

  it("copies title identity and attach selector", () => {
    const fields = openActionToLaunchFields({
      op: "open",
      slot: "mon0",
      destWindowId: 42,
      match: { "title~=": "Grok", title: "Grok" },
      open: { app: "Grok", wmClass: "Google-chrome" },
    });
    expect(fields.title_contains).toBe("Grok");
    expect(fields.title_exact).toBe("Grok");
    expect(fields.attach_selector).toBe("id:42");
    const place = placeNextOptionsFromLaunchFields(fields);
    expect(placeNextHasDest(place)).toBe(true);
    expect(place.titleContains).toBe("Grok");
    expect(place.attachSelector).toBe("id:42");
  });
});

describe("chrome-family serialize (D034)", () => {
  it("classifies chrome / PWA opens, not ghostty", () => {
    expect(isChromeFamilyClass("Google-chrome")).toBe(true);
    expect(isChromeFamilyClass("chrome-abc-Default")).toBe(true);
    expect(isChromeFamilyClass("ghostty")).toBe(false);
    expect(
      openActionIsChromeFamily({
        open: { app: "Grok", wmClass: "Google-chrome" },
        match: { "title~=": "Grok" },
      })
    ).toBe(true);
    expect(
      openActionIsChromeFamily({ open: { app: "YouTube", wmClass: "chrome-abc-Default" } })
    ).toBe(true);
    expect(openActionIsChromeFamily({ open: { app: "ghostty", wmClass: "ghostty" } })).toBe(false);
    expect(openActionIsChromeFamily({ open: { app: "nautilus" } })).toBe(false);
  });

  it("waits unpinned chrome roles before the next chrome spawn", () => {
    const chromeRoles = new Set(["chrome-luke"]);
    const pending = [{ role: "chrome-luke", wait_classes: ["Google-chrome"] }];
    const wait = chromeSerialWaitPins(
      { open: { app: "Grok", wmClass: "Google-chrome" }, role: "grok" },
      chromeRoles,
      pending,
      {}
    );
    expect(wait.map((p) => p.role)).toEqual(["chrome-luke"]);
    expect(
      chromeSerialWaitPins(
        { open: { app: "Grok", wmClass: "Google-chrome" }, role: "grok" },
        chromeRoles,
        pending,
        { "chrome-luke": 101 }
      )
    ).toEqual([]);
    expect(
      chromeSerialWaitPins(
        { open: { app: "ghostty", wmClass: "ghostty" }, role: "term" },
        chromeRoles,
        pending,
        {}
      )
    ).toEqual([]);
  });
});

describe("assignOpenRolePins / title then class leftover (D034)", () => {
  it("windowHasMapId ignores empty ids", () => {
    expect(windowHasMapId({ windowId: 1, mode: "FLOAT" })).toBe(true);
    expect(windowHasMapId({ windowId: "42" })).toBe(true);
    expect(windowHasMapId({ windowId: null })).toBe(false);
    expect(windowHasMapId({ windowId: "" })).toBe(false);
    expect(windowHasMapId({})).toBe(false);
    expect(windowHasMapId(null)).toBe(false);
  });

  it("pins by class and ignores mode", () => {
    const pending = [
      { role: "chrome", wait_classes: ["Google-chrome"] },
      { role: "ghostty", wait_classes: ["ghostty", "com.mitchellh.ghostty"] },
    ];
    const windows = [
      { windowId: 10, wmClass: "Google-chrome", mode: "FLOAT" },
      { windowId: 20, wmClass: "com.mitchellh.ghostty", mode: "FLOAT" },
      { windowId: 99, wmClass: "other", mode: "TILE" },
    ];
    expect(assignOpenRolePins(pending, windows, new Set())).toEqual({
      chrome: 10,
      ghostty: 20,
    });
  });

  it("skips used ids; two same-class instances consume in order", () => {
    const pending = [
      { role: "g1", wait_classes: ["ghostty"] },
      { role: "g2", wait_classes: ["ghostty"] },
    ];
    const windows = [
      { windowId: 1, wmClass: "ghostty" },
      { windowId: 2, wmClass: "ghostty" },
    ];
    expect(assignOpenRolePins(pending, windows, new Set(["1"]))).toEqual({ g1: 2 });
    expect(assignOpenRolePins(pending, windows, new Set())).toEqual({ g1: 1, g2: 2 });
  });

  it("accept_any_new claims unused mapped window", () => {
    expect(
      assignOpenRolePins(
        [{ role: "mystery", wait_classes: null, accept_any_new: true }],
        [{ windowId: 7, wmClass: "Whatever", mode: "FLOAT" }]
      )
    ).toEqual({ mystery: 7 });
  });

  it("title~= disambiguates Chrome multi-open", () => {
    const pending = [
      {
        role: "google-chrome",
        wait_classes: ["Google-chrome"],
        title_contains: "Google Chrome",
      },
      {
        role: "Grok",
        wait_classes: ["Google-chrome", "chrome-ggjo-Default"],
        title_contains: "Grok",
      },
      { role: "Gmail", wait_classes: ["Google-chrome"], title_contains: "Gmail" },
    ];
    const windows = [
      { windowId: 1, wmClass: "Google-chrome", title: "Gmail - Inbox" },
      { windowId: 2, wmClass: "Google-chrome", title: "Grok" },
      { windowId: 3, wmClass: "Google-chrome", title: "about:blank - Google Chrome" },
    ];
    expect(assignOpenRolePins(pending, windows, new Set())).toEqual({
      "google-chrome": 3,
      Grok: 2,
      Gmail: 1,
    });
  });

  it("does not early-claim when title is still empty", () => {
    const pending = [{ role: "Grok", wait_classes: ["Google-chrome"], title_contains: "Grok" }];
    expect(
      assignOpenRolePins(pending, [{ windowId: 9, wmClass: "Google-chrome", title: "" }])
    ).toEqual({});
    expect(
      assignOpenRolePins(pending, [{ windowId: 9, wmClass: "Google-chrome", title: "Grok" }])
    ).toEqual({ Grok: 9 });
    expect(windowMatchesPinTitle({ title: "" }, { title_contains: "Grok" })).toBe(false);
  });

  it("strips title keys for class-only leftover", () => {
    const stripped = pendingPinsWithoutTitle([
      {
        role: "Grok",
        wait_classes: ["Google-chrome"],
        title_contains: "Grok",
        title_exact: "Grok",
      },
    ]);
    expect(stripped[0].role).toBe("Grok");
    expect(stripped[0].title_contains).toBeUndefined();
    expect(stripped[0].title_exact).toBeUndefined();
  });

  it("classEq matches reverse-DNS stem and chrome↔PWA", () => {
    expect(classEq("ghostty", "com.mitchellh.ghostty")).toBe(true);
    expect(classEq("Google-chrome", "chrome-ggjoabcdef-Default")).toBe(true);
    expect(classEq("chrome-aaa-Default", "chrome-bbb-Default")).toBe(false);
  });
});

describe("waitForOpenRolePins (pure assign + timeout leftover)", () => {
  it("polls until mapped", () => {
    const pending = [
      { role: "a", wait_classes: ["A"] },
      { role: "b", wait_classes: ["B"] },
    ];
    const polls = { n: 0 };
    const t = { v: 0 };
    const out = waitForOpenRolePins(
      () => {
        polls.n += 1;
        if (polls.n < 3) return [{ windowId: 1, wmClass: "A", mode: "FLOAT" }];
        return [
          { windowId: 1, wmClass: "A", mode: "FLOAT" },
          { windowId: 2, wmClass: "B", mode: "FLOAT" },
        ];
      },
      pending,
      {
        baselineIds: new Set(),
        timeoutMs: 5000,
        pollMs: 50,
        sleepFn: (s) => {
          t.v += s;
        },
        nowFn: () => t.v,
      }
    );
    expect(out.ok).toBe(true);
    expect(out.rolePins).toEqual({ a: 1, b: 2 });
    expect(out.missing).toEqual([]);
    expect(out.polls).toBeGreaterThanOrEqual(3);
  });

  it("timeout keeps partial pins", () => {
    const t = { v: 0 };
    const out = waitForOpenRolePins(
      () => [{ windowId: 1, wmClass: "A", mode: "FLOAT" }],
      [
        { role: "a", wait_classes: ["A"] },
        { role: "missing", wait_classes: ["Nope"] },
      ],
      {
        timeoutMs: 200,
        pollMs: 50,
        sleepFn: (s) => {
          t.v += Math.max(s, 0.1);
        },
        nowFn: () => t.v,
      }
    );
    expect(out.ok).toBe(false);
    expect(out.rolePins).toEqual({ a: 1 });
    expect(out.missing).toEqual(["missing"]);
    expect(String(out.error || "")).toMatch(/map wait timeout/);
  });

  it("title wait then class-only leftover (R029 New Tab)", () => {
    const t = { v: 0 };
    const out = waitForOpenRolePins(
      () => [
        {
          windowId: 9,
          wmClass: "Google-chrome",
          title: "New Tab - Google Chrome",
        },
      ],
      [{ role: "Grok", wait_classes: ["Google-chrome"], title_contains: "Grok" }],
      {
        timeoutMs: 200,
        pollMs: 50,
        sleepFn: (s) => {
          t.v += Math.max(s, 0.1);
        },
        nowFn: () => t.v,
      }
    );
    expect(out.ok).toBe(true);
    expect(out.rolePins).toEqual({ Grok: 9 });
    expect(out.missing).toEqual([]);
  });

  it("class leftover assigns two untitled chromes in pending order", () => {
    const t = { v: 0 };
    const out = waitForOpenRolePins(
      () => [
        { windowId: 1, wmClass: "Google-chrome", title: "" },
        { windowId: 2, wmClass: "Google-chrome", title: "" },
      ],
      [
        {
          role: "google-chrome",
          wait_classes: ["Google-chrome"],
          title_contains: "Google Chrome",
        },
        { role: "Grok", wait_classes: ["Google-chrome"], title_contains: "Grok" },
      ],
      {
        timeoutMs: 200,
        pollMs: 50,
        sleepFn: (s) => {
          t.v += Math.max(s, 0.1);
        },
        nowFn: () => t.v,
      }
    );
    expect(out.ok).toBe(true);
    expect(out.rolePins["google-chrome"]).toBe(1);
    expect(out.rolePins.Grok).toBe(2);
    expect(out.missing).toEqual([]);
    expect(out.seen).toHaveLength(2);
  });

  it("matches wmClassInstance (R030)", () => {
    const t = { v: 0 };
    const out = waitForOpenRolePins(
      () => [
        {
          windowId: 5,
          wmClass: "com.mitchellh.ghostty",
          wmClassInstance: "ghostty",
          title: "Ghostty",
        },
      ],
      [{ role: "ghostty", wait_classes: ["ghostty"] }],
      {
        timeoutMs: 50,
        pollMs: 10,
        sleepFn: (s) => {
          t.v += s;
        },
        nowFn: () => t.v,
      }
    );
    expect(out.ok).toBe(true);
    expect(out.rolePins).toEqual({ ghostty: 5 });
  });

  it("pinEntryFromOpenAction copies title~=", () => {
    const pin = pinEntryFromOpenAction({
      role: "Grok",
      match: { "title~=": "Grok" },
      open: { app: "Grok", wmClass: "Google-chrome" },
    });
    expect(pin.role).toBe("Grok");
    expect(pin.wait_classes).toContain("Google-chrome");
    expect(pin.title_contains).toBe("Grok");
  });
});
