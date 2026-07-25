import { describe, it, expect } from "vitest";
import {
  parseSelector,
  parseRegexLiteral,
  parseChildIndex,
  matchWindows,
  matchNodes,
  pickMatch,
  collectWindows,
  candidatePublic,
  listRoots,
  TILE_SELECT_API_VERSION,
} from "../../../lib/extension/tile-select.js";

function mockWin({ title = "T", wmClass = "App", id = 1 } = {}) {
  return {
    title,
    get_wm_class: () => wmClass,
    get_title: () => title,
    get_id: () => id,
  };
}

function node(partial) {
  return {
    nodeType: partial.nodeType ?? "CON",
    layout: partial.layout ?? "HSPLIT",
    rect: partial.rect ?? null,
    percent: partial.percent ?? 0,
    userSized: partial.userSized ?? false,
    mode: partial.mode,
    nodeValue: partial.nodeValue,
    childNodes: partial.childNodes ?? [],
    parentNode: partial.parentNode ?? null,
    stableKey: partial.stableKey,
    id: partial.id,
    title: partial.title,
    wmClass: partial.wmClass,
    windowId: partial.windowId,
  };
}

/** Link parentNode on children for pathForNode walks. */
function link(parent) {
  for (const c of parent.childNodes || []) {
    c.parentNode = parent;
    link(c);
  }
  return parent;
}

function sampleForest() {
  const w1 = mockWin({ title: "Grok", wmClass: "Google-chrome", id: 10 });
  const w2 = mockWin({ title: "chrome notes", wmClass: "Google-chrome", id: 11 });
  const w3 = mockWin({ title: "Terminal", wmClass: "Ghostty", id: 20 });
  const mon0 = link(
    node({
      nodeType: "MONITOR",
      nodeValue: "mo0ws0",
      stableKey: "conn:DP-1",
      childNodes: [
        node({
          nodeType: "CON",
          layout: "HSPLIT",
          childNodes: [
            node({ nodeType: "WINDOW", mode: "TILE", nodeValue: w1 }),
            node({ nodeType: "WINDOW", mode: "TILE", nodeValue: w2 }),
          ],
        }),
      ],
    })
  );
  const mon1 = link(
    node({
      nodeType: "MONITOR",
      nodeValue: "mo1ws0",
      stableKey: "conn:HDMI-1",
      childNodes: [node({ nodeType: "WINDOW", mode: "TILE", nodeValue: w3 })],
    })
  );
  return { mon0, mon1, w1, w2, w3, forest: [mon0, mon1] };
}

describe("tile-select parseSelector", () => {
  it("parses focus and lft", () => {
    expect(parseSelector("focus")).toEqual({ kind: "focus", first: false });
    expect(parseSelector("lft")).toEqual({ kind: "lft", first: false });
  });

  it("parses title exact / substr / regex", () => {
    expect(parseSelector("title:Grok")).toEqual({
      kind: "title",
      match: "exact",
      value: "Grok",
      first: false,
    });
    expect(parseSelector("title~=chrome")).toEqual({
      kind: "title",
      match: "substr",
      value: "chrome",
      first: false,
    });
    expect(parseSelector("title~=/notes$/i")).toEqual({
      kind: "title",
      match: "regex",
      value: "notes$",
      flags: "i",
      first: false,
    });
  });

  it("parses class and class@mon", () => {
    expect(parseSelector("class:Ghostty")).toEqual({
      kind: "class",
      value: "Ghostty",
      mon: undefined,
      first: false,
    });
    expect(parseSelector("class:Ghostty@left")).toEqual({
      kind: "class",
      value: "Ghostty",
      mon: "left",
      first: false,
    });
    expect(parseSelector("class:App@mo0")).toEqual({
      kind: "class",
      value: "App",
      mon: "mo0",
      first: false,
    });
  });

  it("parses path and id", () => {
    expect(parseSelector("path:mo0ws0/0/1")).toMatchObject({
      kind: "path",
      segments: ["mo0ws0", "0", "1"],
      value: "mo0ws0/0/1",
    });
    expect(parseSelector("id:42")).toEqual({ kind: "id", value: "42", first: false });
  });

  it("parses JSON wrapper with first", () => {
    const d = parseSelector(JSON.stringify({ selector: "class:Foo", first: true }));
    expect(d).toMatchObject({ kind: "class", value: "Foo", first: true });
  });

  it("parses object input", () => {
    expect(parseSelector({ selector: "focus", first: true })).toEqual({
      kind: "focus",
      first: true,
    });
  });

  it("rejects empty / unknown", () => {
    expect(() => parseSelector("")).toThrow(/empty/);
    expect(() => parseSelector("nope")).toThrow(/unknown/);
    expect(() => parseSelector("title:")).toThrow();
    expect(() => parseSelector("class:")).toThrow();
  });

  it("parseRegexLiteral validates", () => {
    expect(parseRegexLiteral("/ab+c/i")).toEqual({ source: "ab+c", flags: "i" });
    expect(() => parseRegexLiteral("/unterminated")).toThrow();
    expect(() => parseRegexLiteral("/a/zzz")).toThrow(/flags/);
  });

  it("parseChildIndex accepts cN/wN", () => {
    expect(parseChildIndex("0")).toBe(0);
    expect(parseChildIndex("c2")).toBe(2);
    expect(parseChildIndex("w1")).toBe(1);
    expect(parseChildIndex("x")).toBeNull();
  });
});

describe("tile-select matchWindows", () => {
  it("matches title exact / substr / regex", () => {
    const { forest } = sampleForest();
    expect(matchWindows(forest, "title:Grok").matches).toHaveLength(1);
    expect(matchWindows(forest, "title:Grok").matches[0].windowId).toBe(10);
    expect(matchWindows(forest, "title~=chrome").matches).toHaveLength(1);
    expect(matchWindows(forest, "title~=/chrome/i").matches.length).toBeGreaterThanOrEqual(1);
  });

  it("matches class and class@mon index", () => {
    const { forest } = sampleForest();
    const chrome = matchWindows(forest, "class:Google-chrome").matches;
    expect(chrome).toHaveLength(2);
    const on0 = matchWindows(forest, "class:Google-chrome@0").matches;
    expect(on0).toHaveLength(2);
    const on1 = matchWindows(forest, "class:Google-chrome@1").matches;
    expect(on1).toHaveLength(0);
    const ghost = matchWindows(forest, "class:Ghostty@mo1").matches;
    expect(ghost).toHaveLength(1);
    expect(ghost[0].wmClass).toBe("Ghostty");
  });

  it("matches class case-insensitively", () => {
    const { forest } = sampleForest();
    const lower = matchWindows(forest, "class:ghostty").matches;
    expect(lower).toHaveLength(1);
    expect(lower[0].wmClass).toBe("Ghostty");
    const mixed = matchWindows(forest, "class:google-chrome@0").matches;
    expect(mixed).toHaveLength(2);
  });

  it("matches class@stableKey via liveMap", () => {
    const { forest } = sampleForest();
    const liveMap = {
      byKey: new Map([
        ["conn:DP-1", 0],
        ["conn:HDMI-1", 1],
      ]),
      byIndex: new Map([
        [0, "conn:DP-1"],
        [1, "conn:HDMI-1"],
      ]),
    };
    const m = matchWindows(forest, "class:Ghostty@conn:HDMI-1", { liveMap }).matches;
    expect(m).toHaveLength(1);
  });

  it("matches path to window and CON", () => {
    const { forest } = sampleForest();
    const w = matchWindows(forest, "path:mo0ws0/0/1").matches;
    expect(w).toHaveLength(1);
    expect(w[0].windowId).toBe(11);
    const con = matchNodes(forest, "path:mo0ws0/0").matches;
    expect(con).toHaveLength(1);
    expect(con[0].nodeType).toBe("CON");
    // path with c/w prefixes
    const w2 = matchWindows(forest, "path:mo0ws0/c0/w0").matches;
    expect(w2[0].windowId).toBe(10);
  });

  it("matches id", () => {
    const { forest } = sampleForest();
    expect(matchWindows(forest, "id:20").matches[0].title).toBe("Terminal");
    expect(matchWindows(forest, "id:999").matches).toHaveLength(0);
  });

  it("matches focus and lft via ctx", () => {
    const { forest, w1, mon0 } = sampleForest();
    const focusNode = mon0.childNodes[0].childNodes[0];
    const mFocus = matchWindows(forest, "focus", {
      getFocusWindow: () => w1,
      findNode: (v) => (v === w1 ? focusNode : null),
    }).matches;
    expect(mFocus).toHaveLength(1);
    expect(mFocus[0].windowId).toBe(10);

    const mLft = matchWindows(forest, "lft", {
      getLftNode: () => focusNode,
    }).matches;
    expect(mLft).toHaveLength(1);
  });

  it("path mon index and role via monRoleToId", () => {
    const { forest } = sampleForest();
    const byIdx = matchWindows(forest, "path:1/0").matches;
    expect(byIdx[0].wmClass).toBe("Ghostty");
    const byRole = matchWindows(forest, "path:right/0", {
      monRoleToId: (role) => (role === "right" ? "mo1ws0" : null),
    }).matches;
    expect(byRole[0].wmClass).toBe("Ghostty");
  });

  it("collectWindows exposes paths", () => {
    const { forest } = sampleForest();
    const all = collectWindows(forest);
    expect(all.map((c) => c.path).sort()).toEqual(["mo0ws0/0/0", "mo0ws0/0/1", "mo1ws0/0"].sort());
  });
});

describe("tile-select pickMatch / ambiguous", () => {
  it("not found / ambiguous / first", () => {
    const { forest } = sampleForest();
    const none = matchWindows(forest, "class:Nope").matches;
    expect(pickMatch(none)).toEqual({ ok: false, error: "not found", candidates: [] });

    const many = matchWindows(forest, "class:Google-chrome").matches;
    const amb = pickMatch(many);
    expect(amb.ok).toBe(false);
    expect(amb.error).toBe("ambiguous");
    expect(amb.candidates).toHaveLength(2);
    expect(amb.candidates[0]).toMatchObject({
      wmClass: "Google-chrome",
      path: expect.any(String),
    });

    const first = pickMatch(many, { first: true });
    expect(first.ok).toBe(true);
    expect(first.match.windowId).toBe(10);

    const viaSel = matchWindows(forest, { selector: "class:Google-chrome", first: true });
    expect(viaSel.descriptor.first).toBe(true);
    expect(pickMatch(viaSel.matches, { first: viaSel.descriptor.first }).ok).toBe(true);
  });

  it("candidatePublic is JSON-safe", () => {
    const { forest } = sampleForest();
    const c = matchWindows(forest, "id:10").matches[0];
    const pub = candidatePublic(c);
    expect(() => JSON.stringify(pub)).not.toThrow();
    expect(pub).not.toHaveProperty("node");
  });

  it("listRoots handles shapes", () => {
    const { forest, mon0 } = sampleForest();
    expect(listRoots(forest)).toHaveLength(2);
    expect(listRoots({ monitors: forest })).toHaveLength(2);
    expect(listRoots(mon0)).toHaveLength(1);
    expect(listRoots(null)).toHaveLength(0);
  });

  it("exports api version 2", () => {
    expect(TILE_SELECT_API_VERSION).toBe(2);
  });
});
