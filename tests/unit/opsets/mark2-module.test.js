import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getOpSet, mark2Move, runOpAbstract } from "../../../lib/opsets/index.js";
import { mark2Move as libMark2Move } from "../../../lib/opsets/mark2.js";
import { mark2Move as protoMark2Move } from "../../../prototypes/container-motion/src/opsets/mark2.mjs";

const LIB_OPSETS = join(dirname(fileURLToPath(import.meta.url)), "../../../lib/opsets");

describe("lib/opsets mark2", () => {
  it("getOpSet('mark2').ops.move is a function", () => {
    expect(typeof getOpSet("mark2").ops.move).toBe("function");
    expect(getOpSet("mark2").ops.move).toBe(mark2Move);
    expect(typeof runOpAbstract).toBe("function");
  });

  it("proto mark2Move is the lib binding", () => {
    expect(protoMark2Move).toBe(libMark2Move);
    expect(protoMark2Move).toBe(mark2Move);
  });

  it("lib/opsets source does not import proto or plog", () => {
    for (const name of ["mark2.js", "mark2-pointer.js", "transact.js", "transfer.js", "index.js"]) {
      const src = readFileSync(join(LIB_OPSETS, name), "utf8");
      expect(src, name).not.toMatch(/prototypes\/container-motion/);
      expect(src, name).not.toMatch(/plog\.mjs/);
    }
  });

  it("MARK2_OPSET.pointer is wired", () => {
    const set = getOpSet("mark2");
    expect(typeof set.pointer?.hover).toBe("function");
    expect(typeof set.pointer?.release).toBe("function");
  });
});
