import { describe, it, expect, vi } from "vitest";
import {
  EXTENSION_OPS,
  CLI_ONLY_OPS,
  normalizeLayoutMode,
  parseStepsPayload,
  validateStep,
  validateSteps,
  runStepsDispatch,
  partitionMixedSteps,
} from "../../../lib/extension/run-steps.js";

describe("run-steps pure helpers (FC4)", () => {
  describe("normalizeLayoutMode", () => {
    it("maps aliases to LAYOUT_TYPES names", () => {
      expect(normalizeLayoutMode("tabbed")).toEqual({ ok: true, mode: "TABBED" });
      expect(normalizeLayoutMode("stack")).toEqual({ ok: true, mode: "STACKED" });
      expect(normalizeLayoutMode("h-split")).toEqual({ ok: true, mode: "HSPLIT" });
      expect(normalizeLayoutMode("VSPLIT")).toEqual({ ok: true, mode: "VSPLIT" });
    });

    it("rejects missing / unknown", () => {
      expect(normalizeLayoutMode("")).toMatchObject({ ok: false });
      expect(normalizeLayoutMode("grid")).toMatchObject({ ok: false });
    });
  });

  describe("parseStepsPayload", () => {
    it("accepts bare array", () => {
      const r = parseStepsPayload([{ op: "ping" }]);
      expect(r.ok).toBe(true);
      expect(r.steps).toHaveLength(1);
      expect(r.stopOnError).toBe(true);
    });

    it("accepts { steps, stopOnError }", () => {
      const r = parseStepsPayload({
        steps: [{ op: "ping" }],
        stopOnError: false,
      });
      expect(r.ok).toBe(true);
      expect(r.stopOnError).toBe(false);
    });

    it("parses JSON string", () => {
      const r = parseStepsPayload('[{"op":"ping"}]');
      expect(r.ok).toBe(true);
      expect(r.steps[0].op).toBe("ping");
    });

    it("rejects empty / invalid", () => {
      expect(parseStepsPayload("").ok).toBe(false);
      expect(parseStepsPayload("{").ok).toBe(false);
      expect(parseStepsPayload({ notSteps: [] }).ok).toBe(false);
      expect(parseStepsPayload(null).ok).toBe(false);
    });
  });

  describe("validateStep", () => {
    it("normalizes focus / swap / move / layout / set", () => {
      expect(validateStep({ op: "focus", selector: "class:A" })).toEqual({
        ok: true,
        step: { op: "focus", selector: "class:A" },
      });
      expect(validateStep({ op: "swap", a: "focus", b: "lft" }).step).toMatchObject({
        op: "swap",
        a: "focus",
        b: "lft",
      });
      expect(validateStep({ op: "move", tile: "a", dest: "b" }).step).toMatchObject({
        tile: "a",
        dest: "b",
      });
      expect(validateStep({ op: "layout", mode: "tabbed" }).step).toMatchObject({
        op: "layout",
        mode: "TABBED",
      });
      expect(validateStep({ op: "set", key: "window-gap-size", value: 4 }).step).toMatchObject({
        key: "window-gap-size",
        value: 4,
      });
    });

    it("accepts ping and place-next options bag", () => {
      expect(validateStep({ op: "ping" }).ok).toBe(true);
      const p = validateStep({ op: "place-next", wmClass: "X", monitor: 0 });
      expect(p.ok).toBe(true);
      expect(p.step.options).toMatchObject({ wmClass: "X", monitor: 0 });
    });

    it("rejects CLI-only ops with clear error", () => {
      const r = validateStep({ op: "launch", app: "x" });
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/CLI-only/);
      expect(CLI_ONLY_OPS).toContain("launch");
    });

    it("rejects unknown op and missing fields", () => {
      expect(validateStep({ op: "teleport" }).ok).toBe(false);
      expect(validateStep({ op: "focus" }).error).toMatch(/selector/);
      expect(validateStep({ op: "swap", a: "x" }).error).toMatch(/b/);
      expect(validateStep({ op: "set", key: "k" }).error).toMatch(/value/);
    });

    it("lists extension ops", () => {
      expect(EXTENSION_OPS).toContain("layout");
      expect(EXTENSION_OPS).toContain("layout-cycle");
      expect(EXTENSION_OPS).toContain("merge-group");
      expect(EXTENSION_OPS).toContain("group");
      expect(EXTENSION_OPS).toContain("ungroup");
      expect(EXTENSION_OPS).toContain("float");
      expect(EXTENSION_OPS).toContain("order");
      expect(EXTENSION_OPS).toContain("place-next");
      expect(EXTENSION_OPS).toContain("close");
    });

    it("normalizes layout-cycle / merge-group / group / ungroup / float", () => {
      expect(validateStep({ op: "layout-cycle" }).step).toMatchObject({
        op: "layout-cycle",
        axis: "group",
      });
      expect(validateStep({ op: "layout-cycle", axis: "split", selector: "focus" }).step).toEqual({
        op: "layout-cycle",
        axis: "split",
        selector: "focus",
      });
      expect(validateStep({ op: "layout-cycle", axis: "diagonal" }).ok).toBe(false);

      expect(validateStep({ op: "merge-group", selector: "focus", with: "id:2" }).step).toEqual({
        op: "merge-group",
        selector: "focus",
        with: "id:2",
      });
      expect(validateStep({ op: "merge-group", partner: "class:X" }).step).toMatchObject({
        op: "merge-group",
        with: "class:X",
      });
      expect(validateStep({ op: "group", selector: "focus", with: "id:2" }).step).toEqual({
        op: "group",
        selector: "focus",
        with: "id:2",
      });
      expect(validateStep({ op: "ungroup" }).step).toEqual({ op: "ungroup" });
      expect(validateStep({ op: "ungroup", selector: "focus" }).step).toEqual({
        op: "ungroup",
        selector: "focus",
      });

      expect(validateStep({ op: "float" }).step).toEqual({
        op: "float",
        scope: "window",
      });
      expect(validateStep({ op: "float", selector: "focus", scope: "class" }).step).toEqual({
        op: "float",
        selector: "focus",
        scope: "class",
      });
      expect(validateStep({ op: "float", scope: "all" }).ok).toBe(false);
    });

    it("normalizes order with windowIds (≥2)", () => {
      expect(validateStep({ op: "order", windowIds: ["id:1", "id:2"] })).toEqual({
        ok: true,
        step: { op: "order", windowIds: ["id:1", "id:2"] },
      });
      expect(validateStep({ op: "order", selectors: ["id:10", 11] }).step).toMatchObject({
        op: "order",
        windowIds: ["id:10", "11"],
      });
      expect(validateStep({ op: "order" }).ok).toBe(false);
      expect(validateStep({ op: "order", windowIds: ["id:1"] }).error).toMatch(
        /windowIds|selectors/
      );
    });

    it("normalizes size with windowIds + shares", () => {
      expect(validateStep({ op: "size", windowIds: ["id:1", "id:2"], shares: [2, 1] })).toEqual({
        ok: true,
        step: { op: "size", windowIds: ["id:1", "id:2"], shares: [2, 1] },
      });
      expect(EXTENSION_OPS).toContain("size");
      expect(validateStep({ op: "size", windowIds: ["id:1"] }).ok).toBe(false);
      expect(validateStep({ op: "size", windowIds: ["id:1", "id:2"], shares: [1] }).error).toMatch(
        /shares/
      );
      expect(
        validateStep({
          op: "size",
          windowIds: ["id:1", "id:2"],
          shares: [1, 0],
        }).error
      ).toMatch(/positive/);
    });

    it("normalizes close with optional force", () => {
      expect(validateStep({ op: "close", selector: "id:9" })).toEqual({
        ok: true,
        step: { op: "close", selector: "id:9" },
      });
      expect(validateStep({ op: "close", tile: "id:1", force: true }).step).toMatchObject({
        op: "close",
        selector: "id:1",
        force: true,
      });
      expect(validateStep({ op: "close" }).ok).toBe(false);
      expect(validateStep({ op: "close" }).error).toMatch(/selector/);
    });
  });

  describe("validateSteps", () => {
    it("returns normalized steps when all valid", () => {
      const r = validateSteps([{ op: "ping" }, { op: "focus", selector: "focus" }]);
      expect(r.ok).toBe(true);
      expect(r.steps).toHaveLength(2);
    });

    it("collects all invalid indices", () => {
      const r = validateSteps([{ op: "ping" }, { op: "focus" }, { op: "nope" }]);
      expect(r.ok).toBe(false);
      expect(r.results.filter((x) => !x.ok)).toHaveLength(2);
    });
  });

  describe("runStepsDispatch", () => {
    it("dispatches handlers in order and stops on error by default", () => {
      const calls = [];
      const handlers = {
        ping: () => {
          calls.push("ping");
          return { ok: true };
        },
        focus: (s) => {
          calls.push(`focus:${s.selector}`);
          return { error: "not found" };
        },
        set: () => {
          calls.push("set");
          return { ok: true };
        },
      };
      const r = runStepsDispatch(
        [
          { op: "ping" },
          { op: "focus", selector: "class:Missing" },
          { op: "set", key: "k", value: 1 },
        ],
        handlers
      );
      expect(r.ok).toBe(false);
      expect(r.stoppedAt).toBe(1);
      expect(calls).toEqual(["ping", "focus:class:Missing"]);
      expect(r.results).toHaveLength(2);
      expect(r.results[1].error).toMatch(/not found/);
    });

    it("continues when stopOnError is false", () => {
      const handlers = {
        ping: () => ({ ok: true }),
        focus: () => ({ ok: false, error: "boom" }),
        set: (s) => ({ ok: true, key: s.key }),
      };
      const r = runStepsDispatch(
        [
          { op: "ping" },
          { op: "focus", selector: "x" },
          { op: "set", key: "window-gap-size", value: 2 },
        ],
        handlers,
        { stopOnError: false }
      );
      expect(r.ok).toBe(false);
      expect(r.results).toHaveLength(3);
      expect(r.results[0].ok).toBe(true);
      expect(r.results[1].ok).toBe(false);
      expect(r.results[2].ok).toBe(true);
      expect(r.stoppedAt).toBeUndefined();
    });

    it("rejects validation failures without calling handler", () => {
      const focus = vi.fn();
      const r = runStepsDispatch([{ op: "focus" }], { focus });
      expect(focus).not.toHaveBeenCalled();
      expect(r.ok).toBe(false);
      expect(r.results[0].error).toMatch(/selector/);
    });

    it("rejects CLI-only ops", () => {
      const r = runStepsDispatch([{ op: "wait", ms: 100 }], {});
      expect(r.ok).toBe(false);
      expect(r.results[0].error).toMatch(/CLI-only/);
    });

    it("all-ok path", () => {
      const r = runStepsDispatch(
        [{ op: "ping" }, { op: "layout", mode: "hsplit", selector: "focus" }],
        {
          ping: () => ({ ok: true }),
          layout: (s) => ({ ok: true, mode: s.mode }),
        }
      );
      expect(r.ok).toBe(true);
      expect(r.results[1].mode).toBe("HSPLIT");
    });

    it("dispatches close", () => {
      const r = runStepsDispatch([{ op: "close", selector: "id:3", force: true }], {
        close: (s) => ({ ok: true, closed: true, force: !!s.force }),
      });
      expect(r.ok).toBe(true);
      expect(r.results[0]).toMatchObject({ closed: true, force: true });
    });

    it("catches handler throws", () => {
      const r = runStepsDispatch([{ op: "ping" }], {
        ping: () => {
          throw new Error("kaboom");
        },
      });
      expect(r.ok).toBe(false);
      expect(r.results[0].error).toMatch(/kaboom/);
    });
  });

  describe("partitionMixedSteps", () => {
    it("chunks extension vs CLI ops for CLI orchestration", () => {
      const chunks = partitionMixedSteps([
        { op: "set", key: "a", value: 1 },
        { op: "launch", app: "x" },
        { op: "wait-window", wmClass: "X" },
        { op: "focus", selector: "class:X" },
        { op: "layout", mode: "tabbed" },
      ]);
      expect(chunks).toEqual([
        { kind: "extension", steps: [{ op: "set", key: "a", value: 1 }] },
        {
          kind: "cli",
          steps: [
            { op: "launch", app: "x" },
            { op: "wait-window", wmClass: "X" },
          ],
        },
        {
          kind: "extension",
          steps: [
            { op: "focus", selector: "class:X" },
            { op: "layout", mode: "tabbed" },
          ],
        },
      ]);
    });
  });
});
