#!/usr/bin/env python3
"""Black-box nest story oracles (GetTree / forge tree).

Gesture in; who-sits-where, TILE|FLOAT, identity, visible Meta/rect out.
Not PlaceNext, log-token CTS, or fingerprint-only Join.
"""

from __future__ import annotations

import json
import re
from typing import Any, Mapping, Optional, Sequence

from nest_invoke import iter_nodes
from nest_proof import (
    HALF_HI,
    HALF_LO,
    THIRD_HI,
    THIRD_LO,
    ShareError,
    assert_siblings_fill_half,
    assert_slot_not_third,
    in_band,
    monitor_rect,
    width_ratio,
    window_rect,
)

VERSION = "1"

_LAYOUT_SHORT = {
    "HSPLIT": "H",
    "VSPLIT": "V",
    "TABBED": "TAB",
    "STACKED": "STACK",
    "H": "H",
    "V": "V",
    "TAB": "TAB",
    "STACK": "STACK",
}


class OracleError(ValueError):
    """Black-box forest / mode / identity / visible-rect failure."""


def parse_get_tree(raw: Any) -> dict[str, Any]:
    """Accept a GetTree object or JSON text from ``forge tree`` / DBus."""
    if isinstance(raw, Mapping):
        data = dict(raw)
    else:
        text = str(raw or "").strip()
        if not text:
            raise OracleError("empty GetTree / forge tree payload")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise OracleError(f"GetTree not JSON: {text[:240]}") from e
        if not isinstance(parsed, dict):
            raise OracleError("GetTree returned non-object")
        data = parsed
    if data.get("error"):
        raise OracleError(f"GetTree: {data['error']}")
    if "monitors" in data:
        return data
    inner = data.get("tree")
    if isinstance(inner, dict) and "monitors" in inner:
        return inner
    raise OracleError("GetTree object has no monitors")


def node_type(node: Mapping[str, Any]) -> str:
    return str(node.get("nodeType") or node.get("type") or node.get("kind") or "").upper()


def node_layout(node: Mapping[str, Any]) -> str:
    return str(node.get("layout") or "").upper()


def node_mode(node: Mapping[str, Any]) -> str:
    return str(node.get("mode") or "").upper()


def node_id(node: Mapping[str, Any]) -> str:
    return str(node.get("windowId") or node.get("id") or "")


def node_wm_class(node: Mapping[str, Any]) -> str:
    return str(node.get("wmClass") or node.get("wm_class") or "")


def node_pid(node: Mapping[str, Any]) -> Optional[int]:
    raw = node.get("pid")
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def children_of(node: Mapping[str, Any]) -> list[dict[str, Any]]:
    kids = node.get("children") or node.get("childNodes") or []
    if not isinstance(kids, list):
        return []
    return [c for c in kids if isinstance(c, dict)]


def monitors_of(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    roots = forest.get("monitors") or []
    if not isinstance(roots, list):
        return []
    return [m for m in roots if isinstance(m, dict)]


def monitor_at(forest: Mapping[str, Any], index: int = 0) -> dict[str, Any]:
    mons = monitors_of(forest)
    if index < 0 or index >= len(mons):
        raise OracleError(f"monitor {index} missing (have {len(mons)})")
    return mons[index]


def float_windows(forest: Mapping[str, Any]) -> list[dict[str, Any]]:
    """FLOATS bag as GetTree ``orphanWindows`` (D087)."""
    raw = forest.get("orphanWindows") or forest.get("floats") or []
    if not isinstance(raw, list):
        return []
    return [n for n in raw if isinstance(n, dict)]


def open_leaf(bag: Mapping[str, Any]) -> Optional[dict[str, Any]]:
    """Visible child of a TABBED/STACKED group (lastTabFocusId)."""
    kids = children_of(bag)
    if not kids:
        return None
    fid = str(bag.get("lastTabFocusId") or bag.get("lastTabFocus") or "")
    if fid:
        for c in kids:
            if node_id(c) == fid:
                return c
    return kids[0]


def visible_panes(
    forest: Mapping[str, Any],
    *,
    monitor: int = 0,
) -> list[dict[str, Any]]:
    """TILE windows the user can see on one head (D105). Other mons ignored."""
    return _visible_in(monitor_at(forest, monitor))


def _visible_in(node: Mapping[str, Any]) -> list[dict[str, Any]]:
    nt = node_type(node)
    lay = node_layout(node)
    if nt == "WINDOW":
        if node_mode(node) in ("FLOAT", "GRAB_TILE"):
            return []
        return [dict(node)]
    kids = children_of(node)
    if lay in ("TABBED", "STACKED"):
        leaf = open_leaf(node)
        return _visible_in(leaf) if leaf else []
    out: list[dict[str, Any]] = []
    for c in kids:
        out.extend(_visible_in(c))
    return out


def _layout_token(node: Mapping[str, Any]) -> str:
    nt = node_type(node)
    if nt == "WINDOW":
        return "WINDOW"
    return _LAYOUT_SHORT.get(node_layout(node), "")


def shape_of(node: Mapping[str, Any]) -> str:
    """Compact who-sits-where: ``H(V(WINDOW,WINDOW),WINDOW)``."""
    nt = node_type(node)
    kids = children_of(node)
    tok = _layout_token(node)
    if nt == "WINDOW":
        return "WINDOW"
    if nt == "MONITOR":
        if tok and len(kids) >= 2:
            inner = ",".join(shape_of(c) for c in kids)
            return f"{tok}({inner})"
        if len(kids) == 1:
            return shape_of(kids[0])
        if not kids:
            return "()"
        inner = ",".join(shape_of(c) for c in kids)
        return f"MON({inner})"
    if not tok:
        tok = nt or "?"
    inner = ",".join(shape_of(c) for c in kids)
    return f"{tok}({inner})"


def normalize_shape(expected: str) -> str:
    """Story shorthand ``Mon0(H(V(A,C),B))`` → ``H(V(WINDOW,WINDOW),WINDOW)``."""
    s = re.sub(r"\s+", "", str(expected or ""))
    s = re.sub(r"^Mon\d+\((.*)\)$", r"\1", s, flags=re.I)
    for src, dst in (
        ("HSPLIT", "H"),
        ("VSPLIT", "V"),
        ("TABBED", "TAB"),
        ("STACKED", "STACK"),
    ):
        s = s.replace(src, dst)
    # A,B,C… are story letters. Keep H/V layout tokens.
    s = re.sub(r"\b[A-GI-UW-Z]\b", "WINDOW", s)
    return s


def monitor_shape(forest: Mapping[str, Any], index: int = 0) -> str:
    return shape_of(monitor_at(forest, index))


def assert_who_sits_where(
    forest: Mapping[str, Any],
    expected: str,
    *,
    monitor: int = 0,
    stage: str,
) -> str:
    got = monitor_shape(forest, monitor)
    want = normalize_shape(expected)
    if got != want:
        raise OracleError(f"{stage}: shape {got} != {want}")
    return got


def assert_mode(
    node: Mapping[str, Any],
    expected: str,
    *,
    stage: str,
) -> str:
    got = node_mode(node)
    want = str(expected or "").upper()
    if got != want:
        raise OracleError(
            f"{stage}: mode {got or '?'} != {want} id={node_id(node)!r}"
        )
    return got


def assert_identity(
    node: Mapping[str, Any],
    *,
    stage: str,
    wm_class: Optional[str] = None,
    pid: Optional[int] = None,
    window_id: Optional[str] = None,
) -> dict[str, Any]:
    if wm_class:
        got = node_wm_class(node)
        needle = str(wm_class).lower()
        if needle not in got.lower():
            raise OracleError(
                f"{stage}: wmClass {got!r} does not contain {wm_class!r} "
                f"id={node_id(node)!r}"
            )
    if pid is not None:
        got_pid = node_pid(node)
        if got_pid != int(pid):
            raise OracleError(
                f"{stage}: pid {got_pid!r} != {pid} id={node_id(node)!r}"
            )
    if window_id is not None:
        got_id = node_id(node)
        if got_id != str(window_id):
            raise OracleError(f"{stage}: windowId {got_id!r} != {window_id!r}")
    return {
        "windowId": node_id(node),
        "wmClass": node_wm_class(node),
        "pid": node_pid(node),
        "mode": node_mode(node),
    }


def assert_parent_children(
    parent: Mapping[str, Any],
    *,
    stage: str,
    layout: Optional[str] = None,
    child_count: Optional[int] = None,
    child_types: Optional[Sequence[str]] = None,
) -> list[dict[str, Any]]:
    kids = children_of(parent)
    if layout is not None:
        want = str(layout).upper()
        short = _LAYOUT_SHORT.get(want, want)
        got = node_layout(parent)
        got_s = _LAYOUT_SHORT.get(got, got)
        if got != want and got_s != short:
            raise OracleError(f"{stage}: layout {got or '?'} != {want}")
    if child_count is not None and len(kids) != int(child_count):
        raise OracleError(
            f"{stage}: child count {len(kids)} != {child_count}"
        )
    if child_types is not None:
        got_t = [node_type(c) for c in kids]
        want_t = [str(t).upper() for t in child_types]
        if got_t != want_t:
            raise OracleError(f"{stage}: child types {got_t} != {want_t}")
    return kids


def assert_visible_fill_half(
    wins: Sequence[Mapping[str, Any]],
    mon: Mapping[str, float],
    *,
    stage: str,
    closed_id: Optional[str] = None,
) -> dict[str, Any]:
    try:
        return assert_siblings_fill_half(
            wins, mon, stage=stage, closed_id=closed_id
        )
    except ShareError as e:
        raise OracleError(str(e)) from e


def assert_visible_not_third(
    win: Mapping[str, Any],
    mon: Mapping[str, float],
    *,
    stage: str,
    min_ratio: float = HALF_LO,
) -> float:
    try:
        return assert_slot_not_third(
            win, mon, stage=stage, min_ratio=min_ratio
        )
    except ShareError as e:
        raise OracleError(str(e)) from e


def assert_visible_only(
    forest: Mapping[str, Any],
    *,
    monitor: int = 0,
    stage: str,
    expect_count: Optional[int] = None,
    expect_shape: Optional[str] = None,
    expect_half: bool = False,
) -> dict[str, Any]:
    """Assert the **visible** group on one head (D105).

    Other monitors may be missing or still mapping. Do not require them.
    Fails if this head is missing or its visible panes are wrong.
    """
    mon_node = monitor_at(forest, monitor)
    panes = visible_panes(forest, monitor=monitor)
    if expect_count is not None and len(panes) != int(expect_count):
        raise OracleError(
            f"{stage}: visible count {len(panes)} != {expect_count} "
            f"ids={[node_id(p) for p in panes]}"
        )
    shape = shape_of(mon_node)
    if expect_shape is not None:
        want = normalize_shape(expect_shape)
        if shape != want:
            raise OracleError(f"{stage}: visible shape {shape} != {want}")
    work = monitor_rect(forest, monitor)
    if expect_half:
        if len(panes) != 2:
            raise OracleError(
                f"{stage}: expect_half needs 2 visible panes (have {len(panes)})"
            )
        assert_visible_fill_half(panes, work, stage=stage)
    return {
        "monitor": monitor,
        "shape": shape,
        "visibleIds": [node_id(p) for p in panes],
        "visibleCount": len(panes),
        "workarea": work,
    }


def assert_float_not_under_monitor(
    forest: Mapping[str, Any],
    *,
    stage: str,
    window_id: Optional[str] = None,
    wm_class: Optional[str] = None,
) -> list[dict[str, Any]]:
    """FLOAT lives in FLOATS (orphanWindows), never under a MONITOR (D087)."""
    under: list[str] = []
    for i, mon in enumerate(monitors_of(forest)):
        for n in iter_nodes(mon):
            if node_type(n) != "WINDOW":
                continue
            if node_mode(n) != "FLOAT":
                continue
            under.append(f"mon{i}:{node_id(n) or node_wm_class(n) or '?'}")
    if under:
        raise OracleError(f"{stage}: FLOAT under MONITOR {under}")
    floats = float_windows(forest)
    hits = list(floats)
    if window_id is not None:
        hits = [w for w in hits if node_id(w) == str(window_id)]
        if not hits:
            raise OracleError(
                f"{stage}: FLOAT id {window_id!r} not in FLOATS/orphanWindows"
            )
    if wm_class is not None:
        needle = str(wm_class).lower()
        hits = [w for w in hits if needle in node_wm_class(w).lower()]
        if not hits:
            raise OracleError(
                f"{stage}: FLOAT wmClass {wm_class!r} not in FLOATS/orphanWindows"
            )
    for w in hits:
        assert_mode(w, "FLOAT", stage=stage)
    return hits


def width_in_third_band(win: Mapping[str, Any], mon: Mapping[str, float]) -> bool:
    return in_band(width_ratio(win, mon), THIRD_LO, THIRD_HI)


def width_in_half_band(win: Mapping[str, Any], mon: Mapping[str, float]) -> bool:
    return in_band(width_ratio(win, mon), HALF_LO, HALF_HI)


def workarea_of(forest: Mapping[str, Any], monitor: int = 0) -> dict[str, float]:
    return monitor_rect(forest, monitor)


__all__ = (
    "HALF_HI",
    "HALF_LO",
    "OracleError",
    "THIRD_HI",
    "THIRD_LO",
    "VERSION",
    "assert_float_not_under_monitor",
    "assert_identity",
    "assert_mode",
    "assert_parent_children",
    "assert_visible_fill_half",
    "assert_visible_not_third",
    "assert_visible_only",
    "assert_who_sits_where",
    "children_of",
    "float_windows",
    "monitor_at",
    "monitor_shape",
    "monitors_of",
    "node_id",
    "node_layout",
    "node_mode",
    "node_pid",
    "node_type",
    "node_wm_class",
    "normalize_shape",
    "open_leaf",
    "parse_get_tree",
    "shape_of",
    "visible_panes",
    "width_in_half_band",
    "width_in_third_band",
    "window_rect",
    "workarea_of",
)
