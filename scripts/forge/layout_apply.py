#!/usr/bin/env python3
"""Pure helpers for layout reconcile apply (WR3). No DBus / subprocess."""

from __future__ import annotations

from typing import Any, Optional

from layout_plan import mon_index_from_slot

MODE_STEPS = "steps"
MODE_RECONCILE = "reconcile"


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
    Map plan actions to extension RunSteps (move / layout / order / close).
    Skips open (CLI launch).

    layout needs a WINDOW selector (session-api _layoutOp → matchWindows).
    mon path:moNws0 is valid move dest only — not layout selector.

    Order: placement moves/parks and residual closes first, then
    ensure_layout (structure after windows on target mon), then
    ensure_order (mon-level L/R after groups exist).

    close → {op: close, selector: id:…} (+ force when force_close).

    ensure_layout with windowIds (structure repair):
      - tabbed/stacked: layout on first id, then move remaining ids into it
      - hsplit/vsplit: layout on first available id
    Fallback when no windowIds: id from move/park on same mon; skip if none
    (empty desk: open first; residual replan may layout after).

    ensure_order → {op: order, windowIds: [id:…, …]} (mon child reorder).
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
        if op == "ensure_order":
            id_sels = _window_ids_to_selectors(
                a.get("windowIds") if a.get("windowIds") is not None else a.get("selectors")
            )
            if len(id_sels) >= 2:
                order_steps.append({"op": "order", "windowIds": id_sels})
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

        sel = id_sels[0] if id_sels else window_by_mon.get(mon)
        if not sel:
            continue
        layout_steps.append({"op": "layout", "mode": mode, "selector": sel})

    return place_steps + layout_steps + order_steps


def open_action_to_launch_fields(action: dict[str, Any]) -> dict[str, Any]:
    """Map plan open action → do_launch kwargs (+ role for reports)."""
    open_spec = action.get("open") if isinstance(action.get("open"), dict) else {}
    app = open_spec.get("app") or open_spec.get("desktop") or open_spec.get("command")
    fields: dict[str, Any] = {
        "app": str(app).strip() if app is not None else "",
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
