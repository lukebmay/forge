#!/usr/bin/env python3
"""Pure layout save: GetTree forest → tiles sugar sketch (WR7)."""

from __future__ import annotations

import re
from typing import Any, Optional

from layout_plan import (
    _alloc_role_id,
    _order_monitors,
    _parse_mon_id,
    _stem_to_id,
    validate_reconcile_profile,
)

_KNOWN_TITLE_FRAGS = (
    "Google Chrome",
    "YouTube",
    "Gmail",
    "Grok",
    "Voice",
    "Calendar",
    "Drive",
    "Docs",
    "Sheets",
    "Slides",
    "Meet",
    "Maps",
    "Chat",
    "Discord",
    "Slack",
    "Spotify",
    "Code",
    "Nautilus",
    "Ghostty",
    "Firefox",
    "Terminal",
)

_CHROME_CLASS_RE = re.compile(r"chrome|chromium|brave", re.I)


def capture_tiles_profile(
    forest: Any, *, description: Optional[str] = None
) -> dict[str, Any]:
    """
    Snapshot a GetTree forest into compact tiles sugar.

    Output validates via normalize_profile + validate_reconcile_profile.
    """
    if not isinstance(forest, dict):
        raise ValueError("forest must be a JSON object")

    mons = _select_physical_monitors(forest)
    class_counts = _count_classes(mons)
    used_ids: set[str] = set()
    tiles: dict[str, Any] = {}
    floating: list[dict[str, Any]] = []
    mon_window_counts: dict[str, int] = {}
    seen_float_ids: set[str] = set()

    for mon in mons:
        mon_i = _mon_index(mon)
        if mon_i is None:
            continue
        mon_key = f"mon{mon_i}"
        panes: list[Any] = []
        win_n = 0
        for child in _ordered_children(mon):
            if _is_float_window(child):
                cell = _role_cell(child, used_ids, class_counts)
                if cell is not None:
                    floating.append(cell)
                    wid = child.get("windowId")
                    if wid is not None:
                        seen_float_ids.add(str(wid))
                continue
            pane, n = _capture_pane(child, used_ids, class_counts)
            if pane is not None:
                panes.append(pane)
                win_n += n
        if panes:
            tiles[mon_key] = panes
            mon_window_counts[mon_key] = win_n

    for w in _all_windows(forest):
        if not _is_float_window(w):
            continue
        wid = w.get("windowId")
        if wid is not None and str(wid) in seen_float_ids:
            continue
        cell = _role_cell(w, used_ids, class_counts)
        if cell is not None:
            floating.append(cell)
            if wid is not None:
                seen_float_ids.add(str(wid))

    if not tiles and not floating:
        raise ValueError("no tiled windows to capture")

    out: dict[str, Any] = {}
    if description:
        out["description"] = description
    out["tiles"] = tiles
    # Omit empty floating for max sugar (defaults to none on load).
    if floating:
        out["floating"] = floating

    validate_reconcile_profile(out)
    out["_stats"] = {
        "mons": mon_window_counts,
        "windows": sum(mon_window_counts.values()),
        "floating": len(floating),
    }
    return out


def profile_for_output(profile: dict[str, Any]) -> dict[str, Any]:
    """Drop internal keys before JSON print/write."""
    out = {k: v for k, v in profile.items() if not k.startswith("_")}
    return out


def format_capture_stderr(profile: dict[str, Any]) -> str:
    stats = profile.get("_stats") or {}
    mons = stats.get("mons") or {}
    parts = [f"{k}={n}" for k, n in sorted(mons.items())]
    mon_bit = " ".join(parts) if parts else "mons=0"
    return (
        f"forge layout save: {mon_bit} "
        f"windows={stats.get('windows', 0)}"
        + (
            f" floating={stats['floating']}"
            if stats.get("floating")
            else ""
        )
    )


def _select_physical_monitors(forest: dict[str, Any]) -> list[dict[str, Any]]:
    """One MONITOR root per physical mon (prefer ws0); skip empty workspace copies."""
    raw = forest.get("monitors")
    if not isinstance(raw, list):
        return []
    mons = [m for m in raw if isinstance(m, dict)]
    if not mons:
        return []

    # Group by mon index, then stableKey, then id
    groups: dict[Any, list[dict[str, Any]]] = {}
    for m in mons:
        key = _physical_key(m)
        groups.setdefault(key, []).append(m)

    chosen: list[dict[str, Any]] = []
    for _key, group in groups.items():
        # Prefer moNws0, then lowest workspace, then any with children
        group_sorted = sorted(group, key=_mon_pick_key)
        pick = group_sorted[0]
        # If preferred is empty but another copy has windows, take the populated one
        if not _mon_has_windows(pick):
            for alt in group_sorted[1:]:
                if _mon_has_windows(alt):
                    pick = alt
                    break
        # Skip entirely empty physical mons only when every copy is empty
        # and there is at least one other mon with windows — keep empty
        # only if it is the sole mon (still useful sketch).
        chosen.append(pick)

    # Drop empty mons when other mons have content (ignore empty workspace copies)
    if any(_mon_has_windows(m) for m in chosen):
        chosen = [m for m in chosen if _mon_has_windows(m)]

    return sorted(chosen, key=lambda m: (_mon_index(m) is None, _mon_index(m) or 0))


def _physical_key(m: dict[str, Any]) -> Any:
    mid = m.get("id")
    if isinstance(mid, str):
        parsed = _parse_mon_id(mid)
        if parsed:
            return ("idx", parsed[0])
    sk = m.get("stableKey")
    if sk:
        return ("sk", str(sk))
    mon = m.get("monitor")
    if isinstance(mon, int):
        return ("mon", mon)
    return ("id", str(mid or id(m)))


def _mon_pick_key(m: dict[str, Any]) -> tuple:
    mid = m.get("id") or ""
    parsed = _parse_mon_id(str(mid)) if mid else None
    if parsed:
        mon_i, ws = parsed
        return (ws, mon_i, str(mid))
    return (50, 50, str(mid))


def _mon_index(m: dict[str, Any]) -> Optional[int]:
    mid = m.get("id")
    if isinstance(mid, str):
        parsed = _parse_mon_id(mid)
        if parsed:
            return parsed[0]
    mon = m.get("monitor")
    if isinstance(mon, int) and mon >= 0:
        return mon
    return None


def _mon_has_windows(m: dict[str, Any]) -> bool:
    return _count_windows_under(m) > 0


def _count_windows_under(n: Any) -> int:
    if not isinstance(n, dict):
        return 0
    ntype = n.get("nodeType") or n.get("type")
    if ntype == "WINDOW":
        return 1
    kids = n.get("children") or n.get("childNodes") or []
    if not isinstance(kids, list):
        return 0
    return sum(_count_windows_under(c) for c in kids)


def _count_classes(mons: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for m in mons:
        for w in _window_leaves(m):
            if _is_float_window(w):
                continue
            cls = _wm_class(w)
            if not cls:
                continue
            key = cls.strip().lower()
            counts[key] = counts.get(key, 0) + 1
    return counts


def _ordered_children(node: dict[str, Any]) -> list[dict[str, Any]]:
    kids = node.get("children") or node.get("childNodes") or []
    if not isinstance(kids, list):
        return []
    items = [c for c in kids if isinstance(c, dict)]
    layout = str(node.get("layout") or "").upper()
    vsplit = layout == "VSPLIT"

    def sort_key(c: dict[str, Any], i: int) -> tuple:
        rect = c.get("rect") if isinstance(c.get("rect"), dict) else {}
        x = rect.get("x") if isinstance(rect.get("x"), (int, float)) else 0
        y = rect.get("y") if isinstance(rect.get("y"), (int, float)) else 0
        if vsplit:
            return (y, x, i)
        return (x, y, i)

    indexed = list(enumerate(items))
    indexed.sort(key=lambda t: sort_key(t[1], t[0]))
    return [c for _, c in indexed]


def _capture_pane(
    node: dict[str, Any], used_ids: set[str], class_counts: dict[str, int]
) -> tuple[Any, int]:
    """Return (sugar pane or None, window count)."""
    ntype = node.get("nodeType") or node.get("type")
    if ntype == "WINDOW":
        if _is_float_window(node):
            return None, 0
        cell = _role_cell(node, used_ids, class_counts)
        return cell, 1 if cell is not None else 0

    layout = str(node.get("layout") or "").upper()
    kids = _ordered_children(node)

    if layout in ("TABBED", "STACKED"):
        # Prefer direct children order (tab bar L→R / stack order).
        wins = [
            c
            for c in kids
            if (c.get("nodeType") or c.get("type")) == "WINDOW"
            and not _is_float_window(c)
        ]
        if not wins:
            wins = [w for w in _window_leaves(node) if not _is_float_window(w)]
        if not wins:
            return None, 0
        if len(wins) == 1:
            cell = _role_cell(wins[0], used_ids, class_counts)
            return cell, 1 if cell is not None else 0
        cells = []
        for w in wins:
            cell = _role_cell(w, used_ids, class_counts)
            if cell is not None:
                cells.append(cell)
        if not cells:
            return None, 0
        if len(cells) == 1:
            return cells[0], 1
        return cells, len(cells)

    if layout in ("HSPLIT", "VSPLIT") and kids:
        content: list[Any] = []
        total = 0
        for k in kids:
            pane, n = _capture_pane(k, used_ids, class_counts)
            if pane is not None:
                content.append(pane)
                total += n
        if not content:
            return None, 0
        if len(content) == 1:
            return content[0], total
        split = "h" if layout == "HSPLIT" else "v"
        return {"split": split, "content": content}, total

    # Generic CON / unknown: unwrap single child or tab-style multi-window
    wins = [w for w in _window_leaves(node) if not _is_float_window(w)]
    if not wins:
        return None, 0
    if len(wins) == 1:
        cell = _role_cell(wins[0], used_ids, class_counts)
        return cell, 1 if cell is not None else 0
    # Multiple windows without TABBED — still emit nested list (tab-ish)
    cells = []
    for w in wins:
        cell = _role_cell(w, used_ids, class_counts)
        if cell is not None:
            cells.append(cell)
    if not cells:
        return None, 0
    if len(cells) == 1:
        return cells[0], 1
    return cells, len(cells)


def _role_cell(
    w: dict[str, Any], used_ids: set[str], class_counts: dict[str, int]
) -> Optional[Any]:
    """Compact sugar cell: string when possible, else flat {app,class,title~=}."""
    cls = _wm_class(w)
    title = w.get("title")
    title_s = str(title) if title is not None else ""
    stem = _class_to_app_stem(cls) if cls else "app"
    open_app = _open_app_for_window(cls, title_s, stem)
    rid = _alloc_role_id(_role_id_base(cls, title_s, stem), used_ids)
    # Keep used_ids consistent even when we omit id from sugar.
    _ = rid

    title_sub = _title_match_fragment(cls, title_s, class_counts)
    if not title_sub and not cls and title_s:
        title_sub = _short_title_frag(title_s)

    # No title need → bare string (stem matches reverse-DNS class).
    if not title_sub:
        return open_app if open_app else stem

    # Chrome / titled: flat object (no nested match/open, no id).
    cell: dict[str, Any] = {"app": open_app}
    if cls:
        # Prefer short class when reverse-DNS stem equals open stem.
        short = cls.rsplit(".", 1)[-1] if "." in cls else cls
        cell["class"] = short if short.casefold() == stem.casefold() else cls
    if title_sub:
        cell["title~="] = title_sub
    return cell


def _open_app_for_window(cls: str, title: str, stem: str) -> str:
    """Best-effort desktop/app name for open (PWA titles → desktop id)."""
    if _is_chrome_like(cls):
        frag = _short_title_frag(title) if title else ""
        pwa = {
            "YouTube": "YouTube",
            "Gmail": "Gmail",
            "Grok": "Grok",
            "Voice": "Google Voice",
            "Calendar": "Google Calendar",
            "Drive": "Google Drive",
            "Docs": "Google Docs",
            "Sheets": "Google Sheets",
            "Slides": "Google Slides",
            "Meet": "Google Meet",
            "Maps": "Google Maps",
            "Chat": "Google Chat",
            "Google Chrome": "google-chrome",
        }
        if frag in pwa:
            return pwa[frag]
        if frag and frag not in ("Google", "Chrome"):
            return frag
        return "google-chrome"
    return stem


def _role_id_base(cls: str, title: str, app: str) -> str:
    if _is_chrome_like(cls):
        if "Google Chrome" in title and not _title_has_other_known(
            title, "Google Chrome"
        ):
            return "google-chrome"
        frag = _short_title_frag(title)
        if frag and frag.lower() not in ("google", "chrome"):
            return _stem_to_id(frag).lower()
    # Prefer class stem (ghostty, nautilus) over title casing
    return _stem_to_id(app).lower()


def _title_has_other_known(title: str, exclude: str) -> bool:
    for frag in _KNOWN_TITLE_FRAGS:
        if frag == exclude:
            continue
        if frag in title:
            return True
    return False


def _title_match_fragment(
    cls: str, title: str, class_counts: dict[str, int]
) -> Optional[str]:
    if not title:
        return None
    chrome = _is_chrome_like(cls)
    if chrome and "Google Chrome" in title:
        # Product main window — stable matcher for typical browser profiles
        if not _title_has_other_known(title, "Google Chrome"):
            return "Google Chrome"
    # Known product frags only (avoid volatile terminal titles for multi ghostty).
    known = _short_title_frag(title)
    stem = _class_to_app_stem(cls) if cls else ""
    if known in _KNOWN_TITLE_FRAGS:
        # Skip redundant "Ghostty" title on a ghostty window — bare class sugar.
        if known.casefold() == stem.casefold():
            return None
        return known
    # Chrome multi still needs some title~= when unknown product name.
    if chrome:
        return known if known else None
    return None


def _short_title_frag(title: str) -> str:
    for frag in _KNOWN_TITLE_FRAGS:
        if frag in title:
            return frag
    token = title.strip().split()[0] if title.strip() else ""
    token = re.sub(r"[^A-Za-z0-9_-]+", "", token)
    if token:
        return token
    return title.strip()[:24] or "window"


def _is_chrome_like(cls: str) -> bool:
    if not cls:
        return False
    return bool(_CHROME_CLASS_RE.search(cls))


def _class_to_app_stem(cls: str) -> str:
    s = (cls or "").strip()
    if not s:
        return "app"
    if "." in s:
        s = s.rsplit(".", 1)[-1]
    s = re.sub(r"([a-z])([A-Z])", r"\1-\2", s)
    s = re.sub(r"[^A-Za-z0-9_-]+", "-", s).strip("-_").lower()
    return s or "app"


def _wm_class(w: dict[str, Any]) -> str:
    return str(w.get("wmClass") or w.get("wm_class") or "").strip()


def _is_float_window(n: dict[str, Any]) -> bool:
    ntype = n.get("nodeType") or n.get("type")
    if ntype != "WINDOW":
        return False
    mode = str(n.get("mode") or "").upper()
    return mode == "FLOAT"


def _window_leaves(node: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []

    def walk(n: Any) -> None:
        if not isinstance(n, dict):
            return
        ntype = n.get("nodeType") or n.get("type")
        if ntype == "WINDOW":
            out.append(n)
            return
        kids = n.get("children") or n.get("childNodes") or []
        if isinstance(kids, list):
            for c in kids:
                walk(c)

    walk(node)
    return out


def _all_windows(forest: dict[str, Any]) -> list[dict[str, Any]]:
    mons = forest.get("monitors")
    if isinstance(mons, list):
        out: list[dict[str, Any]] = []
        for m in _order_monitors(mons):
            out.extend(_window_leaves(m))
        return out
    return _window_leaves(forest)
