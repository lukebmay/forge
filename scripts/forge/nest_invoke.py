#!/usr/bin/env python3
"""Nest/e2e Mark 2 invoke: Shell.Eval → extWm.command({name}) without Super+key.

Wraps the e2e bridge path (tests/e2e/framework/bridge.js invokeForgeAction).
Not product ``forge Move`` (dest-reparent). Action ids are Mark 2 / ACTIONS.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence

FORGE_UUID = "forge@jmmaranan.com"
FORGE_BUS_NAME = "org.gnome.Shell.Extensions.Forge"
FORGE_OBJECT_PATH = "/org/gnome/Shell/Extensions/Forge"
FORGE_INTERFACE = "org.gnome.Shell.Extensions.Forge"

# lib/keybinds/actions.js ACTIONS (Mark 2 ids). Host PascalCase still accepted.
MARK2_ACTION_IDS = frozenset(
    {
        "focus.left",
        "focus.down",
        "focus.up",
        "focus.right",
        "focus.parent",
        "focus.child",
        "move.left",
        "move.down",
        "move.up",
        "move.right",
        "join.left",
        "join.down",
        "join.up",
        "join.right",
        "toggleSplit",
        "toggleTabStack",
        "layout.cycle-",
        "layout.cycle+",
        "promote",
        "promoteRecursive",
        "remove",
        "launch",
        "size.nudge.x-",
        "size.nudge.x+",
        "size.nudge.y-",
        "size.nudge.y+",
        "size.share",
        "size.shareSiblings",
        "size.shareSiblingsOnly",
        "size.shareSelfSiblingsParent",
        "size.shareParent",
        "size.shareParentGroup",
        "size.shareParentSiblingsOnly",
        "size.shareBothGroups",
        "size.shareAll",
        "size.preset.7",
        "size.preset.8",
        "size.preset.9",
        "size.preset.0",
    }
)

HINTS = ("leftmost", "rightmost", "topmost", "bottommost")

_GUI_DROP = (
    "NO_COLOR",
    "FORCE_COLOR",
    "CLICOLOR",
    "CLICOLOR_FORCE",
    "CARGO_TERM_COLOR",
    "PIP_NO_COLOR",
    "NPM_CONFIG_COLOR",
    "PY_COLORS",
    "PYTHON_COLORS",
    "FORGE_JOB",
    "FORGE_JOB_WORKER",
    "FORGE_JOB_ID",
    "FORGE_JOB_DIR",
)

# Tokens so json.dumps payloads cannot collide with the template source.
_ACTION_TOKEN = "%%FORGE_INVOKE_ACTION%%"
_SPEC_TOKEN = "%%FORGE_INVOKE_SPEC%%"
_DND_SPEC_TOKEN = "%%FORGE_DND_SPEC%%"

# GJS Eval (no import). Mirrors bridge.js invokeForgeAction + nest selectors.
_INVOKE_JS = r"""
(function () {
  try {
    const action = %%FORGE_INVOKE_ACTION%%;
    const spec = %%FORGE_INVOKE_SPEC%% || {};
    const uuid = "forge@jmmaranan.com";
    const rec = Main.extensionManager.lookup(uuid);
    if (!rec || !rec.stateObj) return JSON.stringify({ ok: false, error: "Forge not loaded" });
    const ext = rec.stateObj;
    if (!ext.extWm) return JSON.stringify({ ok: false, error: "extWm not available" });

    const ws = global.workspace_manager.get_active_workspace();
    const wins = ws.list_windows() || [];

    function metaInfo(w) {
      const id = String(w.get_id());
      const wmClass = w.get_wm_class ? String(w.get_wm_class() || "") : "";
      const inst = w.get_wm_class_instance ? String(w.get_wm_class_instance() || "") : "";
      const gtk = w.get_gtk_application_id ? String(w.get_gtk_application_id() || "") : "";
      const title = w.get_title ? String(w.get_title() || "") : "";
      const r = w.get_frame_rect();
      return {
        w: w,
        id: id,
        wmClass: wmClass,
        inst: inst,
        gtk: gtk,
        title: title,
        x: r ? r.x : 0,
        y: r ? r.y : 0
      };
    }
    const metas = [];
    for (let i = 0; i < wins.length; i++) {
      const info = metaInfo(wins[i]);
      if (ext.extWm.findNodeWindow && ext.extWm.findNodeWindow(info.w)) {
        metas.push(info);
      }
    }

    function hay(m) {
      return (m.wmClass + " " + m.inst + " " + m.gtk).toLowerCase();
    }

    function fromSessionApi(sel) {
      if (!sel || !ext.sessionApi || typeof ext.sessionApi._resolveWindow !== "function") {
        return null;
      }
      const input = spec.first ? { selector: sel, first: true } : sel;
      const r = ext.sessionApi._resolveWindow(input);
      if (!r || !r.ok || !r.match || !r.match.node) {
        return { error: (r && r.error) ? String(r.error) : "selector miss" };
      }
      const meta = r.match.node.nodeValue;
      if (!meta || typeof meta.get_id !== "function") {
        return { error: "selector did not resolve a WINDOW" };
      }
      return { w: meta };
    }

    function pickMeta() {
      let pool = metas.slice();
      if (spec.id) {
        const want = String(spec.id);
        pool = pool.filter(function (m) { return m.id === want; });
      }
      if (spec.wmClass) {
        const n = String(spec.wmClass).toLowerCase();
        pool = pool.filter(function (m) { return hay(m).indexOf(n) !== -1; });
      }
      if (spec.title) {
        const n = String(spec.title).toLowerCase();
        pool = pool.filter(function (m) {
          return String(m.title).toLowerCase().indexOf(n) !== -1;
        });
      }
      const hint = spec.hint ? String(spec.hint) : "";
      if (hint === "leftmost") pool.sort(function (a, b) { return a.x - b.x; });
      else if (hint === "rightmost") pool.sort(function (a, b) { return b.x - a.x; });
      else if (hint === "topmost") pool.sort(function (a, b) { return a.y - b.y; });
      else if (hint === "bottommost") pool.sort(function (a, b) { return b.y - a.y; });
      if (pool.length === 0) return null;
      return pool[0];
    }

    const origFn = global.display.get_focus_window;
    let focusMethod = "natural";
    let targetWin = origFn.call(global.display);
    const wantSel = !!(spec.selector || spec.id || spec.wmClass || spec.title || spec.hint);

    if (spec.selector) {
      const via = fromSessionApi(String(spec.selector));
      if (via && via.error) return JSON.stringify({ ok: false, error: via.error });
      if (via && via.w) {
        targetWin = via.w;
        focusMethod = "selector";
      } else {
        const picked = pickMeta();
        if (!picked) return JSON.stringify({ ok: false, error: "no matching tiled window" });
        targetWin = picked.w;
        focusMethod = "selector_meta";
      }
    } else if (spec.id) {
      // GetTree windowId is Forest nanoid (metaWindowId = Meta); resolve via tile-select.
      const via = fromSessionApi("id:" + String(spec.id));
      if (via && via.error) return JSON.stringify({ ok: false, error: via.error });
      if (via && via.w) {
        targetWin = via.w;
        focusMethod = "id_selector";
      } else {
        const picked = pickMeta();
        if (!picked) return JSON.stringify({ ok: false, error: "no matching tiled window" });
        targetWin = picked.w;
        focusMethod = "id_meta";
      }
    } else if (wantSel) {
      const picked = pickMeta();
      if (!picked) return JSON.stringify({ ok: false, error: "no matching tiled window" });
      targetWin = picked.w;
      focusMethod = spec.hint ? "hint_override" : "selector";
    } else if (!targetWin && metas.length > 0) {
      targetWin = metas[0].w;
      focusMethod = "display_override";
    }

    if (targetWin && ext.extWm.findNodeWindow && !ext.extWm.findNodeWindow(targetWin)) {
      return JSON.stringify({ ok: false, error: "target not in forge tree" });
    }

    if (targetWin) {
      global.display.get_focus_window = function () { return targetWin; };
      if (spec.activate) {
        try { targetWin.focus(global.get_current_time()); } catch (e1) {}
      }
    }

    try {
      ext.extWm.command(action);
      const node = targetWin && ext.extWm.findNodeWindow
        ? ext.extWm.findNodeWindow(targetWin)
        : null;
      const parent = node && node.parentNode;
      return JSON.stringify({
        ok: true,
        name: action && action.name ? String(action.name) : "",
        focusMethod: focusMethod,
        windowId: targetWin && targetWin.get_id ? String(targetWin.get_id()) : null,
        inTree: !!node,
        parentLayout: parent && parent.layout != null ? String(parent.layout) : null
      });
    } finally {
      global.display.get_focus_window = origFn;
    }
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) });
  }
})()
""".strip()

# GJS Eval: sessionApi._dndDropOp → _commitResolvedDrop (empty-mon: destMonitor).
_DND_DROP_JS = r"""
(function () {
  try {
    const spec = %%FORGE_DND_SPEC%% || {};
    const uuid = "forge@jmmaranan.com";
    const rec = Main.extensionManager.lookup(uuid);
    if (!rec || !rec.stateObj) return JSON.stringify({ ok: false, error: "Forge not loaded" });
    const ext = rec.stateObj;
    const api = ext.sessionApi;
    if (!api || typeof api._dndDropOp !== "function") {
      return JSON.stringify({ ok: false, error: "sessionApi._dndDropOp missing" });
    }
    const tile = spec.tile != null ? String(spec.tile) : "focus";
    const onto = spec.onto != null ? String(spec.onto) : "";
    const zone = spec.zone != null ? String(spec.zone) : "CENTER";
    const opts = {
      quiet: spec.quiet !== false,
      simulateEnteredMonitor: spec.simulateEnteredMonitor !== false
    };
    if (typeof spec.destMonitor === "number") opts.destMonitor = spec.destMonitor;
    const out = api._dndDropOp(tile, onto, zone, opts) || {};
    if (out.error) {
      return JSON.stringify({
        ok: false,
        error: String(out.error),
        path: out.emptyMon ? "empty-mon" : "commitResolved"
      });
    }
    out.ok = out.ok !== false;
    out.path = out.emptyMon ? "empty-mon" : "commitResolved";
    return JSON.stringify(out);
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) });
  }
})()
""".strip()


class InvokeError(RuntimeError):
    """User-facing invoke failure (exit 1)."""

    exit_code: int = 1

    def __init__(self, message: str, *, exit_code: int = 1) -> None:
        super().__init__(message)
        self.exit_code = int(exit_code)


def smoke_script_path() -> Path:
    return Path(__file__).resolve().parent / "nest_mark2_smoke.py"


def smoke_script_argv() -> list[str]:
    return [sys.executable, str(smoke_script_path())]


def validate_action_name(name: str) -> str:
    n = (name or "").strip()
    if not n or any(ch.isspace() for ch in n):
        raise InvokeError("action id required (e.g. move.left, join.right, toggleSplit)")
    low = n.lower()
    if low == "move":
        raise InvokeError(
            "use a Mark 2 id like move.left — product forge Move is dest-reparent, not this"
        )
    if low == "swap":
        raise InvokeError("use a Mark 2 id like join.left — not product forge swap")
    return n


def parse_invoke_argv(argv: Sequence[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="forge-test nested invoke",
        description=(
            "Call extWm.command({name}) in the nest via Shell.Eval (same as e2e "
            "invoke_forge_action). No Super+key. Not product forge Move."
        ),
    )
    p.add_argument(
        "action",
        help="Mark 2 action id (move.left / join.right / toggleSplit / promote / focus.*)",
    )
    p.add_argument(
        "--selector",
        default=None,
        help="Product tile selector (id: / class: / title~= / path: / focus)",
    )
    p.add_argument("--window-id", dest="window_id", default=None, help="Meta window id")
    p.add_argument(
        "--class",
        dest="wm_class",
        default=None,
        help="wmClass / gtk app id substring",
    )
    p.add_argument("--title", default=None, help="title substring")
    p.add_argument("--hint", choices=HINTS, default=None, help="geometry pick (e2e-style)")
    p.add_argument(
        "--first",
        action="store_true",
        help="With --selector: take first match when ambiguous",
    )
    p.add_argument(
        "--activate",
        action="store_true",
        help="Also Meta.focus the target (async handlers)",
    )
    p.add_argument("--json", dest="json_out", action="store_true", help="Print JSON result")
    p.add_argument(
        "--timeout",
        type=float,
        default=8.0,
        help="Eval timeout seconds (default 8)",
    )
    return p.parse_args(list(argv))


def spec_from_args(args: argparse.Namespace) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "selector": getattr(args, "selector", None),
        "id": getattr(args, "window_id", None),
        "wmClass": getattr(args, "wm_class", None),
        "title": getattr(args, "title", None),
        "hint": getattr(args, "hint", None),
        "first": bool(getattr(args, "first", False)),
        "activate": bool(getattr(args, "activate", False)),
    }
    return {k: v for k, v in spec.items() if v not in (None, False, "")} | {
        "activate": bool(spec.get("activate")),
        "first": bool(spec.get("first")),
    }


def build_invoke_js(action: Mapping[str, Any], spec: Optional[Mapping[str, Any]] = None) -> str:
    payload = json.dumps(dict(action), separators=(",", ":"))
    spec_js = json.dumps(dict(spec or {}), separators=(",", ":"))
    return _INVOKE_JS.replace(_ACTION_TOKEN, payload).replace(_SPEC_TOKEN, spec_js)


def parse_dnd_drop_argv(argv: Sequence[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="forge-test nested dnd-drop",
        description=(
            "Synthetic DnD via sessionApi._dndDropOp → _commitResolvedDrop. "
            "Empty-mon uses --dest-monitor → _commitEmptyMonitorDrop. "
            "Not a Mark 2 action id (that is nested invoke)."
        ),
    )
    p.add_argument(
        "tile",
        help="Dragged tile: product selector, Meta id, or hint (leftmost/…)",
    )
    p.add_argument(
        "onto",
        nargs="?",
        default=None,
        help="Drop target (omit with --dest-monitor)",
    )
    p.add_argument("--zone", default="CENTER", help="LEFT|RIGHT|TOP|BOTTOM|CENTER")
    p.add_argument(
        "--dest-monitor",
        dest="dest_monitor",
        type=int,
        default=None,
        help="Empty-mon drop (R015); omit onto",
    )
    p.add_argument("--json", dest="json_out", action="store_true", help="Print JSON result")
    p.add_argument("--timeout", type=float, default=8.0, help="Eval timeout seconds")
    p.add_argument(
        "--no-simulate-entered",
        dest="simulate_entered",
        action="store_false",
        help="Skip GRAB_TILE entered-monitor probe",
    )
    p.set_defaults(simulate_entered=True)
    return p.parse_args(list(argv))


def dnd_token_to_selector(token: str, forest: Optional[Mapping[str, Any]] = None) -> str:
    t = (token or "").strip()
    if not t:
        raise InvokeError("tile/onto token required")
    if t in HINTS:
        if forest is None:
            raise InvokeError(f"hint {t} needs GetTree")
        wid = resolve_window_id(forest, {"hint": t})
        if not wid:
            raise InvokeError(f"no tiled window for hint {t}")
        return f"id:{wid}"
    if t.isdigit():
        return f"id:{t}"
    return t


def build_dnd_drop_js(spec: Mapping[str, Any]) -> str:
    spec_js = json.dumps(dict(spec or {}), separators=(",", ":"))
    return _DND_DROP_JS.replace(_DND_SPEC_TOKEN, spec_js)


def _unquote_gvariant(s: str) -> str:
    t = s.strip()
    if len(t) >= 2 and t[0] == t[-1] and t[0] in ("'", '"'):
        q = t[0]
        body = t[1:-1]
        out: list[str] = []
        i = 0
        while i < len(body):
            ch = body[i]
            if ch == "\\" and i + 1 < len(body):
                nxt = body[i + 1]
                if nxt == "n":
                    out.append("\n")
                elif nxt == "t":
                    out.append("\t")
                elif nxt == "\\":
                    out.append("\\")
                elif nxt == q:
                    out.append(q)
                elif nxt == '"':
                    out.append('"')
                elif nxt == "'":
                    out.append("'")
                else:
                    out.append(nxt)
                i += 2
                continue
            out.append(ch)
            i += 1
        return "".join(out)
    return t


def unpack_eval_payload(raw: str) -> str:
    """Second element of gdbus Eval tuple → JS return text."""
    out = (raw or "").strip()
    if out.startswith("(") and out.endswith(")"):
        inner = out[1:-1].strip()
        if inner.startswith("true"):
            inner = inner[4:].lstrip()
        elif inner.startswith("false"):
            inner = inner[5:].lstrip()
        if inner.startswith(","):
            inner = inner[1:].strip()
        return _unquote_gvariant(inner)
    return out


def parse_invoke_result(raw: str) -> dict[str, Any]:
    text = unpack_eval_payload(raw)
    try:
        parsed: Any = json.loads(text)
    except json.JSONDecodeError:
        return {"ok": False, "error": f"non-json eval: {text[:240]}"}
    if isinstance(parsed, str):
        try:
            parsed = json.loads(parsed)
        except json.JSONDecodeError:
            return {"ok": False, "error": parsed}
    if not isinstance(parsed, dict):
        return {"ok": False, "error": f"unexpected eval: {parsed!r}"}
    return parsed


def unpack_gdbus_string(stdout: str) -> str:
    """Forge DBus methods return a single string tuple."""
    out = (stdout or "").strip()
    if out.startswith("(") and out.endswith(")"):
        inner = out[1:-1].strip()
        if inner.endswith(","):
            inner = inner[:-1].strip()
        return _unquote_gvariant(inner)
    return out


def _focus_before_command(bus_address: str, spec: Mapping[str, Any]) -> Optional[str]:
    """Canonical DBus Focus (tile-select) so command() is not ambient-only."""
    selector = spec.get("selector")
    if selector:
        sel = str(selector)
        if spec.get("first") and not sel.strip().startswith("{"):
            sel = json.dumps({"selector": sel, "first": True})
        raw = forge_dbus_call(bus_address, "Focus", [sel])
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {}
        if isinstance(data, dict) and data.get("error"):
            raise InvokeError(f"Focus {sel}: {data['error']}")
        cand = data.get("candidate") if isinstance(data, dict) else None
        if isinstance(cand, dict) and cand.get("windowId") is not None:
            return str(cand["windowId"])
        return None
    wid = spec.get("id")
    if not wid:
        wid = resolve_window_id(get_tree(bus_address), spec)
    if not wid:
        return None
    raw = forge_dbus_call(bus_address, "Focus", [f"id:{wid}"])
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        data = {}
    if isinstance(data, dict) and data.get("error"):
        raise InvokeError(f"Focus id:{wid}: {data['error']}")
    return str(wid)


def invoke_on_bus(
    bus_address: str,
    action_name: str,
    *,
    spec: Optional[Mapping[str, Any]] = None,
    timeout: float = 8.0,
) -> dict[str, Any]:
    from nested_wayland import shell_eval

    name = validate_action_name(action_name)
    spec_d = dict(spec or {})
    want = any(spec_d.get(k) for k in ("selector", "id", "wmClass", "title", "hint"))
    if want:
        try:
            focused = _focus_before_command(bus_address, spec_d)
            if focused and not spec_d.get("id"):
                spec_d["id"] = focused
            spec_d["activate"] = True
        except InvokeError:
            spec_d["activate"] = True
    js = build_invoke_js({"name": name}, spec_d)
    ok, payload = shell_eval(bus_address, js, timeout=timeout)
    if not ok:
        raise InvokeError(f"Shell.Eval failed: {payload}")
    result = parse_invoke_result(payload)
    if not result.get("ok"):
        raise InvokeError(result.get("error") or str(result))
    result["name"] = result.get("name") or name
    return result


def forge_dbus_call(
    bus_address: str,
    method: str,
    args: Sequence[str] = (),
    *,
    timeout: float = 8.0,
) -> str:
    from nested_wayland import _gdbus

    argv = [
        "call",
        "--session",
        "--dest",
        FORGE_BUS_NAME,
        "--object-path",
        FORGE_OBJECT_PATH,
        "--method",
        f"{FORGE_INTERFACE}.{method}",
        *list(args),
    ]
    proc = _gdbus(bus_address, argv, timeout=timeout)
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip() or f"exit {proc.returncode}"
        raise InvokeError(f"DBus {method} failed: {err}")
    return unpack_gdbus_string(proc.stdout or "")


def get_tree_options_json(*, workspace: Optional[int] = None) -> str:
    """GetTree options_json. Unfiltered ``{}``; else 0-based Meta workspace."""
    if workspace is None:
        return "{}"
    return json.dumps({"workspace": int(workspace)}, separators=(",", ":"))


def get_tree(
    bus_address: str,
    *,
    timeout: float = 8.0,
    workspace: Optional[int] = None,
) -> dict[str, Any]:
    last_err: Optional[BaseException] = None
    for attempt in range(3):
        try:
            raw = forge_dbus_call(
                bus_address,
                "GetTree",
                [get_tree_options_json(workspace=workspace)],
                timeout=timeout,
            )
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as e:
                raise InvokeError(f"GetTree not JSON: {raw[:240]}") from e
            if not isinstance(data, dict):
                raise InvokeError("GetTree returned non-object")
            if data.get("error"):
                raise InvokeError(f"GetTree: {data['error']}")
            return data
        except InvokeError as e:
            last_err = e
            msg = str(e)
            transient = "NoReply" in msg or "timeout" in msg.lower()
            if not transient or attempt >= 2:
                raise
            time.sleep(0.35)
    raise InvokeError(str(last_err or "GetTree failed"))


def iter_nodes(node: Any):
    if not isinstance(node, dict):
        return
    yield node
    kids = node.get("children") or node.get("childNodes") or []
    if isinstance(kids, list):
        for c in kids:
            yield from iter_nodes(c)


def tiled_windows(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    roots = forest.get("monitors") or []
    if not isinstance(roots, list):
        roots = []
    for m in roots:
        for n in iter_nodes(m):
            nt = str(n.get("nodeType") or n.get("type") or "")
            if nt != "WINDOW":
                continue
            mode = str(n.get("mode") or "").upper()
            if mode in ("FLOAT", "GRAB_TILE"):
                continue
            out.append(n)
    return out


def forest_fingerprint(forest: Mapping[str, Any]) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    roots = forest.get("monitors") or []
    if not isinstance(roots, list):
        roots = []
    for m in roots:
        nodes = list(iter_nodes(m))
        if not any(str(n.get("nodeType") or n.get("type") or "") == "WINDOW" for n in nodes):
            continue
        for n in nodes:
            nt = str(n.get("nodeType") or n.get("type") or "")
            if nt == "WINDOW":
                rows.append(("WINDOW", str(n.get("windowId") or ""), str(n.get("mode") or "")))
            elif nt in ("CON", "MONITOR"):
                rows.append((nt, str(n.get("layout") or ""), ""))
    return rows


def find_bag_groups(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    """TABBED or STACKED bag CONs (Mark 2 tab/stack group)."""
    bags: list[dict[str, Any]] = []
    bag_layouts = frozenset({"TABBED", "STACKED"})

    def walk(node: Any) -> None:
        if not isinstance(node, dict):
            return
        lay = str(node.get("layout") or "").upper()
        nt = str(node.get("nodeType") or node.get("type") or "").upper()
        if lay in bag_layouts and nt in ("CON", "MONITOR"):
            bags.append(node)
        kids = node.get("children") or node.get("childNodes") or []
        if isinstance(kids, list):
            for c in kids:
                walk(c)

    roots = forest.get("monitors") or []
    if isinstance(roots, list):
        for mon in roots:
            walk(mon)
    return bags


def assert_bag_window_kids_only(bag: Mapping[str, Any], *, stage: str) -> None:
    kids = bag.get("children") or bag.get("childNodes") or []
    if not isinstance(kids, list) or len(kids) < 2:
        raise InvokeError(f"{stage}: bag needs ≥2 kids (have {len(kids) if isinstance(kids, list) else 0})")
    bad = []
    for c in kids:
        if not isinstance(c, dict):
            bad.append(type(c).__name__)
            continue
        nt = str(c.get("nodeType") or c.get("type") or "").upper()
        if nt != "WINDOW":
            bad.append(nt or "?")
    if bad:
        raise InvokeError(f"{stage}: bag kids must be WINDOW only; got {bad}")


def window_rect_x(win: Mapping[str, Any]) -> float:
    rect = win.get("rect") if isinstance(win.get("rect"), dict) else {}
    try:
        return float(rect.get("x") or 0)
    except (TypeError, ValueError):
        return 0.0


def resolve_window_id(forest: Mapping[str, Any], spec: Mapping[str, Any]) -> Optional[str]:
    """Pick a TILE window id from GetTree using nest selector flags."""
    if spec.get("id"):
        return str(spec["id"])
    pool = list(tiled_windows(forest))
    wm_class = str(spec.get("wmClass") or "").lower()
    title = str(spec.get("title") or "").lower()
    if wm_class:
        pool = [
            w for w in pool if wm_class in str(w.get("wmClass") or w.get("wm_class") or "").lower()
        ]
    if title:
        pool = [w for w in pool if title in str(w.get("title") or "").lower()]
    hint = str(spec.get("hint") or "")
    if hint == "leftmost":
        pool = sorted(pool, key=lambda w: (window_rect_x(w), str(w.get("windowId") or "")))
    elif hint == "rightmost":
        pool = sorted(pool, key=lambda w: (-window_rect_x(w), str(w.get("windowId") or "")))
    elif hint == "topmost":
        pool = sorted(
            pool,
            key=lambda w: (
                float((w.get("rect") or {}).get("y") or 0),
                str(w.get("windowId") or ""),
            ),
        )
    elif hint == "bottommost":
        pool = sorted(
            pool,
            key=lambda w: (
                -float((w.get("rect") or {}).get("y") or 0),
                str(w.get("windowId") or ""),
            ),
        )
    if not pool:
        return None
    wid = pool[0].get("windowId")
    return str(wid) if wid is not None else None


def _gui_env(base: Optional[Mapping[str, str]] = None) -> dict[str, str]:
    env = dict(base if base is not None else os.environ)
    for k in _GUI_DROP:
        env.pop(k, None)
    term = str(env.get("TERM") or "")
    if not term or term == "dumb":
        env["TERM"] = "xterm-256color"
    return env


def require_nest_client_env(
    env: Optional[Mapping[str, str]] = None,
    *,
    what: str = "campaign",
) -> None:
    """Refuse host desk — nest smokes must run under nest client_env only.

    Raises InvokeError (exit_code=2) when FORGE_CONFIG_HOME is missing, the
    Wayland display is empty / not nest-named (``forge`` in WAYLAND_DISPLAY),
    or XDG_RUNTIME_DIR is not nest-scoped (``nested`` in the path).
    """
    e = env if env is not None else os.environ
    if not str(e.get("FORGE_CONFIG_HOME") or "").strip():
        raise InvokeError(
            f"{what}: missing FORGE_CONFIG_HOME (not in nest client_env)",
            exit_code=2,
        )
    wd = str(e.get("WAYLAND_DISPLAY") or "").strip()
    if not wd:
        raise InvokeError(
            f"{what}: empty WAYLAND_DISPLAY (not in nest client_env)",
            exit_code=2,
        )
    if "forge" not in wd:
        raise InvokeError(
            f"{what}: refusing host desk WAYLAND_DISPLAY={wd!r}",
            exit_code=2,
        )
    rt = str(e.get("XDG_RUNTIME_DIR") or "")
    if "nested" not in rt:
        raise InvokeError(
            f"{what}: XDG_RUNTIME_DIR={rt!r} is not nest-isolated",
            exit_code=2,
        )


def pick_client_argv() -> list[str]:
    if shutil.which("nautilus"):
        return ["nautilus", "--new-window"]
    if shutil.which("gnome-text-editor"):
        return ["gnome-text-editor", "--new-window"]
    if shutil.which("gedit"):
        return ["gedit", "--new-window"]
    raise InvokeError("need nautilus, gnome-text-editor, or gedit on PATH")


def _window_count(
    bus_address: str, *, workspace: Optional[int] = None
) -> int:
    try:
        return len(tiled_windows(get_tree(bus_address, workspace=workspace)))
    except InvokeError:
        return 0


def _nest_rewrite_client(
    env: Mapping[str, str], client: Sequence[str]
) -> list[str]:
    """Apply nest Chrome/Ghostty argv rewrites when FORGE_CONFIG_HOME is set."""
    try:
        from nested_wayland import nest_launch_argv_for_state, nest_state_dir_from_env
    except Exception:
        return [str(a) for a in client]
    state = nest_state_dir_from_env(env)
    if state is None:
        return [str(a) for a in client]
    return nest_launch_argv_for_state(state, client)


def _launch_one(
    env: Mapping[str, str],
    client: Sequence[str],
    bus_address: str,
    *,
    workspace: Optional[int] = None,
) -> None:
    before = _window_count(bus_address, workspace=workspace)
    launch = _nest_rewrite_client(env, client)
    try:
        from nested_wayland import nest_state_dir_from_env as _nest_state

        nest_isolated = _nest_state(env) is not None
    except Exception:
        nest_isolated = bool(str(env.get("FORGE_CONFIG_HOME") or "").strip())
    forge = shutil.which("forge", path=env.get("PATH"))
    # forge launch / DesktopAppInfo often re-attaches host GApplication
    # singletons. Under nest client isolation, always Popen directly.
    if forge and not nest_isolated:
        app = "nautilus" if "nautilus" in launch[0] else os.path.basename(launch[0])
        subprocess.run(
            [forge, "launch", app, "--timeout", "20"],
            check=False,
            env=dict(env),
            capture_output=True,
            text=True,
        )
        if _window_count(bus_address, workspace=workspace) > before:
            return
    if _window_count(bus_address, workspace=workspace) > before:
        return
    subprocess.Popen(
        list(launch),
        env=dict(env),
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def close_window_id(bus_address: str, window_id: str) -> None:
    """Close by GetTree windowId (Forest nanoid) or Meta id.

    GetTree `windowId` is Forest nanoid (`metaWindowId` = Meta). Matching
    Meta `get_id()` alone misses Forest ids and leaves ghosts in the tree.
    Prefer sessionApi `_closeOp('id:…')` (eager Forest remove); Meta id scan
    is fallback only when sessionApi is unavailable.
    """
    from nested_wayland import shell_eval

    wid = json.dumps(str(window_id))
    uuid = json.dumps(FORGE_UUID)
    js = (
        "(function(){ try { "
        "const want = String(%s); "
        "const rec = Main.extensionManager.lookup(%s); "
        "const ext = rec && rec.stateObj; "
        "const api = ext && ext.sessionApi; "
        "if (api && typeof api._closeOp === 'function') { "
        "const r = api._closeOp('id:' + want, { force: true }) || {}; "
        "if (r.error) return JSON.stringify({ok:false,error:String(r.error)}); "
        "return JSON.stringify({ok:true,closed:!!r.closed,"
        "alreadyGone:!!r.alreadyGone,forestRemoved:!!r.forestRemoved,"
        "via:'session-api'}); "
        "} "
        "const wm = global.workspace_manager; "
        "for (let i = 0; i < wm.get_n_workspaces(); i++) { "
        "const wins = wm.get_workspace_by_index(i).list_windows(); "
        "for (let j = 0; j < wins.length; j++) { "
        "if (String(wins[j].get_id()) === want) { "
        "wins[j].delete(global.display.get_current_time_roundtrip()); "
        "return JSON.stringify({ok:true,closed:true,via:'meta-id'}); "
        "} } } "
        "return JSON.stringify({ok:true,closed:false,alreadyGone:true,via:'miss'}); "
        "} catch (e) { return JSON.stringify({ok:false,error:String(e && e.message || e)}); } })()"
    ) % (wid, uuid)
    ok, payload = shell_eval(bus_address, js, timeout=5.0)
    if not ok:
        raise InvokeError(f"close id:{window_id}: shell_eval failed: {payload}")
    data = parse_invoke_result(payload)
    if data.get("error"):
        raise InvokeError(f"close id:{window_id}: {data.get('error')}")
    # Meta-id-only miss against a Forest nanoid never closed anything.
    if data.get("via") == "miss":
        raise InvokeError(
            f"close id:{window_id}: no sessionApi/_closeOp and Meta id miss"
        )


def build_activate_workspace_js(index: int) -> str:
    """GJS Eval: create workspaces through *index* and activate it."""
    want = json.dumps(int(index))
    return (
        "(function(){ try { const wm = global.workspace_manager; "
        "const want = Math.max(0, %s | 0); "
        "while (wm.get_n_workspaces() <= want) "
        "wm.append_new_workspace(false, global.get_current_time()); "
        "const ws = wm.get_workspace_by_index(want); "
        "if (!ws) return JSON.stringify({ok:false,error:'workspace '+want+' unavailable'}); "
        "ws.activate(global.get_current_time()); "
        "return JSON.stringify({ok:true,active:wm.get_active_workspace_index(),"
        "nWorkspaces:wm.get_n_workspaces()}); "
        "} catch (e) { return JSON.stringify({ok:false,error:String(e && e.message || e)}); } })()"
    ) % want


def activate_workspace(
    bus_address: str,
    index: int,
    *,
    timeout: float = 5.0,
) -> dict[str, Any]:
    """Switch the nest active workspace (0-based), creating intermediates."""
    from nested_wayland import shell_eval

    js = build_activate_workspace_js(int(index))
    ok, payload = shell_eval(bus_address, js, timeout=timeout)
    if not ok:
        raise InvokeError(f"Shell.Eval activate workspace {index} failed: {payload}")
    result = parse_invoke_result(payload)
    if not result.get("ok"):
        raise InvokeError(result.get("error") or f"activate workspace {index} failed")
    return result


def _meta_ws_window_count(bus_address: str, workspace: Optional[int]) -> Optional[int]:
    """Meta list_windows count for a workspace (diagnostic; not GetTree)."""
    from nested_wayland import shell_eval

    want = "null" if workspace is None else json.dumps(int(workspace))
    js = (
        "(function(){ try { const wm = global.workspace_manager; "
        "const want = %s; "
        "const ws = want == null ? wm.get_active_workspace() "
        ": wm.get_workspace_by_index(want); "
        "if (!ws) return JSON.stringify({ok:true,n:0}); "
        "const wins = ws.list_windows() || []; "
        "return JSON.stringify({ok:true,n:wins.length}); "
        "} catch (e) { return JSON.stringify({ok:false,n:0}); } })()"
    ) % want
    ok, payload = shell_eval(bus_address, js, timeout=3.0)
    if not ok:
        return None
    data = parse_invoke_result(payload)
    if not data.get("ok"):
        return None
    try:
        return int(data.get("n"))
    except (TypeError, ValueError):
        return None


def wait_window_count(
    bus_address: str,
    want: int,
    *,
    timeout_s: float = 25.0,
    workspace: Optional[int] = None,
) -> list[dict[str, Any]]:
    deadline = time.monotonic() + timeout_s
    last: list[dict[str, Any]] = []
    while time.monotonic() < deadline:
        try:
            forest = get_tree(bus_address, workspace=workspace)
            last = tiled_windows(forest)
            if len(last) >= want:
                return last
        except InvokeError:
            pass
        time.sleep(0.4)
    where = f" on ws={workspace}" if workspace is not None else ""
    extra = ""
    try:
        extra += f" forestAll={len(tiled_windows(get_tree(bus_address)))}"
    except InvokeError:
        pass
    if workspace is not None:
        meta_n = _meta_ws_window_count(bus_address, int(workspace))
        if meta_n is not None:
            extra += f" metaWs={meta_n}"
    raise InvokeError(
        f"timed out waiting for {want} windows{where} (have {len(last)}{extra})"
    )


def _smoke_seed_two_tiles(
    bus_address: str, *, env: Optional[Mapping[str, str]] = None
) -> tuple[str, int, list[tuple[str, str, str]]]:
    """Launch two clients; return (left_window_id, n_windows, fingerprint)."""
    from nested_wayland import wait_forge_ready

    if not wait_forge_ready(bus_address, timeout_s=12.0):
        raise InvokeError("Forge DBus not ready")
    gui = _gui_env(env)
    client = pick_client_argv()
    _launch_one(gui, client, bus_address)
    wait_window_count(bus_address, 1, timeout_s=20.0)
    _launch_one(gui, client, bus_address)
    wait_window_count(bus_address, 2, timeout_s=20.0)
    time.sleep(0.5)
    before = get_tree(bus_address)
    wins = tiled_windows(before)
    extra = sorted(wins, key=lambda w: (window_rect_x(w), str(w.get("windowId") or "")))
    while len(extra) > 2:
        drop = extra.pop()
        close_window_id(bus_address, str(drop.get("windowId")))
        time.sleep(0.35)
        extra = sorted(
            tiled_windows(get_tree(bus_address)),
            key=lambda w: (window_rect_x(w), str(w.get("windowId") or "")),
        )
    time.sleep(0.4)
    before = get_tree(bus_address)
    fp_before = forest_fingerprint(before)
    wins = tiled_windows(before)
    n_before = len(wins)
    if n_before < 2:
        raise InvokeError(f"need two tiled windows before invoke (have {n_before})")
    left = min(wins, key=lambda w: (window_rect_x(w), str(w.get("windowId") or "")))
    left_id = str(left.get("windowId") or "")
    return left_id, n_before, fp_before


def smoke_toggle_tab_stack_on_bus(
    bus_address: str,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    """H/V pair → TABBED → STACKED → TABBED; bag kids stay WINDOW-only."""
    left_id, n_before, fp_before = _smoke_seed_two_tiles(bus_address, env=env)
    layouts: list[str] = []
    last_invoke: Any = None
    expect = ("TABBED", "STACKED", "TABBED")
    for i, want in enumerate(expect):
        stage = f"toggleTabStack[{i}→{want}]"
        last_invoke = invoke_on_bus(
            bus_address,
            "toggleTabStack",
            spec={"id": left_id, "activate": True},
            timeout=8.0,
        )
        time.sleep(1.0)
        after = get_tree(bus_address)
        n_after = len(tiled_windows(after))
        if n_after < 2:
            raise InvokeError(f"{stage}: windows dropped (have {n_after}) invoke={last_invoke}")
        bags = find_bag_groups(after)
        if not bags:
            raise InvokeError(
                f"{stage}: no TABBED/STACKED bag invoke={last_invoke} "
                f"fp={forest_fingerprint(after)!r}"
            )
        bag = bags[0]
        lay = str(bag.get("layout") or "").upper()
        if lay != want:
            raise InvokeError(
                f"{stage}: bag layout={lay!r} want={want!r} invoke={last_invoke}"
            )
        assert_bag_window_kids_only(bag, stage=stage)
        layouts.append(lay)
    after = get_tree(bus_address)
    return {
        "ok": True,
        "action": "toggleTabStack",
        "cycle": layouts,
        "invoke": last_invoke,
        "focusWindowId": left_id,
        "windowsBefore": n_before,
        "windowsAfter": len(tiled_windows(after)),
        "fingerprintBefore": fp_before,
        "fingerprintAfter": forest_fingerprint(after),
    }


def smoke_mark2_on_bus(
    bus_address: str,
    *,
    env: Optional[Mapping[str, str]] = None,
    action: str = "join.right",
) -> dict[str, Any]:
    """Open two clients, invoke a Mark 2 id, assert forge tree changed."""
    action = str(
        (env or {}).get("FORGE_NEST_SMOKE_ACTION")
        or os.environ.get("FORGE_NEST_SMOKE_ACTION")
        or action
        or "join.right"
    ).strip()
    if action == "toggleTabStack":
        return smoke_toggle_tab_stack_on_bus(bus_address, env=env)

    left_id, n_before, fp_before = _smoke_seed_two_tiles(bus_address, env=env)
    result = invoke_on_bus(
        bus_address,
        action,
        spec={"id": left_id, "activate": True},
        timeout=8.0,
    )
    time.sleep(1.2)
    after = get_tree(bus_address)
    fp_after = forest_fingerprint(after)
    n_after = len(tiled_windows(after))
    if n_after < 2:
        raise InvokeError(f"windows dropped after {action} (have {n_after}) invoke={result}")
    if fp_after == fp_before:
        raise InvokeError(
            f"{action} did not change forge tree invoke={result} fingerprint={fp_after!r}"
        )
    return {
        "ok": True,
        "action": action,
        "invoke": result,
        "focusWindowId": left_id,
        "windowsBefore": n_before,
        "windowsAfter": n_after,
        "fingerprintBefore": fp_before,
        "fingerprintAfter": fp_after,
    }


def cmd_invoke(args: Any, name: str) -> int:
    from nested_wayland import is_running, load_config, reap_stale, wait_forge_ready

    reap_stale(name)
    cfg = load_config(name)
    if not cfg or not is_running(name):
        print(f"forge-test nested invoke: session {name!r} not running", file=sys.stderr)
        return 1
    argv = list(getattr(args, "nested_cmd", None) or [])
    if argv and argv[0] == "--":
        argv = argv[1:]
    if not argv:
        print(
            "forge-test nested invoke: need ACTION "
            "(move.left | join.right | toggleSplit | promote | …)",
            file=sys.stderr,
        )
        print(
            "  example: forge-test nested invoke join.right --hint leftmost --activate",
            file=sys.stderr,
        )
        return 2
    try:
        parsed = parse_invoke_argv(argv)
    except SystemExit as e:
        code = e.code
        return 0 if code in (0, None) else (code if isinstance(code, int) else 1)
    json_out = bool(getattr(args, "json", False) or getattr(parsed, "json_out", False))
    timeout = float(getattr(parsed, "timeout", None) or getattr(args, "timeout", None) or 8.0)
    try:
        if not wait_forge_ready(cfg.bus_address, timeout_s=8.0):
            raise InvokeError("Forge DBus not ready")
        result = invoke_on_bus(
            cfg.bus_address,
            parsed.action,
            spec=spec_from_args(parsed),
            timeout=timeout,
        )
    except InvokeError as e:
        print(f"forge-test nested invoke: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    if json_out:
        print(json.dumps(result, indent=2))
    else:
        wid = result.get("windowId") or "—"
        print(
            f"forge-test nested invoke: ok name={result.get('name')} "
            f"focus={result.get('focusMethod')} windowId={wid}"
        )
    return 0


def cmd_dnd_drop(args: Any, name: str) -> int:
    from nested_wayland import is_running, load_config, reap_stale, shell_eval, wait_forge_ready

    reap_stale(name)
    cfg = load_config(name)
    if not cfg or not is_running(name):
        print(f"forge-test nested dnd-drop: session {name!r} not running", file=sys.stderr)
        return 1
    argv = list(getattr(args, "nested_cmd", None) or [])
    if argv and argv[0] == "--":
        argv = argv[1:]
    if not argv:
        print(
            "forge-test nested dnd-drop: need TILE [ONTO] [--zone CENTER] "
            "or TILE --dest-monitor N",
            file=sys.stderr,
        )
        print(
            "  example: forge-test nested dnd-drop leftmost rightmost --zone center",
            file=sys.stderr,
        )
        return 2
    try:
        parsed = parse_dnd_drop_argv(argv)
    except SystemExit as e:
        code = e.code
        return 0 if code in (0, None) else (code if isinstance(code, int) else 1)
    json_out = bool(getattr(args, "json", False) or getattr(parsed, "json_out", False))
    timeout = float(getattr(parsed, "timeout", None) or getattr(args, "timeout", None) or 8.0)
    dest = getattr(parsed, "dest_monitor", None)
    onto_tok = parsed.onto
    if onto_tok in (None, "") and dest is None:
        print(
            "forge-test nested dnd-drop: need ONTO or --dest-monitor",
            file=sys.stderr,
        )
        return 2
    spec: dict[str, Any] = {}
    try:
        if not wait_forge_ready(cfg.bus_address, timeout_s=8.0):
            raise InvokeError("Forge DBus not ready")
        need_tree = parsed.tile in HINTS or (onto_tok in HINTS if onto_tok else False)
        forest = get_tree(cfg.bus_address) if need_tree else None
        tile_sel = dnd_token_to_selector(parsed.tile, forest)
        onto_sel = dnd_token_to_selector(onto_tok, forest) if onto_tok else ""
        spec = {
            "tile": tile_sel,
            "onto": onto_sel,
            "zone": str(parsed.zone or "CENTER").upper(),
            "quiet": True,
            "simulateEnteredMonitor": bool(getattr(parsed, "simulate_entered", True)),
        }
        if dest is not None:
            spec["destMonitor"] = int(dest)
        js = build_dnd_drop_js(spec)
        ok, payload = shell_eval(cfg.bus_address, js, timeout=timeout)
        if not ok:
            raise InvokeError(f"Shell.Eval failed: {payload}")
        result = parse_invoke_result(payload)
        if not result.get("ok"):
            raise InvokeError(result.get("error") or str(result))
    except InvokeError as e:
        print(f"forge-test nested dnd-drop: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    if json_out:
        print(json.dumps(result, indent=2))
    else:
        path = result.get("path") or "commitResolved"
        zone = result.get("zone") or spec.get("zone") or ""
        print(f"forge-test nested dnd-drop: ok path={path} zone={zone}")
    return 0


def cmd_smoke_from_env() -> int:
    try:
        require_nest_client_env(os.environ, what="nest smoke")
    except InvokeError as e:
        print(f"forge-test nest smoke: {e}", file=sys.stderr)
        print(
            "  ./scripts/forge/forge-test nested run -- "
            "python3 ./scripts/forge/nest_mark2_smoke.py\n"
            "  ./scripts/forge/forge-test nested smoke-mark2",
            file=sys.stderr,
        )
        return int(getattr(e, "exit_code", 2) or 2)
    bus = str(os.environ.get("DBUS_SESSION_BUS_ADDRESS") or "").strip()
    if not bus:
        print(
            "forge-test nest smoke: missing DBUS_SESSION_BUS_ADDRESS",
            file=sys.stderr,
        )
        return 2
    try:
        payload = smoke_mark2_on_bus(bus, env=os.environ)
    except InvokeError as e:
        print(f"forge-test nest smoke: {e}", file=sys.stderr)
        return 1
    print(json.dumps(payload, indent=2, default=str))
    return 0
