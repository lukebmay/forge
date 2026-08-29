/** Duck-typed live node for epochs restore tests (no Tree/St). */

export function makeNode({
  kind,
  id,
  layout = "HSPLIT",
  percent = 0,
  userSized = false,
  lastTabFocus = null,
} = {}) {
  const node = {
    kind,
    layout,
    percent,
    userSized,
    lastTabFocus,
    childNodes: [],
    parentNode: null,
    nodeValue: kind === "WINDOW" || kind === "MONITOR" ? id : {},
    windowId: kind === "WINDOW" ? String(id) : undefined,
    isWindow: () => kind === "WINDOW",
    isCon: () => kind === "CON",
    isMonitor: () => kind === "MONITOR",
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
    },
    removeChild(child) {
      this.childNodes = this.childNodes.filter((c) => c !== child);
      if (child.parentNode === this) child.parentNode = null;
    },
    replaceChildren(next) {
      for (const c of [...this.childNodes]) this.removeChild(c);
      for (const c of next || []) this.appendChild(c);
    },
    get index() {
      return this.parentNode ? this.parentNode.childNodes.indexOf(this) : null;
    },
  };
  return node;
}

export function makeMonitor(id, layout = "HSPLIT") {
  return makeNode({ kind: "MONITOR", id, layout });
}

export function makeCon(layout = "HSPLIT") {
  return makeNode({ kind: "CON", layout });
}

export function makeWin(id, opts = {}) {
  return makeNode({ kind: "WINDOW", id, ...opts });
}

export function winDesc(windowId, extra = {}) {
  return {
    kind: "WINDOW",
    windowId: String(windowId),
    percent: 0,
    userSized: false,
    ...extra,
  };
}

export function conDesc(layout, children, extra = {}) {
  return {
    kind: "CON",
    layout,
    percent: 0,
    userSized: false,
    children,
    ...extra,
  };
}
