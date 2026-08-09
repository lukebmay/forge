#!/usr/bin/env python3
"""Pure helpers for layout reconcile apply (WR3). No DBus / subprocess."""

from __future__ import annotations

import os
import shlex
import time
from pathlib import Path
from typing import Any, Callable, Mapping, Optional

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


def _action_workspace(a: dict[str, Any], default: int = 0) -> int:
    """Workspace index from action (if stamped) else default."""
    raw = a.get("workspace")
    if raw is None:
        return default
    try:
        ws = int(raw)
    except (TypeError, ValueError):
        return default
    return ws if ws >= 0 else default


def _move_step_from_action(
    a: dict[str, Any], *, workspace: int = 0
) -> Optional[dict[str, Any]]:
    """Build a move RunStep from plan move/park action (None if incomplete)."""
    tile = window_tile_selector(a)
    if not tile:
        return None
    ws = _action_workspace(a, workspace)
    # Soft park: destWindowId → move onto that window (join group), not mon root.
    dest_wid = a.get("destWindowId")
    if dest_wid is not None and str(dest_wid).strip() != "":
        dest = f"id:{dest_wid}"
    else:
        slot = str(a.get("slot") or "mon0")
        dest = slot_to_monitor_path(slot, workspace=ws)
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
    actions: Any, *, force_close: bool = False, workspace: int = 0
) -> list[dict[str, Any]]:
    """
    Map plan actions to extension RunSteps (move / layout / order / size / close).
    Skips open (CLI launch).

    workspace: 0-based Meta workspace for mon dest paths (path:moNwsW).
    Per-action workspace (if stamped by plan) overrides this default.

    layout needs a WINDOW selector (session-api _layoutOp → matchWindows).
    mon path:moNwsW is valid move dest only — not layout selector.

    CT0/CT1 phase order:
      skeleton → role place (move) → bind → P5 residual (park/close)
      → ensure_layout → order → size → focus

    Role moves may run before bind (mon-correctness for PH replace).
    Residual close/park of non-roles is after the bind barrier.

    ensure_skeleton → {op: skeleton, mons: [...], workspace} (no windowIds).
    bind → {op: bind, tile: id:…, layoutRole?, layoutSlot?, placeholder?}.

    ensure_layout with windowIds (structure repair, mid-session):
      - tabbed/stacked: layout on first id, then move remaining ids into it
      - nested hsplit/vsplit (slot has '.'): same join as tabbed
      - mon-level hsplit/vsplit: layout on first available id only
    Fallback when no windowIds: id from move/park on same mon; skip if none
    (cold empty uses ensure_skeleton instead).

    ensure_order → {op: order, windowIds: [id:…, …]} (mon child reorder).
    ensure_sizes → {op: size, windowIds: [id:…], shares: […]} (sibling percents).
    focus → {op: focus, selector: id:…} (lastTabFocus + keyboard).
    """
    if not isinstance(actions, list):
        return []
    force_close = bool(force_close)
    try:
        workspace = int(workspace)
    except (TypeError, ValueError):
        workspace = 0
    if workspace < 0:
        workspace = 0

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

    skeleton_steps: list[dict[str, Any]] = []
    role_place_steps: list[dict[str, Any]] = []
    residual_steps: list[dict[str, Any]] = []
    bind_steps: list[dict[str, Any]] = []
    layout_steps: list[dict[str, Any]] = []
    order_steps: list[dict[str, Any]] = []
    size_steps: list[dict[str, Any]] = []
    focus_steps: list[dict[str, Any]] = []

    for a in actions:
        if not isinstance(a, dict):
            continue
        op = str(a.get("op") or "").strip().lower()
        if op == "ensure_skeleton":
            mons = a.get("mons")
            if not isinstance(mons, list) or not mons:
                continue
            step: dict[str, Any] = {"op": "skeleton", "mons": mons}
            ws_a = a.get("workspace")
            if ws_a is not None:
                try:
                    step["workspace"] = int(ws_a)
                except (TypeError, ValueError):
                    step["workspace"] = workspace
            else:
                step["workspace"] = workspace
            skeleton_steps.append(step)
            continue
        if op == "bind":
            tile = window_tile_selector(a)
            if not tile:
                continue
            bind_step: dict[str, Any] = {"op": "bind", "tile": tile}
            if a.get("layoutRole") is not None:
                bind_step["layoutRole"] = str(a.get("layoutRole"))
            if a.get("layoutSlot") is not None:
                bind_step["layoutSlot"] = str(a.get("layoutSlot"))
            ph = a.get("placeholderId")
            if ph is not None and str(ph).strip() != "":
                p = str(ph).strip()
                bind_step["placeholder"] = p if p.startswith("id:") else f"id:{p}"
            bind_steps.append(bind_step)
            continue
        if op == "move":
            step = _move_step_from_action(a, workspace=workspace)
            if step:
                role_place_steps.append(step)
            continue
        if op == "park":
            step = _move_step_from_action(a, workspace=workspace)
            if step:
                residual_steps.append(step)
            continue
        if op == "close":
            tile = window_tile_selector(a)
            if not tile:
                continue
            close_step: dict[str, Any] = {"op": "close", "selector": tile}
            if force_close or a.get("force"):
                close_step["force"] = True
            residual_steps.append(close_step)
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
            # Each join inserts *after* the anchor, so join order alone reverses
            # the tail (YT←Gmail←Voice → YT,Voice,Gmail). Always re-order to
            # profile windowIds when ≥2 members.
            anchor = id_sels[0]
            layout_steps.append({"op": "layout", "mode": mode, "selector": anchor})
            for sel in id_sels[1:]:
                layout_steps.append({"op": "move", "tile": sel, "dest": anchor})
            if len(id_sels) >= 2:
                order_steps.append({"op": "order", "windowIds": list(id_sels)})
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
            if len(id_sels) >= 2:
                order_steps.append({"op": "order", "windowIds": list(id_sels)})
            continue

        sel = id_sels[0] if id_sels else window_by_mon.get(mon)
        if not sel:
            continue
        layout_steps.append({"op": "layout", "mode": mode, "selector": sel})

    # Focus last so lastTabFocus + keyboard focus stick after structure/order/size.
    # Bind before residual close/park (CT0 P5 after bind barrier).
    return (
        skeleton_steps
        + role_place_steps
        + bind_steps
        + residual_steps
        + layout_steps
        + order_steps
        + size_steps
        + focus_steps
    )


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


def open_action_to_launch_fields(
    action: dict[str, Any], *, workspace: int = 0
) -> dict[str, Any]:
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
    ws = _action_workspace(action, workspace)
    if mon is None and slot:
        mon_i = mon_index_from_slot(str(slot))
        if mon_i is not None:
            mon = mon_i
    if tree is None and slot:
        tree = slot_to_tree_path(str(slot), workspace=ws)
    if mon is not None and str(mon).strip() != "":
        fields["monitor"] = mon
    if tree is not None and str(tree).strip() != "":
        fields["tree_path"] = str(tree).strip()
    # Nested split open: Prefer attach next to claimed sibling when plan set it.
    attach = action.get("attachSelector") or action.get("destWindowId")
    if attach is not None and str(attach).strip() != "":
        s = str(attach).strip()
        fields["attach_selector"] = s if s.startswith("id:") else f"id:{s}"
    # Title identity for PlaceNext (Chrome multi-open / X11 shared wmClass).
    oa_match = action.get("match") if isinstance(action.get("match"), dict) else {}
    title_sub = oa_match.get("title~=")
    title_exact = oa_match.get("title")
    if title_sub is not None and str(title_sub).strip() != "":
        fields["title_contains"] = str(title_sub).strip()
    if title_exact is not None and str(title_exact).strip() != "":
        fields["title_exact"] = str(title_exact).strip()
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
    workspace: int = 0,
) -> tuple[list[dict[str, Any]], list[Any]]:
    """
    Map residual extension actions to RunSteps; report still-open roles.

    Moves/layout always map even when residual_open is non-empty so apply can
    rehome claimed roles (e.g. mon1 Ghostty landed on mon0) before failing on
    lagging open roles (chrome title pin miss).
    """
    ext = residual_ext if isinstance(residual_ext, list) else []
    opens = residual_open if isinstance(residual_open, list) else []
    steps = actions_to_extension_steps(
        ext, force_close=force_close, workspace=workspace
    )
    still = [a.get("role") for a in opens if isinstance(a, dict)]
    return steps, still


def belt_actions_from_plan(
    actions: Any,
    role_pins: Optional[dict[str, Any]] = None,
    *,
    include_focus: bool = False,
) -> list[dict[str, Any]]:
    """
    Post-open belt: wrong-mon rehome for just-opened roles only.

    Skeleton→bind residual owns structure/order/size. Belt must not re-run
    ensure_layout / ensure_order (that rewrote topology after bind and stomped
    lastTabFocus). include_focus is kept for tests/API; default False — focus is
    a single post-settle pass, never mid-belt.
    """
    if not isinstance(actions, list):
        return []
    pins = role_pins if isinstance(role_pins, dict) else {}
    pin_roles = {str(k) for k in pins.keys() if k is not None and str(k).strip()}
    out: list[dict[str, Any]] = []
    for a in actions:
        if not isinstance(a, dict):
            continue
        op = str(a.get("op") or "").strip().lower()
        if op == "move" and str(a.get("role") or "") in pin_roles:
            out.append(a)
        elif include_focus and op == "focus":
            out.append(a)
    return out


def focus_actions_from_plan(actions: Any) -> list[dict[str, Any]]:
    """Extract focus ops only (profile active + keyboard focus)."""
    if not isinstance(actions, list):
        return []
    return [
        a
        for a in actions
        if isinstance(a, dict) and str(a.get("op") or "").strip().lower() == "focus"
    ]


def without_focus_actions(actions: Any) -> list[dict[str, Any]]:
    """Drop focus ops so structure/bind can run without raising open leaves early."""
    if not isinstance(actions, list):
        return []
    return [
        a
        for a in actions
        if isinstance(a, dict) and str(a.get("op") or "").strip().lower() != "focus"
    ]


def _focus_action_window_id(action: Any) -> Optional[str]:
    """Parse id:N from a focus action selector; None if missing."""
    if not isinstance(action, dict):
        return None
    sel = action.get("selector")
    if sel is None:
        return None
    s = str(sel).strip()
    if not s.startswith("id:"):
        return None
    wid = s[3:].strip()
    return wid if wid else None


def parent_last_tab_focus_by_window_id(forest: Any) -> dict[str, str]:
    """
    Map each WINDOW id under a TABBED/STACKED CON → that CON's lastTabFocusId.

    Used to verify open-leaf after focus (late chrome activate steals lastTabFocus).
    Missing lastTabFocusId → empty string for children of that group.
    """
    out: dict[str, str] = {}

    def walk(n: Any) -> None:
        if not isinstance(n, dict):
            return
        kids = n.get("children") if n.get("children") is not None else n.get("childNodes")
        if not isinstance(kids, list):
            kids = []
        layout = str(n.get("layout") or "").strip().upper()
        if layout in ("TABBED", "STACKED"):
            ltf = n.get("lastTabFocusId")
            ltf_s = (
                str(ltf).strip() if ltf is not None and str(ltf).strip() != "" else ""
            )
            for c in kids:
                if not isinstance(c, dict):
                    continue
                ntype = str(c.get("nodeType") or c.get("type") or "").strip().upper()
                if ntype and ntype != "WINDOW":
                    continue
                wid = c.get("windowId")
                if wid is None or str(wid).strip() == "":
                    continue
                out[str(wid)] = ltf_s
        for c in kids:
            walk(c)

    if isinstance(forest, dict):
        mons = forest.get("monitors")
        if isinstance(mons, list):
            for m in mons:
                walk(m)
        else:
            walk(forest)
    elif isinstance(forest, list):
        for m in forest:
            walk(m)
    return out


def focus_actions_still_needed(
    forest: Any,
    focus_actions: Any,
) -> list[dict[str, Any]]:
    """
    Subset of focus actions that did not stick on the live forest.

    - reason active|survivor: parent TABBED/STACKED lastTabFocusId must equal
      the action window id (open leaf).
    - reason profile: forest focusWindowId must equal the action window id.
    - unknown reason: treat as needed (safe).

    Cold chrome/PWA often activates after the first focus pass and rewrites
    lastTabFocus; this is the verify barrier (one conditional re-apply), not a
    blind second raise.
    """
    if not isinstance(focus_actions, list) or not focus_actions:
        return []
    parent_ltf = parent_last_tab_focus_by_window_id(forest)
    kbd = ""
    if isinstance(forest, dict):
        fw = forest.get("focusWindowId")
        if fw is None and isinstance(forest.get("meta"), dict):
            fw = forest["meta"].get("focusWindowId")
        if fw is not None and str(fw).strip() != "":
            kbd = str(fw).strip()

    needed: list[dict[str, Any]] = []
    for a in focus_actions:
        if not isinstance(a, dict):
            continue
        wid = _focus_action_window_id(a)
        if wid is None:
            needed.append(a)
            continue
        reason = str(a.get("reason") or "").strip().lower()
        if reason in ("active", "survivor"):
            live = parent_ltf.get(wid)
            if live is None:
                # Window not under a tab/stack group in export — still raise.
                needed.append(a)
            elif live != wid:
                needed.append(a)
        elif reason == "profile":
            if kbd != wid:
                needed.append(a)
        else:
            needed.append(a)
    return needed


# Quiet after structure before final active-leaf focus (chrome/PWA late activate).
FINAL_FOCUS_QUIET_MS = 400
# After first focus: wait for late activate, then verify lastTabFocus (not blind reassert).
FINAL_FOCUS_VERIFY_QUIET_MS = 350
# Poll window after verify: re-apply mismatches until clean samples or timeout.
FINAL_FOCUS_STABLE_TIMEOUT_MS = 2000
FINAL_FOCUS_STABLE_POLL_MS = 200
FINAL_FOCUS_STABLE_SAMPLES = 2
# Legacy always-on second full focus pass — default off.
# Opt-in: FORGE_LAYOUT_FINAL_FOCUS_REASSERT_MS=<ms> (debug / compare).
FINAL_FOCUS_REASSERT_MS = 0


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


# --- LF6 fingerprint helpers (optional debug; not default apply gate) ---
# Product path: open all → map-pin wait → release-deferred → residual place.
# wait_for_tree_stable is opt-in via --wait-tree-stable / FORGE_LAYOUT_WAIT_TREE_STABLE.

# Defaults when fingerprint quiet is enabled (Ghostty may self-resize after map).
TREE_STABLE_TIMEOUT_MS = 7000
TREE_STABLE_POLL_MS = 180
TREE_STABLE_SAMPLES = 3
BELT_STABLE_TIMEOUT_MS = 2500
BELT_STABLE_POLL_MS = 150
BELT_STABLE_SAMPLES = 2

# Env values that enable optional whole-tree fingerprint quiet (case-insensitive).
_WAIT_TREE_STABLE_TRUTHY = frozenset({"1", "true", "yes", "on"})


def layout_wait_tree_stable_enabled(
    *,
    flag: bool = False,
    env: Optional[Mapping[str, str]] = None,
) -> bool:
    """
    Whether forge layout should run LF6 wait_for_tree_stable (main + belt).

    Default off. Opt-in: CLI --wait-tree-stable (flag=True) and/or env
    FORGE_LAYOUT_WAIT_TREE_STABLE=1 (also true/yes/on). Pass env= for tests;
    forge uses os.environ when env is None.
    """
    if flag:
        return True
    e = env if env is not None else os.environ
    raw = str(e.get("FORGE_LAYOUT_WAIT_TREE_STABLE") or "").strip().lower()
    return raw in _WAIT_TREE_STABLE_TRUTHY


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

    Optional debug batch quiet (LF6): open all → wait_for_tree_stable
    (fingerprint holds) → residual plan + RunSteps. Not the default product
    gate — enable with --wait-tree-stable / FORGE_LAYOUT_WAIT_TREE_STABLE.
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


# --- CL9: parallel open pin assignment (map/windowId, not TILE settle) ---


def _default_class_eq(a: Any, b: Any) -> bool:
    """Casefold equality for tests; forge passes richer _class_eq in production."""
    if a is None or b is None:
        return False
    sa = str(a).strip().casefold()
    sb = str(b).strip().casefold()
    return bool(sa and sb and sa == sb)


def window_has_map_id(win: Any) -> bool:
    """True when a GetTree WINDOW leaf has a usable windowId (mapped/tracked)."""
    if not isinstance(win, dict):
        return False
    wid = win.get("windowId")
    return wid is not None and str(wid).strip() != ""


def _pending_title_exact(item: dict[str, Any]) -> Optional[str]:
    """Exact title pin field from pending item (if any)."""
    v = item.get("title_exact")
    if v is not None and str(v).strip() != "":
        return str(v).strip()
    # Bare title only when no substring field is set.
    if item.get("title_contains") is not None or item.get("title~=") is not None:
        return None
    v = item.get("title")
    if v is not None and str(v).strip() != "":
        return str(v).strip()
    return None


def _pending_title_contains(item: dict[str, Any]) -> Optional[str]:
    """Substring / title~= pin field from pending item (if any)."""
    for key in ("title_contains", "title~="):
        v = item.get(key)
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return None


def window_matches_pin_title(win: dict[str, Any], item: dict[str, Any]) -> bool:
    """
    Title identity for map-pin (X11 Chrome PWAs share wmClass=Google-chrome).

    No title constraint → True (class / accept_any decides).
    With constraint → False until title is present and matches (do not early-claim).
    """
    if not isinstance(win, dict) or not isinstance(item, dict):
        return False
    exact = _pending_title_exact(item)
    contains = _pending_title_contains(item)
    if exact is None and contains is None:
        return True
    title = win.get("title")
    if title is None:
        return False
    title_s = str(title)
    if exact is not None:
        return title_s == exact
    assert contains is not None
    return contains in title_s


def assign_open_role_pins(
    pending: list[dict[str, Any]],
    windows: list[dict[str, Any]],
    used_ids: Optional[set[str]] = None,
    *,
    class_eq: Optional[Callable[[Any, Any], bool]] = None,
) -> dict[str, Any]:
    """
    Greedy role → windowId pins for parallel layout opens (CL9).

    pending items:
      - role: str (required for pin key)
      - wait_classes: list[str] | None — match wmClass when non-empty
      - title_contains / title~= : substring title identity (Chrome multi-open)
      - title_exact / title : exact title identity
      - accept_any_new: bool — claim any unused mapped window if no class list

    Title constraints (when set) must match before a pin is taken — avoids
    scrambling multiple Google-chrome maps that only differ by title later.

    Only windows with windowId and not in used_ids are candidates.
    Each windowId is assigned to at most one role (pending order wins).
    Returns partial dict of role → windowId for newly matched roles this pass.
    """
    eq = class_eq if class_eq is not None else _default_class_eq
    used: set[str] = set(used_ids or set())
    out: dict[str, Any] = {}
    if not pending:
        return out

    pool: list[dict[str, Any]] = []
    for w in windows or []:
        if not isinstance(w, dict) or not window_has_map_id(w):
            continue
        wid = str(w.get("windowId")).strip()
        if wid in used:
            continue
        pool.append(w)

    def _take_match(item: dict[str, Any]) -> Optional[dict[str, Any]]:
        nonlocal pool
        classes = item.get("wait_classes")
        class_list: list[str] = []
        if isinstance(classes, str) and classes.strip():
            class_list = [classes.strip()]
        elif isinstance(classes, list):
            class_list = [str(c).strip() for c in classes if c and str(c).strip()]
        accept_any = bool(item.get("accept_any_new"))
        need_title = (
            _pending_title_exact(item) is not None
            or _pending_title_contains(item) is not None
        )

        candidates = [w for w in pool if window_matches_pin_title(w, item)]
        if need_title and not candidates:
            return None

        def _pop_from_pool(w: dict[str, Any]) -> dict[str, Any]:
            for i, p in enumerate(pool):
                if p is w or (
                    str(p.get("windowId")).strip() == str(w.get("windowId")).strip()
                ):
                    return pool.pop(i)
            # Should not happen; remove by identity fallback
            pool.remove(w)
            return w

        search = candidates if need_title else pool

        if class_list:
            for w in search:
                cls = w.get("wmClass") if w.get("wmClass") is not None else w.get("wm_class")
                if any(eq(cls, want) for want in class_list):
                    return _pop_from_pool(w)
            # Title identity alone is enough when class list never appears on
            # X11 (all PWAs stay Google-chrome) but title~= is set.
            if need_title and search:
                return _pop_from_pool(search[0])
            return None
        if need_title and search:
            return _pop_from_pool(search[0])
        if accept_any and pool:
            # Never accept-any when a title constraint failed (already returned).
            return pool.pop(0)
        return None

    for item in pending:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role is None or str(role).strip() == "":
            continue
        rid = str(role)
        if rid in out:
            continue
        hit = _take_match(item)
        if hit is None:
            continue
        wid = str(hit.get("windowId")).strip()
        out[rid] = hit.get("windowId")
        used.add(wid)

    return out


def wait_for_open_role_pins(
    load_windows: Callable[[], list[dict[str, Any]]],
    pending: list[dict[str, Any]],
    *,
    baseline_ids: Optional[set[str]] = None,
    timeout_ms: int = 15000,
    poll_ms: int = 120,
    class_eq: Optional[Callable[[Any, Any], bool]] = None,
    sleep_fn: Optional[Callable[[float], None]] = None,
    monotonic_fn: Optional[Callable[[], float]] = None,
) -> dict[str, Any]:
    """
    Poll until each pending role has a mapped windowId (not TILE settle).

    Pure of DBus: inject load_windows (+ optional sleep/monotonic for tests).
    Returns role_pins, missing roles, polls, elapsed_ms, ok.
    """
    sleep = sleep_fn if sleep_fn is not None else time.sleep
    mono = monotonic_fn if monotonic_fn is not None else time.monotonic
    poll_s = max(0, int(poll_ms)) / 1000.0
    deadline = mono() + max(0, int(timeout_ms)) / 1000.0
    t0 = mono()
    baseline = set(str(x) for x in (baseline_ids or set()))
    used: set[str] = set(baseline)
    pins: dict[str, Any] = {}
    remaining = [
        p
        for p in pending
        if isinstance(p, dict)
        and p.get("role") is not None
        and str(p.get("role")).strip() != ""
    ]
    polls = 0
    last_err: Optional[str] = None

    while remaining and mono() <= deadline:
        try:
            wins = load_windows()
            if not isinstance(wins, list):
                wins = []
            last_err = None
        except Exception as e:
            last_err = str(e)
            wins = []
        polls += 1
        assigned = assign_open_role_pins(remaining, wins, used, class_eq=class_eq)
        if assigned:
            for rid, wid in assigned.items():
                pins[rid] = wid
                used.add(str(wid).strip())
            remaining = [
                p for p in remaining if str(p.get("role")) not in pins
            ]
            if not remaining:
                break
        if poll_s > 0 and remaining:
            sleep(poll_s)

    missing = [str(p.get("role")) for p in remaining]
    return {
        "ok": len(missing) == 0,
        "role_pins": pins,
        "missing": missing,
        "polls": polls,
        "elapsed_ms": int((mono() - t0) * 1000),
        "error": None
        if not missing
        else (
            last_err
            or f"map wait timeout for roles: {missing}"
        ),
    }
