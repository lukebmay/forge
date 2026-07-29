#!/usr/bin/env python3
"""Pure layout save: GetTree forest → bare-array / tiles sugar sketch."""

from __future__ import annotations

import re
import sys
from typing import Any, Callable, Optional, TextIO

from layout_plan import (
    SUGAR_HSPLIT,
    SUGAR_STACK,
    SUGAR_TAB,
    SUGAR_VSPLIT,
    _alloc_role_id,
    _infer_open_and_match,
    _order_monitors,
    _parse_mon_id,
    _stem_to_id,
    format_layout_description,
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
    Snapshot a GetTree forest into internal tiles mon-map sugar.

    Call profile_for_output() for bare-array JSON write form.
    Validates via normalize_profile + validate_reconcile_profile.
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
        mon_layout = str(mon.get("layout") or "").upper()
        # Whole-mon tab/stack → one pane (not N mon children).
        if mon_layout in ("TABBED", "STACKED"):
            pane, n = _capture_pane(mon, used_ids, class_counts)
            if pane is not None:
                panes.append(pane)
                win_n += n
        else:
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

    focus_token = _focus_token_from_forest(forest, mons)
    if focus_token is not None:
        out["focus"] = focus_token

    validate_reconcile_profile(out)
    out["_stats"] = {
        "mons": mon_window_counts,
        "windows": sum(mon_window_counts.values()),
        "floating": len(floating),
    }
    return out


def profile_for_output(
    profile: dict[str, Any], *, monitors: bool = False
) -> Any:
    """
    Drop internal keys and emit simplest sugar for JSON print/write.

    Default: bare top-level array (implicit mons via live mon_count on load).
    monitors=True: explicit mon0/mon1/… keys (no fold on mon mismatch).

    Medium container keys on write: tab, stack, hsplit, vsplit.
    Pure-auto description omitted (list/show recompute).
    """
    out = {
        k: v
        for k, v in profile.items()
        if not k.startswith("_") and k not in ("monExplicit",)
    }
    tiles = out.get("tiles")
    if isinstance(tiles, dict):
        out["tiles"] = _compact_tiles_tree(tiles)
    elif isinstance(tiles, list):
        out["tiles"] = _compact_pane_list(tiles)

    floating = out.get("floating")
    if not (isinstance(floating, list) and floating):
        out.pop("floating", None)
        floating = None

    # Extra top-level keys force object form (roles/layout/alias monitors/…).
    sugar_keys = {"description", "tiles", "floating", "focus"}
    extra = [k for k in out if k not in sugar_keys]
    if extra:
        return out

    tiles_out = out.get("tiles")
    if not isinstance(tiles_out, dict):
        return out

    desc = out.get("description")
    desc_s = desc.strip() if isinstance(desc, str) and desc.strip() else None
    focus_out = _focus_for_output(out.get("focus"))

    def _attach_focus_float(result: Any) -> Any:
        """Wrap bare list when focus/floating need object form; never re-add auto desc."""
        if focus_out is None and not floating:
            return result
        if isinstance(result, list):
            body: dict[str, Any] = {"tiles": result}
        elif isinstance(result, dict):
            body = dict(result)
        else:
            return result
        if focus_out is not None:
            body["focus"] = focus_out
        if floating:
            body["floating"] = floating
        return body

    # Build sugar for description compare
    if monitors:
        mon_map = _tiles_to_mon_key_map(tiles_out)
        if mon_map is None:
            return out
        auto = format_layout_description({"tiles": mon_map}).strip()
        if desc_s is None or (auto and desc_s == auto):
            result_m: dict[str, Any] = dict(mon_map)
            return _attach_focus_float(result_m)
        result_m = {"description": desc_s, **mon_map}
        return _attach_focus_float(result_m)

    bare = _tiles_to_bare_array(tiles_out)
    if bare is None:
        # Non-consecutive mon keys → keep mon map object under tiles
        mon_map = _tiles_to_mon_key_map(tiles_out)
        if mon_map is not None:
            wrapped: dict[str, Any] = {"tiles": mon_map}
            if desc_s:
                wrapped["description"] = desc_s
            return _attach_focus_float(wrapped)
        return out

    auto = format_layout_description(bare).strip()
    if desc_s is None or (auto and desc_s == auto):
        return _attach_focus_float(bare)

    wrapped = {"description": desc_s, "tiles": bare}
    return _attach_focus_float(wrapped)


def _tiles_to_bare_array(tiles: Any) -> Optional[list[Any]]:
    """mon0..monN-1 consecutive map → mon bodies list; single mon → panes list."""
    if isinstance(tiles, list):
        return tiles
    if not isinstance(tiles, dict) or not tiles:
        return None
    n = len(tiles)
    expected = [f"mon{i}" for i in range(n)]
    if set(tiles.keys()) != set(expected):
        return None
    bodies = [tiles[f"mon{i}"] for i in range(n)]
    if n == 1:
        body = bodies[0]
        return body if isinstance(body, list) else [body]
    return bodies


def _tiles_to_mon_key_map(tiles: Any) -> Optional[dict[str, Any]]:
    """Compact mon map for --monitors save (mon0, mon1, …)."""
    if not isinstance(tiles, dict) or not tiles:
        return None
    out: dict[str, Any] = {}
    for k, v in tiles.items():
        if not isinstance(k, str):
            continue
        out[k] = v if not isinstance(v, list) else _compact_pane_list(v)
    return out if out else None


def _compact_tiles_tree(tiles: dict[str, Any]) -> dict[str, Any]:
    return {k: _compact_pane_node(v) for k, v in tiles.items()}


def _compact_pane_list(items: list[Any]) -> list[Any]:
    return [_compact_pane_node(x) for x in items]


def _compact_pane_node(node: Any) -> Any:
    if isinstance(node, list):
        # Keep lists as lists (mon body / nested panes = hsplit default).
        # Tab groups are already { "tab": [...] } from capture.
        return _compact_pane_list(node)
    if isinstance(node, dict):
        # Already tagged medium/short/long container
        for raw_key, medium in (
            ("tab", SUGAR_TAB),
            ("t", SUGAR_TAB),
            ("tabbed", SUGAR_TAB),
            ("stack", SUGAR_STACK),
            ("s", SUGAR_STACK),
            ("stacked", SUGAR_STACK),
            ("hsplit", SUGAR_HSPLIT),
            ("h", SUGAR_HSPLIT),
            ("horizontal", SUGAR_HSPLIT),
            ("vsplit", SUGAR_VSPLIT),
            ("v", SUGAR_VSPLIT),
            ("vertical", SUGAR_VSPLIT),
        ):
            if raw_key in node and isinstance(node[raw_key], list):
                content = _compact_pane_list(node[raw_key])
                out_tag: dict[str, Any] = {medium: content}
                if node.get("id") is not None:
                    out_tag["id"] = node["id"]
                active_out = _active_for_output(node.get("active"))
                if active_out is not None:
                    out_tag["active"] = active_out
                return out_tag
        # { layout|split: mode, content: [...] }
        mode_raw = node.get("layout")
        if mode_raw is None:
            mode_raw = node.get("split")
        if mode_raw is not None and (
            "content" in node or "children" in node
        ):
            mode_s = str(mode_raw).strip().lower()
            content = node.get("content")
            if content is None:
                content = node.get("children")
            if isinstance(content, list):
                content_c = _compact_pane_list(content)
                if mode_s in ("tabbed", "tab", "t"):
                    return {SUGAR_TAB: content_c}
                if mode_s in ("stacked", "stack", "s"):
                    return {SUGAR_STACK: content_c}
                if mode_s in ("hsplit", "h", "horizontal"):
                    return {SUGAR_HSPLIT: content_c}
                if mode_s in ("vsplit", "v", "vertical"):
                    return {SUGAR_VSPLIT: content_c}
        if "content" in node or "children" in node or (
            "split" in node and node.get("app") is None and node.get("open") is None
        ):
            out = dict(node)
            if isinstance(out.get("content"), list):
                out["content"] = _compact_pane_list(out["content"])
            if isinstance(out.get("children"), list):
                out["children"] = _compact_pane_list(out["children"])
            return out
        return _maybe_string_cell(node)
    return node


def _is_compact_role_cell(x: Any) -> bool:
    if isinstance(x, str):
        return True
    if not isinstance(x, dict):
        return False
    # Role-ish object, not a container
    if any(
        k in x
        for k in (
            "tab",
            "t",
            "tabbed",
            "stack",
            "s",
            "stacked",
            "hsplit",
            "h",
            "vsplit",
            "v",
            "content",
            "children",
            "split",
            "layout",
        )
    ):
        return False
    return True


def _maybe_string_cell(cell: dict[str, Any]) -> Any:
    """Promote flat role object to string when open+match re-infer identically."""
    allowed = {
        "app",
        "class",
        "title~=",
        "title",
        "open",
        "id",
        "wmClass",
        "wm_class",
        "match",
    }
    if any(k not in allowed for k in cell):
        return cell

    app = _cell_app_token(cell)
    if not app:
        return cell

    open_i, match_i = _infer_open_and_match(app)
    cell_match = _cell_match_dict(cell)
    if cell_match is None:
        return cell
    if cell_match and not _match_re_inferable(cell_match, match_i):
        return cell

    if not _open_re_inferable(cell, open_i, app):
        return cell

    # Explicit id that would not be the natural stem keeps object form.
    rid = cell.get("id")
    if rid is not None and str(rid).strip():
        natural = _stem_to_id(app)
        if str(rid).strip() != natural:
            return cell

    return app


def _cell_app_token(cell: dict[str, Any]) -> Optional[str]:
    if cell.get("app") is not None and str(cell.get("app")).strip():
        return str(cell["app"]).strip()
    open_spec = cell.get("open")
    if isinstance(open_spec, str) and open_spec.strip():
        return open_spec.strip()
    if isinstance(open_spec, dict):
        for k in ("app", "desktop", "command"):
            if open_spec.get(k) is not None and str(open_spec.get(k)).strip():
                return str(open_spec[k]).strip()
    return None


def _cell_match_dict(cell: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Effective match fields, or None if nested match is not a dict we can check."""
    match = cell.get("match")
    if match is not None:
        if isinstance(match, str) and match.strip():
            return {"class": match.strip()}
        if isinstance(match, dict):
            return dict(match)
        return None
    flat: dict[str, Any] = {}
    if cell.get("class") is not None:
        flat["class"] = cell.get("class")
    if cell.get("title~=") is not None:
        flat["title~="] = cell.get("title~=")
    elif cell.get("title") is not None:
        flat["title"] = cell.get("title")
    return flat


def _match_re_inferable(cell_match: dict[str, Any], inferred: dict[str, Any]) -> bool:
    """True when cell match is the same constraint set as string inference."""
    # Normalize title keys
    c = dict(cell_match)
    if "title" in c and "title~=" not in c:
        c["title~="] = c.pop("title")
    i = dict(inferred)
    if "title" in i and "title~=" not in i:
        i["title~="] = i.pop("title")

    c_class = c.get("class")
    i_class = i.get("class")
    if c_class is not None or i_class is not None:
        if not _class_token_equiv(c_class, i_class):
            return False
    c_title = c.get("title~=")
    i_title = i.get("title~=")
    if (c_title is None) != (i_title is None):
        return False
    if c_title is not None and str(c_title) != str(i_title):
        return False
    # Reject unknown match keys that inference does not produce.
    for k in c:
        if k not in ("class", "title~=", "title"):
            return False
    return True


def _class_token_equiv(a: Any, b: Any) -> bool:
    if a is None or b is None:
        return a is None and b is None
    sa, sb = str(a).strip(), str(b).strip()
    if sa.casefold() == sb.casefold():
        return True
    # reverse-DNS stem vs short class
    stem_a = sa.rsplit(".", 1)[-1]
    stem_b = sb.rsplit(".", 1)[-1]
    return stem_a.casefold() == stem_b.casefold()


def _open_re_inferable(cell: dict[str, Any], open_i: dict[str, Any], app: str) -> bool:
    open_spec = cell.get("open")
    if open_spec is None:
        return True
    if isinstance(open_spec, str):
        return open_spec.strip() == app
    if not isinstance(open_spec, dict):
        return False
    # Extra open fields (timeout, argv, …) need object form.
    allowed_open = {"app", "desktop", "command", "wmClass", "wm_class"}
    if any(k not in allowed_open for k in open_spec):
        return False
    for k in ("app", "desktop", "command"):
        if open_spec.get(k) is not None and str(open_spec.get(k)).strip():
            if str(open_spec[k]).strip() != app:
                return False
            break
    for wk in ("wmClass", "wm_class"):
        if open_spec.get(wk) is None:
            continue
        inf = open_i.get("wmClass") or open_i.get("wm_class")
        if inf is None or not _class_token_equiv(open_spec.get(wk), inf):
            return False
    return True


def is_interactive_tty(
    stdin: Optional[TextIO] = None,
    stdout: Optional[TextIO] = None,
) -> bool:
    """True when both stdin and stdout are TTYs (scripting.md)."""
    inn = stdin if stdin is not None else sys.stdin
    out = stdout if stdout is not None else sys.stdout
    try:
        return bool(inn.isatty() and out.isatty())
    except Exception:
        return False


def read_existing_description(path: Any) -> Optional[str]:
    """Stored description from an existing profile file, or None."""
    from pathlib import Path
    import json

    p = Path(path)
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return None
    if not isinstance(data, dict):
        return None
    desc = data.get("description")
    if isinstance(desc, str) and desc.strip():
        return desc.strip()
    return None


def edit_line_prefilled(
    prompt: str,
    prefill: str = "",
    *,
    input_fn: Optional[Callable[[str], str]] = None,
) -> str:
    """
    Single-line edit with optional buffer prefill (readline when available).

    Prefill is value-only — never include the label word "Description" in prefill.
    Do not call readline.redisplay() in the startup hook (duplicates the line).
    """
    if input_fn is not None:
        # Tests: call with (prompt) only; prefill handled by caller mock if needed.
        return input_fn(prompt)

    prefill = prefill if prefill is not None else ""
    try:
        import readline

        def _hook() -> None:
            # insert_text only — redisplay() here double-draws prompt+buffer
            readline.insert_text(prefill)

        readline.set_startup_hook(_hook)
        try:
            return input(prompt)
        finally:
            readline.set_startup_hook()
    except Exception:
        # No readline: show default; empty Enter keeps prefill.
        shown = f"{prompt}[{prefill}] " if prefill else prompt
        raw = input(shown)
        if raw == "" and prefill:
            return prefill
        return raw


def _save_label(text: str, *, stream: Optional[TextIO] = None) -> str:
    """Magenta label for layout-save prompts (ansi-colors headings/labels)."""
    try:
        from cli_ansi import magenta

        return magenta(text, stream=stream)
    except Exception:
        return text


def resolve_save_description(
    *,
    auto: str,
    existing: Optional[str] = None,
    description_flag: Optional[str] = None,
    no_description: bool = False,
    interactive: bool = False,
    profile_name: str = "",
    input_fn: Optional[Callable[[str], str]] = None,
    edit_line_fn: Optional[Callable[[str, str], str]] = None,
    print_fn: Optional[Callable[..., None]] = None,
) -> Optional[str]:
    """
    Choose description for layout save.

    Non-interactive: keep existing if any; else auto; flags override.
    Interactive:
      Current Description: <existing or auto>
      Keep, Edit (K/e):     # default Keep (Enter)
      Edit → New Description: <prefill of that current value>
    Returns None to omit the description key.
    """
    _ = profile_name  # kept for API stability / future labeling
    if no_description:
        return None
    if description_flag is not None:
        s = str(description_flag)
        return s if s.strip() else None

    auto_s = (auto or "").strip()
    existing_s = existing.strip() if isinstance(existing, str) and existing.strip() else None
    # Prefer stored custom; else auto one-liner (never the word "Description").
    current = existing_s if existing_s is not None else (auto_s or "")

    if not interactive:
        return current or None

    _print = print_fn if print_fn is not None else print
    # Labels on stderr when print_fn is _eprint; color against stderr.
    label_stream = sys.stderr if print_fn is not None else sys.stdout
    # input() draws its prompt on stdout — color against stdout for that path.
    prompt_stream = sys.stdout

    _edit = edit_line_fn
    if _edit is None:

        def _edit(prompt: str, prefill: str) -> str:
            return edit_line_prefilled(prompt, prefill, input_fn=input_fn)

    cur_label = _save_label("Current Description:", stream=label_stream)
    shown = current if current else "(none)"
    _print(f"{cur_label} {shown}")

    choice_prompt = _save_label("Keep, Edit (K/e):", stream=prompt_stream) + " "
    if input_fn is not None:
        raw_choice = input_fn(choice_prompt)
    else:
        raw_choice = input(choice_prompt)
    choice = (raw_choice or "k").strip().lower() or "k"

    if choice.startswith("e"):
        new_prompt = _save_label("New Description:", stream=prompt_stream) + " "
        got = _edit(new_prompt, current)
        got_s = got.strip() if isinstance(got, str) else ""
        return got_s or None

    # Keep (default) — including empty Enter / "k"
    return current or None


def apply_description(profile: dict[str, Any], description: Optional[str]) -> dict[str, Any]:
    """Set or clear description on a capture profile (mutates and returns)."""
    if description is None or not str(description).strip():
        profile.pop("description", None)
    else:
        profile["description"] = str(description).strip()
    return profile


def auto_description_for_profile(profile: dict[str, Any]) -> str:
    """format_layout_description on output-shaped sugar (no _stats)."""
    return format_layout_description(profile_for_output(profile))


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
        cell_wins: list[dict[str, Any]] = []
        for w in wins:
            cell = _role_cell(w, used_ids, class_counts)
            if cell is not None:
                cells.append(cell)
                cell_wins.append(w)
        if not cells:
            return None, 0
        if len(cells) == 1:
            return cells[0], 1
        # Medium sugar keys: tab / stack
        group: dict[str, Any] = (
            {SUGAR_STACK: cells} if layout == "STACKED" else {SUGAR_TAB: cells}
        )
        active = _active_token_for_group(node, cell_wins, cells)
        if active is not None:
            group["active"] = active
        return group, len(cells)

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
        key = SUGAR_HSPLIT if layout == "HSPLIT" else SUGAR_VSPLIT
        return {key: content}, total

    # Generic CON / unknown: unwrap single child or tab-style multi-window
    wins = [w for w in _window_leaves(node) if not _is_float_window(w)]
    if not wins:
        return None, 0
    if len(wins) == 1:
        cell = _role_cell(wins[0], used_ids, class_counts)
        return cell, 1 if cell is not None else 0
    # Multiple windows without TABBED — still emit tab group
    cells = []
    for w in wins:
        cell = _role_cell(w, used_ids, class_counts)
        if cell is not None:
            cells.append(cell)
    if not cells:
        return None, 0
    if len(cells) == 1:
        return cells[0], 1
    return {SUGAR_TAB: cells}, len(cells)


def _focus_for_output(focus: Any) -> Any:
    """Normalize focus for JSON output (string | int | [token, n])."""
    if focus is None or isinstance(focus, bool):
        return None
    if isinstance(focus, int):
        return focus
    if isinstance(focus, list) and len(focus) == 2:
        return focus
    if isinstance(focus, str) and focus.strip():
        return focus.strip()
    return None


def _active_for_output(active: Any) -> Any:
    """Normalize active for JSON output (string | int | [token, n])."""
    if active is None or isinstance(active, bool):
        return None
    if isinstance(active, int):
        return active
    if isinstance(active, list) and len(active) == 2:
        return active
    if isinstance(active, str) and active.strip():
        return active.strip()
    return None


def _token_key(token: Any) -> Optional[str]:
    if token is None:
        return None
    s = str(token).strip()
    return s.casefold() if s else None


def _disambiguate_token(
    token: Optional[str], tokens: list[Optional[str]], index: int
) -> Any:
    """
    Unique token → bare string; colliding token → [token, n] (0-based among matches).
    No token → bare index into tokens.
    """
    if token is None or not str(token).strip():
        return index
    key = _token_key(token)
    matches = [
        i
        for i, t in enumerate(tokens)
        if _token_key(t) is not None and _token_key(t) == key
    ]
    if len(matches) <= 1:
        return token
    n = matches.index(index) if index in matches else 0
    return [token, n]


def _focus_token_from_forest(
    forest: dict[str, Any], mons: list[dict[str, Any]]
) -> Any:
    """Map forest.focusWindowId → sugar token / [token, n] when captured."""
    fid = forest.get("focusWindowId")
    if fid is None or fid == "":
        return None
    entries: list[tuple[str, Optional[str]]] = []
    for mon in mons:
        for w in _window_leaves(mon):
            if w.get("windowId") is None:
                continue
            entries.append((str(w.get("windowId")), _window_sugar_token(w)))
    for i, (wid, tok) in enumerate(entries):
        if wid != str(fid):
            continue
        tokens = [t for _, t in entries]
        return _disambiguate_token(tok, tokens, i)
    return None


def _active_token_for_group(
    node: dict[str, Any],
    wins: list[dict[str, Any]],
    cells: list[Any],
) -> Any:
    """Which tab/stack member is open (lastTabFocusId), as sugar token / index."""
    tf = node.get("lastTabFocusId")
    if tf is None or tf == "":
        return None
    focus_idx: Optional[int] = None
    for i, w in enumerate(wins):
        if w.get("windowId") is None:
            continue
        if str(w.get("windowId")) == str(tf):
            focus_idx = i
            break
    if focus_idx is None:
        return None
    tokens = [
        _cell_sugar_token(cell, w) for w, cell in zip(wins, cells)
    ]
    token = tokens[focus_idx] if focus_idx < len(tokens) else None
    return _disambiguate_token(token, tokens, focus_idx)


def _window_sugar_token(w: dict[str, Any]) -> Optional[str]:
    """Best single-string token for focus/active (app stem / PWA title)."""
    cls = _wm_class(w)
    title = w.get("title")
    title_s = str(title) if title is not None else ""
    stem = _class_to_app_stem(cls) if cls else "app"
    open_app = _open_app_for_window(cls, title_s, stem)
    return open_app if open_app else stem


def _cell_sugar_token(cell: Any, w: dict[str, Any]) -> Optional[str]:
    if isinstance(cell, str) and cell.strip():
        return cell.strip()
    if isinstance(cell, dict):
        app = _cell_app_token(cell)
        if app:
            return app
        rid = cell.get("id")
        if rid is not None and str(rid).strip():
            return str(rid).strip()
    return _window_sugar_token(w)


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
