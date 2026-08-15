import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import path from "path";

const smokePath = path.join(process.cwd(), "cli/smoke-import.mjs");

describe("cli/smoke-import.mjs", () => {
  it("imports listKits under real Node and prints kit ids", () => {
    const result = spawnSync(process.execPath, [smokePath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("safe");
    expect(result.stdout).toContain("vim");
    expect(result.stdout).toContain("i3");
  });
});
