import { describe, it, expect } from "vitest";
import {
  matchesPlaceHint,
  metaWmClass,
  metaHasPlaceIdentity,
  wmClassEqual,
  isChromeBrowserClass,
  isChromePwaClass,
  isChromeFamilyClass,
  chromePwaAppId,
  chromePwaDesktopIds,
  preferChromePwaApp,
  normalizePlaceHint,
  pruneExpiredPlaceHints,
  findMatchingPlaceHintIndex,
  findProvisionalPlaceHintIndex,
  consumePlaceHint,
  consumeProvisionalPlaceHint,
  enqueuePlaceHint,
  resolvePlaceMonitorIndex,
  isMonRootTreePath,
  placeNextDestKind,
  placeNextHasSlotDest,
  placeHintHasSlotDest,
  placeHintIdentityReady,
  isLoadingPlaceTitle,
  formatPlaceHint,
  PLACE_HINT_TTL_MS,
  PLACE_HINT_MAX,
} from "../../../lib/extension/place-hint.js";

describe("metaWmClass", () => {
  it("reads get_wm_class / wmClass / wm_class", () => {
    expect(metaWmClass({ get_wm_class: () => "Foo" })).toBe("Foo");
    expect(metaWmClass({ wmClass: "Bar" })).toBe("Bar");
    expect(metaWmClass({ wm_class: "Baz" })).toBe("Baz");
    expect(metaWmClass(null)).toBeNull();
    expect(metaWmClass({})).toBeNull();
  });
});

describe("wmClassEqual", () => {
  it("is case-insensitive", () => {
    expect(wmClassEqual("Eog", "eog")).toBe(true);
    expect(wmClassEqual("Google-chrome", "google-chrome")).toBe(true);
    expect(wmClassEqual("A", "B")).toBe(false);
    expect(wmClassEqual(null, "A")).toBe(false);
  });

  it("matches reverse-DNS stem either side", () => {
    expect(wmClassEqual("ghostty", "com.mitchellh.ghostty")).toBe(true);
    expect(wmClassEqual("com.mitchellh.ghostty", "ghostty")).toBe(true);
    expect(wmClassEqual("Ghostty", "com.mitchellh.Ghostty")).toBe(true);
    expect(wmClassEqual("nautilus", "org.gnome.Nautilus")).toBe(true);
    expect(wmClassEqual("ghostty", "com.mitchellh.ghostty.extra")).toBe(false);
    expect(wmClassEqual("tty", "com.mitchellh.ghostty")).toBe(false);
    expect(wmClassEqual("firefox", "com.mitchellh.ghostty")).toBe(false);
  });

  it("matches Chrome browser family with PWA / crx ids", () => {
    expect(wmClassEqual("Google-chrome", "chrome-ggjoabcdef-Default")).toBe(true);
    expect(wmClassEqual("google-chrome", "chrome-ggjoabcdef-Default")).toBe(true);
    expect(wmClassEqual("Chromium", "chrome-ggjoabcdef-Default")).toBe(true);
    expect(wmClassEqual("chromium", "crx_abc123")).toBe(true);
    expect(wmClassEqual("google-chrome-stable", "crx_xyz")).toBe(true);
    expect(wmClassEqual("chrome-aaa-Default", "Google-chrome")).toBe(true);
    expect(wmClassEqual("Google-chrome", "Google-chrome")).toBe(true);
    expect(wmClassEqual("Google-chrome", "Chromium")).toBe(true);
    expect(wmClassEqual("firefox", "chrome-ggjo-Default")).toBe(false);
    expect(wmClassEqual("ghostty", "crx_abc")).toBe(false);
  });

  it("does not match distinct Chrome PWAs or crx ids", () => {
    expect(wmClassEqual("chrome-aaa-Default", "chrome-bbb-Default")).toBe(false);
    expect(wmClassEqual("chrome-ggjoabcdef-Default", "chrome-otherid-Default")).toBe(false);
    expect(wmClassEqual("crx_a", "crx_b")).toBe(false);
    expect(wmClassEqual("crx_abc123", "chrome-aaa-Default")).toBe(false);
    expect(wmClassEqual("chrome-aaa-Default", "chrome-aaa-Default")).toBe(true);
    expect(wmClassEqual("crx_a", "crx_a")).toBe(true);
  });

  it("matches same Chrome PWA across crx_* and chrome-*-Default", () => {
    expect(
      wmClassEqual(
        "crx_agimnkijcaahngcdmfeangaknmldooml",
        "chrome-agimnkijcaahngcdmfeangaknmldooml-Default"
      )
    ).toBe(true);
    expect(
      wmClassEqual(
        "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Default",
        "crx_ggjocahimgaohmigbfhghnlfcnjemagj"
      )
    ).toBe(true);
    expect(
      wmClassEqual(
        "crx_ggjocahimgaohmigbfhghnlfcnjemagj",
        "chrome-ggjocahimgaohmigbfhghnlfcnjemagj-Profile"
      )
    ).toBe(true);
  });
});

describe("chrome family helpers", () => {
  it("classifies browser vs PWA", () => {
    expect(isChromeBrowserClass("Google-chrome")).toBe(true);
    expect(isChromeBrowserClass("google-chrome-beta")).toBe(true);
    expect(isChromeBrowserClass("Chromium")).toBe(true);
    expect(isChromeBrowserClass("chrome-ggjo-Default")).toBe(false);
    expect(isChromePwaClass("chrome-ggjo-Default")).toBe(true);
    expect(isChromePwaClass("crx_abc")).toBe(true);
    expect(isChromePwaClass("Google-chrome")).toBe(false);
    expect(isChromeFamilyClass("chrome-x-Default")).toBe(true);
    expect(isChromeFamilyClass("firefox")).toBe(false);
    expect(chromePwaAppId("crx_abc123")).toBe("abc123");
    expect(chromePwaAppId("chrome-abc123-Default")).toBe("abc123");
  });
});

describe("preferChromePwaApp / chromePwaDesktopIds", () => {
  it("lists desktop ids for Meta chrome-<id>-Default class", () => {
    expect(chromePwaDesktopIds("chrome-fmgjjmmmlfnkbppncabfkddbjimcfncm-Default")).toEqual([
      "chrome-fmgjjmmmlfnkbppncabfkddbjimcfncm-Default.desktop",
      "chrome-fmgjjmmmlfnkbppncabfkddbjimcfncm-default.desktop",
    ]);
    expect(chromePwaDesktopIds("Google-chrome")).toEqual([]);
  });

  it("looks up PWA app when tracker returned bare Chrome", () => {
    const pwa = { get_id: () => "chrome-abc-Default.desktop", get_name: () => "Gmail" };
    const chrome = { get_id: () => "google-chrome.desktop", get_name: () => "Chrome" };
    const sys = {
      lookup_app: (id) => (id === "chrome-abc-Default.desktop" ? pwa : null),
    };
    expect(preferChromePwaApp("chrome-abc-Default", chrome, sys)).toBe(pwa);
  });

  it("keeps tracker app when it already matches the PWA id", () => {
    const pwa = { get_id: () => "chrome-abc-Default.desktop" };
    const sys = { lookup_app: () => ({ get_id: () => "other" }) };
    expect(preferChromePwaApp("chrome-abc-Default", pwa, sys)).toBe(pwa);
  });

  it("returns null when no AppSystem match", () => {
    const chrome = { get_id: () => "google-chrome.desktop" };
    expect(preferChromePwaApp("chrome-abc-Default", chrome, { lookup_app: () => null })).toBeNull();
    expect(preferChromePwaApp("chrome-abc-Default", chrome, null)).toBeNull();
  });
});

describe("matchesPlaceHint", () => {
  const now = 1_000_000;

  it("matches when wmClass exact and not expired", () => {
    const hint = { wmClass: "Google-chrome", expiresAt: now + 1000 };
    expect(matchesPlaceHint({ wm_class: "Google-chrome" }, hint, now)).toBe(true);
    expect(matchesPlaceHint({ get_wm_class: () => "Google-chrome" }, hint, now)).toBe(true);
  });

  it("matches wmClass case-insensitively", () => {
    const hint = { wmClass: "eog", expiresAt: now + 1000 };
    expect(matchesPlaceHint({ wm_class: "Eog" }, hint, now)).toBe(true);
    expect(matchesPlaceHint({ get_wm_class: () => "EOG" }, hint, now)).toBe(true);
  });

  it("matches reverse-DNS stem for PlaceNext", () => {
    const hint = { wmClass: "ghostty", monitor: 1, expiresAt: now + 1000 };
    expect(matchesPlaceHint({ wm_class: "com.mitchellh.ghostty" }, hint, now)).toBe(true);
    expect(matchesPlaceHint({ get_wm_class: () => "com.mitchellh.ghostty" }, hint, now)).toBe(true);
  });

  it("matches Chrome PWA class against Google-chrome PlaceNext", () => {
    const hint = { wmClass: "Google-chrome", monitor: 0, expiresAt: now + 1000 };
    expect(matchesPlaceHint({ wm_class: "chrome-ggjoabcdef-Default" }, hint, now)).toBe(true);
    expect(matchesPlaceHint({ get_wm_class: () => "crx_pwa1" }, hint, now)).toBe(true);
    // Null class must not consume a class-specific hint (deferred until class lands).
    expect(matchesPlaceHint({ wm_class: null }, hint, now)).toBe(false);
  });

  it("rejects class mismatch", () => {
    const hint = { wmClass: "A", expiresAt: now + 1000 };
    expect(matchesPlaceHint({ wm_class: "B" }, hint, now)).toBe(false);
  });

  it("wildcard (no wmClass) matches any", () => {
    const hint = { monitor: 1, expiresAt: now + 1000 };
    expect(matchesPlaceHint({ wm_class: "Anything" }, hint, now)).toBe(true);
    expect(matchesPlaceHint({}, hint, now)).toBe(true);
  });

  it("rejects expired", () => {
    const hint = { wmClass: "A", expiresAt: now - 1 };
    expect(matchesPlaceHint({ wm_class: "A" }, hint, now)).toBe(false);
  });

  it("rejects null hint", () => {
    expect(matchesPlaceHint({ wm_class: "A" }, null, now)).toBe(false);
  });

  it("requires titleContains when set (Chrome multi-open)", () => {
    const hint = {
      wmClass: "chrome-ggjo-Default",
      titleContains: "Grok",
      monitor: 0,
      expiresAt: now + 1000,
    };
    expect(matchesPlaceHint({ wm_class: "Google-chrome", title: "Grok" }, hint, now)).toBe(true);
    expect(matchesPlaceHint({ wm_class: "Google-chrome", title: "Gmail" }, hint, now)).toBe(false);
    expect(matchesPlaceHint({ wm_class: "Google-chrome", title: "" }, hint, now)).toBe(false);
  });

  it("does not match bare Google-chrome to PWA hint without title", () => {
    const hint = {
      wmClass: "chrome-ggjoabcdef-Default",
      monitor: 1,
      expiresAt: now + 1000,
    };
    expect(matchesPlaceHint({ wm_class: "Google-chrome" }, hint, now)).toBe(false);
  });
});

describe("findMatchingPlaceHintIndex title preference", () => {
  const now = 2_000_000;

  it("picks title-matching PWA hint over LIFO loose class scramble", () => {
    const queue = [
      {
        wmClass: "chrome-aaa-Default",
        titleContains: "Grok",
        monitor: 0,
        expiresAt: now + 1000,
      },
      {
        wmClass: "chrome-bbb-Default",
        titleContains: "Gmail",
        monitor: 1,
        expiresAt: now + 1000,
      },
      {
        wmClass: "chrome-ccc-Default",
        titleContains: "YouTube",
        monitor: 1,
        expiresAt: now + 1000,
      },
    ];
    const gmail = { wm_class: "Google-chrome", title: "Gmail - Inbox" };
    expect(findMatchingPlaceHintIndex(queue, gmail, now)).toBe(1);
    const grok = { wm_class: "Google-chrome", title: "Grok" };
    expect(findMatchingPlaceHintIndex(queue, grok, now)).toBe(0);
  });
});

describe("normalizePlaceHint", () => {
  const now = 5_000;

  it("requires placement field", () => {
    const r = normalizePlaceHint({ wmClass: "X" }, now);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/monitor|treePath|attachSelector/);
  });

  it("builds hint with ttl default", () => {
    const r = normalizePlaceHint({ monitor: 1, wmClass: "X" }, now);
    expect(r.ok).toBe(true);
    expect(r.hint.monitor).toBe(1);
    expect(r.hint.wmClass).toBe("X");
    expect(r.hint.expiresAt).toBe(now + PLACE_HINT_TTL_MS);
  });

  it("strips path: prefix on treePath", () => {
    const r = normalizePlaceHint({ treePath: "path:mo0ws0/0" }, now);
    expect(r.ok).toBe(true);
    expect(r.hint.treePath).toBe("mo0ws0/0");
  });

  it("honors expiresAt over ttl", () => {
    const r = normalizePlaceHint({ monitor: 0, expiresAt: 999, ttlMs: 1 }, now);
    expect(r.ok).toBe(true);
    expect(r.hint.expiresAt).toBe(999);
  });

  it("apply dest kind: slot attach vs mon-root-only", () => {
    expect(isMonRootTreePath("mo0ws0")).toBe(true);
    expect(isMonRootTreePath("mo0ws0/1")).toBe(false);
    const monRoot = normalizePlaceHint({ monitor: 1, treePath: "mo1ws0" }, now);
    expect(monRoot.ok).toBe(true);
    expect(placeNextDestKind(monRoot.hint)).toBe("mon-root");
    expect(placeNextHasSlotDest(monRoot.hint)).toBe(false);
    const slot = normalizePlaceHint({ attachSelector: "id:forge-ph-1", monitor: 0 }, now);
    expect(slot.ok).toBe(true);
    expect(placeNextDestKind(slot.hint)).toBe("slot");
    expect(placeNextHasSlotDest(slot.hint)).toBe(true);
    const slotPath = normalizePlaceHint({ treePath: "mo0ws0/0" }, now);
    expect(placeNextDestKind(slotPath.hint)).toBe("slot");
  });
});

describe("queue consume", () => {
  const now = 10_000;

  it("prune drops expired", () => {
    const q = [
      { monitor: 0, expiresAt: now - 1 },
      { monitor: 1, expiresAt: now + 100 },
    ];
    pruneExpiredPlaceHints(q, now);
    expect(q).toHaveLength(1);
    expect(q[0].monitor).toBe(1);
  });

  it("prefer specific wmClass over wildcard (LIFO)", () => {
    const q = [
      { monitor: 0, expiresAt: now + 100 }, // wildcard older
      { wmClass: "App", monitor: 1, expiresAt: now + 100 },
    ];
    const idx = findMatchingPlaceHintIndex(q, { wm_class: "App" }, now);
    expect(idx).toBe(1);
    const h = consumePlaceHint(q, { wm_class: "App" }, now);
    expect(h.monitor).toBe(1);
    expect(q).toHaveLength(1);
    expect(q[0].monitor).toBe(0);
  });

  it("does not steal mismatched class for specific hints", () => {
    const q = [{ wmClass: "A", monitor: 0, expiresAt: now + 100 }];
    expect(consumePlaceHint(q, { wm_class: "B" }, now)).toBeNull();
    expect(q).toHaveLength(1);
  });

  it("R036 provisional FIFO claims oldest slot, skips mon-root-only", () => {
    const q = [
      { wmClass: "chrome-a", monitor: 0, expiresAt: now + 100 }, // mon-root only
      {
        wmClass: "chrome-b",
        attachSelector: "id:ph-mon0-s0",
        monitor: 0,
        expiresAt: now + 100,
      },
      {
        wmClass: "chrome-c",
        treePath: "mo1ws0/1",
        monitor: 1,
        expiresAt: now + 100,
      },
    ];
    expect(metaHasPlaceIdentity({ wm_class: null, title: null })).toBe(false);
    expect(metaHasPlaceIdentity({ wm_class: "X" })).toBe(true);
    expect(placeHintHasSlotDest(q[0])).toBe(false);
    expect(placeHintHasSlotDest(q[1])).toBe(true);
    expect(findProvisionalPlaceHintIndex(q, now)).toBe(1);
    const first = consumeProvisionalPlaceHint(q, now);
    expect(first.attachSelector).toBe("id:ph-mon0-s0");
    expect(q).toHaveLength(2);
    const second = consumeProvisionalPlaceHint(q, now);
    expect(second.treePath).toBe("mo1ws0/1");
    expect(consumeProvisionalPlaceHint(q, now)).toBeNull();
    expect(q).toHaveLength(1);
    expect(q[0].wmClass).toBe("chrome-a");
  });

  it("R036 placeHintIdentityReady waits for class and title constraints", () => {
    const hint = {
      wmClass: "chrome-bbb-Default",
      titleContains: "YouTube",
      attachSelector: "id:ph",
      monitor: 1,
    };
    expect(placeHintIdentityReady({ wm_class: null, title: null }, hint)).toBe(false);
    expect(placeHintIdentityReady({ wm_class: "chrome-bbb-Default", title: null }, hint)).toBe(
      false
    );
    expect(placeHintIdentityReady({ wm_class: null, title: "YouTube" }, hint)).toBe(false);
    expect(placeHintIdentityReady({ wm_class: "chrome-bbb-Default", title: "YouTube" }, hint)).toBe(
      true
    );
    // Loading titles are not ready when the hint requires a title (crash thrash).
    expect(placeHintIdentityReady({ wm_class: "chrome-bbb-Default", title: "New Tab" }, hint)).toBe(
      false
    );
    expect(
      placeHintIdentityReady({ wm_class: "chrome-bbb-Default", title: "about:blank" }, hint)
    ).toBe(false);
    expect(isLoadingPlaceTitle("New Tab")).toBe(true);
    expect(isLoadingPlaceTitle("YouTube")).toBe(false);
    expect(formatPlaceHint(hint)).toContain("title~=YouTube");
    // Class-only hint
    expect(
      placeHintIdentityReady({ wm_class: "ghostty" }, { wmClass: "ghostty", monitor: 0 })
    ).toBe(true);
    expect(placeHintIdentityReady({ title: "x" }, { wmClass: "ghostty", monitor: 0 })).toBe(false);
    // F7UjZ: class-only is ready with title still null (mismatch uses matchesPlaceHint).
    expect(
      placeHintIdentityReady(
        { wm_class: "chrome-agimnkijcaahngcdmfeangaknmldooml-Default", title: null },
        { wmClass: "ghostty", monitor: 0 }
      )
    ).toBe(true);
    expect(
      matchesPlaceHint(
        { wm_class: "chrome-agimnkijcaahngcdmfeangaknmldooml-Default", title: null },
        { wmClass: "ghostty", monitor: 0 }
      )
    ).toBe(false);
    expect(
      matchesPlaceHint({ wm_class: "ghostty", title: null }, { wmClass: "ghostty", monitor: 0 })
    ).toBe(true);
  });

  it("enqueue caps and prunes", () => {
    const q = [];
    for (let i = 0; i < PLACE_HINT_MAX + 3; i++) {
      enqueuePlaceHint(q, { monitor: i, expiresAt: now + 1000 }, now);
    }
    expect(q.length).toBe(PLACE_HINT_MAX);
    expect(q[0].monitor).toBe(3);
  });
});

describe("resolvePlaceMonitorIndex", () => {
  it("parses number, moN, moNwsW, primary, stableKey", () => {
    expect(resolvePlaceMonitorIndex(2)).toBe(2);
    expect(resolvePlaceMonitorIndex("1")).toBe(1);
    expect(resolvePlaceMonitorIndex("mo3")).toBe(3);
    expect(resolvePlaceMonitorIndex("mo2ws0")).toBe(2);
    expect(resolvePlaceMonitorIndex("primary", { primaryMonitor: 1 })).toBe(1);
    const byKey = new Map([["conn:DP-1", 0]]);
    expect(resolvePlaceMonitorIndex("conn:DP-1", { liveMap: { byKey } })).toBe(0);
    expect(resolvePlaceMonitorIndex("nope")).toBe(-1);
    expect(resolvePlaceMonitorIndex(null)).toBe(-1);
  });
});
