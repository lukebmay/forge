import { describe, it, expect, beforeEach } from "vitest";
import { Node, NODE_TYPES, LAYOUT_TYPES } from "../../lib/extension/tree.js";
import {
  createTreeFixture,
  getWorkspaceAndMonitor,
  createWindowNode,
} from "../mocks/helpers/index.js";

/**
 * Bug forge-mo27: removeChild resolved the child to splice by node.index, but
 * gated on contains() — and those use different bases. Classic Node.contains()
 * matched by nodeValue; index matches by identity. A stale value-twin could
 * make contains() true while index was null → splice(null,1) → splice(0,1)
 * evicted the wrong sibling.
 *
 * G8n: LiveHandle.contains is identity-based; removeChild returns null (no
 * throw) when the node is not a direct child. Assert no eviction + identity
 * detach via childNodes (list mutator), not Forest kidsOf.
 */
describe("Bug forge-mo27: removeChild resolves the child by identity, not value", () => {
  let ctx;

  beforeEach(() => {
    ctx = createTreeFixture({ fullExtWm: true, settings: { "tiling-mode-enabled": true } });
  });

  it("never evicts the wrong sibling when handed a stale value-twin reference", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const a = createWindowNode(ctx.tree, monitor).nodeWindow;
    const b = createWindowNode(ctx.tree, monitor).nodeWindow;
    expect(monitor.childNodes).toEqual([a, b]);

    const stale = new Node(NODE_TYPES.WINDOW, b.nodeValue);
    stale.parentNode = monitor;
    expect(monitor.contains(stale)).toBe(false);
    expect(stale.index).toBe(null);

    // LiveHandle: missing child → null (no throw); siblings untouched.
    expect(monitor.removeChild(stale)).toBeNull();
    expect(monitor.childNodes).toEqual([a, b]);
  });

  it("still detaches a genuine direct child by identity", () => {
    const { monitor } = getWorkspaceAndMonitor(ctx);
    monitor.layout = LAYOUT_TYPES.HSPLIT;
    const a = createWindowNode(ctx.tree, monitor).nodeWindow;
    const b = createWindowNode(ctx.tree, monitor).nodeWindow;

    const removed = monitor.removeChild(a);

    expect(removed).toEqual([a]);
    expect(a.parentNode).toBe(null);
    expect(monitor.childNodes).toEqual([b]);
  });
});
