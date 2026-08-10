import { describe, it, expect, beforeEach } from "vitest";
import { SuppressFlag } from "../../../lib/extension/suppress.js";

describe("SuppressFlag", () => {
  /** @type {SuppressFlag} */
  let s;

  beforeEach(() => {
    s = new SuppressFlag({ label: "test" });
  });

  it("starts inactive at depth 0", () => {
    expect(s.active).toBe(false);
    expect(s.depth).toBe(0);
    expect(s.label).toBe("test");
  });

  it("default label is suppress", () => {
    expect(new SuppressFlag().label).toBe("suppress");
  });

  it("enter/leave toggles active and depth", () => {
    s.enter();
    expect(s.active).toBe(true);
    expect(s.depth).toBe(1);
    s.leave();
    expect(s.active).toBe(false);
    expect(s.depth).toBe(0);
  });

  it("leave at depth 0 clamps (no negative)", () => {
    s.leave();
    s.leave();
    expect(s.depth).toBe(0);
    expect(s.active).toBe(false);
  });

  it("run sets active during fn and restores after", () => {
    expect(s.active).toBe(false);
    let saw = false;
    s.run(() => {
      expect(s.active).toBe(true);
      expect(s.depth).toBe(1);
      saw = true;
    });
    expect(saw).toBe(true);
    expect(s.active).toBe(false);
    expect(s.depth).toBe(0);
  });

  it("run returns fn return value", () => {
    expect(s.run(() => 42)).toBe(42);
    expect(s.run(() => "ok")).toBe("ok");
    expect(s.active).toBe(false);
  });

  it("nested run increments depth and restores stepwise", () => {
    s.run(() => {
      expect(s.depth).toBe(1);
      s.run(() => {
        expect(s.depth).toBe(2);
        expect(s.active).toBe(true);
        s.run(() => {
          expect(s.depth).toBe(3);
        });
        expect(s.depth).toBe(2);
      });
      expect(s.depth).toBe(1);
    });
    expect(s.depth).toBe(0);
    expect(s.active).toBe(false);
  });

  it("throw inside run restores prior depth (outer still active)", () => {
    s.enter(); // outer held
    expect(s.depth).toBe(1);
    expect(() => {
      s.run(() => {
        expect(s.depth).toBe(2);
        throw new Error("boom");
      });
    }).toThrow("boom");
    expect(s.depth).toBe(1);
    expect(s.active).toBe(true);
    s.leave();
    expect(s.active).toBe(false);
  });

  it("throw inside nested run restores fully when no outer hold", () => {
    expect(() => {
      s.run(() => {
        s.run(() => {
          throw new Error("inner");
        });
      });
    }).toThrow("inner");
    expect(s.depth).toBe(0);
    expect(s.active).toBe(false);
  });

  it("throw at outermost run leaves inactive (no sticky flag)", () => {
    expect(() => {
      s.run(() => {
        throw new Error("outer");
      });
    }).toThrow("outer");
    expect(s.active).toBe(false);
    expect(s.depth).toBe(0);
  });

  it("re-entrant: same flag used from nested call sites", () => {
    /** @type {number[]} */
    const depths = [];
    function outer() {
      s.run(() => {
        depths.push(s.depth);
        mid();
        depths.push(s.depth);
      });
    }
    function mid() {
      s.run(() => {
        depths.push(s.depth);
        inner();
        depths.push(s.depth);
      });
    }
    function inner() {
      s.run(() => {
        depths.push(s.depth);
      });
    }
    outer();
    expect(depths).toEqual([1, 2, 3, 2, 1]);
    expect(s.active).toBe(false);
  });

  it("independent flags do not share depth", () => {
    const a = new SuppressFlag({ label: "geom" });
    const b = new SuppressFlag({ label: "above" });
    a.run(() => {
      expect(a.active).toBe(true);
      expect(b.active).toBe(false);
      b.run(() => {
        expect(a.active).toBe(true);
        expect(b.active).toBe(true);
      });
      expect(b.active).toBe(false);
      expect(a.active).toBe(true);
    });
    expect(a.active).toBe(false);
    expect(b.active).toBe(false);
  });

  it("throw on one flag does not affect another", () => {
    const a = new SuppressFlag({ label: "a" });
    const b = new SuppressFlag({ label: "b" });
    b.enter();
    expect(() => {
      a.run(() => {
        throw new Error("a-fail");
      });
    }).toThrow("a-fail");
    expect(a.active).toBe(false);
    expect(b.active).toBe(true);
    expect(b.depth).toBe(1);
    b.leave();
  });

  it("snapshot reports label depth active", () => {
    expect(s.snapshot()).toEqual({ label: "test", depth: 0, active: false });
    s.enter();
    s.enter();
    expect(s.snapshot()).toEqual({ label: "test", depth: 2, active: true });
    s.leave();
    expect(s.snapshot()).toEqual({ label: "test", depth: 1, active: true });
  });

  it("manual enter/leave nests with run", () => {
    s.enter();
    s.run(() => {
      expect(s.depth).toBe(2);
    });
    expect(s.depth).toBe(1);
    s.leave();
    expect(s.depth).toBe(0);
  });
});
