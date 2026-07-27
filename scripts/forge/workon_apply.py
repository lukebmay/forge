#!/usr/bin/env python3
"""Pure helpers for workon reconcile apply (WR3). No DBus / subprocess."""

from __future__ import annotations

from typing import Any, Optional

from workon_plan import mon_index_from_slot

MODE_STEPS = "steps"
MODE_RECONCILE = "reconcile"


def detect_workon_mode(data: Any, *, force_launch: bool = False) -> str:
    """
    Choose steps vs reconcile path.

    --force-launch → steps only when steps[] present; else error.
    mode: steps / version 1 / steps without roles → steps.
    version 2 / roles / mode reconcile → reconcile.
    """
    if not isinstance(data, dict):
        raise ValueError("profile must be a JSON object")

    has_steps = isinstance(data.get("steps"), list)
    roles = data.get("roles")
    has_roles = isinstance(roles, list) and len(roles) > 0
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

    if ver in (2, "2") and has_roles:
        return MODE_RECONCILE

    if has_roles and not has_steps:
        return MODE_RECONCILE

    if ver in (1, "1") or (has_steps and not has_roles):
        return MODE_STEPS

    if has_roles:
        return MODE_RECONCILE

    if has_steps:
        return MODE_STEPS

    raise ValueError(
        "cannot determine workon mode: need version 1 + steps[], "
        "or version 2 + roles[] (mode: reconcile)"
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


def actions_to_extension_steps(actions: Any) -> list[dict[str, Any]]:
    """
    Map plan actions to extension RunSteps (move / layout).
    Skips open (CLI launch).

    layout needs a WINDOW selector (session-api _layoutOp → matchWindows).
    mon path:moNws0 is valid move dest only — not layout selector. Prefer
    id: from a move/park on the same mon; skip ensure_layout when none
    (empty desk: open first; residual replan may layout after).
    """
    if not isinstance(actions, list):
        return []

    # First pass: window id per mon from move/park (for layout feasibility)
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

    steps: list[dict[str, Any]] = []
    for a in actions:
        if not isinstance(a, dict):
            continue
        op = str(a.get("op") or "").strip().lower()
        if op == "ensure_layout":
            mode = a.get("mode")
            if mode is None or str(mode).strip() == "":
                continue
            slot = str(a.get("slot") or "mon0")
            mon = mon_index_from_slot(slot)
            if mon is None:
                mon = 0
            sel = window_by_mon.get(mon)
            if not sel:
                continue
            steps.append(
                {
                    "op": "layout",
                    "mode": str(mode).strip().lower(),
                    "selector": sel,
                }
            )
        elif op in ("move", "park"):
            tile = window_tile_selector(a)
            if not tile:
                continue
            slot = str(a.get("slot") or "mon0")
            steps.append(
                {
                    "op": "move",
                    "tile": tile,
                    "dest": slot_to_monitor_path(slot),
                }
            )
    return steps


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
