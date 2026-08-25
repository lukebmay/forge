/** @typedef {import('./tree.mjs').Forest} Forest */
/** @typedef {import('./tree.mjs').MonitorGeom} MonitorGeom */

/** Host `black`: two landscape 4K-ish panels side by side. */
export const BLACK_MONITORS = /** @type {MonitorGeom[]} */ ([
  { id: "mon0", x: 0, y: 0, width: 2560, height: 1440, primary: true },
  { id: "mon1", x: 2560, y: 0, width: 2560, height: 1440, primary: false },
]);

/**
 * @param {import('./tree.mjs').TreeApi} api
 * @returns {Forest}
 */
export function seedBlackDesk(api) {
  const forest = api.createForest(BLACK_MONITORS.map((m) => ({ ...m })));
  const [m0, m1] = forest.monitors;

  const a = api.makeWindow("A", "chrome");
  const b = api.makeWindow("B", "grok");
  const c = api.makeWindow("C", "ghostty");
  const tab0 = api.makeCon("TABBED", [a, b]);
  tab0.lastTabFocusId = b.id;
  const root0 = api.makeCon("HSPLIT", [tab0, c]);
  api.setChildren(forest, m0, [root0]);

  const d = api.makeWindow("D", "ghostty");
  const e = api.makeWindow("E", "chrome");
  const f = api.makeWindow("F", "youtube");
  const tab1 = api.makeCon("TABBED", [e, f]);
  tab1.lastTabFocusId = f.id;
  const root1 = api.makeCon("HSPLIT", [d, tab1]);
  api.setChildren(forest, m1, [root1]);

  forest.focusId = b.id;
  forest.selectionId = b.id;
  return forest;
}

export const MONITOR_PRESETS = {
  black: {
    label: "black (2×2560×1440)",
    monitors: BLACK_MONITORS,
  },
  laptop: {
    label: "laptop (1×1920×1080)",
    monitors: [{ id: "mon0", x: 0, y: 0, width: 1920, height: 1080, primary: true }],
  },
  portraitTwin: {
    label: "portrait twin",
    monitors: [
      { id: "mon0", x: 0, y: 0, width: 1440, height: 2560, primary: true },
      { id: "mon1", x: 1440, y: 0, width: 1440, height: 2560, primary: false },
    ],
  },
  triple: {
    label: "triple row",
    monitors: [
      { id: "mon0", x: 0, y: 0, width: 1920, height: 1080, primary: false },
      { id: "mon1", x: 1920, y: 0, width: 2560, height: 1440, primary: true },
      { id: "mon2", x: 4480, y: 0, width: 1920, height: 1080, primary: false },
    ],
  },
};
