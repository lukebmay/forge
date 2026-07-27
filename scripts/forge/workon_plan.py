#!/usr/bin/env python3
"""Pure workon reconcile planner (WR1). No DBus / subprocess / network."""

from __future__ import annotations

import copy
import re
from typing import Any, Optional

PROFILE_VERSION = 2
MODE_RECONCILE = "reconcile"

_SLOT_RE = re.compile(r"^(mon\d+|primary)(?:\.(.+))?$")
_MON_KEY_RE = re.compile(r"^mon(\d+)$")
_MON_ID_RE = re.compile(r"^mo(\d+)ws(\d+)$")
_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_SPLIT_ALIASES = {
    "h": "hsplit",
    "horizontal": "hsplit",
    "hsplit": "hsplit",
    "v": "vsplit",
    "vertical": "vsplit",
    "vsplit": "vsplit",
    "tabbed": "tabbed",
    "stacked": "stacked",
}


def normalize_profile(data: Any) -> dict[str, Any]:
    """
    Desugar tiles sugar → v2 IR and fill omit-noise defaults.
    Idempotent on pure IR (pass-through + setdefault only).
    """
    if not isinstance(data, dict):
        raise ValueError("profile must be a JSON object")

    out = copy.deepcopy(data)
    had_tiles = "tiles" in out
    if had_tiles:
        tiles = out.pop("tiles")
        if not isinstance(tiles, dict):
            raise ValueError("tiles must be an object")
        roles, layout = _desugar_tiles(tiles)
        out["roles"] = roles
        out["layout"] = layout

    has_roles = isinstance(out.get("roles"), list) and len(out.get("roles") or []) > 0
    if has_roles or had_tiles:
        out.setdefault("version", PROFILE_VERSION)
        out.setdefault("mode", MODE_RECONCILE)
        if "overflow" not in out:
            out["overflow"] = {"slot": "mon0.overflow", "layout": "tabbed"}
        if "marginal" not in out:
            out["marginal"] = {"mode": "coexist", "roleOrder": "first"}
    return out


def _desugar_tiles(tiles: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """tiles mon map → (roles[], layout{})."""
    roles: list[dict[str, Any]] = []
    layout: dict[str, Any] = {}
    used_ids: set[str] = set()

    for mon_key, mon_body in tiles.items():
        if not isinstance(mon_key, str) or not mon_key.strip():
            raise ValueError("tiles keys must be non-empty strings (mon0, mon1, …)")
        mon_key = mon_key.strip()
        if mon_key != "primary" and not _MON_KEY_RE.match(mon_key):
            raise ValueError(f"tiles key {mon_key!r}: want monN or primary")

        split_override: Optional[str] = None
        content: Any
        if isinstance(mon_body, list):
            content = mon_body
        elif isinstance(mon_body, dict):
            split_override = _normalize_split_alias(mon_body.get("split"), f"tiles.{mon_key}")
            if "content" in mon_body:
                content = mon_body["content"]
            elif "children" in mon_body:
                content = mon_body["children"]
            else:
                raise ValueError(f"tiles.{mon_key}: need content array (or bare array)")
        else:
            raise ValueError(f"tiles.{mon_key}: want array or {{split, content}}")

        if not isinstance(content, list):
            raise ValueError(f"tiles.{mon_key}.content must be an array")

        s_next = [0]
        children = _desugar_panes(
            content, mon_key, mon_key, roles, used_ids, s_next
        )
        entry: dict[str, Any] = {"children": children}
        split = split_override
        if split is None and len(children) >= 2:
            split = "hsplit"
        if split is not None:
            entry["split"] = split
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
        child = _desugar_pane(item, mon_key, path_prefix, where, roles, used_ids, s_next)
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
    # Nested split object
    if isinstance(item, dict) and ("split" in item or "content" in item or "children" in item):
        if "roles" in item and item.get("content") is None and item.get("children") is None:
            # role object that happened to use reserved keys — treat as role if open/match
            if item.get("open") is not None or item.get("match") is not None or item.get("app") is not None:
                return _desugar_role_pane(
                    [item], mon_key, path_prefix, where, roles, used_ids, s_next
                )
        split = _normalize_split_alias(item.get("split"), where)
        content = item.get("content")
        if content is None:
            content = item.get("children")
        if not isinstance(content, list):
            raise ValueError(f"{where}: nested split needs content array")
        cid = item.get("id")
        if cid is None or str(cid).strip() == "":
            cid = f"s{s_next[0]}"
            s_next[0] += 1
        else:
            cid = str(cid).strip()
            if not _NAME_RE.match(cid):
                raise ValueError(f"{where}.id: invalid {cid!r} (use A-Za-z0-9_-)")
        slot_path = f"{path_prefix}.{cid}"
        kids = _desugar_panes(content, mon_key, slot_path, roles, used_ids, s_next)
        node: dict[str, Any] = {"id": cid, "children": kids}
        if split is None and len(kids) >= 2:
            split = "hsplit"
        if split is not None:
            node["split"] = split
        return node

    # List: tab group of role cells, or nested split if mixed structure
    if isinstance(item, list):
        if len(item) == 0:
            raise ValueError(f"{where}: empty pane")
        if all(_is_role_cell(x) for x in item):
            return _desugar_role_pane(
                item, mon_key, path_prefix, where, roles, used_ids, s_next
            )
        # Nested split (prefer explicit {{split, content}} when ambiguous)
        cid = f"s{s_next[0]}"
        s_next[0] += 1
        slot_path = f"{path_prefix}.{cid}"
        kids = _desugar_panes(item, mon_key, slot_path, roles, used_ids, s_next)
        node = {"id": cid, "children": kids}
        if len(kids) >= 2:
            node["split"] = "hsplit"
        return node

    # Bare string / rich role object → single-role pane
    if _is_role_cell(item):
        return _desugar_role_pane(
            [item], mon_key, path_prefix, where, roles, used_ids, s_next
        )

    raise ValueError(f"{where}: want string, role object, array, or {{split, content}}")


def _is_role_cell(x: Any) -> bool:
    if isinstance(x, str):
        return True
    if not isinstance(x, dict):
        return False
    if "content" in x or "children" in x:
        return False
    if "split" in x and x.get("open") is None and x.get("match") is None and x.get("app") is None:
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
) -> dict[str, Any]:
    role_ids: list[str] = []
    for j, cell in enumerate(cells):
        role = _cell_to_role(cell, used_ids, f"{where}[{j}]" if len(cells) > 1 else where)
        role_ids.append(role["id"])
        roles.append(role)

    if len(role_ids) == 1:
        cid = role_ids[0]
        child: dict[str, Any] = {"id": cid, "roles": role_ids}
    else:
        cid = f"s{s_next[0]}"
        s_next[0] += 1
        child = {"id": cid, "layout": "tabbed", "roles": role_ids}

    full_slot = f"{path_prefix}.{cid}"
    for rid in role_ids:
        for r in roles:
            if r["id"] == rid and "slot" not in r:
                r["slot"] = full_slot
                break
    return child


def _cell_to_role(cell: Any, used_ids: set[str], where: str) -> dict[str, Any]:
    if isinstance(cell, str):
        token = cell.strip()
        if not token:
            raise ValueError(f"{where}: empty string cell")
        stem = token.split()[0]
        rid = _alloc_role_id(_stem_to_id(stem), used_ids)
        return {
            "id": rid,
            "match": {"class": stem},
            "open": {"app": stem if len(token.split()) == 1 else token},
        }

    if not isinstance(cell, dict):
        raise ValueError(f"{where}: role cell must be string or object")

    open_spec = cell.get("open")
    if open_spec is None and cell.get("app") is not None:
        open_spec = cell.get("app")
    if open_spec is None:
        raise ValueError(f"{where}: open (or app) required on role object")

    app_stem = _open_stem(open_spec)
    rid_raw = cell.get("id")
    if rid_raw is None or str(rid_raw).strip() == "":
        rid = _alloc_role_id(_stem_to_id(app_stem or "app"), used_ids)
    else:
        rid = str(rid_raw).strip()
        if not _NAME_RE.match(rid):
            raise ValueError(f"{where}.id: invalid {rid!r} (use A-Za-z0-9_-)")
        if rid in used_ids:
            rid = _alloc_role_id(rid, used_ids)
        else:
            used_ids.add(rid)

    match = cell.get("match")
    if match is None and cell.get("class") is not None:
        match = {"class": cell.get("class")}
    if match is None:
        match = {"class": app_stem or rid}

    role: dict[str, Any] = {"id": rid, "match": match, "open": open_spec}
    if cell.get("slot") is not None:
        role["slot"] = cell["slot"]
    return role


def _open_stem(open_spec: Any) -> str:
    if isinstance(open_spec, str):
        return open_spec.strip().split()[0] if open_spec.strip() else ""
    if isinstance(open_spec, dict):
        app = open_spec.get("app") or open_spec.get("desktop") or open_spec.get("command")
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


def validate_reconcile_profile(data: Any) -> dict[str, Any]:
    """
    Validate version-2 reconcile profile; return normalized dict.
    Raises ValueError with a clear message.

    Runs normalize_profile first (tiles sugar → IR + defaults).

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
    data = normalize_profile(data)

    has_roles = isinstance(data.get("roles"), list) and len(data.get("roles") or []) > 0

    if "version" not in data:
        if not has_roles:
            raise ValueError("profile version required (want version: 2) or provide roles[]")
        ver = PROFILE_VERSION
    else:
        ver = data["version"]
        if ver != PROFILE_VERSION and ver != str(PROFILE_VERSION):
            raise ValueError(
                f"unsupported profile version: {ver!r} (want {PROFILE_VERSION})"
            )

    mode = data.get("mode")
    if mode is None:
        if not has_roles:
            raise ValueError("mode required (want mode: reconcile) or provide roles")
        mode = MODE_RECONCILE
    if not isinstance(mode, str) or mode.strip().lower() != MODE_RECONCILE:
        raise ValueError(f"unsupported mode: {mode!r} (want {MODE_RECONCILE!r})")
    mode = MODE_RECONCILE

    if "roles" not in data:
        raise ValueError("profile roles required (array)")
    roles_in = data["roles"]
    if not isinstance(roles_in, list):
        raise ValueError("profile roles must be an array")
    if len(roles_in) == 0:
        raise ValueError("profile roles must be non-empty")

    layout_in = data.get("layout")
    if layout_in is None:
        layout_in = {}
    if not isinstance(layout_in, dict):
        raise ValueError("layout must be an object")

    layout: dict[str, Any] = {}
    slot_ids: set[str] = set()
    mon_role_map: dict[str, str] = {}  # role_id → monN.childId or deeper

    for mon_key, mon_body in layout_in.items():
        if not isinstance(mon_key, str) or not mon_key.strip():
            raise ValueError("layout keys must be non-empty strings (mon0, mon1, …)")
        mon_key = mon_key.strip()
        if mon_key != "primary" and not _MON_KEY_RE.match(mon_key):
            raise ValueError(f"layout key {mon_key!r}: want monN or primary")
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
                raise ValueError(f"layout.{mon_key}.split: unsupported {split!r}")
            split = split_s
        entry: dict[str, Any] = {"children": children}
        if split is not None:
            entry["split"] = split
        layout[mon_key] = entry

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
        if not _SLOT_RE.match(oslot):
            raise ValueError(f"overflow.slot invalid: {oslot!r}")
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
            raise ValueError(f"roles[{i}].id: invalid {rid!r} (use A-Za-z0-9_-)")
        if rid in seen_ids:
            raise ValueError(f"duplicate role id: {rid}")
        seen_ids.add(rid)

        match = role.get("match")
        if match is None and role.get("class") is not None:
            match = {"class": role.get("class")}
        if isinstance(match, str) and match.strip():
            match = {"class": match.strip()}
        if not isinstance(match, dict) or not match:
            raise ValueError(
                f"roles[{i}] ({rid}): match object required "
                '(or match:"WmClass" / class:"WmClass")'
            )
        norm_match = _normalize_match(match, f"roles[{i}].match")

        open_spec = role.get("open")
        if open_spec is None and role.get("app") is not None:
            open_spec = {"app": role.get("app")}
        if isinstance(open_spec, str) and open_spec.strip():
            open_spec = {"app": open_spec.strip()}
        if open_spec is None:
            raise ValueError(
                f"roles[{i}] ({rid}): open object required "
                '(or open:"app" / app:"app")'
            )
        if not isinstance(open_spec, dict):
            raise ValueError(f"roles[{i}] ({rid}): open must be an object or string")
        app = open_spec.get("app") or open_spec.get("desktop") or open_spec.get("command")
        if app is None or str(app).strip() == "":
            raise ValueError(f"roles[{i}] ({rid}): open.app required")
        norm_open: dict[str, Any] = {"app": str(app).strip()}
        wc = open_spec.get("wmClass") or open_spec.get("wm_class")
        if wc is not None and str(wc).strip() != "":
            norm_open["wmClass"] = str(wc).strip()
        if "timeout" in open_spec and open_spec["timeout"] is not None:
            try:
                norm_open["timeout"] = int(open_spec["timeout"])
            except (TypeError, ValueError) as e:
                raise ValueError(f"roles[{i}] ({rid}): open.timeout must be int") from e
        mon = open_spec.get("monitor")
        if mon is not None and str(mon).strip() != "":
            norm_open["monitor"] = mon
        path = open_spec.get("treePath") or open_spec.get("path") or open_spec.get("tree_path")
        if path is not None and str(path).strip() != "":
            norm_open["treePath"] = str(path).strip()
        if open_spec.get("first") is not None:
            norm_open["first"] = bool(open_spec["first"])
        no_wait = open_spec.get("noWait") if "noWait" in open_spec else open_spec.get("no_wait")
        if no_wait is not None:
            norm_open["noWait"] = bool(no_wait)

        slot = role.get("slot")
        if slot is not None:
            if not isinstance(slot, str) or not slot.strip():
                raise ValueError(f"roles[{i}] ({rid}): slot must be a non-empty string")
            slot = slot.strip()
            if not _SLOT_RE.match(slot):
                raise ValueError(f"roles[{i}] ({rid}): invalid slot {slot!r}")
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

        roles.append(
            {
                "id": rid,
                "match": norm_match,
                "open": norm_open,
                "slot": slot,
            }
        )

    out: dict[str, Any] = {
        "version": PROFILE_VERSION,
        "mode": mode,
        "roles": roles,
        "layout": layout,
        "overflow": overflow,
    }

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

    # marginal: omit-noise defaults coexist / first; reject unknown mode
    marginal = data.get("marginal")
    if marginal is None:
        out["marginal"] = {"mode": "coexist", "roleOrder": "first"}
    else:
        if not isinstance(marginal, dict):
            raise ValueError("marginal must be an object")
        m_mode = marginal.get("mode", "coexist")
        if m_mode is None or str(m_mode).strip() == "":
            m_mode = "coexist"
        m_mode = str(m_mode).strip().lower()
        if m_mode not in ("coexist", "strict"):
            raise ValueError(
                f"marginal.mode: unsupported {m_mode!r} (want coexist|strict)"
            )
        role_order = marginal.get("roleOrder") or marginal.get("role_order") or "first"
        if role_order is None or str(role_order).strip() == "":
            role_order = "first"
        role_order = str(role_order).strip().lower()
        out["marginal"] = {"mode": m_mode, "roleOrder": role_order}

    floating = data.get("floating")
    if floating is not None:
        if not isinstance(floating, list):
            raise ValueError("floating must be an array")
        out["floating"] = floating

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
                isinstance(r, str) and r.strip() for r in roles_list
            ):
                raise ValueError(f"{ch_where}.roles must be a string array")
            roles_list = [str(r).strip() for r in roles_list]
        else:
            roles_list = None

        if has_nested and roles_list:
            raise ValueError(f"{ch_where}: use roles or nested children, not both")

        cid = ch.get("id")
        if cid is None or str(cid).strip() == "":
            if roles_list and len(roles_list) == 1 and not has_nested:
                cid = roles_list[0]
            else:
                raise ValueError(
                    f"{ch_where}: id required "
                    "(or single roles:[id] to default id)"
                )
        cid = str(cid).strip()
        if not _NAME_RE.match(cid):
            raise ValueError(f"{ch_where}.id: invalid {cid!r} (use A-Za-z0-9_-)")
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
                    raise ValueError(f"{ch_where}.split: unsupported {split!r}")
                child["split"] = split_s
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
                        raise ValueError(f"role {rid!r} listed in multiple layout slots")
                    mon_role_map[rid] = full_slot

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


def plan_reconcile(forest: dict, profile: dict) -> dict[str, Any]:
    """
    Build a reconcile plan from a GetTree forest + validated (or raw) v2 profile.

    Returns:
      {
        "ok": True,
        "nothingToDo": bool,
        "counts": {"reused": N, "opened": N, "moved": N, "parked": N, "kept": N},
        "roles": [...],
        "actions": [...],
        "kept": [...],
        "unclaimed": [...],
      }
    """
    if not isinstance(forest, dict):
        raise ValueError("forest must be a JSON object")
    prof = validate_reconcile_profile(profile)

    windows = collect_windows(forest)
    claimed: set[str] = set()  # windowId keys
    role_results: list[dict[str, Any]] = []
    actions: list[dict[str, Any]] = []

    counts = {
        "reused": 0,
        "opened": 0,
        "moved": 0,
        "parked": 0,
        "kept": 0,
        "structure": 0,
    }
    slots_needing_layout: dict[str, str] = {}  # slot → mode

    layout_slot_modes = _slot_layout_modes(prof)
    overflow_slot = prof["overflow"]["slot"]
    overflow_layout = prof["overflow"]["layout"]
    parent_info = _window_parent_index(forest)
    marginal = prof.get("marginal") or {}
    marginal_mode = str(marginal.get("mode") or "coexist").strip().lower()
    role_order = str(marginal.get("roleOrder") or "first").strip().lower()

    for role in prof["roles"]:
        rid = role["id"]
        slot = role["slot"]
        desired_mon = mon_index_from_slot(slot)
        pref_mon = _match_mon_pref(role["match"], desired_mon)

        candidates = [
            w
            for w in windows
            if _window_key(w) not in claimed and window_matches(w, role["match"])
        ]
        # Prefer preferred mon, then any
        chosen = _pick_window(candidates, pref_mon)

        entry: dict[str, Any] = {"id": rid, "slot": slot}
        if chosen is None:
            entry["status"] = "open"
            counts["opened"] += 1
            actions.append(
                {
                    "op": "open",
                    "role": rid,
                    "open": dict(role["open"]),
                    "slot": slot,
                }
            )
            mode = layout_slot_modes.get(slot)
            if mode:
                slots_needing_layout[slot] = mode
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
                move_act: dict[str, Any] = {
                    "op": "move",
                    "role": rid,
                    "windowId": chosen.get("windowId"),
                    "path": chosen.get("path"),
                    "slot": slot,
                }
                # First mon-layout child → prepend under MONITOR (term | tabs).
                child_i = _slot_mon_child_index(prof, slot)
                if child_i is not None:
                    move_act["childIndex"] = child_i
                    if child_i == 0:
                        move_act["position"] = "start"
                actions.append(move_act)
                mode = layout_slot_modes.get(slot)
                if mode:
                    slots_needing_layout[slot] = mode
        role_results.append(entry)

    # Coexist: unclaimed already in a claimed role's slot CON → keep; else park.
    # Strict: park all unclaimed (legacy park-all).
    slot_members = (
        _build_slot_membership(role_results, parent_info, windows)
        if marginal_mode != "strict"
        else {}
    )
    key_to_slot: dict[str, str] = {}
    for slot, keys in slot_members.items():
        for k in keys:
            key_to_slot.setdefault(k, slot)

    kept: list[dict[str, Any]] = []
    unclaimed: list[dict[str, Any]] = []
    for w in windows:
        if _window_key(w) in claimed:
            continue
        summary = _window_summary(w)
        key = _window_key(w)
        keep_slot = key_to_slot.get(key) if marginal_mode != "strict" else None
        if keep_slot is not None:
            entry = dict(summary)
            entry["status"] = "kept"
            entry["slot"] = keep_slot
            kept.append(entry)
            unclaimed.append(entry)
            counts["kept"] += 1
        else:
            entry = dict(summary)
            entry["status"] = "parked"
            unclaimed.append(entry)
            counts["parked"] += 1
            actions.append(
                {
                    "op": "park",
                    "windowId": w.get("windowId"),
                    "path": w.get("path"),
                    "slot": overflow_slot,
                }
            )

    if counts["parked"] > 0:
        slots_needing_layout[overflow_slot] = overflow_layout

    # Tabbed/stacked: repair when not co-grouped; roleOrder first → roles then keeps.
    structure_slots: dict[str, dict[str, Any]] = {}
    slots_for_structure = set(layout_slot_modes.keys())
    for k in kept:
        if k.get("slot"):
            slots_for_structure.add(str(k["slot"]))

    for slot in slots_for_structure:
        mode = layout_slot_modes.get(slot)
        if mode not in ("tabbed", "stacked", None):
            continue
        if mode is None:
            # Single-role slot with companions → treat as tabbed bag
            mode = "tabbed"
        wids = _ordered_slot_window_ids(role_results, slot, kept, role_order)
        if len(wids) < 2:
            continue
        share = _windows_share_group(wids, parent_info, mode)
        order_ok = True
        if role_order == "first" and share:
            actual = _sibling_order_ids(wids, parent_info)
            order_ok = [str(x) for x in actual] == [str(x) for x in wids]
        if share and order_ok:
            continue
        structure_slots[slot] = {"mode": mode, "windowIds": wids}
        slots_needing_layout[slot] = mode

    counts["structure"] = len(structure_slots)

    # Keeps are no placement work
    has_placement = counts["opened"] > 0 or counts["moved"] > 0 or counts["parked"] > 0
    has_work = has_placement or counts["structure"] > 0
    ensure_actions: list[dict[str, Any]] = []
    if has_work:
        # mon-level splits only when placement changes (avoid rewriting CON layout).
        # Anchor on mon-direct children (term slots), never tab-group members —
        # layout acts on the window's parent CON, so chrome in a tab would
        # demote TABBED → HSPLIT.
        if has_placement:
            for mon_key, mon_body in prof.get("layout", {}).items():
                split = mon_body.get("split")
                if split:
                    ensure_actions.append(
                        {
                            "op": "ensure_layout",
                            "slot": mon_key,
                            "mode": split,
                            "windowIds": _mon_split_anchor_ids(
                                role_results, mon_key, prof
                            ),
                        }
                    )
        for slot, mode in sorted(slots_needing_layout.items()):
            wids = structure_slots.get(slot, {}).get("windowIds")
            if wids is None:
                wids = _ordered_slot_window_ids(
                    role_results, slot, kept, role_order
                )
            entry: dict[str, Any] = {
                "op": "ensure_layout",
                "slot": slot,
                "mode": mode,
            }
            if wids:
                entry["windowIds"] = wids
            ensure_actions.append(entry)

    # de-dupe ensure by slot (first wins — mon splits already prepended)
    seen_ensure: set[str] = set()
    deduped_ensure: list[dict[str, Any]] = []
    for a in ensure_actions:
        key = a["slot"]
        if key in seen_ensure:
            continue
        seen_ensure.add(key)
        deduped_ensure.append(a)

    final_actions = deduped_ensure + actions
    nothing = not has_work

    return {
        "ok": True,
        "nothingToDo": nothing,
        "counts": counts,
        "roles": role_results,
        "actions": final_actions,
        "kept": kept,
        "unclaimed": unclaimed,
    }


def collect_windows(forest: Any) -> list[dict[str, Any]]:
    """Collect WINDOW nodes with path + monitor; prefer all mon roots in forest."""
    out: list[dict[str, Any]] = []

    def walk(n: Any, path: str, mon_idx: Optional[int]) -> None:
        if not isinstance(n, dict):
            return
        ntype = n.get("nodeType") or n.get("type")
        if ntype == "WINDOW":
            w = {
                "windowId": n.get("windowId"),
                "wmClass": n.get("wmClass") or n.get("wm_class"),
                "title": n.get("title"),
                "path": path or n.get("path"),
                "monitor": n.get("monitor") if isinstance(n.get("monitor"), int) else mon_idx,
                "mode": n.get("mode"),
                "pid": n.get("pid"),
            }
            if w["windowId"] is None and not w.get("path"):
                return
            out.append(w)
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
    """mon0.left-tab → 0; mon1 → 1; primary → 0."""
    if not slot:
        return None
    m = _SLOT_RE.match(slot)
    if not m:
        return None
    head = m.group(1)
    if head == "primary":
        return 0
    mm = _MON_KEY_RE.match(head)
    if mm:
        return int(mm.group(1))
    return None


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


def _match_mon_pref(match: dict[str, Any], slot_mon: Optional[int]) -> Optional[int]:
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
    candidates: list[dict[str, Any]], pref_mon: Optional[int]
) -> Optional[dict[str, Any]]:
    if not candidates:
        return None
    if pref_mon is not None:
        on_mon = [w for w in candidates if window_monitor_index(w) == pref_mon]
        if on_mon:
            return on_mon[0]
    return candidates[0]


def _class_eq(a: Any, b: Any) -> bool:
    if a is None or b is None:
        return False
    return str(a).strip().lower() == str(b).strip().lower()


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


def _slot_layout_modes(prof: dict[str, Any]) -> dict[str, str]:
    """Map full slot (mon0.left-tab) → layout mode when specified."""
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


def _role_window_ids_for_slot(
    role_results: list[dict[str, Any]], slot: str
) -> list[Any]:
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


def _build_slot_membership(
    role_results: list[dict[str, Any]],
    parent_info: dict[str, dict[str, Any]],
    windows: list[dict[str, Any]],
) -> dict[str, set[str]]:
    """
    Per slot: window keys in the claimed role's parent CON (siblings).
    Bare tile under MONITOR → only the claimed role window (no companions).
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
    for r in role_results:
        wid = r.get("windowId")
        slot = r.get("slot")
        if wid is None or not slot:
            continue
        key = f"id:{wid}"
        membership.setdefault(str(slot), set()).add(key)
        info = parent_info.get(str(wid))
        if not info:
            continue
        pt = str(info.get("parent_type") or "").upper()
        pp = info.get("parent_path")
        if not pp or pt == "MONITOR":
            continue
        for sib in by_parent.get(str(pp), []):
            membership[str(slot)].add(sib)
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


def _sibling_order_ids(
    window_ids: list[Any], parent_info: dict[str, dict[str, Any]]
) -> list[Any]:
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


def _role_window_ids_for_mon(
    role_results: list[dict[str, Any]], mon_key: str
) -> list[Any]:
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


def _mon_split_anchor_ids(
    role_results: list[dict[str, Any]], mon_key: str, prof: dict[str, Any]
) -> list[Any]:
    """
    Window ids for mon-level hsplit/vsplit ensure.

    Prefer roles in mon children that are *not* tabbed/stacked groups (direct
    tiles like mon0.term). Layout rewrites the selected window's parent, so
    using a tab member would convert the tab CON to HSPLIT.
    Nested mon children: walk first leaf role under each non-tab top child.
    """
    by_id = {str(r.get("id")): r for r in role_results if r.get("id") is not None}
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
            for rid in first_role_ids(ch):
                r = by_id.get(rid)
                if not r:
                    continue
                wid = r.get("windowId")
                if wid is None or str(wid).strip() == "":
                    continue
                out.append(wid)
                break
    if out:
        return out
    return _role_window_ids_for_mon(role_results, mon_key)


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
                walk(m, str(m.get("id") or "") if isinstance(m, dict) else "", None, None, None)
        else:
            walk(forest, "", None, None, None)
    elif isinstance(forest, list):
        for m in _order_monitors(forest):
            walk(m, str(m.get("id") or "") if isinstance(m, dict) else "", None, None, None)
    return out


def _windows_share_group(
    window_ids: list[Any], parent_info: dict[str, dict[str, Any]], mode: str
) -> bool:
    """
    True when all windows share one CON parent with the desired tab/stack layout.
    Fewer than two windows always "share" (nothing to group).
    """
    if len(window_ids) < 2:
        return True
    want = "TABBED" if mode == "tabbed" else "STACKED" if mode == "stacked" else None
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
    if any(str(i.get("parent_type") or "").upper() == "MONITOR" for i in infos):
        return False
    if want:
        got = str(infos[0].get("parent_layout") or "").upper()
        if got != want:
            return False
    return True


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
    flags = body[i + 1 :]
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
