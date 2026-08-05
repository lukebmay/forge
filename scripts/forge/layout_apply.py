#!/usr/bin/env python3
"""Pure helpers for layout reconcile apply (WR3). No DBus / subprocess."""

from __future__ import annotations

import shlex
import time
from pathlib import Path
from typing import Any, Callable, Optional

from layout_plan import mon_index_from_slot

MODE_STEPS = "steps"
MODE_RECONCILE = "reconcile"

# Stock Ghostty .desktop uses --gtk-single-instance=true; gio launch reuses the
# existing process and often maps the new window onto mon0. Layout open must
# spawn multi-instance so PlaceNext + residual mon moves can stick.
GHOSTTY_MULTI_INSTANCE_FLAG = "--gtk-single-instance=false"
_GHOSTTY_STEMS = frozenset({"ghostty", "com.mitchellh.ghostty"})


def detect_layout_mode(data: Any, *, force_launch: bool = False) -> str:
    """
    Choose steps vs reconcile path.

    --force-launch → steps only when steps[] present; else error.
    mode: steps / version 1 / steps without roles → steps.
    version 2 / roles / tiles / bare array / mode reconcile → reconcile.
    """
    # Bare array sugar → reconcile (normalize_profile wraps to tiles).
    if isinstance(data, list):
        if force_launch:
            raise ValueError(
                "--force-launch requires profile steps[] (imperative path); "
                "bare-array profiles use reconcile — omit --force-launch"
            )
        return MODE_RECONCILE

    if not isinstance(data, dict):
        raise ValueError("profile must be a JSON object or array")

    has_steps = isinstance(data.get("steps"), list)
    roles = data.get("roles")
    has_roles = isinstance(roles, list) and len(roles) > 0
    tiles = data.get("tiles")
    has_tiles = (
        (isinstance(tiles, dict) and len(tiles) > 0)
        or (isinstance(tiles, list) and len(tiles) > 0)
    )
    mode_raw = data.get("mode")
    mode_s = str(mode_raw).strip().lower() if mode_raw is not None else None
    ver = data.get("version")

    if force_launch:
        if has_steps:
            return MODE_STEPS
        raise ValueError(
            "--force-launch requires profile steps[] (imperative path); "
            "roles-only v2 profiles use reconcile — omit --force-launch"
        )

    if mode_s == MODE_STEPS:
        if not has_steps:
            raise ValueError("mode: steps requires steps[] array")
        return MODE_STEPS

    if mode_s == MODE_RECONCILE:
        return MODE_RECONCILE

    if ver in (2, "2") and (has_roles or has_tiles):
        return MODE_RECONCILE

    if (has_roles or has_tiles) and not has_steps:
        return MODE_RECONCILE

    if ver in (1, "1") or (has_steps and not has_roles and not has_tiles):
        return MODE_STEPS

    if has_roles or has_tiles:
        return MODE_RECONCILE

    if has_steps:
        return MODE_STEPS

    raise ValueError(
        "cannot determine layout mode: need version 1 + steps[], "
        "or version 2 + roles[] / tiles / bare array (mode: reconcile)"
    )


def slot_to_monitor_path(slot: str, workspace: int = 0) -> str:
    """mon0.left-tab → path:mo0ws0; mon1 → path:mo1ws0; primary → path:mo0ws0."""
    mon = mon_index_from_slot(slot) if slot else None
    if mon is None:
        mon = 0
    try:
        ws = int(workspace)
    except (TypeError, ValueError):
        ws = 0
    if ws < 0:
        ws = 0
    return f"path:mo{mon}ws{ws}"


def slot_to_tree_path(slot: str, workspace: int = 0) -> str:
    """Bare mon path for PlaceNext (moNwsW), no path: prefix."""
    p = slot_to_monitor_path(slot, workspace)
    return p[len("path:") :] if p.startswith("path:") else p


def window_tile_selector(action: dict[str, Any]) -> Optional[str]:
    """id:WINDOWID preferred; else path:… from action path."""
    wid = action.get("windowId")
    if wid is not None and str(wid).strip() != "":
        return f"id:{wid}"
    path = action.get("path")
    if path is None or str(path).strip() == "":
        return None
    s = str(path).strip()
    if s.startswith("path:") or s.startswith("id:"):
        return s
    return f"path:{s}"


def _move_step_from_action(a: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Build a move RunStep from plan move/park action (None if incomplete)."""
    tile = window_tile_selector(a)
    if not tile:
        return None
    # Soft park: destWindowId → move onto that window (join group), not mon root.
    dest_wid = a.get("destWindowId")
    if dest_wid is not None and str(dest_wid).strip() != "":
        dest = f"id:{dest_wid}"
    else:
        slot = str(a.get("slot") or "mon0")
        dest = slot_to_monitor_path(slot)
    step: dict[str, Any] = {
        "op": "move",
        "tile": tile,
        "dest": dest,
    }
    # First mon-layout child (e.g. mon1.term) → prepend under MONITOR.
    pos = a.get("position")
    if pos is None and a.get("childIndex") == 0:
        pos = "start"
    if pos is not None and str(pos).strip() != "":
        step["position"] = pos if isinstance(pos, str) else str(pos)
    return step


def _window_ids_to_selectors(wids: Any) -> list[str]:
    """Raw ids or id: selectors → list of id:N strings."""
    if not isinstance(wids, list):
        return []
    out: list[str] = []
    for wid in wids:
        if wid is None or str(wid).strip() == "":
            continue
        s = str(wid).strip()
        if s.startswith("id:"):
            out.append(s)
        else:
            out.append(f"id:{s}")
    return out


def actions_to_extension_steps(
    actions: Any, *, force_close: bool = False
) -> list[dict[str, Any]]:
    """
    Map plan actions to extension RunSteps (move / layout / order / size / close).
    Skips open (CLI launch).

    layout needs a WINDOW selector (session-api _layoutOp → matchWindows).
    mon path:moNws0 is valid move dest only — not layout selector.

    Order: placement moves/parks and residual closes first, then
    ensure_layout (structure after windows on target mon), then
    ensure_order (mon-level L/R after groups exist), then
    ensure_sizes (sibling percent shares), then focus
    (active tab/stack + profile focus).

    close → {op: close, selector: id:…} (+ force when force_close).

    ensure_layout with windowIds (structure repair):
      - tabbed/stacked: layout on first id, then move remaining ids into it
      - nested hsplit/vsplit (slot has '.'): same join as tabbed
      - mon-level hsplit/vsplit: layout on first available id only
    Fallback when no windowIds: id from move/park on same mon; skip if none
    (empty desk: open first; residual replan may layout after).

    ensure_order → {op: order, windowIds: [id:…, …]} (mon child reorder).
    ensure_sizes → {op: size, windowIds: [id:…], shares: […]} (sibling percents).
    focus → {op: focus, selector: id:…} (lastTabFocus + keyboard).
    """
    if not isinstance(actions, list):
        return []
    force_close = bool(force_close)

    # First pass: window id per mon from move/park (fallback for mon splits)
    window_by_mon: dict[int, str] = {}
    for a in actions:
        if not isinstance(a, dict):
            continue
        op = str(a.get("op") or "").strip().lower()
        if op not in ("move", "park"):
            continue
        tile = window_tile_selector(a)
        if not tile or not tile.startswith("id:"):
            continue
        mon = mon_index_from_slot(str(a.get("slot") or "mon0"))
        if mon is None:
            mon = 0
        window_by_mon.setdefault(mon, tile)

    place_steps: list[dict[str, Any]] = []
    layout_steps: list[dict[str, Any]] = []
    order_steps: list[dict[str, Any]] = []
    size_steps: list[dict[str, Any]] = []
    focus_steps: list[dict[str, Any]] = []

    for a in actions:
        if not isinstance(a, dict):
            continue
        op = str(a.get("op") or "").strip().lower()
        if op in ("move", "park"):
            step = _move_step_from_action(a)
            if step:
                place_steps.append(step)
            continue
        if op == "close":
            tile = window_tile_selector(a)
            if not tile:
                continue
            close_step: dict[str, Any] = {"op": "close", "selector": tile}
            if force_close or a.get("force"):
                close_step["force"] = True
            place_steps.append(close_step)
            continue
        if op == "focus":
            sel = a.get("selector")
            if sel is None or str(sel).strip() == "":
                wid = a.get("windowId")
                if wid is not None and str(wid).strip() != "":
                    s = str(wid).strip()
                    sel = s if s.startswith("id:") else f"id:{s}"
            if sel is not None and str(sel).strip() != "":
                focus_steps.append({"op": "focus", "selector": str(sel).strip()})
            continue
        if op == "ensure_order":
            id_sels = _window_ids_to_selectors(
                a.get("windowIds") if a.get("windowIds") is not None else a.get("selectors")
            )
            if len(id_sels) >= 2:
                order_steps.append({"op": "order", "windowIds": id_sels})
            continue
        if op == "ensure_sizes":
            id_sels = _window_ids_to_selectors(
                a.get("windowIds") if a.get("windowIds") is not None else a.get("selectors")
            )
            raw_shares = a.get("shares") if a.get("shares") is not None else a.get("share")
            shares: list[float] = []
            if isinstance(raw_shares, list):
                for s in raw_shares:
                    try:
                        f = float(s)
                    except (TypeError, ValueError):
                        shares = []
                        break
                    if f <= 0:
                        shares = []
                        break
                    shares.append(f)
            if len(id_sels) >= 2 and len(shares) == len(id_sels):
                size_steps.append(
                    {"op": "size", "windowIds": id_sels, "shares": shares}
                )
            continue
        if op != "ensure_layout":
            continue
        mode_raw = a.get("mode")
        if mode_raw is None or str(mode_raw).strip() == "":
            continue
        mode = str(mode_raw).strip().lower()
        slot = str(a.get("slot") or "mon0")
        mon = mon_index_from_slot(slot)
        if mon is None:
            mon = 0

        id_sels = _window_ids_to_selectors(a.get("windowIds"))

        if mode in ("tabbed", "stacked") and id_sels:
            # layout first: mon-wrap + H/V→tab flatten in extension _layoutOp;
            # then move remaining ids onto anchor so mon-direct siblings join the bag.
            anchor = id_sels[0]
            layout_steps.append({"op": "layout", "mode": mode, "selector": anchor})
            for sel in id_sels[1:]:
                layout_steps.append({"op": "move", "tile": sel, "dest": anchor})
            continue

        # Nested h/v split structure: join members onto first id (like tabbed).
        # Mon-level (slot mon0/mon1) only rewrites MONITOR layout — never join.
        if (
            mode in ("hsplit", "vsplit")
            and id_sels
            and len(id_sels) >= 2
            and "." in slot
        ):
            anchor = id_sels[0]
            layout_steps.append({"op": "layout", "mode": mode, "selector": anchor})
            for sel in id_sels[1:]:
                layout_steps.append({"op": "move", "tile": sel, "dest": anchor})
            continue

        sel = id_sels[0] if id_sels else window_by_mon.get(mon)
        if not sel:
            continue
        layout_steps.append({"op": "layout", "mode": mode, "selector": sel})

    # Focus last so lastTabFocus + keyboard focus stick after structure/order/size.
    return place_steps + layout_steps + order_steps + size_steps + focus_steps


def _ghostty_stem(token: str) -> str:
    """Basename / reverse-DNS last label, casefolded."""
    t = str(token or "").strip().strip("'\"")
    if not t:
        return ""
    # desktop id or path → stem
    name = Path(t).name
    if name.casefold().endswith(".desktop"):
        name = name[: -len(".desktop")]
    cf = name.casefold()
    if "." in cf:
        return cf.rsplit(".", 1)[-1]
    return cf


def is_ghostty_launch_target(app: str, desktop: Optional[str] = None) -> bool:
    """
    True when launch target is Ghostty (short name, desktop id, or argv0).

    Used to bypass stock single-instance .desktop Exec for layout/PlaceNext.
    """
    if desktop:
        stem = Path(str(desktop)).stem.casefold()
        if stem in _GHOSTTY_STEMS or stem.endswith(".ghostty") or _ghostty_stem(stem) == "ghostty":
            return True
    raw = (app or "").strip().strip("'\"")
    if not raw:
        return False
    # Bare id / desktop path
    if _ghostty_stem(raw) == "ghostty":
        return True
    # Argv form: "ghostty …" or "/usr/bin/ghostty …"
    try:
        parts = shlex.split(raw)
    except ValueError:
        parts = raw.split()
    if not parts:
        return False
    return _ghostty_stem(parts[0]) == "ghostty"


def _is_ghostty_executable_token(token: str) -> bool:
    """True if token is ghostty binary path/name (not reverse-DNS desktop id)."""
    t = str(token or "").strip()
    if not t or t.casefold().endswith(".desktop"):
        return False
    return Path(t).name.casefold() == "ghostty"


def ghostty_multi_instance_argv(
    app: str = "ghostty",
    *,
    desktop: Optional[str] = None,
    exe_path: Optional[str] = None,
) -> list[str]:
    """
    Argv for a multi-instance Ghostty process (not gio of stock .desktop).

    Prefer explicit exe_path, else first token of app if it is a ghostty binary,
    else bare `ghostty` (PATH). Always forces --gtk-single-instance=false.
    Desktop ids (com.mitchellh.ghostty) never become argv0.
    """
    del desktop  # reserved for callers; Exec path comes via exe_path
    exe = (exe_path or "").strip() or None
    raw = (app or "").strip().strip("'\"")
    extra: list[str] = []
    if raw:
        try:
            parts = shlex.split(raw)
        except ValueError:
            parts = raw.split()
        if parts and _ghostty_stem(parts[0]) == "ghostty":
            if exe is None and _is_ghostty_executable_token(parts[0]):
                exe = parts[0]
            # Drop any prior single-instance flag; keep other user args.
            for p in parts[1:]:
                if str(p).startswith("--gtk-single-instance="):
                    continue
                extra.append(p)
    if not exe:
        exe = "ghostty"
    return [exe, GHOSTTY_MULTI_INSTANCE_FLAG, *extra]


def rewrite_ghostty_launch_app(app: str) -> str:
    """Map ghostty app/desktop sugar to multi-instance argv string; else unchanged."""
    if not is_ghostty_launch_target(app):
        return (app or "").strip()
    return shlex.join(ghostty_multi_instance_argv(app))


def open_action_to_launch_fields(action: dict[str, Any]) -> dict[str, Any]:
    """Map plan open action → do_launch kwargs (+ role for reports)."""
    open_spec = action.get("open") if isinstance(action.get("open"), dict) else {}
    app = open_spec.get("app") or open_spec.get("desktop") or open_spec.get("command")
    app_s = str(app).strip() if app is not None else ""
    # Ghostty: never hand bare id through to gio launch of single-instance desktop.
    if is_ghostty_launch_target(app_s):
        app_s = rewrite_ghostty_launch_app(app_s)
    fields: dict[str, Any] = {
        "app": app_s,
    }
    wc = open_spec.get("wmClass") or open_spec.get("wm_class")
    if wc is not None and str(wc).strip() != "":
        fields["wm_class"] = str(wc).strip()
    if "timeout" in open_spec and open_spec["timeout"] is not None:
        fields["timeout"] = int(open_spec["timeout"])
    no_wait = open_spec.get("noWait") if "noWait" in open_spec else open_spec.get("no_wait")
    if no_wait is not None:
        fields["no_wait"] = bool(no_wait)
    if open_spec.get("first") is not None:
        fields["first"] = bool(open_spec["first"])

    mon = open_spec.get("monitor")
    tree = open_spec.get("treePath") or open_spec.get("path") or open_spec.get("tree_path")
    slot = action.get("slot")
    if mon is None and slot:
        mon_i = mon_index_from_slot(str(slot))
        if mon_i is not None:
            mon = mon_i
    if tree is None and slot:
        tree = slot_to_tree_path(str(slot))
    if mon is not None and str(mon).strip() != "":
        fields["monitor"] = mon
    if tree is not None and str(tree).strip() != "":
        fields["tree_path"] = str(tree).strip()
    # Nested split open: Prefer attach next to claimed sibling when plan set it.
    attach = action.get("attachSelector") or action.get("destWindowId")
    if attach is not None and str(attach).strip() != "":
        s = str(attach).strip()
        fields["attach_selector"] = s if s.startswith("id:") else f"id:{s}"
    return fields


def partition_plan_actions(
    actions: Any,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split plan actions into (extension-side, open) lists preserving order."""
    if not isinstance(actions, list):
        return [], []
    ext: list[dict[str, Any]] = []
    opens: list[dict[str, Any]] = []
    for a in actions:
        if not isinstance(a, dict):
            continue
        if str(a.get("op") or "").strip().lower() == "open":
            opens.append(a)
        else:
            ext.append(a)
    return ext, opens


def residual_follow_up(
    residual_ext: Any,
    residual_open: Any,
    *,
    force_close: bool = False,
) -> tuple[list[dict[str, Any]], list[Any]]:
    """
    Map residual extension actions to RunSteps; report still-open roles.

    Moves/layout always map even when residual_open is non-empty so apply can
    rehome claimed roles (e.g. mon1 Ghostty landed on mon0) before failing on
    lagging open roles (chrome title pin miss).
    """
    ext = residual_ext if isinstance(residual_ext, list) else []
    opens = residual_open if isinstance(residual_open, list) else []
    steps = actions_to_extension_steps(ext, force_close=force_close)
    still = [a.get("role") for a in opens if isinstance(a, dict)]
    return steps, still


# --- LF5: settle-before-move (pure predicates; CLI poll uses these) ---

# GetTree WINDOW.mode after processFloats first pass. FLOAT = not yet tiled.
SETTLED_MODES = frozenset({"TILE", "tile"})
# Mid-drag is rare for layout open; treat as settled enough to Move.
SETTLED_MODES_LOOSE = frozenset({"TILE", "tile", "GRAB_TILE", "grab_tile"})


def _rect_is_reasonable(rect: Any) -> bool:
    """True when rect missing (optional) or has positive finite size."""
    if rect is None:
        return True
    if not isinstance(rect, dict):
        return False
    try:
        w = float(rect.get("width"))
        h = float(rect.get("height"))
    except (TypeError, ValueError):
        return False
    return w > 0 and h > 0 and all(
        isinstance(rect.get(k), (int, float)) or rect.get(k) is None
        for k in ("x", "y")
    )


def window_is_settled(
    win: Any,
    *,
    require_tile: bool = True,
    allow_grab: bool = True,
) -> bool:
    """
    Whether a GetTree WINDOW leaf is ready for layout Move / residual rehome.

    Settled means:
      1. Present with windowId
      2. mode is TILE (default) — FLOAT means still in window-create-queue /
         pre-processFloats; Move often no-ops or Meta snaps back
      3. If rect exported: positive width/height (zero rect = unprocessed)
      4. If monitor exported: >= 0 (Mutter has assigned a display)

    require_tile=False: only id + geometry checks (class appear without tile).
    allow_grab: GRAB_TILE counts as settled when require_tile.
    """
    if not isinstance(win, dict):
        return False
    wid = win.get("windowId")
    if wid is None or str(wid).strip() == "":
        return False

    if require_tile:
        mode = win.get("mode")
        modes = SETTLED_MODES_LOOSE if allow_grab else SETTLED_MODES
        if mode is None or str(mode) not in modes:
            return False

    if not _rect_is_reasonable(win.get("rect")):
        return False

    mon = win.get("monitor")
    if mon is not None:
        try:
            if int(mon) < 0:
                return False
        except (TypeError, ValueError):
            return False

    return True


def find_settled_window(
    windows: Any,
    *,
    window_id: Any = None,
    require_tile: bool = True,
) -> Optional[dict[str, Any]]:
    """First settled window in list; optional windowId filter."""
    if not isinstance(windows, list):
        return None
    want = str(window_id).strip() if window_id is not None else None
    for w in windows:
        if not isinstance(w, dict):
            continue
        if want is not None and str(w.get("windowId")) != want:
            continue
        if window_is_settled(w, require_tile=require_tile):
            return w
    return None


def move_step_window_ids(steps: Any) -> list[str]:
    """Collect id:N targets from move/park steps (for settle-before-move)."""
    out: list[str] = []
    if not isinstance(steps, list):
        return out
    for s in steps:
        if not isinstance(s, dict):
            continue
        op = str(s.get("op") or "").strip().lower()
        if op not in ("move", "park"):
            continue
        tile = s.get("tile") or s.get("selector")
        if tile is None:
            continue
        t = str(tile).strip()
        if t.startswith("id:"):
            wid = t[3:].strip()
            if wid and wid not in out:
                out.append(wid)
    return out


# --- LF6 / CL5: open-all → batch quiet (fingerprint) → one residual commit ---
# Control-loop: LayoutBatch begin → launch roles → wait_for_tree_stable
# (batch quiet) → residual RunSteps (freeze → ops → one render + verify) → end.
# Not a separate philosophy from requestLayout/verify — quiet gate only.

# Defaults for post-open batch quiet (Ghostty may self-resize after map).
TREE_STABLE_TIMEOUT_MS = 7000
TREE_STABLE_POLL_MS = 180
TREE_STABLE_SAMPLES = 3
BELT_STABLE_TIMEOUT_MS = 2500
BELT_STABLE_POLL_MS = 150
BELT_STABLE_SAMPLES = 2


def _stability_focus_id(node: dict[str, Any]) -> str:
    """lastTabFocusId or windowId from lastTabFocus dict/scalar."""
    fid = node.get("lastTabFocusId")
    if fid is not None and str(fid).strip() != "":
        return str(fid).strip()
    lt = node.get("lastTabFocus")
    if isinstance(lt, dict):
        wid = lt.get("windowId")
        if wid is not None and str(wid).strip() != "":
            return str(wid).strip()
    if lt is not None and not isinstance(lt, (dict, list)) and str(lt).strip() != "":
        return str(lt).strip()
    return ""


def _stability_walk_lines(
    n: Any, path: str, mon_idx: Optional[int], lines: list[str]
) -> None:
    if not isinstance(n, dict):
        return
    ntype = str(n.get("nodeType") or n.get("type") or "").strip().upper()
    kids = n.get("children") if n.get("children") is not None else n.get("childNodes")
    if not isinstance(kids, list):
        kids = []

    cur_mon = mon_idx
    mon_id = n.get("id") if ntype == "MONITOR" else None
    if ntype == "MONITOR" and isinstance(mon_id, str) and mon_id:
        # moNwsW → N
        m = mon_id
        if m.startswith("mo") and "ws" in m:
            try:
                cur_mon = int(m[2 : m.index("ws")])
            except ValueError:
                pass
        elif n.get("monitor") is not None:
            try:
                cur_mon = int(n["monitor"])
            except (TypeError, ValueError):
                pass

    if ntype == "WINDOW":
        wid = n.get("windowId")
        mode = n.get("mode") if n.get("mode") is not None else ""
        mon = n.get("monitor") if isinstance(n.get("monitor"), int) else cur_mon
        if mon is None and n.get("monitor") is not None:
            try:
                mon = int(n["monitor"])
            except (TypeError, ValueError):
                mon = cur_mon
        p = path or (str(n.get("path") or "").strip())
        lines.append(f"W id={wid}|mode={mode}|mon={mon}|path={p}")
        return

    # CON / MONITOR structural lines (layouts + tab focus drive rehome plan).
    if ntype in ("CON", "CONTAINER", "MONITOR", "WORKSPACE", "ROOT"):
        layout = n.get("layout")
        layout_s = "" if layout is None else str(layout)
        focus = _stability_focus_id(n)
        nid = n.get("id")
        nid_s = "" if nid is None else str(nid)
        # Skip empty interior noise: no layout, no focus, not MONITOR id.
        if layout_s or focus or (ntype == "MONITOR" and nid_s):
            lines.append(
                f"C type={ntype}|layout={layout_s}|focus={focus}|id={nid_s}|path={path}"
            )

    for i, c in enumerate(kids):
        if isinstance(mon_id, str) and mon_id:
            child_path = f"{mon_id}/{i}"
        elif path:
            child_path = f"{path}/{i}"
        else:
            child_path = str(i)
        _stability_walk_lines(c, child_path, cur_mon, lines)


def forest_stability_fingerprint(forest: Any) -> str:
    """
    Deterministic fingerprint of GetTree forest for thrash-stability waits.

    Includes: every WINDOW (windowId, mode, monitor, path), key CON/MONITOR
    layouts + lastTabFocusId, sorted so walk order does not matter beyond path.
    """
    lines: list[str] = []
    if isinstance(forest, dict):
        mons = forest.get("monitors")
        if isinstance(mons, list):
            for m in mons:
                _stability_walk_lines(m, "", None, lines)
        else:
            _stability_walk_lines(forest, "", None, lines)
    elif isinstance(forest, list):
        for m in forest:
            _stability_walk_lines(m, "", None, lines)
    lines.sort()
    return "\n".join(lines)


def wait_for_tree_stable(
    load_forest: Callable[[], Any],
    *,
    timeout_ms: int = TREE_STABLE_TIMEOUT_MS,
    poll_ms: int = TREE_STABLE_POLL_MS,
    stable_samples: int = TREE_STABLE_SAMPLES,
    sleep_fn: Optional[Callable[[float], None]] = None,
    monotonic_fn: Optional[Callable[[], float]] = None,
) -> dict[str, Any]:
    """
    Poll load_forest until fingerprint is unchanged for stable_samples polls.

    Pure of DBus: inject load_forest (+ optional sleep/monotonic for tests).
    On timeout: ok=false, last fingerprint/forest still returned.

    Batch quiet gate (LF6 / CL5 control-loop): open all → wait_for_tree_stable
    (fingerprint holds) → one residual plan + RunSteps commit+verify. Not a
    per-role re-render loop.
    """
    sleep = sleep_fn if sleep_fn is not None else time.sleep
    mono = monotonic_fn if monotonic_fn is not None else time.monotonic
    samples_need = max(1, int(stable_samples))
    poll_s = max(0, int(poll_ms)) / 1000.0
    deadline = mono() + max(0, int(timeout_ms)) / 1000.0
    t0 = mono()

    last_fp: Optional[str] = None
    last_forest: Any = None
    streak = 0
    polls = 0
    last_err: Optional[str] = None

    while True:
        try:
            forest = load_forest()
            fp = forest_stability_fingerprint(forest)
            last_forest = forest
            last_err = None
        except Exception as e:
            last_err = str(e)
            fp = None
            forest = None

        polls += 1
        if fp is None:
            streak = 0
        elif fp == last_fp:
            streak += 1
        else:
            last_fp = fp
            streak = 1

        if streak >= samples_need and last_fp is not None:
            return {
                "ok": True,
                "fingerprint": last_fp,
                "samples": streak,
                "polls": polls,
                "elapsed_ms": int((mono() - t0) * 1000),
                "forest": last_forest,
                "error": None,
            }

        if mono() > deadline:
            break
        if poll_s > 0:
            sleep(poll_s)

    return {
        "ok": False,
        "fingerprint": last_fp,
        "samples": streak,
        "polls": polls,
        "elapsed_ms": int((mono() - t0) * 1000),
        "forest": last_forest,
        "error": last_err
        or f"tree not stable after {timeout_ms}ms (need {samples_need} equal samples)",
    }
