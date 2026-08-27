#!/usr/bin/env node
// @ts-check
/**
 * TOM / OpSet regression runner.
 * Green suite + wrong desk ⇒ paint/translation, not the TOM or OpSet.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initMotionPlog } from "../src/plog.mjs";
import { ATOMIC_CASES } from "./cases-atomics.mjs";
import { COMPOSED_CASES } from "./cases-composed.mjs";
import { MARK2_CASES } from "./cases-mark2.mjs";
import { SHORTHAND_CASES } from "./cases-shorthand.mjs";
import { WORKFLOW_CASES } from "./cases-workflows.mjs";
import { SIZING_CASES } from "./cases-sizing.mjs";
import { runCase } from "./harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.join(__dirname, "..", "logs", "motion-test.log");

fs.mkdirSync(path.dirname(logPath), { recursive: true });
initMotionPlog({
  level: "debug",
  sessionId: "motion-test",
  console: false,
  append: (chunk) => fs.appendFileSync(logPath, chunk),
});

const ALL = [
  ...SHORTHAND_CASES,
  ...ATOMIC_CASES,
  ...COMPOSED_CASES,
  ...MARK2_CASES,
  ...WORKFLOW_CASES,
  ...SIZING_CASES,
];

function parseArgs(argv) {
  /** @type {{ filter: string[], layer: string | null }} */
  const out = { filter: [], layer: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--layer") {
      out.layer = argv[++i] || null;
    } else if (a.startsWith("--layer=")) {
      out.layer = a.slice("--layer=".length);
    } else if (!a.startsWith("-")) {
      out.filter.push(a);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let cases = ALL;
  if (args.layer) {
    cases = cases.filter((c) => c.layer === args.layer);
  }
  if (args.filter.length) {
    cases = cases.filter((c) => args.filter.some((x) => c.id.includes(x)));
  }

  let fails = 0;
  /** @type {Record<string, { ok: number, fail: number }>} */
  const byLayer = {};

  console.log(`TOM / OpSet regressions (${cases.length} cases)\n`);

  for (const c of cases) {
    const out = runCase(c);
    const layer = c.layer || "?";
    if (!byLayer[layer]) byLayer[layer] = { ok: 0, fail: 0 };
    if (out.ok) {
      byLayer[layer].ok++;
      console.log(`  ok  [${layer}] ${out.id}`);
      if (out.actions) console.log(`      ${out.actions}`);
      if (out.after) console.log(`      → ${out.after}`);
    } else {
      byLayer[layer].fail++;
      fails++;
      console.log(`  FAIL [${layer}] ${out.id}`);
      if (c.given) console.log(`      Given:   ${c.given}`);
      if (out.actions) console.log(`      Actions: ${out.actions}`);
      for (const p of out.problems || []) console.log(`      ${p}`);
      if (out.before) console.log(`      before:  ${out.before}`);
    }
    console.log("");
  }

  for (const [layer, n] of Object.entries(byLayer)) {
    console.log(`${layer}: ${n.ok} ok / ${n.fail} fail`);
  }
  console.log(fails ? `\n${fails} FAILED (plog: ${logPath})` : `\nALL PASSED (plog: ${logPath})`);
  process.exit(fails ? 1 : 0);
}

main();
