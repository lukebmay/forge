import { describe, it, expect } from "vitest";
import {
  resolvePortableKey,
  parseKeyRef,
  parseSettingValueText,
  coerceForGSettingsType,
  isSettingsKey,
  isKeybindingKey,
  allSettingsKeys,
  allKeybindingKeys,
} from "../../../lib/shared/settings-control.js";

describe("settings-control (FC3)", () => {
  describe("allowlist", () => {
    it("includes known settings and keybinding keys", () => {
      expect(isSettingsKey("tiling-mode-enabled")).toBe(true);
      expect(isSettingsKey("window-gap-size")).toBe(true);
      expect(isKeybindingKey("window-focus-left")).toBe(true);
      expect(isKeybindingKey("mod-mask-mouse-tile")).toBe(true);
      expect(isSettingsKey("not-a-real-key")).toBe(false);
      expect(isKeybindingKey("tiling-mode-enabled")).toBe(false);
    });

    it("exports flat lists covering both schemas", () => {
      expect(allSettingsKeys().length).toBeGreaterThan(10);
      expect(allKeybindingKeys()).toContain("window-focus-left");
      expect(allKeybindingKeys()).toContain("mod-mask-mouse-tile");
    });
  });

  describe("parseKeyRef", () => {
    it("parses schema prefixes", () => {
      expect(parseKeyRef("settings:window-gap-size")).toEqual({
        schema: "settings",
        key: "window-gap-size",
      });
      expect(parseKeyRef("kbd:window-focus-left")).toEqual({
        schema: "keybindings",
        key: "window-focus-left",
      });
      expect(parseKeyRef("keybindings:mod-mask-mouse-tile")).toEqual({
        schema: "keybindings",
        key: "mod-mask-mouse-tile",
      });
    });

    it("leaves unprefixed keys alone", () => {
      expect(parseKeyRef("tiling-mode-enabled")).toEqual({
        schema: null,
        key: "tiling-mode-enabled",
      });
    });
  });

  describe("resolvePortableKey", () => {
    it("resolves unique settings keys", () => {
      const r = resolvePortableKey("tiling-mode-enabled");
      expect(r.ok).toBe(true);
      expect(r.resolved).toMatchObject({
        schema: "settings",
        key: "tiling-mode-enabled",
      });
    });

    it("resolves unique keybinding keys as strv", () => {
      const r = resolvePortableKey("window-focus-left");
      expect(r.ok).toBe(true);
      expect(r.resolved).toMatchObject({
        schema: "keybindings",
        key: "window-focus-left",
        typeHint: "as",
      });
    });

    it("resolves string keybinding keys", () => {
      const r = resolvePortableKey("mod-mask-mouse-tile");
      expect(r.ok).toBe(true);
      expect(r.resolved.typeHint).toBe("s");
    });

    it("rejects unknown keys", () => {
      const r = resolvePortableKey("totally-fake-key");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/unknown key/);
    });

    it("rejects empty key", () => {
      expect(resolvePortableKey("").ok).toBe(false);
      expect(resolvePortableKey("settings:").ok).toBe(false);
    });

    it("requires prefix for ambiguous focus-border-toggle", () => {
      const amb = resolvePortableKey("focus-border-toggle");
      expect(amb.ok).toBe(false);
      expect(amb.error).toMatch(/ambiguous/);

      const s = resolvePortableKey("settings:focus-border-toggle");
      expect(s.ok).toBe(true);
      expect(s.resolved.schema).toBe("settings");

      const k = resolvePortableKey("kbd:focus-border-toggle");
      expect(k.ok).toBe(true);
      expect(k.resolved.schema).toBe("keybindings");
    });

    it("rejects wrong schema prefix for known key", () => {
      const r = resolvePortableKey("settings:window-focus-left");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/unknown settings key/);
    });
  });

  describe("parseSettingValueText", () => {
    it("parses JSON literals", () => {
      expect(parseSettingValueText("true")).toEqual({ ok: true, value: true });
      expect(parseSettingValueText("false")).toEqual({ ok: true, value: false });
      expect(parseSettingValueText("8")).toEqual({ ok: true, value: 8 });
      expect(parseSettingValueText('"hello"')).toEqual({ ok: true, value: "hello" });
      expect(parseSettingValueText('["<Super>h"]')).toEqual({
        ok: true,
        value: ["<Super>h"],
      });
    });

    it("treats non-JSON as plain string", () => {
      expect(parseSettingValueText("<Super>h")).toEqual({
        ok: true,
        value: "<Super>h",
      });
      expect(parseSettingValueText("HSPLIT")).toEqual({ ok: true, value: "HSPLIT" });
    });

    it("allows empty string", () => {
      expect(parseSettingValueText("")).toEqual({ ok: true, value: "" });
    });
  });

  describe("coerceForGSettingsType", () => {
    it("coerces booleans", () => {
      expect(coerceForGSettingsType(true, "b")).toEqual({ ok: true, value: true });
      expect(coerceForGSettingsType("false", "b")).toEqual({ ok: true, value: false });
      expect(coerceForGSettingsType("nope", "b").ok).toBe(false);
    });

    it("coerces integers", () => {
      expect(coerceForGSettingsType(3, "u")).toEqual({ ok: true, value: 3 });
      expect(coerceForGSettingsType(-1, "u").ok).toBe(false);
      expect(coerceForGSettingsType(2.5, "i").ok).toBe(false);
      expect(coerceForGSettingsType(-2, "i")).toEqual({ ok: true, value: -2 });
    });

    it("coerces strings and strv", () => {
      expect(coerceForGSettingsType("HSPLIT", "s")).toEqual({
        ok: true,
        value: "HSPLIT",
      });
      expect(coerceForGSettingsType(["<Super>h"], "as")).toEqual({
        ok: true,
        value: ["<Super>h"],
      });
      expect(coerceForGSettingsType("<Super>h", "as")).toEqual({
        ok: true,
        value: ["<Super>h"],
      });
      expect(coerceForGSettingsType([1], "as").ok).toBe(false);
    });

    it("rejects unknown types", () => {
      expect(coerceForGSettingsType(1, "xy").ok).toBe(false);
    });
  });
});
