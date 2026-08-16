#!/usr/bin/env python3
"""Pure layout reconcile planner (WR1). No DBus / subprocess / network."""

from __future__ import annotations

import copy
import math
import re
from typing import Any, Iterable, Optional

PROFILE_VERSION = 2
MODE_RECONCILE = "reconcile"
# Optional keys allowed on tagged sugar {hsplit|vsplit|tab|…: content, …}.
_TAG_OPTIONAL_KEYS = frozenset({"id", "active", "share", "ratio"})

# monN / primary slots (post-resolve). Pre-resolve also allows stableKey / alias heads.
_SLOT_RE = re.compile(r"^(mon\d+|primary)(?:\.(.+))?$")
_MON_KEY_RE = re.compile(r"^mon(\d+)$")
_MON_ID_RE = re.compile(r"^mo(\d+)ws(\d+)$")
_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
# Geometry roles (physical side) — resolve via live forest rect / geom stableKey.
_GEOM_ROLE_KEYS = frozenset({"left", "right", "top", "bottom"})
# T7 stableKey prefixes (see lib/extension/monitor-identity.js)
_STABLE_KEY_RE = re.compile(r"^(?:geom:|conn:|name:).+")
# Container mode aliases (load accepts all; save emits medium keys — see SUGAR_*).
_SPLIT_ALIASES = {
    "h": "hsplit",
    "horizontal": "hsplit",
    "hsplit": "hsplit",
    "v": "vsplit",
    "vertical": "vsplit",
    "vsplit": "vsplit",
    "t": "tabbed",
    "tab": "tabbed",
    "tabbed": "tabbed",
    "s": "stacked",
    "stack": "stacked",
    "stacked": "stacked",
}
# Medium-length keys written by layout save (not short t/h/s, not long tabbed/…).
SUGAR_TAB = "tab"
SUGAR_STACK = "stack"
SUGAR_HSPLIT = "hsplit"
SUGAR_VSPLIT = "vsplit"
# Dict key on a pane object → canonical mode (value is content array).
_CONTAINER_TAG_KEYS = frozenset(_SPLIT_ALIASES.keys())

# String-cell open.app → Chrome class (casefold keys).
_CHROME_LAUNCHERS = frozenset({
    "google-chrome",
    "google-chrome-stable",
    "google-chrome-beta",
    "google-chrome-unstable",
    "chromium",
    "chromium-browser",
    "chrome",
    "brave",
    "brave-browser",
})
_CHROME_CLASS = "Google-chrome"
# Known PWA / product names → title~= fragment (casefold keys).
_KNOWN_PWA_TITLE = {
    "grok": "Grok",
    "youtube": "YouTube",
    "gmail": "Gmail",
    "google voice": "Voice",
    "voice": "Voice",
    "google calendar": "Calendar",
    "calendar": "Calendar",
    "google drive": "Drive",
    "drive": "Drive",
    "google docs": "Docs",
    "docs": "Docs",
    "google sheets": "Sheets",
    "sheets": "Sheets",
    "google slides": "Slides",
    "slides": "Slides",
    "google meet": "Meet",
    "meet": "Meet",
    "google maps": "Maps",
    "maps": "Maps",
    "google chat": "Chat",
    "chat": "Chat",
    "discord": "Discord",
    "slack": "Slack",
    "spotify": "Spotify",
}


def normalize_shares(weights: Any) -> Optional[list[float]]:
    """
    Positive weights → fractions that sum to 1.0 (3 decimal places).

    Accepts unnormalized weights ([2, 1] → [0.667, 0.333]) or fractions.
    Returns None for empty, length < 2, non-numeric, or non-positive values.
    Malformed input is ignored by callers (equal siblings).
    """
    if not isinstance(weights, list) or len(weights) < 2:
        return None
    nums: list[float] = []
    for w in weights:
        try:
            f = float(w)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(f) or f <= 0:
            return None
        nums.append(f)
    total = sum(nums)
    if total <= 0:
        return None
    fracs = [x / total for x in nums]
    rounded = [round(f, 3) for f in fracs]
    head = sum(rounded[:-1])
    last = round(1.0 - head, 3)
    if last <= 0:
        # Degenerate after rounding — keep plain rounded fracs (sum may drift).
        return rounded
    rounded[-1] = last
    return rounded


def _share_weights_from_obj(obj: Any) -> Optional[list[float]]:
    """Read share or ratio from a sugar/IR object; normalize or None."""
    if not isinstance(obj, dict):
        return None
    raw = obj.get("share")
    if raw is None:
        raw = obj.get("ratio")
    return normalize_shares(raw)


def _is_stable_key(key: str) -> bool:
    return bool(key) and bool(_STABLE_KEY_RE.match(key))


def _is_builtin_mon_key(key: str) -> bool:
    return key == "primary" or bool(_MON_KEY_RE.match(key))


def _is_geom_role_key(key: str) -> bool:
    return key in _GEOM_ROLE_KEYS


def mon_head_and_rest(
    slot: str,
    known_heads: Optional[Iterable[str]] = None,
) -> tuple[str, Optional[str]]:
    """Split slot into mon head + optional path rest (monN, primary, stableKey, alias).

    When known_heads is set, use longest-prefix match so dotted stableKeys
    (e.g. name:Dell.U2720Q.path) are not split on the first '.'.
    """
    if not slot:
        return "", None
    m = _SLOT_RE.match(slot)
    if m:
        return m.group(1), m.group(2)

    if known_heads is not None:
        best: Optional[str] = None
        for h in known_heads:
            if not isinstance(h, str) or not h:
                continue
            if slot == h or slot.startswith(h + "."):
                if best is None or len(h) > len(best):
                    best = h
        if best is not None:
            if slot == best:
                return best, None
            rest = slot[len(best) + 1:]
            return best, rest if rest != "" else None
        return slot, None

    if "." in slot:
        head, rest = slot.split(".", 1)
        return head, rest if rest != "" else None
    return slot, None


def _validate_monitors_aliases(raw: Any) -> dict[str, str]:
    """
    Top-level monitors as alias map: { alias: monN|primary|stableKey }.

    monitors as a list of mon bodies is handled in normalize_profile (not here).
    """
    if raw is None:
        return {}
    if isinstance(raw, list):
        # Body list already desugared to tiles; nothing left to alias.
        return {}
    if not isinstance(raw, dict):
        raise ValueError(
            "monitors must be an array of mon bodies or an object "
            "(alias → monN | primary | stableKey)")
    out: dict[str, str] = {}
    for k, v in raw.items():
        if not isinstance(k, str) or not k.strip():
            raise ValueError("monitors keys must be non-empty strings")
        alias = k.strip()
        if not _NAME_RE.match(alias):
            raise ValueError(f"monitors alias {alias!r}: use A-Za-z0-9_-")
        if _is_builtin_mon_key(alias):
            raise ValueError(
                f"monitors alias {alias!r}: reserved (monN / primary)")
        if _is_stable_key(alias):
            raise ValueError(
                f"monitors alias {alias!r}: use a short name, not a stableKey")
        if not isinstance(v, str) or not str(v).strip():
            raise ValueError(
                f"monitors.{alias}: target must be a non-empty string")
        target = str(v).strip()
        if not (_is_builtin_mon_key(target) or _is_stable_key(target)):
            raise ValueError(
                f"monitors.{alias}: target want monN, primary, or stableKey "
                f"(got {target!r})")
        out[alias] = target
    return out


def _mon_key_ok(key: str, aliases: dict[str, str]) -> bool:
    if _is_builtin_mon_key(key) or _is_stable_key(key) or _is_geom_role_key(
            key):
        return True
    return key in aliases


def _mon_key_error(key: str, where: str, aliases: dict[str,
                                                       str]) -> ValueError:
    parts = [
        "monN",
        "primary",
        "left|right|top|bottom",
        "stableKey (geom:|conn:|name:…)",
    ]
    if aliases:
        parts.append("or alias " + ", ".join(sorted(repr(a) for a in aliases)))
    return ValueError(f"{where} {key!r}: want {' / '.join(parts)}")


def _slot_ok(slot: str, aliases: dict[str, str],
             layout_keys: set[str]) -> bool:
    known = set(layout_keys) | set(aliases.keys()) | set(_GEOM_ROLE_KEYS)
    head, _rest = mon_head_and_rest(slot, known_heads=known)
    if not head:
        return False
    if _is_builtin_mon_key(head) or _is_geom_role_key(head):
        return True
    if head in aliases or head in layout_keys:
        return True
    return False


def normalize_profile(
    data: Any,
    *,
    mon_count: Optional[int] = None,
    mon_indices: Optional[list[int]] = None,
) -> dict[str, Any]:
    """
    Desugar tiles sugar → v2 IR and fill omit-noise defaults.

    Accepts:
      - bare top-level array (implicit mons: live mon_count decides)
      - { tiles: array|mon-map }
      - { mon0: …, mon1: … } explicit mon keys (no fold on mon mismatch)
      - { monitors: [ monBody, … ] } explicit mon list (no fold)
      - { monitors: { alias: monN|stableKey } } alias map (with tiles/mon keys)
      - pure roles+layout IR (pass-through + defaults)

    mon_count: physical outputs from GetTree; required for bare dual-mon.
    mon_indices: when planning against a live forest, Meta indices in physical
      L→R order (see forest_mon_indices_left_to_right). Bare dual arrays map
      body[i] → mon{mon_indices[i]} so first mon body is the leftmost head even
      when Meta mon0 is the right display. Explicit monN / monitors[] ignore this.
    Offline (None): bare arrays always desugar as mon0 panes (use mon keys /
    monitors[] for multi-mon without a live forest).
    """
    if isinstance(data, list):
        data = {"tiles": data}
    if not isinstance(data, dict):
        raise ValueError("profile must be a JSON object or array")

    out = copy.deepcopy(data)
    # Preserve focus token before tiles extraction mutates keys.
    focus_raw = out.get("focus")
    tiles, mon_explicit, from_sugar = _extract_tiles_from_profile(
        out, mon_count=mon_count, mon_indices=mon_indices)
    had_sugar = from_sugar

    if tiles is not None:
        if not isinstance(tiles, dict):
            raise ValueError("tiles must resolve to a mon map object")
        roles, layout = _desugar_tiles(tiles)
        out["roles"] = roles
        out["layout"] = layout
        if mon_explicit:
            out["monExplicit"] = True

    has_roles = isinstance(out.get("roles"), list) and len(
        out.get("roles") or []) > 0
    if has_roles or had_sugar:
        out.setdefault("version", PROFILE_VERSION)
        out.setdefault("mode", MODE_RECONCILE)
        if "overflow" not in out:
            out["overflow"] = {"slot": "mon0.overflow", "layout": "tabbed"}
        if "marginal" not in out:
            out["marginal"] = {
                "mode": "coexist",
                "roleOrder": "first",
                "residual": "leave",
            }

    # Top-level focus: string | int | [token, n] → role id when roles exist.
    if _role_ref_present(focus_raw):
        if has_roles:
            rid = _resolve_role_ref(focus_raw, out.get("roles") or [])
            if rid is not None:
                out["focus"] = rid
            elif isinstance(focus_raw, str):
                out["focus"] = focus_raw.strip()
            else:
                out["focus"] = focus_raw
        else:
            out["focus"] = (focus_raw.strip()
                            if isinstance(focus_raw, str) else focus_raw)
    elif "focus" in out:
        out.pop("focus", None)

    return out


def _extract_tiles_from_profile(
    out: dict[str, Any],
    *,
    mon_count: Optional[int],
    mon_indices: Optional[list[int]] = None,
) -> tuple[Optional[dict[str, Any]], bool, bool]:
    """
    Pull tiles sugar out of profile dict (mutates out: pops consumed keys).

    Returns (tiles_mon_map|None, mon_explicit, had_sugar).
    """
    # 1) Explicit monitors: [ monBody, … ] — Meta index order (not geometry L→R)
    monitors_raw = out.get("monitors")
    if isinstance(monitors_raw, list):
        out.pop("monitors", None)
        if "tiles" in out:
            raise ValueError("profile: use monitors[] or tiles, not both")
        tiles = {f"mon{i}": body for i, body in enumerate(monitors_raw)}
        return tiles, True, True

    # 2) Top-level monN / primary / stableKey / geom-role bodies (no tiles wrapper)
    top_mon_keys = [
        k for k in list(out.keys()) if isinstance(k, str) and (
            _is_builtin_mon_key(k.strip()) or _is_stable_key(k.strip())
            or _is_geom_role_key(k.strip())) and k not in (
                "version",
                "mode",
                "roles",
                "layout",
                "overflow",
                "marginal",
                "floating",
                "description",
                "tiles",
                "monitors",
                "monExplicit",
                "displays",
                "settings",
                "focus",
            )
    ]
    # monN keys only when value looks like mon body (list or split object), not strings
    top_mon_keys = [
        k for k in top_mon_keys
        if (_is_builtin_mon_key(str(k).strip()) or _is_stable_key(
            str(k).strip()) or _is_geom_role_key(str(k).strip()))
    ]
    if top_mon_keys and "tiles" not in out and "roles" not in out:
        tiles = {}
        for k in top_mon_keys:
            tiles[str(k).strip()] = out.pop(k)
        return tiles, True, True

    # 3) tiles: array (implicit L→R) or mon map (explicit if mon keys)
    if "tiles" not in out:
        return None, False, False

    tiles_in = out.pop("tiles")
    if isinstance(tiles_in, list):
        return (
            _bare_array_to_mon_tiles(tiles_in,
                                     mon_count=mon_count,
                                     mon_indices=mon_indices),
            False,
            True,
        )
    if isinstance(tiles_in, dict):
        # mon map under tiles is explicit binding
        return tiles_in, True, True
    raise ValueError("tiles must be an object or array")


def format_layout_description(profile: Any) -> str:
    """
    Auto one-liner from profile sugar or IR (roles+layout).

    Example:
      mon0 (hsplit): tabgroup, ghostty. mon1 (hsplit): ghostty, tabgroup.
    """
    try:
        data = normalize_profile(profile)
    except (ValueError, TypeError):
        return ""
    layout = data.get("layout")
    roles_list = data.get("roles") if isinstance(data.get("roles"),
                                                 list) else []
    intentional_empty = isinstance(data.get("roles"),
                                   list) and len(roles_list) == 0
    if not isinstance(layout, dict) or not layout:
        return "empty" if intentional_empty else ""

    roles_by_id: dict[str, dict[str, Any]] = {}
    for r in roles_list:
        if isinstance(r, dict) and r.get("id") is not None:
            roles_by_id[str(r["id"])] = r

    parts: list[str] = []
    for mon_key in sorted(layout.keys(), key=_layout_mon_sort_key):
        mon_body = layout[mon_key]
        if not isinstance(mon_body, dict):
            continue
        children = mon_body.get("children")
        if not isinstance(children, list) or not children:
            continue
        tokens = [
            t for c in children if (t := _format_desc_child(c, roles_by_id))
        ]
        if not tokens:
            continue
        split = mon_body.get("split")
        if split is None and len(children) >= 2:
            split = "hsplit"
        if split is not None:
            split_s = str(split).strip().lower()
            parts.append(f"{mon_key} ({split_s}): {', '.join(tokens)}")
        else:
            parts.append(f"{mon_key}: {', '.join(tokens)}")
    if not parts:
        return "empty" if intentional_empty else ""
    return ". ".join(parts) + "."


def _layout_mon_sort_key(key: str) -> tuple:
    m = _MON_KEY_RE.match(str(key))
    if m:
        return (0, int(m.group(1)), "")
    if key == "primary":
        return (1, 0, "")
    return (2, 0, str(key))


def _format_desc_child(child: Any, roles_by_id: dict[str, dict[str,
                                                               Any]]) -> str:
    if not isinstance(child, dict):
        return ""
    nested = child.get("children")
    if isinstance(nested, list) and nested:
        kids = [t for c in nested if (t := _format_desc_child(c, roles_by_id))]
        if not kids:
            return ""
        split = child.get("split")
        if split is None and len(kids) >= 2:
            split = "hsplit"
        if split is not None:
            return f"{str(split).strip().lower()}({', '.join(kids)})"
        return ", ".join(kids)

    roles = child.get("roles")
    if isinstance(roles, list) and len(roles) >= 2:
        return "tabgroup"
    if isinstance(roles, list) and len(roles) == 1:
        return _role_desc_token(roles[0], roles_by_id)
    rid = child.get("id")
    if rid is not None:
        return _role_desc_token(rid, roles_by_id)
    return ""


def _role_desc_token(rid: Any, roles_by_id: dict[str, dict[str, Any]]) -> str:
    key = str(rid)
    r = roles_by_id.get(key)
    if not r:
        return key
    open_spec = r.get("open")
    if isinstance(open_spec, dict):
        app = open_spec.get("app") or open_spec.get(
            "desktop") or open_spec.get("command")
        if app is not None and str(app).strip():
            return str(app).strip()
    elif isinstance(open_spec, str) and open_spec.strip():
        return open_spec.strip()
    app = r.get("app")
    if app is not None and str(app).strip():
        return str(app).strip()
    return key


def _looks_like_mon_body(item: Any) -> bool:
    """List or container object — not a bare string / flat role object."""
    if isinstance(item, list):
        return True
    if not isinstance(item, dict):
        return False
    if item.get("open") is not None or item.get(
            "match") is not None or item.get("app") is not None:
        return False
    if _tagged_container_mode(item) is not None:
        return True
    return "split" in item or "layout" in item or "content" in item or "children" in item


def _tagged_container_mode(item: dict[str, Any]) -> Optional[str]:
    """
    { tab|stack|hsplit|vsplit|t|h|…: content } → canonical mode, else None.

    Optional: id, active (tab/stack), share|ratio (hsplit/vsplit weights).
    Ignores role objects (open/match/app) and multi-key IR-ish nodes.
    """
    if not isinstance(item, dict):
        return None
    if item.get("open") is not None or item.get(
            "match") is not None or item.get("app") is not None:
        return None
    tags = [
        k for k in item.keys() if str(k).strip().lower() in _CONTAINER_TAG_KEYS
    ]
    # Allow id / active / share|ratio alongside the tag
    other = [
        k for k in item.keys()
        if str(k).strip().lower() not in _CONTAINER_TAG_KEYS
        and str(k).strip().lower() not in _TAG_OPTIONAL_KEYS
    ]
    if len(tags) != 1 or other:
        return None
    mode = _SPLIT_ALIASES.get(str(tags[0]).strip().lower())
    content = item.get(tags[0])
    if not isinstance(content, list):
        return None
    return mode


def _mon_body_as_pane_list(body: Any) -> list[Any]:
    """Normalize a mon body value to a list of panes (for fold onto mon0)."""
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        if "content" in body and isinstance(body["content"], list):
            return body["content"]
        if "children" in body and isinstance(body["children"], list):
            return body["children"]
        tag = _tagged_container_mode(body)
        if tag is not None:
            for k, v in body.items():
                if str(k).strip().lower(
                ) in _CONTAINER_TAG_KEYS and isinstance(v, list):
                    # Whole mon is one tagged container → single pane
                    return [body]
        return [body]
    return [body]


def _bare_array_to_mon_tiles(
    items: list[Any],
    *,
    mon_count: Optional[int] = None,
    mon_indices: Optional[list[int]] = None,
) -> dict[str, Any]:
    """
    Implicit bare array → mon map (physical L→R when mon_indices given).

    Live mon_count == len(items) and each item is mon-body-shaped → one mon each.
    With mon_indices (geometry L→R Meta indices from the live forest), body[i]
    binds to mon{mon_indices[i]} so the first list is always the leftmost head.
    Without mon_indices → mon0..monN-1 (Meta index order; offline / show).
    mon_count <= 1 with multiple mon-body-looking items → fold all panes onto mon0
    (temporary second head gone). Offline (mon_count None) → always mon0 panes
    (multi-mon offline needs mon0/mon1 or monitors[]).
    """
    if mon_count is not None:
        try:
            n = int(mon_count)
        except (TypeError, ValueError):
            n = 0
        if n <= 1:
            if len(items) >= 2 and all(_looks_like_mon_body(x) for x in items):
                # Dual bare on 1-output desk: fold mon bodies into mon0 panes
                panes: list[Any] = []
                for body in items:
                    panes.extend(_mon_body_as_pane_list(body))
                return {"mon0": panes}
            return {"mon0": items}
        if (n >= 2 and len(items) == n
                and all(_looks_like_mon_body(x) for x in items)):
            idxs = _normalize_mon_indices(mon_indices, n)
            if idxs is not None:
                return {f"mon{idxs[i]}": body for i, body in enumerate(items)}
            return {f"mon{i}": body for i, body in enumerate(items)}
        # mon count known but not a dual bare match → single-mon pane list
        return {"mon0": items}

    # Offline: dual mon only when every top-level item is a list (mon body =
    # pane list). Tagged panes like {tab:…}/{vsplit:…} stay mon0 (green).
    # Explicit mon0/mon1 or monitors[] when offline dual must be unambiguous.
    if len(items) >= 2 and all(isinstance(x, list) for x in items):
        n = len(items)
        idxs = _normalize_mon_indices(mon_indices, n)
        if idxs is not None:
            return {f"mon{idxs[i]}": body for i, body in enumerate(items)}
        return {f"mon{i}": body for i, body in enumerate(items)}
    return {"mon0": items}


def _normalize_mon_indices(mon_indices: Optional[list[int]],
                           n: int) -> Optional[list[int]]:
    """Return n distinct non-neg Meta indices, or None when unusable."""
    if not mon_indices or n <= 0:
        return None
    try:
        idxs = [int(x) for x in mon_indices[:n]]
    except (TypeError, ValueError):
        return None
    if len(idxs) != n or any(i < 0 for i in idxs):
        return None
    if len(set(idxs)) != n:
        return None
    return idxs


def forest_physical_mon_count(forest: Any) -> int:
    """Unique physical mon indices in a GetTree forest (workspaces share monN)."""
    idxs: set[int] = set()
    for m in _iter_forest_monitors(forest):
        if not isinstance(m, dict):
            continue
        idx = _monitor_node_index(m)
        if idx is not None:
            idxs.add(idx)
    return max(1, len(idxs))


def forest_mon_indices_left_to_right(forest: Any) -> list[int]:
    """
    Unique Meta mon indices sorted physical left→right (then top→bottom).

    Uses MONITOR rect or geom: stableKey; falls back to Meta index as x when
    geometry is missing so order stays deterministic.
    """
    best: dict[int, tuple[float, float]] = {}
    for m in _iter_forest_monitors(forest):
        if not isinstance(m, dict):
            continue
        idx = _monitor_node_index(m)
        if idx is None:
            continue
        rect = _mon_node_rect(m)
        if rect:
            x, y = float(rect["x"]), float(rect["y"])
        else:
            x, y = float(idx) * 1_000_000.0, 0.0
        prev = best.get(idx)
        if prev is None or (x, y) < prev:
            best[idx] = (x, y)
    return [
        i for i, _xy in sorted(best.items(),
                               key=lambda kv: (kv[1][0], kv[1][1], kv[0]))
    ]


def forest_profile_mon_kwargs(forest: Any) -> dict[str, Any]:
    """mon_count + mon_indices for normalize/validate against a live forest."""
    idxs = forest_mon_indices_left_to_right(forest)
    if not idxs:
        return {"mon_count": 1, "mon_indices": [0]}
    return {"mon_count": len(idxs), "mon_indices": idxs}


def _desugar_tiles(
        tiles: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """tiles mon map → (roles[], layout{})."""
    roles: list[dict[str, Any]] = []
    layout: dict[str, Any] = {}
    used_ids: set[str] = set()

    for mon_key, mon_body in tiles.items():
        if not isinstance(mon_key, str) or not mon_key.strip():
            raise ValueError("tiles keys must be non-empty strings "
                             "(monN, primary, stableKey, or monitors alias)")
        mon_key = mon_key.strip()
        # Full alias check needs top-level monitors map (validate_reconcile_profile).
        if not (_is_builtin_mon_key(mon_key) or _is_stable_key(mon_key)
                or _is_geom_role_key(mon_key) or _NAME_RE.match(mon_key)):
            raise ValueError(
                f"tiles key {mon_key!r}: want monN, primary, left|right, "
                f"stableKey, or alias name")

        split_override: Optional[str] = None
        content: Any
        mon_share_src: Any = None
        if isinstance(mon_body, list):
            content = mon_body
        elif isinstance(mon_body, dict):
            mon_share_src = mon_body
            tag = _tagged_container_mode(mon_body)
            if tag in ("hsplit", "vsplit"):
                split_override = tag
                for k, v in mon_body.items():
                    if str(k).strip().lower() in _CONTAINER_TAG_KEYS:
                        content = v
                        break
            elif tag in ("tabbed", "stacked"):
                # Whole mon is one tab/stack group
                content = [mon_body]
                mon_share_src = None
            else:
                split_override = _normalize_split_alias(
                    mon_body.get("split"), f"tiles.{mon_key}")
                if "content" in mon_body:
                    content = mon_body["content"]
                elif "children" in mon_body:
                    content = mon_body["children"]
                else:
                    raise ValueError(
                        f"tiles.{mon_key}: need content array, bare array, "
                        f"or {{hsplit|vsplit|tab|stack: […]}}")
        else:
            raise ValueError(
                f"tiles.{mon_key}: want array or {{split|hsplit|vsplit|tab, content}}"
            )

        if not isinstance(content, list):
            raise ValueError(f"tiles.{mon_key}.content must be an array")

        s_next = [0]
        children = _desugar_panes(content, mon_key, mon_key, roles, used_ids,
                                  s_next)
        entry: dict[str, Any] = {"children": children}
        split = split_override
        if split is None and len(children) >= 2:
            split = "hsplit"
        if split is not None:
            entry["split"] = split
        shares = _share_weights_from_obj(mon_share_src)
        if shares is not None and len(shares) == len(children) and len(
                children) >= 2:
            entry["share"] = shares
        layout[mon_key] = entry

    return roles, layout


def _desugar_panes(
    items: list[Any],
    mon_key: str,
    path_prefix: str,
    roles: list[dict[str, Any]],
    used_ids: set[str],
    s_next: list[int],
) -> list[dict[str, Any]]:
    """Desugar pane list under mon or nested split → layout children."""
    children: list[dict[str, Any]] = []
    for i, item in enumerate(items):
        where = f"{path_prefix}[{i}]"
        child = _desugar_pane(item, mon_key, path_prefix, where, roles,
                              used_ids, s_next)
        children.append(child)
    return children


def _desugar_pane(
    item: Any,
    mon_key: str,
    path_prefix: str,
    where: str,
    roles: list[dict[str, Any]],
    used_ids: set[str],
    s_next: list[int],
) -> dict[str, Any]:
    # Tagged container: { tab|stack|hsplit|vsplit|t|h|…: content }
    if isinstance(item, dict):
        tag_mode = _tagged_container_mode(item)
        if tag_mode is not None:
            content = None
            for k, v in item.items():
                if str(k).strip().lower() in _CONTAINER_TAG_KEYS:
                    content = v
                    break
            if not isinstance(content, list) or len(content) == 0:
                raise ValueError(
                    f"{where}: {tag_mode} needs a non-empty content array")
            child = _desugar_tagged_container(
                tag_mode,
                content,
                mon_key,
                path_prefix,
                where,
                roles,
                used_ids,
                s_next,
                item.get("id"),
                share_src=item if tag_mode in ("hsplit", "vsplit") else None,
            )
            if tag_mode in ("tabbed", "stacked"):
                _apply_active_to_child(child, item.get("active"), roles)
            return child

    # Multi-role group sugar: {layout|split: tabbed|stacked, content: [roles]}
    if isinstance(item, dict):
        mode_raw = item.get("layout")
        if mode_raw is None:
            mode_raw = item.get("split")
        if mode_raw is not None:
            mode_key = str(mode_raw).strip().lower()
            mode_norm = _SPLIT_ALIASES.get(mode_key, mode_key)
            if mode_norm in ("tabbed", "stacked"):
                content = item.get("content")
                if content is None:
                    content = item.get("children")
                if (isinstance(content, list) and len(content) > 0
                        and all(_is_role_cell(x) for x in content)):
                    child = _desugar_role_pane(
                        content,
                        mon_key,
                        path_prefix,
                        where,
                        roles,
                        used_ids,
                        s_next,
                        mode=mode_norm,
                    )
                    _apply_active_to_child(child, item.get("active"), roles)
                    return child
            if mode_norm in ("hsplit", "vsplit"):
                content = item.get("content")
                if content is None:
                    content = item.get("children")
                if isinstance(content, list):
                    return _desugar_split_node(
                        mode_norm,
                        content,
                        mon_key,
                        path_prefix,
                        where,
                        roles,
                        used_ids,
                        s_next,
                        item.get("id"),
                        share_src=item,
                    )

    # Nested split object { split, content } / { content } default hsplit
    if isinstance(item, dict) and ("split" in item or "content" in item
                                   or "children" in item):
        if "roles" in item and item.get("content") is None and item.get(
                "children") is None:
            if item.get("open") is not None or item.get(
                    "match") is not None or item.get("app") is not None:
                return _desugar_role_pane([item], mon_key, path_prefix, where,
                                          roles, used_ids, s_next)
        split = _normalize_split_alias(item.get("split"), where)
        content = item.get("content")
        if content is None:
            content = item.get("children")
        if not isinstance(content, list):
            raise ValueError(f"{where}: nested split needs content array")
        if split is None:
            split = "hsplit"
        if split in ("tabbed", "stacked"):
            if content and all(_is_role_cell(x) for x in content):
                child = _desugar_role_pane(content,
                                           mon_key,
                                           path_prefix,
                                           where,
                                           roles,
                                           used_ids,
                                           s_next,
                                           mode=split)
                _apply_active_to_child(child, item.get("active"), roles)
                return child
            raise ValueError(
                f"{where}: tabbed/stacked content must be role cells")
        return _desugar_split_node(
            split,
            content,
            mon_key,
            path_prefix,
            where,
            roles,
            used_ids,
            s_next,
            item.get("id"),
            share_src=item,
        )

    # List: tab group of role cells, or nested hsplit if mixed structure
    if isinstance(item, list):
        if len(item) == 0:
            raise ValueError(f"{where}: empty pane")
        if all(_is_role_cell(x) for x in item):
            return _desugar_role_pane(item, mon_key, path_prefix, where, roles,
                                      used_ids, s_next)
        # Nested panes → default hsplit
        return _desugar_split_node(
            "hsplit",
            item,
            mon_key,
            path_prefix,
            where,
            roles,
            used_ids,
            s_next,
            None,
        )

    # Bare string / rich role object → single-role pane
    if _is_role_cell(item):
        return _desugar_role_pane([item], mon_key, path_prefix, where, roles,
                                  used_ids, s_next)

    raise ValueError(f"{where}: want string, role object, array, or "
                     f"{{tab|stack|hsplit|vsplit|split, content}}")


def _desugar_tagged_container(
    mode: str,
    content: list[Any],
    mon_key: str,
    path_prefix: str,
    where: str,
    roles: list[dict[str, Any]],
    used_ids: set[str],
    s_next: list[int],
    cid_raw: Any,
    share_src: Any = None,
) -> dict[str, Any]:
    if mode in ("tabbed", "stacked"):
        if not all(_is_role_cell(x) for x in content):
            raise ValueError(
                f"{where}: {mode} content must be role cells (strings/objects)"
            )
        return _desugar_role_pane(content,
                                  mon_key,
                                  path_prefix,
                                  where,
                                  roles,
                                  used_ids,
                                  s_next,
                                  mode=mode)
    if mode in ("hsplit", "vsplit"):
        return _desugar_split_node(
            mode,
            content,
            mon_key,
            path_prefix,
            where,
            roles,
            used_ids,
            s_next,
            cid_raw,
            share_src=share_src,
        )
    raise ValueError(f"{where}: unsupported container mode {mode!r}")


def _desugar_split_node(
    split: str,
    content: list[Any],
    mon_key: str,
    path_prefix: str,
    where: str,
    roles: list[dict[str, Any]],
    used_ids: set[str],
    s_next: list[int],
    cid_raw: Any,
    share_src: Any = None,
) -> dict[str, Any]:
    cid: str
    if cid_raw is None or str(cid_raw).strip() == "":
        cid = f"s{s_next[0]}"
        s_next[0] += 1
    else:
        cid = str(cid_raw).strip()
        if not _NAME_RE.match(cid):
            raise ValueError(f"{where}.id: invalid {cid!r} (use A-Za-z0-9_-)")
    slot_path = f"{path_prefix}.{cid}"
    kids = _desugar_panes(content, mon_key, slot_path, roles, used_ids, s_next)
    node: dict[str, Any] = {"id": cid, "children": kids}
    if split:
        node["split"] = split
    elif len(kids) >= 2:
        node["split"] = "hsplit"
    shares = _share_weights_from_obj(share_src)
    if shares is not None and len(shares) == len(kids) and len(kids) >= 2:
        node["share"] = shares
    return node


def _is_role_cell(x: Any) -> bool:
    if isinstance(x, str):
        return True
    if not isinstance(x, dict):
        return False
    if _tagged_container_mode(x) is not None:
        return False
    if "content" in x or "children" in x:
        return False
    if "layout" in x and x.get("open") is None and x.get(
            "match") is None and x.get("app") is None:
        return False
    if "split" in x and x.get("open") is None and x.get(
            "match") is None and x.get("app") is None:
        return False
    return True


def _desugar_role_pane(
    cells: list[Any],
    mon_key: str,
    path_prefix: str,
    where: str,
    roles: list[dict[str, Any]],
    used_ids: set[str],
    s_next: list[int],
    mode: str = "tabbed",
) -> dict[str, Any]:
    role_ids: list[str] = []
    for j, cell in enumerate(cells):
        role = _cell_to_role(cell, used_ids,
                             f"{where}[{j}]" if len(cells) > 1 else where)
        role_ids.append(role["id"])
        roles.append(role)

    if len(role_ids) == 1:
        cid = role_ids[0]
        child: dict[str, Any] = {"id": cid, "roles": role_ids}
    else:
        cid = f"s{s_next[0]}"
        s_next[0] += 1
        mode_s = str(mode).strip().lower()
        if mode_s not in ("tabbed", "stacked"):
            mode_s = "tabbed"
        child = {"id": cid, "layout": mode_s, "roles": role_ids}

    full_slot = f"{path_prefix}.{cid}"
    for rid in role_ids:
        for r in roles:
            if r["id"] == rid and "slot" not in r:
                r["slot"] = full_slot
                break
    return child


def _role_ref_present(raw: Any) -> bool:
    """True when active/focus sugar is non-empty (int 0 is valid)."""
    if raw is None or isinstance(raw, bool):
        return False
    if isinstance(raw, int):
        return True
    if isinstance(raw, list):
        return len(raw) > 0
    if isinstance(raw, str):
        return bool(raw.strip())
    return bool(str(raw).strip())


def _role_matches_token(token: str, role: dict[str, Any]) -> bool:
    """Whether one role matches a sugar token (id / open / title / class)."""
    t = str(token).strip()
    if not t:
        return False
    t_cf = t.casefold()
    rid = role.get("id")
    if rid is not None:
        if str(rid) == t or str(rid).casefold() == t_cf:
            return True
    open_spec = role.get("open") if isinstance(role.get("open"), dict) else {}
    for k in ("app", "desktop", "command"):
        v = open_spec.get(k)
        if v is not None and str(v).strip().casefold() == t_cf:
            return True
    match = role.get("match") if isinstance(role.get("match"), dict) else {}
    for mk in ("title~=", "title", "class", "wmClass", "wm_class"):
        v = match.get(mk)
        if v is not None and str(v).strip().casefold() == t_cf:
            return True
        if mk == "title~=" and v is not None and t_cf in str(v).casefold():
            return True
    return False


def _match_role_token_nth(token: str,
                          roles: list[dict[str, Any]],
                          n: int = 0) -> Optional[str]:
    """Nth (0-based) role id matching token among roles list order."""
    if not isinstance(n, int) or isinstance(n, bool) or n < 0:
        return None
    matches: list[str] = []
    for r in roles:
        rid = r.get("id")
        if rid is None:
            continue
        if _role_matches_token(token, r):
            matches.append(str(rid))
    if n < len(matches):
        return matches[n]
    return None


def _match_role_token(token: str, roles: list[dict[str,
                                                   Any]]) -> Optional[str]:
    """Map focus/active sugar token → first matching role id."""
    return _match_role_token_nth(token, roles, 0)


def _check_role_ref_shape(raw: Any, where: str) -> None:
    """Raise ValueError if active/focus sugar is malformed."""
    if isinstance(raw, bool):
        raise ValueError(
            f"{where}: must be string, int index, or [token, index]")
    if isinstance(raw, int):
        if raw < 0:
            raise ValueError(f"{where}: index must be >= 0 (0-based)")
        return
    if isinstance(raw, list):
        if len(raw) != 2:
            raise ValueError(
                f"{where}: want [token, index] (0-based occurrence)")
        tok, n = raw[0], raw[1]
        if not str(tok).strip():
            raise ValueError(f"{where}: token must be non-empty")
        if not isinstance(n, int) or isinstance(n, bool) or n < 0:
            raise ValueError(f"{where}: index must be int >= 0 (0-based)")
        return
    if isinstance(raw, str):
        return
    raise ValueError(f"{where}: must be string, int index, or [token, index]")


def _resolve_role_ref(ref: Any, roles: list[dict[str, Any]]) -> Optional[str]:
    """
    Resolve focus/active sugar → role id.

    - int → roles[n].id (0-based index into this roles list)
    - str → first match (id / open / title)
    - [token, n] → nth match among roles (0-based)
    """
    if not _role_ref_present(ref):
        return None
    if isinstance(ref, int) and not isinstance(ref, bool):
        if 0 <= ref < len(roles):
            rid = roles[ref].get("id")
            return str(rid) if rid is not None else None
        return None
    if isinstance(ref, list):
        if len(ref) != 2:
            return None
        tok, n = ref[0], ref[1]
        if not isinstance(n, int) or isinstance(n, bool):
            return None
        return _match_role_token_nth(str(tok), roles, n)
    return _match_role_token(str(ref).strip(), roles)


def _resolve_active_ref(ref: Any, role_ids: list[str],
                        group_roles: list[dict[str, Any]]) -> Optional[str]:
    """Resolve active sugar against a group's ordered role ids / role objects."""
    if not _role_ref_present(ref):
        return None
    # Bare index: 2nd child = roles[1] in this group.
    if isinstance(ref, int) and not isinstance(ref, bool):
        if 0 <= ref < len(role_ids):
            return str(role_ids[ref])
        return None
    rid = _resolve_role_ref(ref, group_roles)
    if rid is not None:
        return rid
    if isinstance(ref, str):
        token = ref.strip()
        for cr in role_ids:
            if str(cr).casefold() == token.casefold():
                return str(cr)
    return None


def _apply_active_to_child(child: dict[str, Any], active_raw: Any,
                           roles: list[dict[str, Any]]) -> None:
    """Set child.active to a role id when active sugar matches a group role."""
    if not _role_ref_present(active_raw):
        return
    child_roles = child.get("roles") or []
    if not isinstance(child_roles, list) or not child_roles:
        return
    role_ids = [str(rid) for rid in child_roles]
    by_id = {str(r.get("id")): r for r in roles if r.get("id") is not None}
    group_roles = [by_id[rid] for rid in role_ids if rid in by_id]
    rid = _resolve_active_ref(active_raw, role_ids, group_roles)
    if rid is not None:
        child["active"] = rid


def _resolve_profile_focus_active(prof: dict[str, Any]) -> None:
    """Desugar layout active + top-level focus to role id strings in IR."""
    roles = prof.get("roles") or []
    if not isinstance(roles, list):
        return
    by_id = {str(r.get("id")): r for r in roles if r.get("id") is not None}

    def walk(children: Any) -> None:
        if not isinstance(children, list):
            return
        for ch in children:
            if not isinstance(ch, dict):
                continue
            nested = ch.get("children")
            if isinstance(nested, list) and nested:
                walk(nested)
            active = ch.get("active")
            if not _role_ref_present(active):
                ch.pop("active", None)
                continue
            role_ids = [str(r) for r in (ch.get("roles") or [])]
            group_roles = [by_id[rid] for rid in role_ids if rid in by_id]
            rid = _resolve_active_ref(active, role_ids, group_roles)
            if rid is not None:
                ch["active"] = rid
            elif isinstance(active, str) and active.strip():
                ch["active"] = active.strip()
            else:
                ch.pop("active", None)

    for mon_body in (prof.get("layout") or {}).values():
        if isinstance(mon_body, dict):
            walk(mon_body.get("children"))

    focus = prof.get("focus")
    if not _role_ref_present(focus):
        prof.pop("focus", None)
        return
    rid = _resolve_role_ref(focus, roles)
    if rid is not None:
        prof["focus"] = rid
    elif isinstance(focus, str) and focus.strip():
        prof["focus"] = focus.strip()
    else:
        prof.pop("focus", None)


def _cell_to_role(cell: Any, used_ids: set[str], where: str) -> dict[str, Any]:
    if isinstance(cell, str):
        token = cell.strip()
        if not token:
            raise ValueError(f"{where}: empty string cell")
        open_spec, match = _infer_open_and_match(token)
        rid = _alloc_role_id(_stem_to_id(token), used_ids)
        return {"id": rid, "match": match, "open": open_spec}

    if not isinstance(cell, dict):
        raise ValueError(f"{where}: role cell must be string or object")

    open_spec = cell.get("open")
    if open_spec is None and cell.get("app") is not None:
        open_spec = cell.get("app")
    if open_spec is None:
        raise ValueError(f"{where}: open (or app) required on role object")
    if isinstance(open_spec, str) and open_spec.strip():
        open_spec = {"app": open_spec.strip()}
    if not isinstance(open_spec, dict):
        raise ValueError(f"{where}: open must be an object or string")

    app_stem = _open_stem(open_spec)
    app_full = ""
    for k in ("app", "desktop", "command"):
        if open_spec.get(k) is not None and str(open_spec.get(k)).strip():
            app_full = str(open_spec.get(k)).strip()
            break
    rid_raw = cell.get("id")
    if rid_raw is None or str(rid_raw).strip() == "":
        # Full app token → id ("Google Voice" → Google-Voice), not first word only
        rid = _alloc_role_id(_stem_to_id(app_full or app_stem or "app"),
                             used_ids)
    else:
        rid = str(rid_raw).strip()
        if not _NAME_RE.match(rid):
            raise ValueError(f"{where}.id: invalid {rid!r} (use A-Za-z0-9_-)")
        if rid in used_ids:
            rid = _alloc_role_id(rid, used_ids)
        else:
            used_ids.add(rid)

    # Flat sugar: class / title~= / title on the cell (no nested match{}).
    match = cell.get("match")
    if match is None:
        flat: dict[str, Any] = {}
        if cell.get("class") is not None:
            flat["class"] = cell.get("class")
        if cell.get("title~=") is not None:
            flat["title~="] = cell.get("title~=")
        elif cell.get("title") is not None:
            flat["title"] = cell.get("title")
        if flat:
            match = flat
    if match is None and cell.get("class") is not None:
        match = {"class": cell.get("class")}
    if match is None:
        # Same inference as bare string cells when match not overridden.
        _open_i, match = _infer_open_and_match(app_full or app_stem or rid)
        # Keep author open as written; only fill wmClass when chrome-inferred and unset.
        if (match.get("class") == _CHROME_CLASS
                and open_spec.get("wmClass") is None
                and open_spec.get("wm_class") is None):
            open_spec = dict(open_spec)
            open_spec["wmClass"] = _CHROME_CLASS

    role: dict[str, Any] = {"id": rid, "match": match, "open": open_spec}
    if cell.get("slot") is not None:
        role["slot"] = cell["slot"]
    return role


def _infer_open_and_match(token: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Infer open + match from an app string (no live desktop DB).

    chrome launchers → Google-chrome + title~= Google Chrome
    known / Title-Case / multi-word PWA-like → Google-chrome + title~=
    else stem class (reverse-DNS sugar via _class_eq at match time)
    """
    token = token.strip()
    open_spec: dict[str, Any] = {"app": token}
    key = token.casefold()

    if key in _CHROME_LAUNCHERS or key.replace("_", "-") in _CHROME_LAUNCHERS:
        open_spec["wmClass"] = _CHROME_CLASS
        return open_spec, {"class": _CHROME_CLASS, "title~=": "Google Chrome"}

    pwa_title = _KNOWN_PWA_TITLE.get(key)
    if pwa_title is not None:
        open_spec["wmClass"] = _CHROME_CLASS
        return open_spec, {"class": _CHROME_CLASS, "title~=": pwa_title}

    if _looks_like_chrome_pwa_token(token):
        open_spec["wmClass"] = _CHROME_CLASS
        return open_spec, {"class": _CHROME_CLASS, "title~=": token}

    stem = token.split()[0]
    return open_spec, {"class": stem}


def _looks_like_chrome_pwa_token(token: str) -> bool:
    """Multi-word or Capitalized product name (not desktop-id / hyphen style)."""
    if not token:
        return False
    if " " in token:
        return True
    if "." in token or "-" in token or "_" in token:
        return False
    # Grok, YouTube — leading capital + some lower (not SCREAMING / all-lower)
    return token[0].isupper() and any(c.islower() for c in token[1:])


def _open_stem(open_spec: Any) -> str:
    if isinstance(open_spec, str):
        return open_spec.strip().split()[0] if open_spec.strip() else ""
    if isinstance(open_spec, dict):
        app = open_spec.get("app") or open_spec.get(
            "desktop") or open_spec.get("command")
        if app is None:
            return ""
        return str(app).strip().split()[0]
    return ""


def _stem_to_id(stem: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_-]+", "-", stem.strip()).strip("-_")
    if not s:
        return "app"
    if s[0].isdigit():
        s = f"a{s}"
    return s


def _alloc_role_id(base: str, used: set[str]) -> str:
    base = _stem_to_id(base)
    if base not in used:
        used.add(base)
        return base
    n = 2
    while f"{base}-{n}" in used:
        n += 1
    rid = f"{base}-{n}"
    used.add(rid)
    return rid


def _normalize_split_alias(val: Any, where: str) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip().lower()
    if s not in _SPLIT_ALIASES:
        raise ValueError(f"{where}: unsupported split {val!r}")
    return _SPLIT_ALIASES[s]


def validate_reconcile_profile(
    data: Any,
    *,
    mon_count: Optional[int] = None,
    mon_indices: Optional[list[int]] = None,
) -> dict[str, Any]:
    """
    Validate version-2 reconcile profile; return normalized dict.
    Raises ValueError with a clear message.

    Runs normalize_profile first (tiles sugar → IR + defaults).
    mon_count / mon_indices are forwarded for bare-array dual mon binding
    (see forest_profile_mon_kwargs).

    Human-friendly defaults (no app-specific hardcoding in Forge):
      - version omitted + roles[] → 2
      - mode omitted + roles[] → reconcile
      - match string → {class: …}; open string → {app: …}
      - role.class / role.app shortcuts when match/open omitted
      - layout mon split omitted + ≥2 children → hsplit
      - child layout omitted + ≥2 roles → tabbed
      - child id omitted + single role → that role id
      - overflow omitted → mon0.overflow tabbed
      - marginal omitted → coexist / first (via normalize)
      - role.slot from layout.roles listing when omitted
    """
    data = normalize_profile(data,
                             mon_count=mon_count,
                             mon_indices=mon_indices)

    has_roles = isinstance(data.get("roles"), list) and len(
        data.get("roles") or []) > 0
    # Empty roles[] is valid (empty desk / `forge layout clean`).
    has_roles_key = isinstance(data.get("roles"), list)

    if "version" not in data:
        if not has_roles and not has_roles_key:
            raise ValueError(
                "profile version required (want version: 2) or provide roles[]"
            )
        ver = PROFILE_VERSION
    else:
        ver = data["version"]
        if ver != PROFILE_VERSION and ver != str(PROFILE_VERSION):
            raise ValueError(
                f"unsupported profile version: {ver!r} (want {PROFILE_VERSION})"
            )

    mode = data.get("mode")
    if mode is None:
        if not has_roles and not has_roles_key:
            raise ValueError(
                "mode required (want mode: reconcile) or provide roles")
        mode = MODE_RECONCILE
    if not isinstance(mode, str) or mode.strip().lower() != MODE_RECONCILE:
        raise ValueError(
            f"unsupported mode: {mode!r} (want {MODE_RECONCILE!r})")
    mode = MODE_RECONCILE

    if "roles" not in data:
        raise ValueError("profile roles required (array)")
    roles_in = data["roles"]
    if not isinstance(roles_in, list):
        raise ValueError("profile roles must be an array")
    # roles: [] allowed — no claimed windows; clean closes residuals.

    aliases = _validate_monitors_aliases(data.get("monitors"))

    layout_in = data.get("layout")
    if layout_in is None:
        layout_in = {}
    if not isinstance(layout_in, dict):
        raise ValueError("layout must be an object")

    layout: dict[str, Any] = {}
    slot_ids: set[str] = set()
    mon_role_map: dict[str, str] = {}  # role_id → monKey.childId or deeper
    layout_keys: set[str] = set()

    for mon_key, mon_body in layout_in.items():
        if not isinstance(mon_key, str) or not mon_key.strip():
            raise ValueError("layout keys must be non-empty strings "
                             "(monN, primary, stableKey, or monitors alias)")
        mon_key = mon_key.strip()
        if not _mon_key_ok(mon_key, aliases):
            raise _mon_key_error(mon_key, "layout key", aliases)
        if not isinstance(mon_body, dict):
            raise ValueError(f"layout.{mon_key}: must be an object")
        children_in = mon_body.get("children")
        if children_in is None:
            children_in = []
        if not isinstance(children_in, list):
            raise ValueError(f"layout.{mon_key}.children must be an array")
        children = _validate_layout_children(
            children_in,
            mon_key,
            mon_key,
            f"layout.{mon_key}",
            slot_ids,
            mon_role_map,
        )

        split = mon_body.get("split")
        if split is None and len(children) >= 2:
            split = "hsplit"  # dual-pane mon default
        if split is not None:
            split_s = str(split).strip().lower()
            if split_s not in ("hsplit", "vsplit", "tabbed", "stacked"):
                raise ValueError(
                    f"layout.{mon_key}.split: unsupported {split!r}")
            split = split_s
        entry: dict[str, Any] = {"children": children}
        if split is not None:
            entry["split"] = split
        shares = normalize_shares(mon_body.get("share"))
        if shares is None:
            shares = normalize_shares(mon_body.get("ratio"))
        if shares is not None and len(shares) == len(children) and len(
                children) >= 2:
            entry["share"] = shares
        layout[mon_key] = entry
        layout_keys.add(mon_key)

    overflow_in = data.get("overflow")
    overflow: dict[str, Any]
    if overflow_in is None:
        overflow = {"slot": "mon0.overflow", "layout": "tabbed"}
    elif not isinstance(overflow_in, dict):
        raise ValueError("overflow must be an object")
    else:
        oslot = overflow_in.get("slot")
        if oslot is None or str(oslot).strip() == "":
            raise ValueError("overflow.slot required")
        oslot = str(oslot).strip()
        if not _slot_ok(oslot, aliases, layout_keys):
            raise ValueError(f"overflow.slot invalid: {oslot!r} "
                             "(want monN|primary|stableKey|alias . path)")
        olayout = overflow_in.get("layout", "tabbed")
        olayout_s = str(olayout).strip().lower()
        if olayout_s not in ("tabbed", "stacked", "hsplit", "vsplit"):
            raise ValueError(f"overflow.layout unsupported: {olayout!r}")
        overflow = {"slot": oslot, "layout": olayout_s}

    roles: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for i, role in enumerate(roles_in):
        if not isinstance(role, dict):
            raise ValueError(f"roles[{i}]: must be an object")
        rid = role.get("id")
        if rid is None or str(rid).strip() == "":
            raise ValueError(f"roles[{i}]: id required")
        rid = str(rid).strip()
        if not _NAME_RE.match(rid):
            raise ValueError(
                f"roles[{i}].id: invalid {rid!r} (use A-Za-z0-9_-)")
        if rid in seen_ids:
            raise ValueError(f"duplicate role id: {rid}")
        seen_ids.add(rid)

        match = role.get("match")
        if match is None and role.get("class") is not None:
            match = {"class": role.get("class")}
        if isinstance(match, str) and match.strip():
            match = {"class": match.strip()}
        if not isinstance(match, dict) or not match:
            raise ValueError(f"roles[{i}] ({rid}): match object required "
                             '(or match:"WmClass" / class:"WmClass")')
        norm_match = _normalize_match(match, f"roles[{i}].match")

        open_spec = role.get("open")
        if open_spec is None and role.get("app") is not None:
            open_spec = {"app": role.get("app")}
        if isinstance(open_spec, str) and open_spec.strip():
            open_spec = {"app": open_spec.strip()}
        if open_spec is None:
            raise ValueError(f"roles[{i}] ({rid}): open object required "
                             '(or open:"app" / app:"app")')
        if not isinstance(open_spec, dict):
            raise ValueError(
                f"roles[{i}] ({rid}): open must be an object or string")
        app = open_spec.get("app") or open_spec.get(
            "desktop") or open_spec.get("command")
        if app is None or str(app).strip() == "":
            raise ValueError(f"roles[{i}] ({rid}): open.app required")
        norm_open: dict[str, Any] = {"app": str(app).strip()}
        wc = open_spec.get("wmClass") or open_spec.get("wm_class")
        if wc is not None and str(wc).strip() != "":
            norm_open["wmClass"] = str(wc).strip()
        elif norm_match.get("class"):
            # PlaceNext / wait: sugar match.class when open omits wmClass
            # (ghostty ↔ com.mitchellh.ghostty via stem class equality).
            norm_open["wmClass"] = str(norm_match["class"]).strip()
        if "timeout" in open_spec and open_spec["timeout"] is not None:
            try:
                norm_open["timeout"] = int(open_spec["timeout"])
            except (TypeError, ValueError) as e:
                raise ValueError(
                    f"roles[{i}] ({rid}): open.timeout must be int") from e
        mon = open_spec.get("monitor")
        if mon is not None and str(mon).strip() != "":
            norm_open["monitor"] = mon
        path = open_spec.get("treePath") or open_spec.get(
            "path") or open_spec.get("tree_path")
        if path is not None and str(path).strip() != "":
            norm_open["treePath"] = str(path).strip()
        if open_spec.get("first") is not None:
            norm_open["first"] = bool(open_spec["first"])
        no_wait = open_spec.get(
            "noWait") if "noWait" in open_spec else open_spec.get("no_wait")
        if no_wait is not None:
            norm_open["noWait"] = bool(no_wait)

        slot = role.get("slot")
        if slot is not None:
            if not isinstance(slot, str) or not slot.strip():
                raise ValueError(
                    f"roles[{i}] ({rid}): slot must be a non-empty string")
            slot = slot.strip()
            if not _slot_ok(slot, aliases, layout_keys):
                raise ValueError(f"roles[{i}] ({rid}): invalid slot {slot!r} "
                                 "(want monN|primary|stableKey|alias . path)")
        elif rid in mon_role_map:
            slot = mon_role_map[rid]
        else:
            raise ValueError(
                f"roles[{i}] ({rid}): slot required (or list role under layout children)"
            )

        # layout listing may disagree with role.slot — role.slot wins
        if rid in mon_role_map and mon_role_map[rid] != slot:
            # still ok; slot on role is authoritative
            pass

        roles.append({
            "id": rid,
            "match": norm_match,
            "open": norm_open,
            "slot": slot,
        })

    out: dict[str, Any] = {
        "version": PROFILE_VERSION,
        "mode": mode,
        "roles": roles,
        "layout": layout,
        "overflow": overflow,
    }
    if data.get("monExplicit"):
        out["monExplicit"] = True

    desc = data.get("description")
    if desc is not None:
        if not isinstance(desc, str):
            raise ValueError("description must be a string")
        out["description"] = desc

    displays = data.get("displays")
    if displays is not None:
        if not isinstance(displays, str) or not displays.strip():
            raise ValueError("displays must be a non-empty string")
        out["displays"] = displays.strip()

    settings = data.get("settings")
    if settings is not None:
        if not isinstance(settings, str) or not settings.strip():
            raise ValueError("settings must be a non-empty string")
        out["settings"] = settings.strip()

    # marginal: coexist / first / leave residuals (zero thrash default)
    marginal = data.get("marginal")
    if marginal is None:
        out["marginal"] = {
            "mode": "coexist",
            "roleOrder": "first",
            "residual": "leave",
        }
    else:
        if not isinstance(marginal, dict):
            raise ValueError("marginal must be an object")
        m_mode = marginal.get("mode", "coexist")
        if m_mode is None or str(m_mode).strip() == "":
            m_mode = "coexist"
        m_mode = str(m_mode).strip().lower()
        if m_mode not in ("coexist", "strict"):
            raise ValueError(
                f"marginal.mode: unsupported {m_mode!r} (want coexist|strict)")
        role_order = marginal.get("roleOrder") or marginal.get(
            "role_order") or "first"
        if role_order is None or str(role_order).strip() == "":
            role_order = "first"
        role_order = str(role_order).strip().lower()
        residual = marginal.get("residual") or "leave"
        if residual is None or str(residual).strip() == "":
            residual = "leave"
        residual = str(residual).strip().lower()
        if residual not in ("leave", "park"):
            raise ValueError(
                f"marginal.residual: unsupported {residual!r} (want leave|park)"
            )
        out["marginal"] = {
            "mode": m_mode,
            "roleOrder": role_order,
            "residual": residual,
        }

    floating = data.get("floating")
    if floating is not None:
        if not isinstance(floating, list):
            raise ValueError("floating must be an array")
        out["floating"] = floating

    focus = data.get("focus")
    if _role_ref_present(focus):
        _check_role_ref_shape(focus, "focus")
        out["focus"] = focus

    if aliases:
        out["monitors"] = aliases

    # active / focus sugar → role id strings for plan/apply.
    _resolve_profile_focus_active(out)

    return out


def _validate_layout_children(
    children_in: list[Any],
    mon_key: str,
    path_prefix: str,
    where: str,
    slot_ids: set[str],
    mon_role_map: dict[str, str],
) -> list[dict[str, Any]]:
    """Validate flat or nested layout children; path_prefix is monN or monN.parent."""
    children: list[dict[str, Any]] = []
    for i, ch in enumerate(children_in):
        ch_where = f"{where}.children[{i}]"
        if not isinstance(ch, dict):
            raise ValueError(f"{ch_where}: must be an object")

        nested_in = ch.get("children")
        has_nested = isinstance(nested_in, list)

        roles_list = ch.get("roles")
        if roles_list is not None:
            if not isinstance(roles_list, list) or not all(
                    isinstance(r, str) and r.strip() for r in roles_list):
                raise ValueError(f"{ch_where}.roles must be a string array")
            roles_list = [str(r).strip() for r in roles_list]
        else:
            roles_list = None

        if has_nested and roles_list:
            raise ValueError(
                f"{ch_where}: use roles or nested children, not both")

        cid = ch.get("id")
        if cid is None or str(cid).strip() == "":
            if roles_list and len(roles_list) == 1 and not has_nested:
                cid = roles_list[0]
            else:
                raise ValueError(f"{ch_where}: id required "
                                 "(or single roles:[id] to default id)")
        cid = str(cid).strip()
        if not _NAME_RE.match(cid):
            raise ValueError(
                f"{ch_where}.id: invalid {cid!r} (use A-Za-z0-9_-)")
        full_slot = f"{path_prefix}.{cid}"
        if full_slot in slot_ids:
            raise ValueError(f"duplicate slot id: {full_slot}")
        slot_ids.add(full_slot)

        child: dict[str, Any] = {"id": cid}

        if has_nested:
            nested = _validate_layout_children(
                nested_in,
                mon_key,
                full_slot,
                ch_where,
                slot_ids,
                mon_role_map,
            )
            child["children"] = nested
            split = ch.get("split")
            if split is None and len(nested) >= 2:
                split = "hsplit"
            if split is not None:
                split_s = str(split).strip().lower()
                if split_s not in ("hsplit", "vsplit", "tabbed", "stacked"):
                    raise ValueError(
                        f"{ch_where}.split: unsupported {split!r}")
                child["split"] = split_s
            shares = normalize_shares(ch.get("share"))
            if shares is None:
                shares = normalize_shares(ch.get("ratio"))
            if shares is not None and len(shares) == len(nested) and len(
                    nested) >= 2:
                child["share"] = shares
        else:
            lay = ch.get("layout")
            if lay is None and roles_list and len(roles_list) >= 2:
                lay = "tabbed"
            if lay is not None:
                lay_s = str(lay).strip().lower()
                if lay_s not in ("tabbed", "stacked", "hsplit", "vsplit"):
                    raise ValueError(f"{ch_where}.layout: unsupported {lay!r}")
                child["layout"] = lay_s
            if roles_list is not None:
                child["roles"] = roles_list
                for rid in child["roles"]:
                    if rid in mon_role_map:
                        raise ValueError(
                            f"role {rid!r} listed in multiple layout slots")
                    mon_role_map[rid] = full_slot
            active = ch.get("active")
            if _role_ref_present(active):
                _check_role_ref_shape(active, f"{ch_where}.active")
                # Resolve to role id after roles[] is normalized (see
                # _resolve_profile_focus_active).
                child["active"] = active

        children.append(child)
    return children


def _normalize_match(match: dict[str, Any], where: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    cls = match.get("class") or match.get("wmClass") or match.get("wm_class")
    if cls is not None:
        if not isinstance(cls, str) or not cls.strip():
            raise ValueError(f"{where}: class must be a non-empty string")
        out["class"] = cls.strip()

    if "title" in match and match["title"] is not None:
        if not isinstance(match["title"], str):
            raise ValueError(f"{where}: title must be a string")
        out["title"] = match["title"]

    title_sub = match.get("title~=")
    if title_sub is not None:
        if not isinstance(title_sub, str) or title_sub == "":
            raise ValueError(f"{where}: title~= must be a non-empty string")
        out["title~="] = title_sub

    mon = match.get("mon") if "mon" in match else match.get("monitor")
    if mon is not None and mon != "":
        out["mon"] = mon

    # mon is preference-only; require at least one real selector
    if not any(k in out for k in ("class", "title", "title~=")):
        raise ValueError(f"{where}: need class, title, and/or title~=")
    return out


def _normalize_workspace(workspace: Any) -> int:
    """Non-negative workspace index; bad values → 0."""
    try:
        ws = int(workspace)
    except (TypeError, ValueError):
        return 0
    return ws if ws >= 0 else 0


def monitor_workspace_index(m: dict[str, Any]) -> Optional[int]:
    """Workspace index from MONITOR id (moNwsW). None if unparseable."""
    mid = m.get("id")
    if isinstance(mid, str):
        parsed = _parse_mon_id(mid)
        if parsed is not None:
            return parsed[1]
    return None


def window_workspace_index(w: dict[str, Any]) -> Optional[int]:
    """Workspace from window path mon id (moNwsW/...)."""
    path = w.get("path")
    if path is None or str(path).strip() == "":
        return None
    head = str(path).strip()
    if head.startswith("path:"):
        head = head[5:]
    mon_head = head.split("/", 1)[0]
    parsed = _parse_mon_id(mon_head)
    if parsed is None:
        return None
    return parsed[1]


def filter_forest_workspace(forest: Any, workspace: int = 0) -> Any:
    """
    Shallow-copy forest keeping only MONITOR roots for the target workspace.

    Monitors without parseable moNwsW id are kept only for workspace 0
    (legacy / single-workspace fixtures). Other workspaces are invisible.
    Preserves forest meta (activeWorkspace, nWorkspaces, focusWindowId, …).
    """
    ws = _normalize_workspace(workspace)
    if not isinstance(forest, dict):
        return forest
    mons = forest.get("monitors")
    if not isinstance(mons, list):
        return forest
    kept: list[Any] = []
    for m in mons:
        if not isinstance(m, dict):
            continue
        mws = monitor_workspace_index(m)
        if mws is None:
            if ws == 0:
                kept.append(m)
        elif mws == ws:
            kept.append(m)
    out = dict(forest)
    out["monitors"] = kept
    return out


def active_workspace_from_forest(forest: Any, default: int = 0) -> int:
    """
    Resolve 0-based workspace index from GetTree forest meta.

    Prefers activeWorkspace, then currentWorkspace (aliases). Missing or
    invalid meta → default (0 for offline --tree-file without meta).
    """
    if not isinstance(forest, dict):
        return _normalize_workspace(default)
    for key in ("activeWorkspace", "currentWorkspace"):
        if key not in forest or forest[key] is None:
            continue
        return _normalize_workspace(forest[key])
    return _normalize_workspace(default)


def plan_reconcile(
    forest: dict,
    profile: dict,
    *,
    clean: bool = False,
    keep_others: bool = False,
    safe: bool = False,
    role_pins: Optional[dict[str, Any]] = None,
    just_opened_roles: Optional[Iterable[str]] = None,
    workspace: int = 0,
) -> dict[str, Any]:
    """
    Build a reconcile plan from a GetTree forest + validated (or raw) v2 profile.

    workspace: 0-based Meta workspace index to plan against (default 0).
    Only windows on that workspace are claim/keep/park/structure candidates;
    matching windows on other workspaces are invisible (no cross-ws steal).

    clean=True: close true residuals (Meta delete path). Product CLI default.
    keep_others=True: soft-park residuals onto each mon's last unit (tab join);
    overrides clean. claimed roles are never closed/parked. Mode A "kept"
    companions apply only when neither clean nor park (residual leave).

    safe=True: open missing roles + move roles to correct mon only;
    no park/close, no collect keep, no structure, no mon ensure.
    thrashState still reported (Mode A/B detection); Mode B park skipped.

    role_pins: optional role id → windowId from a successful launch (residual
    replan after open). Pins claim by id when title match still fails.

    just_opened_roles: role ids launched this apply (residual). Survivor tab
    focus prefers pre-existing group members over these.

    Returns:
      {
        "ok": True,
        "workspace": int,
        "nothingToDo": bool,
        "counts": {
          "reused", "opened", "moved", "parked", "kept", "closed",
          "structure", "ordered"
        },
        "roles": [...],
        "actions": [...],
        "kept": [...],
        "unclaimed": [...],
        "clean": bool,
        "safe": bool,
      }
    """
    if not isinstance(forest, dict):
        raise ValueError("forest must be a JSON object")
    workspace = _normalize_workspace(workspace)
    # Target-ws only: other moNwsW roots are not candidates for claim/park/keep.
    forest = filter_forest_workspace(forest, workspace)
    # mon_count + L→R mon_indices so bare dual arrays bind leftmost head first
    # even when Meta mon0 is the right display (X11 / renumber footgun).
    prof = validate_reconcile_profile(profile,
                                      **forest_profile_mon_kwargs(forest))
    # Rewrite mon keys (stableKey / alias / primary / left|right) → monN.
    prof = resolve_profile_mon_keys(prof, forest)
    clean = bool(clean)
    keep_others = bool(keep_others)
    if keep_others:
        # Park wins over close when both somehow set.
        clean = False
    safe = bool(safe)
    pins = _normalize_role_pins(role_pins)
    opened_roles = {
        str(x).strip()
        for x in (just_opened_roles or []) if x is not None and str(x).strip()
    }

    # Mode B gate — once; reused for residual policy + plan.thrashState.
    # Cold happy path (CT0): thrash may be reported for stderr info only —
    # force_park is gated after claim (cold empty / residual bind).
    thrash_state = detect_thrash(forest, prof)
    thrashed = bool(thrash_state.get("thrashed"))

    windows = collect_windows(forest)
    layout_placeholders = collect_layout_placeholders(forest)
    claimed: set[str] = set()  # windowId keys
    role_results: list[dict[str, Any]] = []
    actions: list[dict[str, Any]] = []

    counts = {
        "reused": 0,
        "opened": 0,
        "moved": 0,
        "parked": 0,
        "kept": 0,
        "left": 0,
        "closed": 0,
        "structure": 0,
        "ordered": 0,
        "sized": 0,
        "focused": 0,
        "skeleton": 0,
        "bound": 0,
    }
    slots_needing_layout: dict[str, str] = {}  # slot → mode
    mons_with_placement: set[str] = set()

    layout_slot_modes = _slot_layout_modes(prof)
    overflow_slot = prof["overflow"]["slot"]
    parent_info = _window_parent_index(forest)
    marginal = prof.get("marginal") or {}
    marginal_mode = str(marginal.get("mode") or "coexist").strip().lower()
    role_order = str(marginal.get("roleOrder") or "first").strip().lower()
    residual_mode = str(marginal.get("residual") or "leave").strip().lower()
    if residual_mode not in ("leave", "park"):
        residual_mode = "leave"

    # Two-pass claim: same-mon first so earlier roles do not steal later mons'
    # only matching window (e.g. mon0.ghostty vs mon1.ghostty-2).
    role_windows = _two_pass_claim_windows(prof["roles"], windows)
    # Launch pins (by windowId) fill roles title match still misses after open.
    role_windows = _apply_role_pins(prof["roles"], windows, role_windows, pins)
    # Untitled Chrome PWA (still "New Tab") must not force a second launch.
    role_windows = _claim_class_only_windows(prof["roles"], windows, role_windows)

    for role, chosen in zip(prof["roles"], role_windows):
        rid = role["id"]
        slot = role["slot"]
        desired_mon = mon_index_from_slot(slot)

        entry: dict[str, Any] = {"id": rid, "slot": slot}
        if chosen is None:
            entry["status"] = "open"
            counts["opened"] += 1
            open_act: dict[str, Any] = {
                "op": "open",
                "role": rid,
                "open": dict(role["open"]),
                "slot": slot,
                "workspace": workspace,
            }
            # Title identity for CL9 map-pin (X11 Chrome PWAs share wmClass).
            role_match = role.get("match")
            if isinstance(role_match, dict):
                pin_match: dict[str, Any] = {}
                if role_match.get("title~=") is not None:
                    pin_match["title~="] = role_match.get("title~=")
                if role_match.get("title") is not None:
                    pin_match["title"] = role_match.get("title")
                if pin_match:
                    open_act["match"] = pin_match
            # Nested split: attach next to claimed sibling when known (PlaceNext).
            if not safe:
                join_wid = _nested_split_join_dest(
                    prof["roles"],
                    role_windows,
                    slot,
                    layout_slot_modes,
                    rid,
                )
                if join_wid is not None:
                    open_act["destWindowId"] = join_wid
            actions.append(open_act)
            mon_head = _slot_mon_key(slot)
            if mon_head:
                mons_with_placement.add(mon_head)
            if not safe:
                _mark_layout_slots_for_role(slot, layout_slot_modes,
                                            slots_needing_layout)
        else:
            claimed.add(_window_key(chosen))
            entry["windowId"] = chosen.get("windowId")
            entry["path"] = chosen.get("path")
            entry["title"] = chosen.get("title")
            entry["wmClass"] = chosen.get("wmClass") or chosen.get("wm_class")
            win_mon = window_monitor_index(chosen)
            if win_mon is not None and desired_mon is not None and win_mon == desired_mon:
                entry["status"] = "reused"
                counts["reused"] += 1
            elif desired_mon is None:
                entry["status"] = "reused"
                counts["reused"] += 1
            else:
                entry["status"] = "move"
                counts["moved"] += 1
                mon_head = _slot_mon_key(slot)
                if mon_head:
                    mons_with_placement.add(mon_head)
                move_act: dict[str, Any] = {
                    "op": "move",
                    "role": rid,
                    "windowId": chosen.get("windowId"),
                    "path": chosen.get("path"),
                    "slot": slot,
                    "workspace": workspace,
                }
                # First mon-layout child → prepend under MONITOR (term | tabs).
                child_i = _slot_mon_child_index(prof, slot)
                if child_i is not None:
                    move_act["childIndex"] = child_i
                    if child_i == 0:
                        move_act["position"] = "start"
                # Nested h/v: join onto claimed sibling (ghostty), not mon root.
                join_wid = _nested_split_join_dest(
                    prof["roles"],
                    role_windows,
                    slot,
                    layout_slot_modes,
                    rid,
                )
                if join_wid is not None:
                    move_act["destWindowId"] = join_wid
                actions.append(move_act)
                if not safe:
                    _mark_layout_slots_for_role(slot, layout_slot_modes,
                                                slots_needing_layout)
        role_results.append(entry)

    # Cold empty: every role needs open (no claimed windows). CT1 skeleton path.
    cold_empty = (not safe and bool(role_results) and all(
        str(r.get("status") or "") == "open" for r in role_results))
    # Residual after open batch (just_opened_roles) or cold empty: thrash must not
    # force residual park (CT0 P0–P5 cold; Mode B only mid-session / --recover).
    suppress_thrash_park = cold_empty or bool(opened_roles)
    # Residuals: keep_others → park; clean → close; Mode B thrash → park when
    # not clean and not cold/bind; else profile residual leave|park. --safe: never.
    force_park_residuals = (keep_others or
                            (thrashed and not clean and not safe
                             and not suppress_thrash_park)) and not safe
    # Slot-tagged layout PHs (from ensure_skeleton): residual prefers bind.
    has_layout_ph = bool(layout_placeholders)

    # floating[]: claim matching windows so clean/park residuals leave them alone.
    _claim_floating_windows(prof.get("floating") or [], windows, claimed)

    # Mode A collect: assign marginals to views (coexist). Mode B / --safe: skip.
    slot_members = (_build_slot_membership(role_results, parent_info, windows,
                                           prof, forest)
                    if marginal_mode != "strict" and not thrashed and not safe
                    else {})
    key_to_slot: dict[str, str] = {}
    for slot, keys in slot_members.items():
        for k in keys:
            key_to_slot.setdefault(k, slot)

    want_park = ((residual_mode == "park" or force_park_residuals)
                 and not clean and not safe)
    # Per-mon last unit (claimed role preferred) for soft park join.
    anchors_by_mon = (_soft_park_anchors_by_mon(windows, parent_info, claimed)
                      if want_park else {})
    global_park_anchor = (_soft_park_anchor(windows, parent_info, claimed)
                          if want_park else None)
    # mon_index → { "anchor": wid, "parked": [wid, ...] } for tab-join ensure
    park_join_by_mon: dict[int, dict[str, Any]] = {}

    kept: list[dict[str, Any]] = []
    left: list[dict[str, Any]] = []
    unclaimed: list[dict[str, Any]] = []
    # P5 residual close/park — separate from role open/move (bind barrier before P5).
    residual_actions: list[dict[str, Any]] = []
    for w in windows:
        if _window_key(w) in claimed:
            continue
        summary = _window_summary(w)
        key = _window_key(w)
        keep_slot = key_to_slot.get(key) if key_to_slot else None
        # Cold empty first plan: skeleton + open only. Defer residual close/park
        # until post-open residual replan (after bind). Avoids close-before-open.
        if cold_empty and not safe:
            entry = dict(summary)
            entry["status"] = "left"
            left.append(entry)
            unclaimed.append(entry)
            counts["left"] += 1
            continue
        # Mode A "kept" companions only when we are not closing/parking residuals.
        # Product default (clean=True) must close non-layout windows; --keep-others
        # must park them. Previously keep always won → default close and --keep
        # both looked like no-ops for mon-child companions (Nautilus, etc.).
        if keep_slot is not None and not clean and not want_park and not safe:
            entry = dict(summary)
            entry["status"] = "kept"
            entry["slot"] = keep_slot
            kept.append(entry)
            unclaimed.append(entry)
            counts["kept"] += 1
        elif clean and not safe:
            entry = dict(summary)
            entry["status"] = "closed"
            unclaimed.append(entry)
            counts["closed"] += 1
            residual_actions.append({
                "op": "close",
                "windowId": w.get("windowId"),
                "path": w.get("path"),
            })
        elif safe or (residual_mode == "leave" and not force_park_residuals):
            entry = dict(summary)
            entry["status"] = "left"
            left.append(entry)
            unclaimed.append(entry)
            counts["left"] += 1
        else:
            # Soft park onto that mon's last unit; tab-join if last unit is an app.
            entry = dict(summary)
            entry["status"] = "parked"
            unclaimed.append(entry)
            counts["parked"] += 1
            park_act: dict[str, Any] = {
                "op": "park",
                "windowId": w.get("windowId"),
                "path": w.get("path"),
                "slot": overflow_slot,
                "workspace": workspace,
            }
            mon_i = window_monitor_index(w)
            anchor = None
            if mon_i is not None:
                anchor = anchors_by_mon.get(int(mon_i))
            if anchor is None:
                anchor = global_park_anchor
            if anchor is not None:
                awid = anchor.get("windowId")
                if awid is not None and str(awid) != str(w.get("windowId")):
                    park_act["destWindowId"] = awid
                    mon_a = window_monitor_index(anchor)
                    if mon_a is None:
                        mon_a = mon_i
                    if mon_a is not None:
                        park_act["slot"] = f"mon{mon_a}.overflow"
                        join = park_join_by_mon.setdefault(
                            int(mon_a),
                            {
                                "anchor": awid,
                                "parked": []
                            },
                        )
                        if join.get("anchor") is None:
                            join["anchor"] = awid
                        rwid = w.get("windowId")
                        if rwid is not None and str(rwid).strip() != "":
                            join["parked"].append(rwid)
            residual_actions.append(park_act)

    # Tabbed/stacked + nested h/v: repair when not co-grouped; order when shared.
    # Mode B: kept empty → structure windowIds are roles only. --safe: skip.
    # Cold empty: skeleton owns structure (no window-anchored ensure_layout).
    # LayoutRole PHs: bind still runs first (bind phase before order), but do
    # **not** skip ensure_layout — residual open often leaves multi-role tab
    # slots as mon siblings when map/PlaceNext missed the PH CON. Order-phase
    # ensure_layout repairs ungrouped roles after bind.
    structure_slots: dict[str, dict[str, Any]] = {}
    slot_order_actions: list[dict[str, Any]] = []
    skip_window_structure = cold_empty
    if not safe and not skip_window_structure:
        slots_for_structure = set(layout_slot_modes.keys())
        for k in kept:
            if k.get("slot"):
                slots_for_structure.add(str(k["slot"]))

        for slot in slots_for_structure:
            mode = layout_slot_modes.get(slot)
            # Nested hsplit/vsplit: roles live under mon0.s1.* not exact mon0.s1.
            if mode in ("hsplit", "vsplit"):
                wids = _role_window_ids_for_slot_prefix(role_results, slot)
                if len(wids) < 2:
                    continue
                if _windows_share_group(wids, parent_info, mode):
                    if not _sibling_order_matches(wids, parent_info):
                        slot_order_actions.append({
                            "op": "ensure_order",
                            "slot": slot,
                            "mode": mode,
                            "windowIds": wids,
                        })
                    continue
                structure_slots[slot] = {"mode": mode, "windowIds": wids}
                slots_needing_layout[slot] = mode
                continue
            if mode not in ("tabbed", "stacked", None):
                continue
            if mode is None:
                # Single-role slot with companions → treat as tabbed bag
                mode = "tabbed"
            wids = _ordered_slot_window_ids(role_results, slot, kept,
                                            role_order)
            if len(wids) < 2:
                continue
            share = _windows_share_group(wids, parent_info, mode)
            role_wids = _role_window_ids_for_slot(role_results, slot)
            # Co-grouped multi-role bag polluted by another mon-child role
            # (giant tab: chrome+Grok+ghostty) → peel + re-tab role-only ids.
            if share and _slot_parent_has_foreign_mon_child(
                    slot, role_wids if role_wids else wids, role_results,
                    parent_info):
                peel_wids = role_wids if len(role_wids) >= 2 else wids
                structure_slots[slot] = {"mode": mode, "windowIds": peel_wids}
                slots_needing_layout[slot] = mode
                continue
            if share:
                # Co-grouped: still repair role sibling order (YT→Gmail→Voice).
                if len(role_wids) >= 2 and not _sibling_order_matches(
                        role_wids, parent_info):
                    slot_order_actions.append({
                        "op": "ensure_order",
                        "slot": slot,
                        "mode": mode,
                        "windowIds": role_wids,
                    })
                continue
            structure_slots[slot] = {"mode": mode, "windowIds": wids}
            slots_needing_layout[slot] = mode

        # Soft park: tab-join residuals into that mon's last unit (default = tabbed).
        # Lone app last unit is wrapped to a group then residuals join the bag.
        if want_park and park_join_by_mon:
            overflow_layout = str(((prof.get("overflow") or {}).get("layout")
                                   or "tabbed")).strip().lower()
            if overflow_layout not in ("tabbed", "stacked"):
                overflow_layout = "tabbed"
            for mon_a, join in sorted(park_join_by_mon.items()):
                anchor_wid = join.get("anchor")
                parked_wids = join.get("parked") or []
                if anchor_wid is None or not parked_wids:
                    continue
                wids_j: list[Any] = [anchor_wid]
                seen_w: set[str] = {str(anchor_wid)}
                for pwid in parked_wids:
                    if str(pwid) in seen_w:
                        continue
                    seen_w.add(str(pwid))
                    wids_j.append(pwid)
                if len(wids_j) < 2:
                    continue
                slot_j = f"mon{mon_a}.overflow"
                # First wins if a real profile slot already owns this key (rare).
                if slot_j not in structure_slots:
                    structure_slots[slot_j] = {
                        "mode": overflow_layout,
                        "windowIds": wids_j,
                    }
                    slots_needing_layout[slot_j] = overflow_layout

    counts["structure"] = len(structure_slots)

    # Mon-level L/R (hsplit/vsplit) + in-group role order vs profile.
    order_actions: list[dict[str, Any]] = []
    if not safe:
        order_actions = _mon_order_actions(role_results, parent_info, prof)
        order_actions.extend(slot_order_actions)
    counts["ordered"] = len(order_actions)

    # Sibling percent shares after structure/order (Move resets percents).
    size_actions: list[dict[str, Any]] = []
    if not safe:
        size_actions = _size_actions(role_results, prof)
    counts["sized"] = len(size_actions)

    # Residual just_opened: roles reused on correct mon still need mon ensure
    # (open-all residual has opened=moved=0; mon stays TABBED without this).
    if opened_roles and not safe:
        for entry in role_results:
            rid = entry.get("id")
            if rid is None or str(rid) not in opened_roles:
                continue
            if entry.get("windowId") is None:
                continue
            mon_head = _slot_mon_key(entry.get("slot"))
            if mon_head:
                mons_with_placement.add(mon_head)
            if entry.get("status") == "reused":
                _mark_layout_slots_for_role(
                    str(entry.get("slot") or ""),
                    layout_slot_modes,
                    slots_needing_layout,
                )

    # Live mon layout wrong vs profile split (e.g. mon-root TABBED, want hsplit).
    mons_split_mismatch: set[str] = set()
    if not safe:
        mons_split_mismatch = _mons_with_split_mismatch(
            forest, prof, role_results)
        for mon_key in mons_split_mismatch:
            mons_with_placement.add(mon_key)

    # FIRM: profile tree vs live forest structural compare (single source of truth).
    structure_cmp = compare_layout_structure(
        forest,
        prof,
        role_results=role_results,
        parent_info=parent_info,
        already_validated=True,
    )

    # Mon-child peel: demote shared TABBED/STACKED before subset re-tab.
    # layoutOp only wraps subset on H/V multi-window CONs — not already-TABBED.
    # Cold / PH-bind residual: no peel (skeleton+bind owns topology).
    peel_demote_actions: list[dict[str, Any]] = []
    mon_child_peel_mons: set[str] = set()
    if not safe and not skip_window_structure:
        for mm in structure_cmp.get("mismatches") or []:
            if not isinstance(mm, dict) or mm.get("kind") != "mon-child":
                continue
            mon_key = str(mm.get("slot") or "")
            if not mon_key:
                continue
            mon_child_peel_mons.add(mon_key)
            mon_body = (prof.get("layout") or {}).get(mon_key) or {}
            split = str((mon_body or {}).get("split")
                        or "hsplit").strip().lower()
            if split not in ("hsplit", "vsplit"):
                split = "hsplit"
            anchor = _peel_demote_anchor(mon_key, role_results, parent_info,
                                         prof, mm)
            if anchor is None:
                continue
            peel_demote_actions.append({
                "op": "ensure_layout",
                "slot": mon_key,
                "mode": split,
                "windowIds": [anchor],
            })
            mons_with_placement.add(mon_key)
            # Force multi-role tab/stack under this mon into structure repair
            # with role-only windowIds (exclude foreign mon-child roles).
            for slot, mode in layout_slot_modes.items():
                if not str(slot).startswith(mon_key + "."):
                    continue
                mode_l = str(mode or "").strip().lower()
                if mode_l not in ("tabbed", "stacked"):
                    continue
                role_wids = _role_window_ids_for_slot(role_results, slot)
                if len(role_wids) < 2:
                    continue
                if slot not in structure_slots:
                    structure_slots[slot] = {
                        "mode": mode_l,
                        "windowIds": role_wids,
                    }
                    slots_needing_layout[slot] = mode_l
        counts["structure"] = len(structure_slots)

    # Role open/move / residual just_opened / mon split repair rewrite mon splits.
    # Park/close alone must not thrash dual-mon hsplit. --safe: no ensure.
    # Cold empty: skeleton (not mon ensure). PH residual: bind after place.
    has_role_placement = counts["opened"] > 0 or counts["moved"] > 0
    # just_opened only drives mon ensure off --safe (safe path is open+move only).
    # Skeleton already set mon H/V while layout PHs live — skip mon-level ensure
    # until PHs are gone. Tab/stack structure repair still runs (above).
    has_mon_ensure = (not skip_window_structure and not has_layout_ph and
                      (has_role_placement or (bool(opened_roles) and not safe)
                       or bool(mons_split_mismatch)
                       or bool(mon_child_peel_mons)))
    skeleton_actions: list[dict[str, Any]] = []
    if cold_empty and not safe:
        sk = build_ensure_skeleton_action(prof, workspace=workspace)
        if sk is not None:
            skeleton_actions.append(sk)
            counts["skeleton"] = 1

    bind_actions: list[dict[str, Any]] = []
    if not safe and has_layout_ph and not cold_empty:
        bind_actions = build_bind_actions(role_results, layout_placeholders)
        counts["bound"] = len(bind_actions)

    has_work = (has_role_placement or has_mon_ensure or counts["parked"] > 0
                or counts["closed"] > 0 or counts["structure"] > 0
                or counts["ordered"] > 0 or counts["sized"] > 0
                or bool(slots_needing_layout) or bool(peel_demote_actions)
                or bool(skeleton_actions) or bool(bind_actions)
                or (not safe and not skip_window_structure
                    and not structure_cmp.get("match", True)))
    structure_ensure_actions: list[dict[str, Any]] = []
    mon_ensure_actions: list[dict[str, Any]] = []
    if has_work and not safe and not skip_window_structure:
        # Nested tab/stack/h-v first so mon kids become [tab CON, term] before
        # mon-level hsplit (flat TABBED mon otherwise equal-splits every leaf).
        # Peel demotes go *before* tab structure (already in peel_demote_actions).
        for slot, mode in sorted(slots_needing_layout.items()):
            wids = structure_slots.get(slot, {}).get("windowIds")
            if wids is None:
                mode_l = str(mode or "").strip().lower()
                if mode_l in ("hsplit", "vsplit"):
                    # Nested split: collect mon0.s1 + mon0.s1.* role leaves.
                    wids = _role_window_ids_for_slot_prefix(role_results, slot)
                else:
                    wids = _ordered_slot_window_ids(role_results, slot, kept,
                                                    role_order)
            # Window-anchored ensure needs at least one id (empty desk → skeleton).
            if not wids:
                continue
            entry: dict[str, Any] = {
                "op": "ensure_layout",
                "slot": slot,
                "mode": mode,
                "windowIds": wids,
            }
            structure_ensure_actions.append(entry)

        # mon-level splits only for mons that open/move / just_opened / mismatch.
        # Touching peer mons steals LFT/focus and can derail PlaceNext.
        # Anchor on mon-direct children (term slots), never tab-group members —
        # layout acts on the window's parent CON, so chrome in a tab would
        # demote TABBED → HSPLIT. Peel demote already handled polluted bags.
        #
        # Nested structure first builds [tab CON, term]. A mon-level ensure
        # *after* that (same RunSteps batch) has been observed to flatten
        # mon1 tab groups on partial reopen (left-chrome): moves + TABBED
        # join succeed, then mon HSPLIT on the term anchor leaves YT/Gmail/
        # Voice mon-direct again. Skip mon ensure when nested structure for
        # this mon is also planned this pass — mon kids are owned by nested
        # ensure + ensure_order. Peel / split-mismatch still force mon ensure.
        nested_structure_mons = {
            str(slot).split(".", 1)[0]
            for slot in slots_needing_layout
            if isinstance(slot, str) and "." in slot
        }
        if has_mon_ensure:
            for mon_key, mon_body in prof.get("layout", {}).items():
                if mon_key not in mons_with_placement:
                    continue
                if mon_key in mon_child_peel_mons:
                    # Peel demote already rewrote mon bag; skip second mon ensure.
                    continue
                if mon_key in nested_structure_mons and mon_key not in mons_split_mismatch:
                    continue
                if not isinstance(mon_body, dict):
                    continue
                split = mon_body.get("split")
                if not split:
                    continue
                anchors = _mon_split_anchor_ids(role_results, mon_key, prof)
                if not anchors:
                    continue
                mon_ensure_actions.append({
                    "op": "ensure_layout",
                    "slot": mon_key,
                    "mode": split,
                    "windowIds": anchors,
                })

    # de-dupe ensure by slot (first wins — peel demote before structure before mon)
    ensure_actions = (peel_demote_actions + structure_ensure_actions +
                      mon_ensure_actions)
    seen_ensure: set[str] = set()
    deduped_ensure: list[dict[str, Any]] = []
    for a in ensure_actions:
        key = a["slot"]
        if key in seen_ensure:
            continue
        seen_ensure.add(key)
        deduped_ensure.append(a)

    # Active tab/stack + profile focus → focus ops after structure settles.
    # Survivor open-leaf when profile omits active (bare-array reopen).
    # Cold empty: focus after maps (residual replan); no focus without windowId.
    focus_actions = _focus_actions_from_profile(
        prof,
        role_results,
        forest=forest,
        just_opened_roles=opened_roles,
    )
    counts["focused"] = len(focus_actions)
    if focus_actions:
        has_work = True

    # CT0 phase order (one plan model):
    # skeleton → structure ensure → role open/move → bind → P5 residual close/park
    # → order → size → focus. Bind barrier before residual close/park.
    # Role place before mon order so ensure_order sees co-located mon-directs.
    final_actions = (skeleton_actions + deduped_ensure + actions +
                     bind_actions + residual_actions + order_actions +
                     size_actions + focus_actions)
    nothing = not has_work
    thrash_risk = _compute_thrash_risk(final_actions, counts)

    return {
        "ok": True,
        "workspace": workspace,
        "nothingToDo": nothing,
        "counts": counts,
        "roles": role_results,
        "actions": final_actions,
        "structureMatch": bool(structure_cmp.get("match")),
        "structureMismatches": list(structure_cmp.get("mismatches") or []),
        "kept": kept,
        "left": left,
        "unclaimed": unclaimed,
        "clean": clean,
        "keepOthers": keep_others,
        "safe": safe,
        "coldEmpty": cold_empty,
        "thrashRisk": thrash_risk,
        "thrashState": thrash_state,
    }


# AC4 / CT1: layout placeholders (not claimable apps).
_PLACEHOLDER_WM_CLASS = "forge-placeholder"
_PH_TITLE_RE = re.compile(r"^forge-ph:(?P<slot>[^:]+):(?P<role>.+)$",
                          re.IGNORECASE)


def _is_placeholder_window_node(n: dict[str, Any]) -> bool:
    """True for GetTree WINDOW leaves that are layout/ thrash placeholders."""
    if n.get("placeholder") is True:
        return True
    wm = n.get("wmClass") or n.get("wm_class")
    if wm == _PLACEHOLDER_WM_CLASS:
        return True
    return False


def collect_layout_placeholders(
        forest: Any,
        *,
        workspace: Optional[int] = None) -> list[dict[str, Any]]:
    """
    Collect slot-tagged layout placeholders (ensure_skeleton / fail-open).

    layoutRole / layoutSlot from GetTree fields, or title forge-ph:slot:role.
    """
    if workspace is not None:
        forest = filter_forest_workspace(forest, workspace)
    out: list[dict[str, Any]] = []

    def walk(n: Any, path: str, mon_idx: Optional[int]) -> None:
        if not isinstance(n, dict):
            return
        ntype = n.get("nodeType") or n.get("type")
        if ntype == "WINDOW":
            if not _is_placeholder_window_node(n):
                return
            role = n.get("layoutRole")
            slot = n.get("layoutSlot")
            title = n.get("title")
            if (role is None or slot is None) and isinstance(title, str):
                m = _PH_TITLE_RE.match(title.strip())
                if m:
                    slot = slot or m.group("slot")
                    role = role or m.group("role")
            # Only layout-slot PHs drive bind (plain thrash PH has no tags).
            if role is None and slot is None:
                return
            out.append({
                "windowId":
                n.get("windowId"),
                "path":
                path or n.get("path"),
                "monitor": (n.get("monitor") if isinstance(
                    n.get("monitor"), int) else mon_idx),
                "layoutRole":
                str(role) if role is not None else None,
                "layoutSlot":
                str(slot) if slot is not None else None,
                "title":
                title,
                "placeholder":
                True,
            })
            return
        kids = n.get("children") or n.get("childNodes") or []
        if not isinstance(kids, list):
            return
        cur_mon = mon_idx
        mon_id = n.get("id") if ntype == "MONITOR" else None
        if ntype == "MONITOR" and isinstance(mon_id, str):
            parsed = _parse_mon_id(mon_id)
            if parsed is not None:
                cur_mon = parsed[0]
        for i, c in enumerate(kids):
            if mon_id:
                child_path = f"{mon_id}/{i}"
            elif path:
                child_path = f"{path}/{i}"
            else:
                child_path = str(i)
            walk(c, child_path, cur_mon)

    if isinstance(forest, dict):
        mons = forest.get("monitors")
        if isinstance(mons, list):
            for m in _order_monitors(mons):
                walk(m, "", None)
        else:
            walk(forest, "", None)
    elif isinstance(forest, list):
        for m in _order_monitors(forest):
            walk(m, "", None)
    return out


def build_ensure_skeleton_action(
        prof: dict[str, Any],
        *,
        workspace: int = 0) -> Optional[dict[str, Any]]:
    """
    Pure plan action: mon splits + tab/stack CONs + slot-tagged PH leaves.

    No windowIds — extension skeleton op builds the tree before maps.
    """
    layout = prof.get("layout")
    if not isinstance(layout, dict) or not layout:
        return None
    mons: list[dict[str, Any]] = []

    def child_spec(ch: dict[str, Any],
                   prefix: str) -> Optional[dict[str, Any]]:
        cid = ch.get("id")
        if cid is None or str(cid).strip() == "":
            return None
        full = f"{prefix}.{cid}"
        nested = ch.get("children")
        if isinstance(nested, list) and nested:
            kids: list[dict[str, Any]] = []
            for sub in nested:
                if isinstance(sub, dict):
                    spec = child_spec(sub, full)
                    if spec is not None:
                        kids.append(spec)
            if not kids:
                return None
            split = str(ch.get("split") or "hsplit").strip().lower()
            if split not in ("hsplit", "vsplit"):
                split = "hsplit"
            entry: dict[str, Any] = {
                "id": str(cid),
                "slot": full,
                "split": split,
                "children": kids,
            }
            shares = normalize_shares(ch.get("share") or ch.get("shares"))
            if shares is not None:
                entry["shares"] = shares
            return entry
        roles_raw = ch.get("roles") or []
        roles = [
            str(r) for r in roles_raw if r is not None and str(r).strip() != ""
        ]
        mode = str(ch.get("layout") or "").strip().lower() or None
        if mode not in ("tabbed", "stacked", "hsplit", "vsplit", None):
            mode = None
        if len(roles) > 1 and mode not in ("tabbed", "stacked", "hsplit",
                                           "vsplit"):
            mode = "tabbed"
        elif len(roles) <= 1:
            # Mon-direct single-role unit: one PH leaf (no bag CON).
            mode = None
        entry = {
            "id": str(cid),
            "slot": full,
            "roles": roles,
        }
        if mode:
            entry["mode"] = mode
        shares = normalize_shares(ch.get("share") or ch.get("shares"))
        if shares is not None:
            entry["shares"] = shares
        return entry

    for mon_key in sorted(layout.keys(), key=_layout_mon_sort_key):
        mon_body = layout[mon_key]
        if not isinstance(mon_body, dict):
            continue
        mon_i = mon_index_from_slot(str(mon_key))
        if mon_i is None:
            continue
        children_out: list[dict[str, Any]] = []
        for ch in mon_body.get("children") or []:
            if not isinstance(ch, dict):
                continue
            spec = child_spec(ch, str(mon_key))
            if spec is not None:
                children_out.append(spec)
        if not children_out:
            continue
        split = str(mon_body.get("split") or "hsplit").strip().lower()
        if split not in ("hsplit", "vsplit"):
            split = "hsplit"
        mon_entry: dict[str, Any] = {
            "mon": mon_i,
            "slot": str(mon_key),
            "split": split,
            "children": children_out,
        }
        shares = normalize_shares(
            mon_body.get("share") or mon_body.get("shares"))
        if shares is not None:
            mon_entry["shares"] = shares
        mons.append(mon_entry)

    if not mons:
        return None
    return {
        "op": "ensure_skeleton",
        "workspace": int(workspace),
        "mons": mons,
    }


def build_bind_actions(
    role_results: list[dict[str, Any]],
    placeholders: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Map claimed roles onto layoutRole/layoutSlot placeholders (bind ops)."""
    by_role: dict[str, dict[str, Any]] = {}
    by_slot_role: dict[tuple[str, str], dict[str, Any]] = {}
    for ph in placeholders:
        if not isinstance(ph, dict):
            continue
        role = ph.get("layoutRole")
        slot = ph.get("layoutSlot")
        if role is not None and str(role).strip() != "":
            by_role.setdefault(str(role), ph)
        if (role is not None and slot is not None and str(role).strip() != ""
                and str(slot).strip() != ""):
            by_slot_role.setdefault((str(slot), str(role)), ph)

    out: list[dict[str, Any]] = []
    used_ph: set[str] = set()
    for r in role_results:
        if not isinstance(r, dict):
            continue
        rid = r.get("id")
        wid = r.get("windowId")
        if rid is None or wid is None or str(wid).strip() == "":
            continue
        slot = str(r.get("slot") or "")
        ph = by_slot_role.get((slot, str(rid))) or by_role.get(str(rid))
        if ph is None:
            continue
        ph_id = ph.get("windowId")
        ph_key = str(ph_id if ph_id is not None else ph.get("path") or id(ph))
        if ph_key in used_ph:
            continue
        used_ph.add(ph_key)
        act: dict[str, Any] = {
            "op": "bind",
            "role": rid,
            "slot": slot,
            "windowId": wid,
            "layoutRole": str(ph.get("layoutRole") or rid),
            "layoutSlot": str(ph.get("layoutSlot") or slot),
        }
        if ph_id is not None:
            act["placeholderId"] = ph_id
        out.append(act)
    return out


def collect_windows(forest: Any,
                    *,
                    workspace: Optional[int] = None) -> list[dict[str, Any]]:
    """
    Collect WINDOW nodes with path + monitor.

    workspace: when set, only windows under moNws{workspace} MONITOR roots.
    None walks every mon root (caller may pre-filter via filter_forest_workspace).

    Placeholders (AC4 / layout skeleton) are excluded — not claimable apps.
    """
    if workspace is not None:
        forest = filter_forest_workspace(forest, workspace)
    out: list[dict[str, Any]] = []

    def walk(n: Any, path: str, mon_idx: Optional[int]) -> None:
        if not isinstance(n, dict):
            return
        ntype = n.get("nodeType") or n.get("type")
        if ntype == "WINDOW":
            if _is_placeholder_window_node(n):
                return
            w = {
                "windowId":
                n.get("windowId"),
                "wmClass":
                n.get("wmClass") or n.get("wm_class"),
                "title":
                n.get("title"),
                "path":
                path or n.get("path"),
                "monitor":
                n.get("monitor")
                if isinstance(n.get("monitor"), int) else mon_idx,
                "mode":
                n.get("mode"),
                "pid":
                n.get("pid"),
            }
            rect = n.get("rect")
            if isinstance(rect, dict):
                w["rect"] = rect
            if w["windowId"] is None and not w.get("path"):
                return
            out.append(w)
            kids = n.get("children") or n.get("childNodes") or []
            if isinstance(kids, list):
                for i, c in enumerate(kids):
                    walk(c, f"{path}/{i}" if path else str(i), mon_idx)
            return
        kids = n.get("children") or n.get("childNodes") or []
        if not isinstance(kids, list):
            return
        cur_mon = mon_idx
        mon_id = n.get("id") if ntype == "MONITOR" else None
        if ntype == "MONITOR" and isinstance(mon_id, str):
            parsed = _parse_mon_id(mon_id)
            if parsed is not None:
                cur_mon = parsed[0]
        for i, c in enumerate(kids):
            if mon_id:
                child_path = f"{mon_id}/{i}"
            elif path:
                child_path = f"{path}/{i}"
            else:
                child_path = str(i)
            walk(c, child_path, cur_mon)

    if isinstance(forest, dict):
        mons = forest.get("monitors")
        if isinstance(mons, list):
            # Prefer workspace-0 monitors first (stable claim order), then rest
            ordered = _order_monitors(mons)
            for m in ordered:
                walk(m, "", None)
        else:
            walk(forest, "", None)
    elif isinstance(forest, list):
        for m in _order_monitors(forest):
            walk(m, "", None)
    if isinstance(forest, dict):
        seen = {str(w.get("windowId")) for w in out if w.get("windowId") is not None}
        for extra in (forest.get("orphanWindows") or []) + (forest.get("metaWindows") or []):
            if not isinstance(extra, dict):
                continue
            if extra.get("placeholder") is True:
                continue
            if extra.get("tracked") is False:
                continue
            wid = extra.get("windowId")
            if wid is None or str(wid) in seen:
                continue
            seen.add(str(wid))
            out.append({
                "windowId": wid,
                "wmClass": extra.get("wmClass") or extra.get("wm_class"),
                "title": extra.get("title"),
                "path": extra.get("path"),
                "monitor": extra.get("monitor")
                if isinstance(extra.get("monitor"), int) else None,
                "mode": extra.get("mode"),
                "pid": extra.get("pid"),
            })
    return out


def _order_monitors(mons: list[Any]) -> list[Any]:
    """Workspace 0 (moNws0) first, then higher workspaces; stable by mon index."""

    def key(m: Any) -> tuple:
        if not isinstance(m, dict):
            return (99, 99, "")
        mid = m.get("id") or ""
        parsed = _parse_mon_id(str(mid)) if mid else None
        if parsed:
            mon_i, ws = parsed
            return (ws, mon_i, str(mid))
        return (50, 50, str(mid))

    return sorted(mons, key=key)


def _parse_mon_id(mon_id: str) -> Optional[tuple[int, int]]:
    m = _MON_ID_RE.match(mon_id)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def mon_index_from_slot(slot: str) -> Optional[int]:
    """mon0.left-tab → 0; mon1 → 1; primary → 0. (stableKey/alias resolved pre-plan)."""
    if not slot:
        return None
    head, _rest = mon_head_and_rest(slot)
    if not head:
        return None
    if head == "primary":
        return 0
    mm = _MON_KEY_RE.match(head)
    if mm:
        return int(mm.group(1))
    return None


def forest_stable_key_map(forest: Any) -> dict[str, int]:
    """stableKey → mon index from GetTree forest (ws0 preferred when duplicate)."""
    out: dict[str, int] = {}
    for m in _iter_forest_monitors(forest):
        if not isinstance(m, dict):
            continue
        sk = m.get("stableKey")
        if not isinstance(sk, str) or not sk.strip():
            continue
        sk = sk.strip()
        idx = _monitor_node_index(m)
        if idx is None:
            continue
        if sk not in out:
            out[sk] = idx
    return out


def _iter_forest_monitors(forest: Any) -> list[Any]:
    if isinstance(forest, dict):
        mons = forest.get("monitors")
        if isinstance(mons, list):
            return _order_monitors(mons)
        return [forest]
    if isinstance(forest, list):
        return _order_monitors(forest)
    return []


def _monitor_node_index(m: dict[str, Any]) -> Optional[int]:
    mid = m.get("id")
    if isinstance(mid, str):
        parsed = _parse_mon_id(mid)
        if parsed is not None:
            return parsed[0]
    mon = m.get("monitor")
    if isinstance(mon, int) and mon >= 0:
        return mon
    return None


def _primary_mon_index(forest: Any) -> int:
    for m in _iter_forest_monitors(forest):
        if not isinstance(m, dict):
            continue
        sk = m.get("stableKey") or ""
        if m.get("isPrimary") is True or (isinstance(sk, str)
                                          and "#primary" in sk):
            idx = _monitor_node_index(m)
            if idx is not None:
                return idx
    return 0


def resolve_mon_key(
    key: str,
    forest: Any,
    aliases: Optional[dict[str, str]] = None,
) -> int:
    """
    Resolve monN / primary / left|right|top|bottom / stableKey / alias → index.
    Raises ValueError listing available stableKeys when unknown.
    """
    if not key or not str(key).strip():
        raise ValueError("empty monitor key")
    key = str(key).strip()
    aliases = aliases or {}

    if key == "primary":
        return _primary_mon_index(forest)

    mm = _MON_KEY_RE.match(key)
    if mm:
        return int(mm.group(1))

    # Profile monitors aliases win over builtin geometry roles (left/right/…).
    if key in aliases:
        return resolve_mon_key(aliases[key], forest, aliases={})

    if _is_geom_role_key(key):
        return _geom_role_mon_index(key, forest)

    sk_map = forest_stable_key_map(forest)
    if key in sk_map:
        return sk_map[key]

    available = ", ".join(sorted(sk_map.keys())) or "(none)"
    alias_hint = ""
    if aliases:
        alias_hint = f"; profile aliases: {', '.join(sorted(aliases))}"
    raise ValueError(f"monitor key {key!r} not in forest "
                     f"(available stableKeys: {available}{alias_hint}; "
                     f"also monN / primary / left|right|top|bottom)")


def _geom_role_mon_index(role: str, forest: Any) -> int:
    """left/right by x; top/bottom by y (Meta index via geometry)."""
    idxs = forest_mon_indices_left_to_right(forest)
    if not idxs:
        return 0
    if role == "left":
        return idxs[0]
    if role == "right":
        return idxs[-1]
    # top / bottom: re-sort by y then x
    best: dict[int, tuple[float, float]] = {}
    for m in _iter_forest_monitors(forest):
        if not isinstance(m, dict):
            continue
        idx = _monitor_node_index(m)
        if idx is None:
            continue
        rect = _mon_node_rect(m)
        if rect:
            x, y = float(rect["x"]), float(rect["y"])
        else:
            x, y = float(idx) * 1_000_000.0, 0.0
        prev = best.get(idx)
        if prev is None or (y, x) < prev:
            best[idx] = (y, x)
    ordered = [
        i for i, _xy in sorted(best.items(),
                               key=lambda kv: (kv[1][0], kv[1][1], kv[0]))
    ]
    if not ordered:
        return idxs[0]
    if role == "top":
        return ordered[0]
    return ordered[-1]


def resolve_mon_key_to_monN(
    key: str,
    forest: Any,
    aliases: Optional[dict[str, str]] = None,
) -> str:
    return f"mon{resolve_mon_key(key, forest, aliases)}"


def _rewrite_slot_mon(
    slot: str,
    forest: Any,
    aliases: dict[str, str],
    cache: dict[str, str],
    known_heads: Iterable[str],
) -> str:
    head, rest = mon_head_and_rest(slot, known_heads=known_heads)
    if not head:
        return slot
    if head not in cache:
        cache[head] = resolve_mon_key_to_monN(head, forest, aliases)
    mon_n = cache[head]
    if rest is None or rest == "":
        return mon_n
    return f"{mon_n}.{rest}"


def resolve_profile_mon_keys(profile: dict[str, Any],
                             forest: Any) -> dict[str, Any]:
    """
    Deep-copy profile and rewrite layout keys / role slots / overflow to monN
    using forest stableKeys and optional profile monitors aliases.
    """
    out = copy.deepcopy(profile)
    aliases_raw = out.get("monitors") if isinstance(out.get("monitors"),
                                                    dict) else {}
    aliases = {str(k): str(v) for k, v in aliases_raw.items()}
    cache: dict[str, str] = {}
    sk_map = forest_stable_key_map(forest)
    known_heads = set(sk_map.keys()) | set(
        aliases.keys()) | set(_GEOM_ROLE_KEYS)
    if isinstance(out.get("layout"), dict):
        known_heads |= {str(k) for k in out["layout"].keys()}

    layout_in = out.get("layout")
    if isinstance(layout_in, dict):
        new_layout: dict[str, Any] = {}
        for mon_key, mon_body in layout_in.items():
            mon_n = cache.get(str(mon_key)) or resolve_mon_key_to_monN(
                str(mon_key), forest, aliases)
            cache[str(mon_key)] = mon_n
            if mon_n in new_layout:
                raise ValueError(
                    f"monitor keys {mon_key!r} and another key both resolve to {mon_n}"
                )
            new_layout[mon_n] = mon_body
        out["layout"] = new_layout

    for role in out.get("roles") or []:
        if not isinstance(role, dict):
            continue
        slot = role.get("slot")
        if isinstance(slot, str) and slot.strip():
            role["slot"] = _rewrite_slot_mon(slot.strip(), forest, aliases,
                                             cache, known_heads)

    overflow = out.get("overflow")
    if isinstance(overflow, dict):
        oslot = overflow.get("slot")
        if isinstance(oslot, str) and oslot.strip():
            overflow["slot"] = _rewrite_slot_mon(oslot.strip(), forest,
                                                 aliases, cache, known_heads)

    out.pop("monitors", None)
    return out


def window_monitor_index(w: dict[str, Any]) -> Optional[int]:
    # Tree path is authoritative after Move (meta monitor can lag).
    path = w.get("path") or ""
    if isinstance(path, str) and path:
        first = path.split("/")[0]
        parsed = _parse_mon_id(first)
        if parsed:
            return parsed[0]
    mon = w.get("monitor")
    if isinstance(mon, int) and mon >= 0:
        return mon
    return None


def window_matches(w: dict[str, Any], match: dict[str, Any]) -> bool:
    """True if window satisfies all match fields (AND). mon is preference only."""
    cls_want = match.get("class")
    if cls_want is not None:
        got = w.get("wmClass") or w.get("wm_class") or ""
        if not _class_eq(got, cls_want):
            return False

    if "title" in match:
        title = w.get("title")
        if title is None or str(title) != match["title"]:
            return False

    if "title~=" in match:
        body = match["title~="]
        title = w.get("title")
        if title is None:
            return False
        title_s = str(title)
        if body.startswith("/"):
            try:
                source, flags = _parse_regex_literal(body)
            except ValueError:
                return False
            try:
                cre = re.compile(source, _re_flags(flags))
            except re.error:
                return False
            if not cre.search(title_s):
                return False
        else:
            if body not in title_s:
                return False

    return True


def _floating_cell_to_match(cell: Any) -> Optional[dict[str, Any]]:
    """Role-cell sugar → match dict for floating claim (no open required)."""
    if isinstance(cell, str):
        token = cell.strip()
        if not token:
            return None
        _open_spec, match = _infer_open_and_match(token)
        return match if isinstance(match, dict) and match else None
    if not isinstance(cell, dict):
        return None
    match = cell.get("match")
    if isinstance(match, str) and match.strip():
        return {"class": match.strip()}
    if isinstance(match, dict) and match:
        return dict(match)
    flat: dict[str, Any] = {}
    if cell.get("class") is not None:
        flat["class"] = cell.get("class")
    if cell.get("title~=") is not None:
        flat["title~="] = cell.get("title~=")
    elif cell.get("title") is not None:
        flat["title"] = cell.get("title")
    if flat:
        return flat
    app = cell.get("app")
    if app is not None and str(app).strip():
        _open_spec, match = _infer_open_and_match(str(app).strip())
        if isinstance(match, dict) and match:
            return match
    return None


def _claim_floating_windows(
    floating: Any,
    windows: list[dict[str, Any]],
    claimed: set[str],
) -> int:
    """
    Mark windows matching profile floating[] as claimed (no open/structure).

    Returns number of windows claimed. Each floating cell claims at most one
    free match so clean residuals leave Guake / other floats alone.
    """
    if not isinstance(floating, list) or not floating:
        return 0
    n = 0
    for cell in floating:
        match = _floating_cell_to_match(cell)
        if not match:
            continue
        candidates = [
            w for w in windows
            if _window_key(w) not in claimed and window_matches(w, match)
        ]
        if not candidates:
            continue
        # Prefer FLOAT mode when present (Guake vs accidental title match).
        floats = [
            w for w in candidates
            if str(w.get("mode") or "").upper() == "FLOAT"
        ]
        pick = floats[0] if floats else candidates[0]
        key = _window_key(pick)
        if key:
            claimed.add(key)
            n += 1
    return n


def _match_mon_pref(match: dict[str, Any],
                    slot_mon: Optional[int]) -> Optional[int]:
    mon = match.get("mon")
    if mon is None or mon == "":
        return slot_mon
    if isinstance(mon, int):
        return mon
    s = str(mon).strip()
    if s.isdigit():
        return int(s)
    if s.startswith("mo") and s[2:].isdigit():
        return int(s[2:])
    mm = _MON_KEY_RE.match(s)
    if mm:
        return int(mm.group(1))
    parsed = _parse_mon_id(s)
    if parsed:
        return parsed[0]
    return slot_mon


def _pick_window(
    candidates: list[dict[str, Any]],
    pref_mon: Optional[int],
    *,
    mon_only: bool = False,
) -> Optional[dict[str, Any]]:
    if not candidates:
        return None
    if pref_mon is not None:
        on_mon = [w for w in candidates if window_monitor_index(w) == pref_mon]
        if on_mon:
            return on_mon[0]
        if mon_only:
            return None
    elif mon_only:
        return None
    return candidates[0]


def _two_pass_claim_windows(
        roles: list[dict[str, Any]],
        windows: list[dict[str, Any]]) -> list[Optional[dict[str, Any]]]:
    """
    Assign windows to roles without earlier slots stealing later mons.

    Pass 1: claim only candidates already on preferred mon.
    Pass 2: fill remaining roles from leftover candidates (any mon), else None.
    """
    claimed: set[str] = set()
    chosen: list[Optional[dict[str, Any]]] = [None] * len(roles)

    def free_matches(role: dict[str, Any]) -> list[dict[str, Any]]:
        match = role.get("match") or {}
        return [
            w for w in windows
            if _window_key(w) not in claimed and window_matches(w, match)
        ]

    def pref_for(role: dict[str, Any]) -> Optional[int]:
        slot = str(role.get("slot") or "")
        desired_mon = mon_index_from_slot(slot)
        return _match_mon_pref(role.get("match") or {}, desired_mon)

    for i, role in enumerate(roles):
        pick = _pick_window(free_matches(role), pref_for(role), mon_only=True)
        if pick is not None:
            chosen[i] = pick
            claimed.add(_window_key(pick))

    for i, role in enumerate(roles):
        if chosen[i] is not None:
            continue
        pick = _pick_window(free_matches(role), pref_for(role), mon_only=False)
        if pick is not None:
            chosen[i] = pick
            claimed.add(_window_key(pick))

    return chosen


def _role_class_want(role: dict[str, Any]) -> Optional[str]:
    """Class token for leftover claim: match.class, else open.wmClass."""
    match = role.get("match") if isinstance(role.get("match"), dict) else {}
    cls = match.get("class") or match.get("wmClass") or match.get("wm_class")
    if cls is not None and str(cls).strip():
        return str(cls).strip()
    open_spec = role.get("open") if isinstance(role.get("open"), dict) else {}
    cls = open_spec.get("wmClass") or open_spec.get("wm_class")
    if cls is not None and str(cls).strip():
        return str(cls).strip()
    return None


def _claim_class_only_windows(
        roles: list[dict[str, Any]],
        windows: list[dict[str, Any]],
        chosen: list[Optional[dict[str, Any]]],
) -> list[Optional[dict[str, Any]]]:
    """
    After title match + pins, give leftover class-matching windows to
    still-unclaimed roles so a second apply reuses a New Tab PWA.
    """
    if not roles or not windows:
        return chosen
    claimed: set[str] = set()
    for w in chosen:
        if w is not None:
            claimed.add(_window_key(w))
    out = list(chosen)

    def pref_for(role: dict[str, Any]) -> Optional[int]:
        slot = str(role.get("slot") or "")
        desired_mon = mon_index_from_slot(slot)
        return _match_mon_pref(role.get("match") or {}, desired_mon)

    for i, role in enumerate(roles):
        if out[i] is not None:
            continue
        want = _role_class_want(role)
        if not want:
            continue
        candidates = []
        for w in windows:
            if not isinstance(w, dict) or _window_key(w) in claimed:
                continue
            if w.get("placeholder") is True:
                continue
            got = w.get("wmClass") or w.get("wm_class") or ""
            if str(got).casefold().startswith("forge-placeholder"):
                continue
            if _class_eq(got, want):
                candidates.append(w)
        pick = _pick_window(candidates, pref_for(role), mon_only=False)
        if pick is None:
            continue
        out[i] = pick
        claimed.add(_window_key(pick))
    return out


def _normalize_role_pins(
        role_pins: Optional[dict[str, Any]]) -> dict[str, Any]:
    """role id → windowId (skip empty)."""
    if not isinstance(role_pins, dict):
        return {}
    out: dict[str, Any] = {}
    for rid, wid in role_pins.items():
        if rid is None or wid is None or str(wid).strip() == "":
            continue
        key = str(rid).strip()
        if key:
            out[key] = wid
    return out


def _apply_role_pins(
    roles: list[dict[str, Any]],
    windows: list[dict[str, Any]],
    chosen: list[Optional[dict[str, Any]]],
    role_pins: dict[str, Any],
) -> list[Optional[dict[str, Any]]]:
    """
    Force-claim windows by id for roles still unclaimed after match-based claim.

    Used after open: chrome may map with title "New Tab" while match wants
    title~= Google Chrome — pin from launch wait still binds the role.
    """
    if not role_pins:
        return chosen
    by_wid: dict[str, dict[str, Any]] = {}
    for w in windows:
        wid = w.get("windowId")
        if wid is not None and str(wid).strip() != "":
            by_wid[str(wid)] = w
    claimed: set[str] = set()
    for w in chosen:
        if w is not None:
            claimed.add(_window_key(w))
    out = list(chosen)
    for i, role in enumerate(roles):
        if out[i] is not None:
            continue
        rid = role.get("id")
        if rid is None:
            continue
        pin = role_pins.get(str(rid))
        if pin is None:
            continue
        w = by_wid.get(str(pin))
        if w is None:
            continue
        key = _window_key(w)
        if key in claimed:
            continue
        out[i] = w
        claimed.add(key)
    return out


def _slot_mon_key(slot: Any) -> Optional[str]:
    """mon0.s0 → mon0; mon1 → mon1."""
    if slot is None:
        return None
    s = str(slot).strip()
    if not s:
        return None
    head = s.split(".", 1)[0]
    if _MON_KEY_RE.match(head) or head == "primary":
        return head
    return None


def _is_chrome_browser_class(s: str) -> bool:
    """Google-chrome / Chromium family (not a PWA instance id)."""
    n = (s or "").strip().casefold()
    if not n:
        return False
    if n in ("google-chrome", "chromium", "chromium-browser", "chrome"):
        return True
    if n.startswith("google-chrome-"):
        return True
    return False


def _chrome_pwa_app_id(s: str) -> Optional[str]:
    """Shared id for crx_<id> and chrome-<id>-Default / profile-ish."""
    n = (s or "").strip().casefold()
    if not n:
        return None
    if n.startswith("crx_") and len(n) > 4:
        return n[4:]
    if not n.startswith("chrome-"):
        return None
    rest = n[len("chrome-"):]
    if rest.endswith("-default") and len(rest) > len("-default"):
        return rest[:-len("-default")]
    m = re.match(r"^(.+)-profile(?:[._-].+)?$", rest)
    if m and m.group(1):
        return m.group(1)
    return None


def _is_chrome_pwa_class(s: str) -> bool:
    return _chrome_pwa_app_id(s) is not None


def _is_chrome_family_class(s: str) -> bool:
    return _is_chrome_browser_class(s) or _is_chrome_pwa_class(s)


def _class_eq(a: Any, b: Any) -> bool:
    """Casefold + reverse-DNS stem + browser↔PWA / same PWA id / browser↔browser."""
    if a is None or b is None:
        return False
    sa = str(a).strip().casefold()
    sb = str(b).strip().casefold()
    if not sa or not sb:
        return False
    if sa == sb:
        return True
    # Sugar stem: "ghostty" matches "com.mitchellh.ghostty" (either side).
    if sa.endswith("." + sb) or sb.endswith("." + sa):
        return True
    a_id = _chrome_pwa_app_id(sa)
    b_id = _chrome_pwa_app_id(sb)
    if a_id and b_id and a_id == b_id:
        return True
    # Browser ↔ PWA (either side); browser ↔ browser. Never distinct PWA ↔ PWA.
    a_browser = _is_chrome_browser_class(sa)
    b_browser = _is_chrome_browser_class(sb)
    a_pwa = _is_chrome_pwa_class(sa)
    b_pwa = _is_chrome_pwa_class(sb)
    if (a_browser and b_pwa) or (a_pwa and b_browser):
        return True
    if a_browser and b_browser:
        return True
    return False


def _window_key(w: dict[str, Any]) -> str:
    wid = w.get("windowId")
    if wid is not None:
        return f"id:{wid}"
    return f"path:{w.get('path')}"


def _window_summary(w: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {
        "windowId": w.get("windowId"),
        "path": w.get("path"),
        "wmClass": w.get("wmClass") or w.get("wm_class"),
        "title": w.get("title"),
    }
    mon = window_monitor_index(w)
    if mon is not None:
        out["monitor"] = mon
    return out


def _focus_actions_from_profile(
    prof: dict[str, Any],
    role_results: list[dict[str, Any]],
    *,
    forest: Any = None,
    just_opened_roles: Optional[set[str]] = None,
) -> list[dict[str, Any]]:
    """
    Emit focus ops for tab/stack active leaves, then profile-level focus.

    Order: group actives first (sets lastTabFocus), then survivor open-leaf
    when profile omits active, then profile focus (keyboard).

    Survivor rule (bare-array reopen): when a tab/stack has no profile
    `active`, keep the open leaf on a pre-existing group member rather than
    a role just opened into the group. Prefer live lastTabFocus among
    survivors; else the sole survivor; else first survivor in profile order.

    Skips roles still opening (no windowId yet) — follow-up replan covers them.
    """
    by_id = {
        str(r.get("id")): r
        for r in role_results if r.get("id") is not None
    }
    actions: list[dict[str, Any]] = []
    seen_sels: set[str] = set()
    opened = just_opened_roles or set()
    last_tab_by_wid = _last_tab_focus_window_ids(
        forest) if forest is not None else set()

    def add_role_focus(rid: Any, *, reason: str) -> None:
        if rid is None:
            return
        key = str(rid)
        r = by_id.get(key)
        if not r:
            return
        wid = r.get("windowId")
        if wid is None or wid == "":
            return
        sel = f"id:{wid}"
        if sel in seen_sels:
            return
        seen_sels.add(sel)
        actions.append({
            "op": "focus",
            "selector": sel,
            "role": key,
            "reason": reason,
        })

    def walk(children: Any) -> None:
        if not isinstance(children, list):
            return
        for ch in children:
            if not isinstance(ch, dict):
                continue
            nested = ch.get("children")
            if isinstance(nested, list) and nested:
                walk(nested)
            lay = str(ch.get("layout") or "").strip().lower()
            roles_list = ch.get("roles") if isinstance(ch.get("roles"),
                                                       list) else []
            is_group = lay in ("tabbed", "stacked") or len(roles_list) >= 2
            if not is_group:
                continue
            active = ch.get("active")
            if active is not None and str(active).strip():
                add_role_focus(str(active).strip(), reason="active")
                continue
            # No profile active: preserve survivor open leaf when companions join.
            survivor = _pick_survivor_open_role(roles_list, by_id, opened,
                                                last_tab_by_wid)
            if survivor is not None:
                add_role_focus(survivor, reason="survivor")

    for mon_body in (prof.get("layout") or {}).values():
        if isinstance(mon_body, dict):
            walk(mon_body.get("children"))

    focus = prof.get("focus")
    if focus is not None and str(focus).strip():
        add_role_focus(str(focus).strip(), reason="profile")

    return actions


def _last_tab_focus_window_ids(forest: Any) -> set[str]:
    """Collect lastTabFocusId values from CON/MONITOR nodes in a forest."""
    out: set[str] = set()

    def walk(n: Any) -> None:
        if not isinstance(n, dict):
            return
        tf = n.get("lastTabFocusId")
        if tf is not None and str(tf).strip() != "":
            out.add(str(tf))
        for c in n.get("children") or n.get("childNodes") or []:
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


def _pick_survivor_open_role(
    role_ids: list[Any],
    by_id: dict[str, dict[str, Any]],
    just_opened: set[str],
    last_tab_focus_wids: set[str],
) -> Optional[str]:
    """
    Role id to keep open when profile has no active and companions (re)join.

    Survivors = claimed roles not in just_opened and not still open-without-id.
    Only emits when at least one companion is joining (open status or just_opened).
    """
    members: list[dict[str, Any]] = []
    for rid in role_ids:
        if rid is None:
            continue
        r = by_id.get(str(rid))
        if r:
            members.append(r)
    if len(members) < 2:
        return None

    joining = False
    survivors: list[dict[str, Any]] = []
    for r in members:
        rid = str(r.get("id"))
        status = str(r.get("status") or "")
        is_open_status = status == "open"
        is_just_opened = rid in just_opened
        if is_open_status or is_just_opened:
            joining = True
        wid = r.get("windowId")
        if wid is None or str(wid).strip() == "":
            continue
        if is_open_status or is_just_opened:
            continue
        survivors.append(r)

    if not joining or not survivors:
        return None

    # Prefer live lastTabFocus when it still names a survivor.
    for r in survivors:
        if str(r.get("windowId")) in last_tab_focus_wids:
            return str(r.get("id"))
    # Sole survivor, else first in profile order.
    return str(survivors[0].get("id"))


def _slot_layout_modes(prof: dict[str, Any]) -> dict[str, str]:
    """Map full slot (mon0.left-tab / mon0.s1) → layout mode when specified."""
    modes: dict[str, str] = {}

    def walk(children: Any, prefix: str) -> None:
        if not isinstance(children, list):
            return
        for ch in children:
            if not isinstance(ch, dict) or not ch.get("id"):
                continue
            full = f"{prefix}.{ch['id']}"
            nested = ch.get("children")
            if isinstance(nested, list) and nested:
                # Nested h/v split container (not only leaf tab/stack bags).
                split = str(ch.get("split") or "").strip().lower()
                if split in ("hsplit", "vsplit"):
                    modes[full] = split
                walk(nested, full)
                continue
            if ch.get("layout"):
                modes[full] = ch["layout"]
            elif ch.get("roles") and len(ch.get("roles") or []) > 1:
                modes[full] = "tabbed"

    for mon_key, mon_body in prof.get("layout", {}).items():
        if isinstance(mon_body, dict):
            walk(mon_body.get("children") or [], mon_key)
    overflow = prof.get("overflow") or {}
    if overflow.get("slot") and overflow.get("layout"):
        modes.setdefault(overflow["slot"], overflow["layout"])
    return modes


def _role_window_ids_for_slot(role_results: list[dict[str, Any]],
                              slot: str) -> list[Any]:
    """Ordered windowIds for claimed roles targeting slot (profile order)."""
    out: list[Any] = []
    for r in role_results:
        if r.get("slot") != slot:
            continue
        wid = r.get("windowId")
        if wid is None or str(wid).strip() == "":
            continue
        out.append(wid)
    return out


def _role_window_ids_for_slot_prefix(role_results: list[dict[str, Any]],
                                     slot_prefix: str) -> list[Any]:
    """
    Claimed role windowIds under slot or any nested leaf (mon0.s1 → ghostty,
    nautilus under mon0.s1.*). Profile order.
    """
    out: list[Any] = []
    prefix = str(slot_prefix or "")
    if not prefix:
        return out
    for r in role_results:
        s = str(r.get("slot") or "")
        if s != prefix and not s.startswith(prefix + "."):
            continue
        wid = r.get("windowId")
        if wid is None or str(wid).strip() == "":
            continue
        out.append(wid)
    return out


def _parent_hv_split_slot(slot: str,
                          layout_slot_modes: dict[str, str]) -> Optional[str]:
    """Nearest ancestor (incl. self) with hsplit/vsplit mode; None if none."""
    if not slot or "." not in slot:
        return None
    parts = str(slot).split(".")
    # mon0.s1.nautilus → try mon0.s1.nautilus, mon0.s1 (not bare mon0)
    for i in range(len(parts), 1, -1):
        cand = ".".join(parts[:i])
        mode = str(layout_slot_modes.get(cand) or "").strip().lower()
        if mode in ("hsplit", "vsplit"):
            return cand
    return None


def _mark_layout_slots_for_role(
    slot: str,
    layout_slot_modes: dict[str, str],
    slots_needing_layout: dict[str, str],
) -> None:
    """Mark exact slot mode + parent nested h/v split containers for open/move."""
    if not slot:
        return
    mode = layout_slot_modes.get(slot)
    if mode:
        slots_needing_layout[slot] = mode
    parent = _parent_hv_split_slot(slot, layout_slot_modes)
    if parent:
        pmode = layout_slot_modes.get(parent)
        if pmode:
            slots_needing_layout[parent] = pmode


def _nested_split_join_dest(
    roles: list[dict[str, Any]],
    role_windows: list[Optional[dict[str, Any]]],
    slot: str,
    layout_slot_modes: dict[str, str],
    exclude_role_id: Any,
) -> Optional[Any]:
    """
    Claimed sibling windowId under the same nested h/v split parent.

    Used as move destWindowId so rehome joins under ghostty, not mon root.
    """
    parent = _parent_hv_split_slot(slot, layout_slot_modes)
    if not parent:
        return None
    exclude = str(exclude_role_id) if exclude_role_id is not None else ""
    for role, win in zip(roles, role_windows):
        if not isinstance(role, dict) or win is None:
            continue
        rid = role.get("id")
        if rid is not None and str(rid) == exclude:
            continue
        rslot = str(role.get("slot") or "")
        if rslot != parent and not rslot.startswith(parent + "."):
            continue
        wid = win.get("windowId")
        if wid is None or str(wid).strip() == "":
            continue
        return wid
    return None


def _mon_child_loc(path: Any) -> Optional[tuple[str, int]]:
    """(mon_id, mon-level child index) from a tree path like mo1ws0/0 or mo1ws0/3/1."""
    if path is None:
        return None
    parts = str(path).split("/")
    if len(parts) < 2 or not parts[0]:
        return None
    try:
        return parts[0], int(parts[1])
    except ValueError:
        return None


def _first_role_ids_in_layout_node(node: dict[str, Any]) -> list[str]:
    """Depth-first first non-empty roles[] under a mon layout child."""
    if not isinstance(node, dict):
        return []
    roles = node.get("roles")
    if isinstance(roles, list) and roles:
        return [str(x) for x in roles]
    for sub in node.get("children") or []:
        if isinstance(sub, dict):
            found = _first_role_ids_in_layout_node(sub)
            if found:
                return found
    return []


def _mon_child_reps(role_results: list[dict[str, Any]], prof: dict[str, Any],
                    mon_key: str) -> list[Any]:
    """
    One claimed windowId per mon layout child in profile order.
    First role under that child that has a windowId (tabs → first tab role).
    """
    by_id = {
        str(r.get("id")): r
        for r in role_results if r.get("id") is not None
    }
    mon_body = (prof.get("layout") or {}).get(mon_key)
    if not isinstance(mon_body, dict):
        return []
    out: list[Any] = []
    for ch in mon_body.get("children") or []:
        if not isinstance(ch, dict):
            continue
        for rid in _first_role_ids_in_layout_node(ch):
            r = by_id.get(rid)
            if not r:
                continue
            wid = r.get("windowId")
            if wid is None or str(wid).strip() == "":
                continue
            out.append(wid)
            break
    return out


def _mon_order_matches(parent_info: dict[str, dict[str, Any]],
                       reps: list[Any]) -> bool:
    """
    True when reps share one mon and mon-level child indices are strictly
    increasing (profile order already matches live L→R / T→B).
    """
    if len(reps) < 2:
        return True
    indices: list[int] = []
    mon_id: Optional[str] = None
    for wid in reps:
        info = parent_info.get(str(wid)) or {}
        path = info.get("path")
        loc = _mon_child_loc(path)
        if loc is None:
            return False
        if mon_id is None:
            mon_id = loc[0]
        elif loc[0] != mon_id:
            return False
        indices.append(loc[1])
    return all(indices[i] < indices[i + 1] for i in range(len(indices) - 1))


def _mon_order_actions(
    role_results: list[dict[str, Any]],
    parent_info: dict[str, dict[str, Any]],
    prof: dict[str, Any],
) -> list[dict[str, Any]]:
    """ensure_order actions for mons whose hsplit/vsplit children are reversed."""
    actions: list[dict[str, Any]] = []
    for mon_key, mon_body in (prof.get("layout") or {}).items():
        if not isinstance(mon_body, dict):
            continue
        split = str(mon_body.get("split") or "").strip().lower()
        if split not in ("hsplit", "vsplit"):
            continue
        children = mon_body.get("children") or []
        if not isinstance(children, list) or len(children) < 2:
            continue
        reps = _mon_child_reps(role_results, prof, mon_key)
        if len(reps) < 2:
            continue
        if _mon_order_matches(parent_info, reps):
            continue
        actions.append({
            "op": "ensure_order",
            "slot": mon_key,
            "mode": split,
            "windowIds": reps,
        })
    return actions


def _layout_node_child_reps(role_results: list[dict[str, Any]],
                            node: dict[str, Any]) -> list[Any]:
    """One claimed windowId per layout child (profile order); skip unclaimed."""
    by_id = {
        str(r.get("id")): r
        for r in role_results if r.get("id") is not None
    }
    out: list[Any] = []
    for ch in node.get("children") or []:
        if not isinstance(ch, dict):
            continue
        found = False
        for rid in _first_role_ids_in_layout_node(ch):
            r = by_id.get(rid)
            if not r:
                continue
            wid = r.get("windowId")
            if wid is None or str(wid).strip() == "":
                continue
            out.append(wid)
            found = True
            break
        if not found:
            # Incomplete claim for this sibling — size requires all children.
            return []
    return out


def _size_actions(
    role_results: list[dict[str, Any]],
    prof: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    ensure_sizes for layout nodes that carry share[] (mon or nested split).

    Emits only when every profile child under that node has a claimed window
    and len(windowIds) matches len(share) (≥2).
    """
    actions: list[dict[str, Any]] = []

    def visit(node: Any, slot: str) -> None:
        if not isinstance(node, dict):
            return
        children = node.get("children")
        shares = normalize_shares(node.get("share"))
        if (shares is not None and isinstance(children, list)
                and len(children) >= 2 and len(shares) == len(children)):
            reps = _layout_node_child_reps(role_results, node)
            if len(reps) >= 2 and len(reps) == len(shares):
                actions.append({
                    "op": "ensure_sizes",
                    "slot": slot,
                    "windowIds": reps,
                    "shares": shares,
                })
        if isinstance(children, list):
            for ch in children:
                if not isinstance(ch, dict):
                    continue
                cid = ch.get("id")
                if cid is None or str(cid).strip() == "":
                    continue
                child_slot = f"{slot}.{cid}" if slot else str(cid)
                visit(ch, child_slot)

    for mon_key, mon_body in (prof.get("layout") or {}).items():
        if not isinstance(mon_body, dict):
            continue
        visit(mon_body, str(mon_key))
    return actions


def _soft_park_window_sort_key(
        w: dict[str, Any],
        parent_info: dict[str, dict[str, Any]]) -> Optional[tuple]:
    """Higher key = later mon-child / leaf (last unit on that mon)."""
    mon = window_monitor_index(w)
    if mon is None:
        return None
    wid = w.get("windowId")
    if wid is None:
        return None
    info = parent_info.get(str(wid)) or {}
    path = str(info.get("path") or w.get("path") or "")
    loc = _mon_child_loc(path)
    child_i = loc[1] if loc else -1
    try:
        leaf = int(path.rsplit("/", 1)[-1])
    except ValueError:
        leaf = 0
    return (int(mon), child_i, leaf)


def _soft_park_anchors_by_mon(
    windows: list[dict[str, Any]],
    parent_info: dict[str, dict[str, Any]],
    claimed: set[str],
) -> dict[int, dict[str, Any]]:
    """
    Last *claimed* mon unit per monitor for soft park.

    mon_index → window dict. Last = highest mon-child index, then leaf index.
    Unclaimed residuals are never anchors (would park residual onto residual).
    """
    out: dict[int, dict[str, Any]] = {}
    best_by_mon: dict[int, tuple[tuple, dict[str, Any]]] = {}
    for w in windows:
        if _window_key(w) not in claimed:
            continue
        key = _soft_park_window_sort_key(w, parent_info)
        if key is None:
            continue
        mon = key[0]
        prev = best_by_mon.get(mon)
        if prev is None or key > prev[0]:
            best_by_mon[mon] = (key, w)
    for mon, (_k, w) in best_by_mon.items():
        out[mon] = w
    return out


def _soft_park_anchor(
    windows: list[dict[str, Any]],
    parent_info: dict[str, dict[str, Any]],
    claimed: set[str],
) -> Optional[dict[str, Any]]:
    """
    Soft park dump: last mon's last *claimed* role window.
    Park moves onto this window id — no mon-root insert.
    Falls back to any tiled window only if no claimed anchors exist.
    """
    by_mon = _soft_park_anchors_by_mon(windows, parent_info, claimed)
    if by_mon:
        best_mon = max(by_mon.keys())
        return by_mon[best_mon]
    # No claimed roles: last any tiled window (empty desk edge case).
    best: Optional[dict[str, Any]] = None
    best_key: Optional[tuple] = None
    for w in windows:
        key = _soft_park_window_sort_key(w, parent_info)
        if key is None:
            continue
        if best_key is None or key > best_key:
            best_key = key
            best = w
    return best


def _compute_thrash_risk(actions: list[dict[str, Any]],
                         counts: dict[str, Any]) -> dict[str, Any]:
    """
    Score how destructive a plan is (cross-mon moves, mon ensures, structure).
    CLI may warn / refuse on high scores (TZ2).
    """
    cross_mon = 0
    mon_ensures = 0
    structure_groups = 0
    parks = 0
    reasons: list[str] = []
    for a in actions:
        if not isinstance(a, dict):
            continue
        op = str(a.get("op") or "").strip().lower()
        if op == "park":
            parks += 1
            if a.get("destWindowId") is None:
                reasons.append("hard-park-mon-root")
            else:
                reasons.append(f"soft-park→{a.get('destWindowId')}")
        elif op == "move":
            # role mon moves — count as placement risk
            reasons.append(f"move:{a.get('role') or a.get('windowId')}")
        elif op == "ensure_layout":
            slot = str(a.get("slot") or "")
            head = slot.split(".", 1)[0] if slot else ""
            if head and "." not in slot:
                mon_ensures += 1
                reasons.append(f"mon-ensure:{slot}")
            else:
                structure_groups += 1
                reasons.append(f"structure:{slot}")
        elif op == "ensure_skeleton":
            structure_groups += 1
            reasons.append("skeleton")
        elif op == "bind":
            reasons.append(f"bind:{a.get('role') or a.get('windowId')}")
        elif op == "ensure_order":
            reasons.append(f"order:{a.get('slot')}")
        elif op == "ensure_sizes":
            reasons.append(f"size:{a.get('slot')}")
        elif op == "open":
            reasons.append(f"open:{a.get('role')}")
    # Cross-mon heuristic: park without destWindowId, or counts.moved
    cross_mon = int(counts.get("moved") or 0)
    if parks and any(r.startswith("hard-park") for r in reasons):
        cross_mon += parks
    ordered = int(counts.get("ordered") or 0)
    score = (3 * cross_mon + 2 * mon_ensures + 2 * structure_groups + parks +
             ordered + int(counts.get("closed") or 0))
    # Dedup reasons while preserving order
    seen: set[str] = set()
    uniq: list[str] = []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            uniq.append(r)
    return {
        "score": score,
        "crossMonMoves": cross_mon,
        "monEnsures": mon_ensures,
        "structureGroups": structure_groups,
        "parks": parks,
        "reasons": uniq,
    }


def _as_rect(raw: Any) -> Optional[dict[str, float]]:
    if not isinstance(raw, dict):
        return None
    try:
        x = float(raw["x"])
        y = float(raw["y"])
        w = float(raw["width"])
        h = float(raw["height"])
    except (KeyError, TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    return {"x": x, "y": y, "width": w, "height": h}


_GEOM_SK_RE = re.compile(
    r"^geom:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)"
)


def _mon_node_rect(mon_node: dict[str, Any]) -> Optional[dict[str, float]]:
    r = _as_rect(mon_node.get("rect"))
    if r:
        return r
    sk = mon_node.get("stableKey")
    if not isinstance(sk, str):
        return None
    m = _GEOM_SK_RE.match(sk.strip())
    if not m:
        return None
    return {
        "x": float(m.group(1)),
        "y": float(m.group(2)),
        "width": float(m.group(3)),
        "height": float(m.group(4)),
    }


def _split_rect(parent: dict[str, float], n: int,
                split: str) -> list[dict[str, float]]:
    if n <= 0:
        return []
    if n == 1:
        return [dict(parent)]
    split_l = str(split or "hsplit").strip().lower()
    out: list[dict[str, float]] = []
    if split_l in ("vsplit", "v", "vertical"):
        h = parent["height"] / n
        for i in range(n):
            out.append({
                "x": parent["x"],
                "y": parent["y"] + i * h,
                "width": parent["width"],
                "height": h,
            })
    else:
        w = parent["width"] / n
        for i in range(n):
            out.append({
                "x": parent["x"] + i * w,
                "y": parent["y"],
                "width": w,
                "height": parent["height"],
            })
    return out


def _rect_overlap_area(a: dict[str, float], b: dict[str, float]) -> float:
    ax2 = a["x"] + a["width"]
    ay2 = a["y"] + a["height"]
    bx2 = b["x"] + b["width"]
    by2 = b["y"] + b["height"]
    ix1 = max(a["x"], b["x"])
    iy1 = max(a["y"], b["y"])
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    return (ix2 - ix1) * (iy2 - iy1)


def _build_view_regions(prof: dict[str, Any],
                        forest: Any) -> list[dict[str, Any]]:
    """
    Profile mon-child / nested pane regions in profile order.
    Equal splits of mon rect (tree rect or geom: stableKey; synthetic fallback).
    """
    views: list[dict[str, Any]] = []
    order = 0

    def walk(
        nodes: list[Any],
        parent_rect: dict[str, float],
        prefix: str,
        split_mode: str,
        mon_idx: int,
    ) -> None:
        nonlocal order
        rects = _split_rect(parent_rect, len(nodes), split_mode)
        for i, ch in enumerate(nodes):
            if not isinstance(ch, dict) or not ch.get("id"):
                continue
            full = f"{prefix}.{ch['id']}"
            r = rects[i] if i < len(rects) else dict(parent_rect)
            nested = ch.get("children")
            if isinstance(nested, list) and nested:
                nest_split = str(
                    ch.get("split") or ch.get("layout")
                    or "hsplit").strip().lower()
                if nest_split in ("tabbed", "stacked"):
                    views.append({
                        "slot": full,
                        "mon_idx": mon_idx,
                        "rect": r,
                        "order": order,
                    })
                    order += 1
                else:
                    walk(nested, r, full, nest_split, mon_idx)
            else:
                views.append({
                    "slot": full,
                    "mon_idx": mon_idx,
                    "rect": r,
                    "order": order,
                })
                order += 1

    for mon_key, mon_body in (prof.get("layout") or {}).items():
        if not isinstance(mon_body, dict):
            continue
        mon_idx = mon_index_from_slot(mon_key)
        if mon_idx is None:
            continue
        mon_node = _monitor_for_index(forest, mon_idx)
        mon_rect = _mon_node_rect(mon_node) if mon_node else None
        if mon_rect is None:
            mon_rect = {
                "x": float(mon_idx) * 10000.0,
                "y": 0.0,
                "width": 1000.0,
                "height": 1000.0,
            }
        children = mon_body.get("children") or []
        if not isinstance(children, list) or not children:
            continue
        split = str(mon_body.get("split") or "hsplit").strip().lower()
        walk(children, mon_rect, mon_key, split, mon_idx)
    return views


def _assign_view_by_overlap(
    win_rect: dict[str, float],
    mon_idx: int,
    views: list[dict[str, Any]],
) -> Optional[str]:
    """First profile-order view on mon with positive rect overlap (partial → first)."""
    for v in sorted(views, key=lambda x: int(x.get("order") or 0)):
        if int(v.get("mon_idx", -1)) != int(mon_idx):
            continue
        vr = v.get("rect")
        if not isinstance(vr, dict):
            continue
        if _rect_overlap_area(win_rect, vr) > 0:
            return str(v["slot"])
    return None


def _build_slot_membership(
    role_results: list[dict[str, Any]],
    parent_info: dict[str, dict[str, Any]],
    windows: list[dict[str, Any]],
    prof: Optional[dict[str, Any]] = None,
    forest: Any = None,
) -> dict[str, set[str]]:
    """
    Mode A collect: map unclaimed windows → view slots.

    1. CON siblings of claimed roles (in-group companions)
    2. Mon-child containment: unclaimed under a role-owned mon-child
    3. Rect overlap vs profile view regions (partial → first view)
    4. Mon-direct span: nearest preceding role-owned mon child
    """
    by_parent: dict[str, list[str]] = {}
    for w in windows:
        wid = w.get("windowId")
        if wid is None:
            continue
        info = parent_info.get(str(wid))
        if not info:
            continue
        pt = str(info.get("parent_type") or "").upper()
        pp = info.get("parent_path")
        if not pp or pt == "MONITOR":
            continue
        by_parent.setdefault(str(pp), []).append(_window_key(w))

    membership: dict[str, set[str]] = {}
    # mon_id → mon-child index → primary slot owning that mon child
    mon_owned: dict[str, dict[int, str]] = {}
    claimed_keys: set[str] = set()
    for r in role_results:
        wid = r.get("windowId")
        slot = r.get("slot")
        if wid is None or not slot:
            continue
        key = f"id:{wid}"
        claimed_keys.add(key)
        membership.setdefault(str(slot), set()).add(key)
        info = parent_info.get(str(wid))
        if not info:
            continue
        loc = _mon_child_loc(info.get("path"))
        if loc:
            mon_id, idx = loc
            mon_owned.setdefault(mon_id, {}).setdefault(idx, str(slot))
        pt = str(info.get("parent_type") or "").upper()
        pp = info.get("parent_path")
        if not pp or pt == "MONITOR":
            continue
        for sib in by_parent.get(str(pp), []):
            membership[str(slot)].add(sib)

    already = set(claimed_keys)
    for keys in membership.values():
        already |= keys

    # Nested under a mon-child already owned by a claimed role (VSPLIT companions)
    for w in windows:
        key = _window_key(w)
        if key in already:
            continue
        wid = w.get("windowId")
        if wid is None:
            continue
        info = parent_info.get(str(wid))
        if not info:
            continue
        loc = _mon_child_loc(info.get("path"))
        if not loc:
            continue
        mon_id, idx = loc
        slot = (mon_owned.get(mon_id) or {}).get(idx)
        if not slot:
            continue
        membership.setdefault(slot, set()).add(key)
        already.add(key)

    # Rect overlap collect (profile equal-split view geometry)
    views: list[dict[str, Any]] = []
    if prof is not None and forest is not None:
        views = _build_view_regions(prof, forest)
    if views:
        for w in windows:
            key = _window_key(w)
            if key in already:
                continue
            wr = _as_rect(w.get("rect"))
            if not wr:
                continue
            mon = window_monitor_index(w)
            if mon is None:
                continue
            slot = _assign_view_by_overlap(wr, mon, views)
            if not slot:
                continue
            membership.setdefault(slot, set()).add(key)
            already.add(key)

    # Mon-direct unclaimed: nearest preceding role-owned mon-child span
    for w in windows:
        key = _window_key(w)
        if key in already:
            continue
        wid = w.get("windowId")
        if wid is None:
            continue
        info = parent_info.get(str(wid))
        if not info:
            continue
        if str(info.get("parent_type") or "").upper() != "MONITOR":
            continue
        loc = _mon_child_loc(info.get("path"))
        if not loc:
            continue
        mon_id, i = loc
        owned = mon_owned.get(mon_id) or {}
        prior = [j for j in owned if j <= i]
        if not prior:
            continue
        slot = owned[max(prior)]
        membership.setdefault(slot, set()).add(key)
        already.add(key)
    return membership


def _ordered_slot_window_ids(
    role_results: list[dict[str, Any]],
    slot: str,
    kept: list[dict[str, Any]],
    role_order: str,
) -> list[Any]:
    """Role windowIds then kept companions when roleOrder=first."""
    roles = _role_window_ids_for_slot(role_results, slot)
    companions: list[Any] = []
    seen = {str(x) for x in roles}
    for k in kept:
        if str(k.get("slot") or "") != slot:
            continue
        wid = k.get("windowId")
        if wid is None or str(wid).strip() == "":
            continue
        if str(wid) in seen:
            continue
        seen.add(str(wid))
        companions.append(wid)
    # roleOrder first (default): roles prefix companions in ensure_layout windowIds
    return roles + companions


def _sibling_order_ids(window_ids: list[Any],
                       parent_info: dict[str, dict[str, Any]]) -> list[Any]:
    """Sort windowIds by sibling index under their parent CON."""

    def sort_key(wid: Any) -> tuple:
        info = parent_info.get(str(wid)) or {}
        path = str(info.get("path") or "")
        try:
            idx = int(path.rsplit("/", 1)[-1])
        except ValueError:
            idx = 999
        return (idx, str(wid))

    return sorted(window_ids, key=sort_key)


def _sibling_order_matches(window_ids: list[Any],
                           parent_info: dict[str, dict[str, Any]]) -> bool:
    """True when window_ids are already in live sibling order (profile order)."""
    if len(window_ids) < 2:
        return True
    live = _sibling_order_ids(window_ids, parent_info)
    return [str(x) for x in live] == [str(x) for x in window_ids]


def _role_window_ids_for_mon(role_results: list[dict[str, Any]],
                             mon_key: str) -> list[Any]:
    """WindowIds for roles whose slot is on mon_key (mon0 / mon1 / primary)."""
    out: list[Any] = []
    for r in role_results:
        slot = str(r.get("slot") or "")
        head = slot.split(".", 1)[0] if slot else ""
        if mon_key == "primary":
            if head not in ("primary", "mon0"):
                continue
        elif head != mon_key:
            continue
        wid = r.get("windowId")
        if wid is None or str(wid).strip() == "":
            continue
        out.append(wid)
    return out


def _is_mon_direct_path(path: Any) -> bool:
    """True when path is mon-child WINDOW (moNwsW/i), not nested (moNwsW/i/j…)."""
    if path is None:
        return False
    parts = str(path).strip().split("/")
    if len(parts) != 2 or not parts[0]:
        return False
    try:
        int(parts[1])
    except ValueError:
        return False
    return True


def _mon_layout_child_id(slot: Any) -> Optional[str]:
    """mon0.left-tab → left-tab; mon0.s1.nautilus → s1; mon0 → None."""
    s = str(slot or "").strip()
    if not s or "." not in s:
        return None
    parts = s.split(".")
    if len(parts) < 2 or not parts[1]:
        return None
    return parts[1]


def _parent_path_for_wid(
        wid: Any, parent_info: dict[str, dict[str, Any]]) -> Optional[str]:
    info = parent_info.get(str(wid)) if wid is not None else None
    if not info:
        return None
    pp = info.get("parent_path")
    if pp is None or str(pp).strip() == "":
        return None
    return str(pp)


def _is_con_parent(wid: Any, parent_info: dict[str, dict[str, Any]]) -> bool:
    """True when window's parent is a CON (not MONITOR / mon-direct)."""
    info = parent_info.get(str(wid)) if wid is not None else None
    if not info:
        return False
    ptype = str(info.get("parent_type") or "").upper()
    if ptype == "MONITOR":
        return False
    # CON or missing type with nested path (moNwsW/i/j)
    path = str(info.get("path") or "")
    if ptype == "CON":
        return True
    # Nested under mon child without parent_type stamped
    parts = path.split("/")
    return len(parts) >= 3


def _slot_parent_has_foreign_mon_child(
    slot: str,
    window_ids: list[Any],
    role_results: list[dict[str, Any]],
    parent_info: dict[str, dict[str, Any]],
) -> bool:
    """
    True when a claimed role of a *different* mon-layout child shares a parent
    CON path with window_ids (e.g. ghostty co-tabbed with chrome+Grok).

    Mon-direct siblings correctly share the MONITOR parent — not a mismatch.
    """
    mon_child = _mon_layout_child_id(slot)
    mon_key = str(slot or "").split(".", 1)[0] if slot else ""
    if not mon_child or not mon_key:
        return False
    own_parents: set[str] = set()
    for wid in window_ids:
        if not _is_con_parent(wid, parent_info):
            continue
        pp = _parent_path_for_wid(wid, parent_info)
        if pp is not None:
            own_parents.add(pp)
    if not own_parents:
        return False
    for r in role_results:
        if r.get("windowId") is None:
            continue
        if not _is_con_parent(r.get("windowId"), parent_info):
            continue
        rslot = str(r.get("slot") or "")
        rhead = rslot.split(".", 1)[0] if rslot else ""
        if rhead != mon_key:
            continue
        rchild = _mon_layout_child_id(rslot)
        if rchild is None or rchild == mon_child:
            continue
        pp = _parent_path_for_wid(r.get("windowId"), parent_info)
        if pp is not None and pp in own_parents:
            return True
    return False


def _mon_child_topology_mismatches(
    role_results: list[dict[str, Any]],
    parent_info: dict[str, dict[str, Any]],
    prof: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Claimed roles for different mon-layout children share the same parent CON
    path (collapsed mon children / giant tab bag), or the same mon-direct child
    index (nested HSPLIT wrapping tab|ghostty under one mon pane).

    Ignores MONITOR parents for immediate-parent check (correct mon-direct
    siblings). kind: mon-child.
    """
    mismatches: list[dict[str, Any]] = []
    for mon_key, mon_body in sorted((prof.get("layout") or {}).items()):
        if not isinstance(mon_body, dict):
            continue
        children = mon_body.get("children") or []
        if not isinstance(children, list) or len(children) < 2:
            continue
        # mon-child id → claimed role entries
        by_child: dict[str, list[dict[str, Any]]] = {}
        for r in role_results:
            if r.get("windowId") is None:
                continue
            slot = str(r.get("slot") or "")
            head = slot.split(".", 1)[0] if slot else ""
            if head != mon_key:
                continue
            child_id = _mon_layout_child_id(slot)
            if not child_id:
                continue
            by_child.setdefault(child_id, []).append(r)
        if len(by_child) < 2:
            continue
        path_to_children: dict[str, set[str]] = {}
        mon_direct_to_children: dict[str, set[str]] = {}
        for child_id, roles in by_child.items():
            for r in roles:
                wid = r.get("windowId")
                info = parent_info.get(str(wid)) if wid is not None else None
                path = (info or {}).get("path") or r.get("path")
                loc = _mon_child_loc(path)
                if loc is not None:
                    mon_direct_key = f"{loc[0]}/{loc[1]}"
                    mon_direct_to_children.setdefault(mon_direct_key,
                                                      set()).add(child_id)
                # Only CON parents: mon-direct siblings share MONITOR correctly.
                if not _is_con_parent(wid, parent_info):
                    continue
                pp = _parent_path_for_wid(wid, parent_info)
                if pp is None:
                    continue
                path_to_children.setdefault(pp, set()).add(child_id)
        polluted = {
            pp: sorted(kids)
            for pp, kids in path_to_children.items() if len(kids) >= 2
        }
        # Nested mon collapse: different profile mon-children under one mon-direct
        # index (e.g. mo0ws0/0 HSPLIT wrapping both tab and ghostty).
        collapsed = {
            k: sorted(kids)
            for k, kids in mon_direct_to_children.items() if len(kids) >= 2
        }
        if not polluted and not collapsed:
            continue
        want_ids = [
            str(c.get("id")) for c in children
            if isinstance(c, dict) and c.get("id") is not None
        ]
        got = polluted if polluted else collapsed
        detail_kind = ("share parent CON path(s)" if polluted else
                       "share mon-direct index (nested mon collapse)")
        mismatches.append({
            "kind":
            "mon-child",
            "slot":
            mon_key,
            "want":
            want_ids,
            "got":
            got,
            "detail": (f"{mon_key} mon-child roles {detail_kind}: " +
                       ", ".join(sorted(got))),
        })
    return mismatches


def _peel_demote_anchor(
    mon_key: str,
    role_results: list[dict[str, Any]],
    parent_info: dict[str, dict[str, Any]],
    prof: dict[str, Any],
    mismatch: dict[str, Any],
) -> Any:
    """
    Window id whose parent CON is the polluted TABBED/STACKED bag.
    layout hsplit/vsplit on it demotes the bag so subset tab wrap can peel.

    Returns None for nested mon-direct collapse (not a giant tab bag) — order
    hoist repairs that path; demoting the tab group would be wrong.
    """
    polluted_paths = set()
    got = mismatch.get("got")
    if isinstance(got, dict):
        polluted_paths = {str(k) for k in got.keys()}
    # Prefer a window under a TABBED/STACKED parent on a polluted path.
    for r in role_results:
        wid = r.get("windowId")
        if wid is None or str(wid).strip() == "":
            continue
        slot = str(r.get("slot") or "")
        head = slot.split(".", 1)[0] if slot else ""
        if head != mon_key:
            continue
        info = parent_info.get(str(wid)) or {}
        pp = info.get("parent_path")
        parent_lay = str(info.get("parent_layout") or "").upper()
        parent_type = str(info.get("parent_type") or "").upper()
        if parent_type == "MONITOR":
            continue
        # Giant-tab peel only: polluted key must be the TABBED/STACKED parent path.
        if parent_lay not in ("TABBED", "STACKED"):
            continue
        if polluted_paths and str(pp) not in polluted_paths:
            continue
        return wid
    # Nested mon collapse (mon-direct index keys) has no tab bag to demote.
    return None


def _forest_mon_layouts(forest: Any) -> dict[str, str]:
    """monN → live MONITOR layout (upper). Prefers workspace 0 roots."""
    out: dict[str, str] = {}
    for m in _iter_forest_monitors(forest):
        if not isinstance(m, dict):
            continue
        idx = _monitor_node_index(m)
        if idx is None:
            continue
        key = f"mon{idx}"
        if key in out:
            continue
        lay = m.get("layout")
        if lay is None:
            continue
        out[key] = str(lay).strip().upper()
    return out


def _mons_with_split_mismatch(
    forest: Any,
    prof: dict[str, Any],
    role_results: list[dict[str, Any]],
) -> set[str]:
    """
    mon keys where profile wants hsplit/vsplit but live mon layout differs.

    Conservative: only layout-type mismatch (e.g. TABBED mon vs hsplit profile).
    Does not fire on HSPLIT mon with a stray mon-direct companion (structure-only).
    Requires at least one claimed role window on the mon.
    """
    live = _forest_mon_layouts(forest)
    out: set[str] = set()
    for mon_key, mon_body in (prof.get("layout") or {}).items():
        if not isinstance(mon_body, dict):
            continue
        split = str(mon_body.get("split") or "").strip().lower()
        if split not in ("hsplit", "vsplit"):
            continue
        if not _role_window_ids_for_mon(role_results, mon_key):
            continue
        live_lay = live.get(mon_key)
        if not live_lay:
            continue
        want = split.upper()
        if live_lay != want:
            out.add(mon_key)
    return out


def compare_layout_structure(
    forest: Any,
    profile: Any,
    *,
    role_results: Optional[list[dict[str, Any]]] = None,
    parent_info: Optional[dict[str, dict[str, Any]]] = None,
    already_validated: bool = False,
) -> dict[str, Any]:
    """
    Pure structural compare: layout profile (desired) vs GetTree forest (live).

    FIRM: this is the single source of truth for "do these trees agree?"
    Plan reconcile must not claim nothingToDo for structure when match is false
    (except --safe, which skips structure repair by policy).

    Checks (claimed roles only; missing opens are not structure mismatches):
      - role monitor placement
      - mon-level split layout (HSPLIT/VSPLIT vs live MONITOR.layout)
      - multi-role tabbed/stacked/hsplit/vsplit slots share one CON of that mode
      - mon-child topology: different mon-layout children not under one shared CON

    Returns:
      {
        "match": bool,
        "mismatches": [
          {"kind": "role-mon"|"mon-layout"|"group"|"mon-child", "slot": str,
           "want": ..., "got": ..., "detail": str}
        ],
      }
    """
    if not isinstance(forest, dict):
        raise ValueError("forest must be a JSON object")
    if already_validated and isinstance(profile, dict) and "roles" in profile:
        prof = profile
    else:
        prof = validate_reconcile_profile(profile,
                                          **forest_profile_mon_kwargs(forest))
        prof = resolve_profile_mon_keys(prof, forest)

    windows = collect_windows(forest)
    pinfo = parent_info if parent_info is not None else _window_parent_index(
        forest)
    layout_slot_modes = _slot_layout_modes(prof)

    if role_results is None:
        role_windows = _two_pass_claim_windows(prof["roles"], windows)
        roles: list[dict[str, Any]] = []
        for role, chosen in zip(prof["roles"], role_windows):
            entry: dict[str, Any] = {
                "id": role["id"],
                "slot": role["slot"],
            }
            if chosen is None:
                entry["status"] = "open"
            else:
                entry["windowId"] = chosen.get("windowId")
                entry["path"] = chosen.get("path")
                entry["monitor"] = window_monitor_index(chosen)
                entry["status"] = "claimed"
            roles.append(entry)
        role_results = roles

    mismatches: list[dict[str, Any]] = []

    # Role on wrong monitor (only claimed windows).
    for r in role_results:
        if r.get("windowId") is None:
            continue
        slot = str(r.get("slot") or "")
        desired = mon_index_from_slot(slot)
        win_mon = r.get("monitor")
        if win_mon is None:
            # resolve from path parent_info when plan_reconcile roles lack monitor
            info = pinfo.get(str(r.get("windowId")))
            path = str((info or {}).get("path") or r.get("path") or "")
            if path.startswith("mo") and "ws" in path:
                try:
                    win_mon = int(path[2:path.index("ws")])
                except ValueError:
                    win_mon = None
        if desired is not None and win_mon is not None and int(win_mon) != int(
                desired):
            mismatches.append({
                "kind":
                "role-mon",
                "slot":
                slot,
                "want":
                desired,
                "got":
                int(win_mon),
                "detail":
                f"role {r.get('id')} on mon{win_mon}, want mon{desired}",
            })

    # Mon-level layout type.
    for mon_key in sorted(_mons_with_split_mismatch(forest, prof,
                                                    role_results)):
        mon_body = (prof.get("layout") or {}).get(mon_key) or {}
        want = str((mon_body or {}).get("split") or "").strip().upper()
        live = _forest_mon_layouts(forest).get(mon_key)
        mismatches.append({
            "kind":
            "mon-layout",
            "slot":
            mon_key,
            "want":
            want,
            "got":
            live,
            "detail":
            f"{mon_key} live layout {live!r} != profile {want!r}",
        })

    # Multi-role groups: tabbed/stacked/nested h-v must share one CON of that mode.
    for slot, mode in sorted(layout_slot_modes.items()):
        mode_l = str(mode or "").strip().lower()
        if mode_l not in ("tabbed", "stacked", "hsplit", "vsplit"):
            continue
        if str(slot).endswith(".overflow"):
            continue
        if mode_l in ("hsplit", "vsplit"):
            wids = _role_window_ids_for_slot_prefix(role_results, slot)
        else:
            wids = _role_window_ids_for_slot(role_results, slot)
        if len(wids) < 2:
            continue
        if not _windows_share_group(wids, pinfo, mode_l):
            mismatches.append({
                "kind":
                "group",
                "slot":
                slot,
                "want":
                mode_l,
                "got":
                None,
                "detail":
                f"{mode_l} roles not co-grouped under one CON: {slot}",
            })
            continue
        # Co-grouped but polluted by another mon-child role (giant tab bag).
        if mode_l in ("tabbed",
                      "stacked") and _slot_parent_has_foreign_mon_child(
                          slot, wids, role_results, pinfo):
            mismatches.append({
                "kind":
                "group",
                "slot":
                slot,
                "want":
                mode_l,
                "got":
                "polluted",
                "detail": (f"{mode_l} group for {slot} shares parent with "
                           "foreign mon-child role(s)"),
            })

    # Mon-child topology: different profile mon children under one CON path.
    mismatches.extend(_mon_child_topology_mismatches(role_results, pinfo,
                                                     prof))

    return {
        "match": len(mismatches) == 0,
        "mismatches": mismatches,
    }


def _mon_split_anchor_ids(role_results: list[dict[str, Any]], mon_key: str,
                          prof: dict[str, Any]) -> list[Any]:
    """
    Window ids for mon-level hsplit/vsplit ensure.

    Only mon-direct windows (path moNwsW/<i>, parent MONITOR). Nested leaves
    under tab/stack/vsplit CONs must not be anchors — layout rewrites the
    selected window's parent and would demote nested VSPLIT/TABBED → mon mode.
    """
    by_id = {
        str(r.get("id")): r
        for r in role_results if r.get("id") is not None
    }
    mon_body = (prof.get("layout") or {}).get(mon_key)
    out: list[Any] = []

    def first_role_ids(node: dict[str, Any]) -> list[str]:
        if node.get("roles"):
            return [str(x) for x in node["roles"]]
        for sub in node.get("children") or []:
            if isinstance(sub, dict):
                found = first_role_ids(sub)
                if found:
                    return found
        return []

    if isinstance(mon_body, dict):
        for ch in mon_body.get("children") or []:
            if not isinstance(ch, dict):
                continue
            lay = str(ch.get("layout") or "").strip().lower()
            if lay in ("tabbed", "stacked"):
                continue
            # Nested mon-child split: first leaf is under CON, not mon-direct.
            split = str(ch.get("split") or "").strip().lower()
            if split in ("hsplit", "vsplit") and ch.get("children"):
                continue
            for rid in first_role_ids(ch):
                r = by_id.get(rid)
                if not r:
                    continue
                wid = r.get("windowId")
                if wid is None or str(wid).strip() == "":
                    continue
                # Live path must be mon-direct (skip nested ghostty under VSPLIT).
                if not _is_mon_direct_path(r.get("path")):
                    continue
                out.append(wid)
                break
    # Never fall back to tab/stack bag members — layout rewrites the selected
    # window's parent CON and would demote TABBED/STACKED → HSPLIT/VSPLIT.
    return out


def _slot_mon_child_index(prof: dict[str, Any], slot: str) -> Optional[int]:
    """
    Index of slot among mon layout children (0 = first / left in hsplit).
    mon1.term with children [term, comms] → 0. mon0.term with [left-tab, term] → 1.
    Nested mon1.s0.nautilus → index of top-level mon child s0.
    """
    if not slot or "." not in slot:
        return None
    mon_key, rest = slot.split(".", 1)
    child_id = rest.split(".", 1)[0]
    mon_body = (prof.get("layout") or {}).get(mon_key)
    if not isinstance(mon_body, dict):
        return None
    children = mon_body.get("children") or []
    if not isinstance(children, list):
        return None
    for i, ch in enumerate(children):
        if isinstance(ch, dict) and ch.get("id") == child_id:
            return i
    return None


def _window_parent_index(forest: Any) -> dict[str, dict[str, Any]]:
    """
    Map windowId string → parent path/layout/type for structure checks.
    Keys are str(windowId).
    """
    out: dict[str, dict[str, Any]] = {}

    def walk(
        n: Any,
        path: str,
        parent_path: Optional[str],
        parent_layout: Any,
        parent_type: Optional[str],
    ) -> None:
        if not isinstance(n, dict):
            return
        ntype = n.get("nodeType") or n.get("type")
        if ntype == "WINDOW":
            wid = n.get("windowId")
            if wid is not None:
                out[str(wid)] = {
                    "path": path,
                    "parent_path": parent_path,
                    "parent_layout": parent_layout,
                    "parent_type": parent_type,
                }
            return
        kids = n.get("children") or n.get("childNodes") or []
        if not isinstance(kids, list):
            return
        mon_id = n.get("id") if ntype == "MONITOR" else None
        lay = n.get("layout")
        for i, c in enumerate(kids):
            if mon_id:
                child_path = f"{mon_id}/{i}"
            elif path:
                child_path = f"{path}/{i}"
            else:
                child_path = str(i)
            walk(c, child_path, path if path else mon_id, lay, ntype)

    if isinstance(forest, dict):
        mons = forest.get("monitors")
        if isinstance(mons, list):
            for m in _order_monitors(mons):
                walk(m,
                     str(m.get("id") or "") if isinstance(m, dict) else "",
                     None, None, None)
        else:
            walk(forest, "", None, None, None)
    elif isinstance(forest, list):
        for m in _order_monitors(forest):
            walk(m,
                 str(m.get("id") or "") if isinstance(m, dict) else "", None,
                 None, None)
    return out


def _windows_share_group(window_ids: list[Any],
                         parent_info: dict[str, dict[str,
                                                     Any]], mode: str) -> bool:
    """
    True when all windows share one CON parent with the desired layout.

    Supports tabbed/stacked and nested hsplit/vsplit. Fewer than two windows
    always "share" (nothing to group).
    """
    if len(window_ids) < 2:
        return True
    mode_l = str(mode or "").strip().lower()
    want = {
        "tabbed": "TABBED",
        "stacked": "STACKED",
        "hsplit": "HSPLIT",
        "vsplit": "VSPLIT",
    }.get(mode_l)
    infos: list[dict[str, Any]] = []
    for wid in window_ids:
        info = parent_info.get(str(wid))
        if not info:
            return False
        infos.append(info)
    parents = {i.get("parent_path") for i in infos}
    if len(parents) != 1 or None in parents or "" in parents:
        return False
    # Must be under a CON (not flat siblings on the monitor)
    if any(
            str(i.get("parent_type") or "").upper() == "MONITOR"
            for i in infos):
        return False
    if want:
        got = str(infos[0].get("parent_layout") or "").upper()
        if got != want:
            return False
    return True


# Strong thrash: any reason → thrashed; score is severity for later gates.
_THRASH_SCORE_THRESHOLD = 3
_THRASH_WRONG_MON_K = 2


def detect_thrash(forest: Any, profile: Any) -> dict[str, Any]:
    """
    Pure thrash detector over GetTree forest + v2 profile.

    Returns { thrashed, score, reasons[] }. Does not plan actions.
    Accepts raw or validated/resolved profile (re-validates + mon-key resolve).
    """
    if not isinstance(forest, dict):
        raise ValueError("forest must be a JSON object")
    prof = validate_reconcile_profile(profile,
                                      **forest_profile_mon_kwargs(forest))
    prof = resolve_profile_mon_keys(prof, forest)

    windows = collect_windows(forest)
    parent_info = _window_parent_index(forest)
    layout_slot_modes = _slot_layout_modes(prof)
    role_results = _claim_roles_for_detect(prof, windows)

    score = 0
    reasons: list[str] = []

    # ≥K roles on wrong monitor
    wrong_mon = 0
    for r in role_results:
        if r.get("windowId") is None:
            continue
        desired = mon_index_from_slot(str(r.get("slot") or ""))
        win_mon = r.get("monitor")
        if desired is not None and win_mon is not None and int(win_mon) != int(
                desired):
            wrong_mon += 1
    if wrong_mon >= _THRASH_WRONG_MON_K:
        score += 2 * wrong_mon
        reasons.append(f"roles-wrong-mon:{wrong_mon}")

    # Multi-role tabbed/stacked slots: claimed roles must share one CON of that mode
    for slot, mode in sorted(layout_slot_modes.items()):
        if mode not in ("tabbed", "stacked"):
            continue
        if str(slot).endswith(".overflow"):
            continue
        wids = _role_window_ids_for_slot(role_results, slot)
        if len(wids) < 2:
            continue
        if not _windows_share_group(wids, parent_info, mode):
            score += 3
            reasons.append(f"{mode}-roles-not-grouped:{slot}")

    # Mon structure: excess mon-level kids; nested H/V under a role view
    for mon_key, mon_body in sorted((prof.get("layout") or {}).items()):
        if not isinstance(mon_body, dict):
            continue
        mon_idx = mon_index_from_slot(mon_key)
        if mon_idx is None:
            continue
        mon_node = _monitor_for_index(forest, mon_idx)
        if mon_node is None:
            continue
        live_kids = mon_node.get("children") or []
        if not isinstance(live_kids, list):
            live_kids = []
        expected = mon_body.get("children") or []
        if not isinstance(expected, list):
            expected = []
        n_exp = len(expected)
        n_live = len(live_kids)
        # ≫ N mon-level children (e.g. 5 vs 2); 4 vs 2 alone is not thrash
        if n_exp > 0 and n_live > max(n_exp + 1, n_exp * 2):
            score += 3
            reasons.append(
                f"mon-children-excess:mon{mon_idx}:{n_live}>{n_exp}")

        for view in expected:
            if not isinstance(view, dict) or not view.get("id"):
                continue
            view_id = str(view["id"])
            slot = f"{mon_key}.{view_id}"
            # Nested H/V under a mon-child is thrash only for multi-role
            # tabbed/stacked views (wanted group, got nested splits).
            # Single-role term + companions under VSPLIT/HSPLIT is Mode A.
            view_roles = view.get("roles") or []
            mode = layout_slot_modes.get(slot)
            if mode not in ("tabbed", "stacked") or len(view_roles) < 2:
                continue
            wids = [
                r["windowId"] for r in role_results
                if r.get("windowId") is not None and (
                    str(r.get("slot") or "") == slot
                    or str(r.get("slot") or "").startswith(slot + "."))
            ]
            if not wids:
                continue
            info = parent_info.get(str(wids[0])) or {}
            loc = _mon_child_loc(info.get("path"))
            if not loc:
                continue
            _mon_id, child_i = loc
            if child_i < 0 or child_i >= n_live:
                continue
            child_node = live_kids[child_i]
            if not isinstance(child_node, dict):
                continue
            if _node_has_nested_hv_split(child_node):
                score += 4
                reasons.append(f"nested-split-view:{slot}")

    # Dedup reasons
    seen: set[str] = set()
    uniq: list[str] = []
    for r in reasons:
        if r not in seen:
            seen.add(r)
            uniq.append(r)

    thrashed = bool(uniq) or score >= _THRASH_SCORE_THRESHOLD
    return {
        "thrashed": thrashed,
        "score": score,
        "reasons": uniq,
    }


def _claim_roles_for_detect(
        prof: dict[str, Any],
        windows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Claim windows for roles (same two-pass preference as plan_reconcile)."""
    roles = list(prof.get("roles") or [])
    picks = _two_pass_claim_windows(roles, windows)
    results: list[dict[str, Any]] = []
    for role, chosen in zip(roles, picks):
        rid = role.get("id")
        slot = str(role.get("slot") or "")
        entry: dict[str, Any] = {"id": rid, "slot": slot}
        if chosen is None:
            entry["status"] = "open"
        else:
            entry["windowId"] = chosen.get("windowId")
            entry["path"] = chosen.get("path")
            entry["monitor"] = window_monitor_index(chosen)
            entry["status"] = "claimed"
        results.append(entry)
    return results


def _monitor_for_index(forest: Any, mon_idx: int) -> Optional[dict[str, Any]]:
    """First ws-ordered MONITOR node for mon index."""
    for m in _iter_forest_monitors(forest):
        if not isinstance(m, dict):
            continue
        if _monitor_node_index(m) == mon_idx:
            return m
    return None


def _node_has_nested_hv_split(node: dict[str, Any]) -> bool:
    """True if this CON is H/V and contains a nested H/V CON (sliver thrash)."""
    ntype = str(node.get("nodeType") or node.get("type") or "").upper()
    if ntype == "WINDOW":
        return False
    layout = str(node.get("layout") or "").upper()
    kids = node.get("children") or node.get("childNodes") or []
    if not isinstance(kids, list) or layout not in ("HSPLIT", "VSPLIT"):
        return False
    for c in kids:
        if not isinstance(c, dict):
            continue
        ct = str(c.get("nodeType") or c.get("type") or "").upper()
        if ct == "WINDOW":
            continue
        cl = str(c.get("layout") or "").upper()
        if cl in ("HSPLIT", "VSPLIT"):
            return True
        if _node_has_nested_hv_split(c):
            return True
    return False


def _parse_regex_literal(body: str) -> tuple[str, str]:
    if not body.startswith("/"):
        raise ValueError("regex must start with /")
    i = 1
    source = ""
    escaped = False
    while i < len(body):
        ch = body[i]
        if escaped:
            source += ch
            escaped = False
            i += 1
            continue
        if ch == "\\":
            source += ch
            escaped = True
            i += 1
            continue
        if ch == "/":
            break
        source += ch
        i += 1
    if i >= len(body) or body[i] != "/":
        raise ValueError("unterminated regex")
    flags = body[i + 1:]
    if flags and not re.fullmatch(r"[gimsuy]*", flags):
        raise ValueError(f"invalid regex flags: {flags}")
    re.compile(source, _re_flags(flags))  # validate
    return source, flags


def _re_flags(flags: str) -> int:
    f = 0
    if not flags:
        return f
    if "i" in flags:
        f |= re.IGNORECASE
    if "m" in flags:
        f |= re.MULTILINE
    if "s" in flags:
        f |= re.DOTALL
    return f
