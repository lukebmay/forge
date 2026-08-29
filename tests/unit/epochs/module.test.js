import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const LIB_EPOCHS = join(dirname(fileURLToPath(import.meta.url)), "../../../lib/epochs");

describe("lib/epochs module", () => {
  it("source has no gi/host/proto/plog", () => {
    const files = readdirSync(LIB_EPOCHS).filter((n) => n.endsWith(".js"));
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const src = readFileSync(join(LIB_EPOCHS, name), "utf8");
      expect(src, name).not.toMatch(/gi:\/\//);
      expect(src, name).not.toMatch(/tree\.js/);
      expect(src, name).not.toMatch(/window\.js/);
      expect(src, name).not.toMatch(/prototypes\/container-motion/);
      expect(src, name).not.toMatch(/plog/);
      expect(src, name).not.toMatch(/\bMeta\b/);
    }
  });
});
