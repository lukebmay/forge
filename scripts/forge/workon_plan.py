#!/usr/bin/env python3
"""Pure workon reconcile planner (WR1). No DBus / subprocess / network."""

from __future__ import annotations

import re
from typing import Any, Optional

PROFILE_VERSION = 2
MODE_RECONCILE = "reconcile"

_SLOT_RE = re.compile(r"^(mon\d+|primary)(?:\.(.+))?$")
_MON_KEY_RE = re.compile(r"^mon(\d+)$")
_MON_ID_RE = re.compile(r"^mo(\d+)ws(\d+)$")
_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def validate_reconcile_profile(data: Any) -> dict[str, Any]:
    """
    Validate version-2 reconcile profile; return normalized dict.
    Raises ValueError with a clear message.

    Human-friendly defaults (no app-specific hardcoding in Forge):
      - version omitted + roles[] → 2
      - mode omitted + roles[] → reconcile
      - match string → {class: …}; open string → {app: …}
      - role.class / role.app shortcuts when match/open omitted
      - layout mon split omitted + ≥2 children → hsplit
      - child layout omitted + ≥2 roles → tabbed
      - child id omitted + single role → that role id
      - overflow omitted → mon0.overflow tabbed
      - role.slot from layout.roles listing when omitted
    """
    if not isinstance(data, dict):
        raise ValueError("profile must be a JSON object")

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
    mon_role_map: dict[str, str] = {}  # role_id → monN.childId

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
        children: list[dict[str, Any]] = []
        for i, ch in enumerate(children_in):
            if not isinstance(ch, dict):
                raise ValueError(f"layout.{mon_key}.children[{i}]: must be an object")
            roles_list = ch.get("roles")
            if roles_list is not None:
                if not isinstance(roles_list, list) or not all(
                    isinstance(r, str) and r.strip() for r in roles_list
                ):
                    raise ValueError(
                        f"layout.{mon_key}.children[{i}].roles must be a string array"
                    )
                roles_list = [str(r).strip() for r in roles_list]
            else:
                roles_list = None

            cid = ch.get("id")
            if cid is None or str(cid).strip() == "":
                # Single-role child: id defaults to that role id
                if roles_list and len(roles_list) == 1:
                    cid = roles_list[0]
                else:
                    raise ValueError(
                        f"layout.{mon_key}.children[{i}]: id required "
                        "(or single roles:[id] to default id)"
                    )
            cid = str(cid).strip()
            if not _NAME_RE.match(cid):
                raise ValueError(
                    f"layout.{mon_key}.children[{i}].id: invalid {cid!r} (use A-Za-z0-9_-)"
                )
            full_slot = f"{mon_key}.{cid}"
            if full_slot in slot_ids:
                raise ValueError(f"duplicate slot id: {full_slot}")
            slot_ids.add(full_slot)
            child: dict[str, Any] = {"id": cid}
            lay = ch.get("layout")
            if lay is None and roles_list and len(roles_list) >= 2:
                lay = "tabbed"  # multi-role pane → tab group
            if lay is not None:
                lay_s = str(lay).strip().lower()
                if lay_s not in ("tabbed", "stacked", "hsplit", "vsplit"):
                    raise ValueError(
                        f"layout.{mon_key}.children[{i}].layout: unsupported {lay!r}"
                    )
                child["layout"] = lay_s
            if roles_list is not None:
                child["roles"] = roles_list
                for rid in child["roles"]:
                    if rid in mon_role_map:
                        raise ValueError(f"role {rid!r} listed in multiple layout slots")
                    mon_role_map[rid] = full_slot
            children.append(child)

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

    return out


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
        "counts": {"reused": N, "opened": N, "moved": N, "parked": N},
        "roles": [...],
        "actions": [...],
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

    counts = {"reused": 0, "opened": 0, "moved": 0, "parked": 0, "structure": 0}
    slots_needing_layout: dict[str, str] = {}  # slot → mode

    layout_slot_modes = _slot_layout_modes(prof)
    overflow_slot = prof["overflow"]["slot"]
    overflow_layout = prof["overflow"]["layout"]
    parent_info = _window_parent_index(forest)

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

    unclaimed: list[dict[str, Any]] = []
    for w in windows:
        if _window_key(w) in claimed:
            continue
        summary = _window_summary(w)
        unclaimed.append(summary)
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

    # Multi-role tabbed/stacked slots: repair when claimed windows are not co-grouped.
    structure_slots: dict[str, dict[str, Any]] = {}
    for slot, mode in layout_slot_modes.items():
        if mode not in ("tabbed", "stacked"):
            continue
        wids = _role_window_ids_for_slot(role_results, slot)
        if len(wids) < 2:
            # Single claimed window (or none): no group to form yet.
            # Still mark layout needed when opens/moves already require it.
            continue
        if _windows_share_group(wids, parent_info, mode):
            continue
        structure_slots[slot] = {"mode": mode, "windowIds": wids}
        slots_needing_layout[slot] = mode

    counts["structure"] = len(structure_slots)

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
                wids = _role_window_ids_for_slot(role_results, slot)
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
    for mon_key, mon_body in prof.get("layout", {}).items():
        for ch in mon_body.get("children") or []:
            if ch.get("layout"):
                modes[f"{mon_key}.{ch['id']}"] = ch["layout"]
            elif ch.get("roles") and len(ch.get("roles") or []) > 1:
                modes[f"{mon_key}.{ch['id']}"] = "tabbed"
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
    """
    by_id = {str(r.get("id")): r for r in role_results if r.get("id") is not None}
    mon_body = (prof.get("layout") or {}).get(mon_key)
    out: list[Any] = []
    if isinstance(mon_body, dict):
        for ch in mon_body.get("children") or []:
            if not isinstance(ch, dict):
                continue
            lay = str(ch.get("layout") or "").strip().lower()
            if lay in ("tabbed", "stacked"):
                continue
            for rid in ch.get("roles") or []:
                r = by_id.get(str(rid))
                if not r:
                    continue
                wid = r.get("windowId")
                if wid is None or str(wid).strip() == "":
                    continue
                out.append(wid)
    if out:
        return out
    return _role_window_ids_for_mon(role_results, mon_key)


def _slot_mon_child_index(prof: dict[str, Any], slot: str) -> Optional[int]:
    """
    Index of slot among mon layout children (0 = first / left in hsplit).
    mon1.term with children [term, comms] → 0. mon0.term with [left-tab, term] → 1.
    """
    if not slot or "." not in slot:
        return None
    mon_key, child_id = slot.split(".", 1)
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
