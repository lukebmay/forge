import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { setProductionForTests } from "../../../lib/shared/production.js";
import {
  LOG_LEVELS,
  init,
  resetForTests,
  siblingJsonlPath,
} from "../../../lib/shared/plog-adapter.js";
import { huntTileSlotFloat } from "../../../lib/extension/hunt-logs.js";

describe("hunt-logs tile-slot-float fields (D067 Q6)", () => {
  /** @type {string | null} */
  let tmpFile;
  /** @type {string | undefined} */
  let prevJsonlEnv;

  beforeEach(() => {
    tmpFile = null;
    prevJsonlEnv = process.env.FORGE_LOG_JSONL;
    setProductionForTests(false);
    resetForTests();
  });

  afterEach(() => {
    resetForTests();
    if (prevJsonlEnv === undefined) delete process.env.FORGE_LOG_JSONL;
    else process.env.FORGE_LOG_JSONL = prevJsonlEnv;
    if (tmpFile) {
      try {
        fs.unlinkSync(tmpFile);
      } catch (_e) {
        /* */
      }
      try {
        fs.unlinkSync(siblingJsonlPath(tmpFile));
      } catch (_e) {
        /* */
      }
    }
  });

  it("emits debug JSONL with non-empty payload fields", () => {
    tmpFile = path.join(os.tmpdir(), `forge-hunt-fields-${process.pid}-${Date.now()}.log`);
    delete process.env.FORGE_LOG_JSONL;
    init(
      {
        get_boolean: () => true,
        get_uint: () => LOG_LEVELS.TRACE,
      },
      { sink: vi.fn(), file: tmpFile }
    );

    huntTileSlotFloat("processFloats", {
      id: "w9",
      action: "float",
      metaMon: 1,
      applyLive: true,
    });

    const jsonlPath = siblingJsonlPath(tmpFile);
    const lines = fs
      .readFileSync(jsonlPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const row = lines.find((r) => String(r.text || "").includes("hunt:tile-slot-float"));
    expect(row).toBeTruthy();
    expect(row.level).toBe("debug");
    expect(row.text).toBe("hunt:tile-slot-float processFloats");
    expect(row.payload).toEqual({
      id: "w9",
      action: "float",
      metaMon: 1,
      applyLive: true,
    });
  });
});
