#!/usr/bin/env python3
"""Live-matrix runner for forge-test (not part of the user forge CLI)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

_HERE = Path(__file__).resolve().parent
_FORGE_SCRIPT = _HERE / "forge"
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

_FORGE_MOD = None


def _forge():
    global _FORGE_MOD
    if _FORGE_MOD is None:
        import importlib.util
        from importlib.machinery import SourceFileLoader

        loader = SourceFileLoader("forge_user_cli", str(_FORGE_SCRIPT))
        spec = importlib.util.spec_from_loader(loader.name, loader)
        assert spec is not None
        mod = importlib.util.module_from_spec(spec)
        loader.exec_module(mod)
        _FORGE_MOD = mod
    return _FORGE_MOD


def _check_deps():
    return _forge()._check_deps()


def _eprint(*args: object) -> None:
    _forge()._eprint(*args)


def _print_json(data: Any, compact: bool) -> None:
    _forge()._print_json(data, compact)


def _layout_is_verbose(args: Any) -> bool:
    return _forge()._layout_is_verbose(args)


def _layout_load_tree(backend: Optional[str], tree_file: Optional[str]) -> dict[str, Any]:
    return _forge()._layout_load_tree(backend, tree_file)


def call_method(backend: str, method: str, *args: str) -> str:
    return _forge().call_method(backend, method, *args)


def do_launch(*args: Any, **kwargs: Any) -> Any:
    return _forge().do_launch(*args, **kwargs)


def run_mixed_steps(*args: Any, **kwargs: Any) -> Any:
    return _forge().run_mixed_steps(*args, **kwargs)


def _test_live_get_forest(backend: Optional[str], tree_file: Optional[str]) -> dict[str, Any]:
    return _layout_load_tree(backend, tree_file)


def _test_live_probe(
    backend: Optional[str], *, tree_file: Optional[str] = None
) -> dict[str, Any]:
    from live_matrix import capability_from_forest, format_probe_text

    ping_payload: Optional[dict[str, Any]] = None
    if tree_file is None and backend is not None:
        try:
            raw = call_method(backend, "Ping")
            ping_payload = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(ping_payload, dict):
                ping_payload = {"ok": True, "raw": ping_payload}
        except Exception as e:
            ping_payload = {"ok": False, "error": str(e)}
    forest = _test_live_get_forest(backend, tree_file)
    cap = capability_from_forest(forest, ping=ping_payload)
    return {"capability": cap, "forest": forest, "text": format_probe_text(cap)}


def _test_live_close_chrome(
    backend: str, *, mon_index: Optional[int] = None
) -> list[str]:
    """Close TILE chrome-family windows (all mons, or one tree mon index)."""
    forest = _test_live_get_forest(backend, None)
    from live_matrix import select_chrome_tile_ids

    closed = select_chrome_tile_ids(forest, mon_index=mon_index)
    if closed:
        steps = [{"op": "close", "selector": f"id:{wid}"} for wid in closed]
        run_mixed_steps(backend, steps, stop_on_error=False, print_each=False)
    return closed


def _test_live_close_all_tiles(backend: str, keep_id: Optional[str]) -> list[str]:
    forest = _test_live_get_forest(backend, None)
    from live_matrix import iter_windows

    closed: list[str] = []
    steps: list[dict[str, Any]] = []
    keep = str(keep_id) if keep_id else None
    for w in iter_windows(forest):
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        wid = w.get("windowId")
        if wid is None:
            continue
        if keep and str(wid) == keep:
            continue
        steps.append({"op": "close", "selector": f"id:{wid}"})
        closed.append(str(wid))
    if steps:
        run_mixed_steps(backend, steps, stop_on_error=False, print_each=False)
    return closed


def _test_live_run_layout(
    name: str, *, verbose: bool = True
) -> tuple[int, str, int]:
    """
    Invoke forge layout <name> as subprocess (same CLI).

    Returns (rc, combined stdout+stderr, wall_ms).
    verbose=True (default for live matrix) so apply JSON is available for metrics.
    """
    cmd = [sys.executable, str(_FORGE_SCRIPT), "layout", name]
    if verbose:
        cmd.append("--verbose")
    # Prefer local forge path so we use this tree
    env = os.environ.copy()
    if verbose:
        env["FORGE_VERBOSE"] = "1"
    t0 = time.monotonic()
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        env=env,
        timeout=300,
    )
    wall_ms = int(max(0.0, (time.monotonic() - t0) * 1000))
    out = (proc.stdout or "") + "\n" + (proc.stderr or "")
    # Keep a long tail for metrics + debug (soft barriers can be verbose).
    return int(proc.returncode), out[-120000:], wall_ms


def _test_live_ensure_nautilus(backend: str) -> dict[str, Any]:
    """Open Nautilus if no nautilus window is present. Pure detect + launch."""
    from live_matrix import forest_has_nautilus

    forest = _test_live_get_forest(backend, None)
    if forest_has_nautilus(forest):
        return {"launched": False, "already": True}
    # Desktop id first; fall back to short name for resolve_desktop_file.
    result: dict[str, Any] = {}
    rc = 1
    for app in ("org.gnome.Nautilus", "nautilus"):
        rc, result = do_launch(backend, app=app, print_result=False)
        if rc == 0:
            break
    if rc != 0:
        return {
            "launched": False,
            "already": False,
            "error": (result or {}).get("error") or "launch failed",
        }
    time.sleep(0.6)
    forest2 = _test_live_get_forest(backend, None)
    return {
        "launched": True,
        "already": False,
        "ok": forest_has_nautilus(forest2),
        "windowId": (result or {}).get("windowId"),
    }


def _test_live_ensure_dev_shape(backend: str) -> dict[str, Any]:
    """No-op when dual-mon test shape already present; else bootstrap test profile."""
    from live_matrix import forest_looks_like_dev_shape

    # Prefer dedicated test profile (not personal `dev`).
    bootstrap = "_forge-test-dual"
    forest = _test_live_get_forest(backend, None)
    ok, detail = forest_looks_like_dev_shape(forest)
    if ok:
        return {"shaped": True, "action": "noop", "detail": detail}
    rc, out, _wall = _test_live_run_layout(bootstrap, verbose=False)
    time.sleep(0.5)
    forest2 = _test_live_get_forest(backend, None)
    ok2, detail2 = forest_looks_like_dev_shape(forest2)
    return {
        "shaped": ok2,
        "action": f"layout-{bootstrap}",
        "layoutRc": rc,
        "detail": detail2 if ok2 else f"before={detail}; after={detail2}",
        "layoutTail": out[-400:] if out else "",
    }


def _test_live_ensure_some_tiles(
    backend: str, *, keep_id: Optional[str] = None
) -> dict[str, Any]:
    """If no TILE windows (other than keep), bootstrap via layout dev."""
    from live_matrix import forest_has_some_tiles

    allow = {str(keep_id)} if keep_id else set()
    forest = _test_live_get_forest(backend, None)
    if forest_has_some_tiles(forest, allow_window_ids=allow):
        return {"action": "noop", "hasTiles": True}
    rc, out, _wall = _test_live_run_layout("_forge-test-dual", verbose=False)
    time.sleep(0.5)
    forest2 = _test_live_get_forest(backend, None)
    has = forest_has_some_tiles(forest2, allow_window_ids=allow)
    return {
        "action": "layout-dev",
        "hasTiles": has,
        "layoutRc": rc,
        "layoutTail": out[-400:] if out else "",
    }


def _test_live_pick_disposable_chrome(
    forest: Any, *, keep_id: Optional[str] = None
) -> Optional[str]:
    """
    Prefer plain browser chrome (New Tab / 'Google Chrome') over named PWA titles.
    Never pick agent keep_id.
    """
    from live_matrix import iter_windows, select_chrome_tile_ids

    keep = str(keep_id) if keep_id else None
    ids = select_chrome_tile_ids(forest)
    by_id = {
        str(w.get("windowId")): w
        for w in iter_windows(forest)
        if w.get("windowId") is not None
    }
    ranked: list[tuple[int, str]] = []
    for wid in ids:
        if keep and wid == keep:
            continue
        w = by_id.get(wid) or {}
        title = str(w.get("title") or "").strip()
        tl = title.casefold()
        # Prefer disposable browser chrome; avoid high-value role titles.
        if tl in ("", "google chrome", "new tab", "chromium") or "new tab" in tl:
            rank = 0
        elif any(
            k in tl
            for k in ("grok", "youtube", "gmail", "voice", "messages")
        ):
            rank = 2
        else:
            rank = 1
        ranked.append((rank, wid))
    if not ranked:
        return None
    ranked.sort(key=lambda t: (t[0], t[1]))
    return ranked[0][1]


def _test_live_pick_any_tile(
    forest: Any, *, keep_id: Optional[str] = None
) -> Optional[str]:
    from live_matrix import iter_windows

    keep = str(keep_id) if keep_id else None
    for w in iter_windows(forest):
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        wid = w.get("windowId")
        if wid is None:
            continue
        sid = str(wid)
        if keep and sid == keep:
            continue
        return sid
    # Fall back to keep if it is a tile
    if keep:
        for w in iter_windows(forest):
            if str(w.get("windowId")) == keep and str(w.get("mode") or "").upper() == "TILE":
                return keep
    return None


def _test_live_focus_id(backend: str, window_id: str) -> dict[str, Any]:
    steps = [{"op": "focus", "selector": f"id:{window_id}", "keyboard": True}]
    rc, out = run_mixed_steps(backend, steps, stop_on_error=True, print_each=False)
    return {"ok": rc == 0, "windowId": window_id, "result": out}


def _test_live_close_id(backend: str, window_id: str) -> dict[str, Any]:
    steps = [{"op": "close", "selector": f"id:{window_id}"}]
    rc, out = run_mixed_steps(backend, steps, stop_on_error=False, print_each=False)
    return {"ok": rc == 0, "closed": window_id, "result": out}


def _test_live_unfocus(backend: str) -> dict[str, Any]:
    steps = [{"op": "unfocus"}]
    rc, out = run_mixed_steps(backend, steps, stop_on_error=True, print_each=False)
    return {"ok": rc == 0, "result": out}


def _test_live_r012_tab_mon1_then_center_join_mon0(
    backend: str, *, keep_id: Optional[str] = None
) -> dict[str, Any]:
    """
    R012 live action: tab Nautilus with mon1 Ghostty, then synthetic center
    dnd-drop onto mon0 Ghostty (GRAB_TILE + entered-monitor probe).
    """
    from live_matrix import (
        _is_ghostty_class,
        _is_nautilus_wm_class,
        _wm_class_str,
        iter_windows_with_mon,
    )

    forest = _test_live_get_forest(backend, None)
    keep = str(keep_id) if keep_id else None

    def _pick_ghosttys_and_nautilus(fr: Any) -> tuple[Optional[str], Optional[str], Optional[str]]:
        """Return (mon0_ghostty, mon1_ghostty, nautilus). Agent may be mon0 Ghostty target."""
        m0: Optional[str] = None
        m1: Optional[str] = None
        nau: Optional[str] = None
        m0_non_agent: Optional[str] = None
        m1_non_agent: Optional[str] = None
        for mon_i, w in iter_windows_with_mon(fr):
            if str(w.get("mode") or "").upper() != "TILE":
                continue
            wid = w.get("windowId")
            if wid is None:
                continue
            sid = str(wid)
            cls = _wm_class_str(w)
            if _is_nautilus_wm_class(cls) and nau is None:
                nau = sid
            if _is_ghostty_class(cls):
                if mon_i == 0:
                    if m0 is None:
                        m0 = sid
                    if keep and sid != keep and m0_non_agent is None:
                        m0_non_agent = sid
                if mon_i == 1:
                    if m1 is None:
                        m1 = sid
                    if keep and sid != keep and m1_non_agent is None:
                        m1_non_agent = sid
        # Prefer non-agent Ghostty when both exist (agent must survive; drop onto peer).
        return (m0_non_agent or m0, m1_non_agent or m1, nau)

    mon0_ghostty, mon1_ghostty, nautilus = _pick_ghosttys_and_nautilus(forest)

    if not mon0_ghostty:
        return {"ok": False, "error": "no TILE Ghostty on mon0"}
    if not mon1_ghostty:
        return {"ok": False, "error": "no TILE Ghostty on mon1"}
    if not nautilus:
        # Test profiles often residuals=close — re-open after layout.
        ens = _test_live_ensure_nautilus(backend)
        if ens.get("error") or ens.get("ok") is False:
            return {"ok": False, "error": f"ensure-nautilus: {ens}"}
        time.sleep(0.8)
        forest = _test_live_get_forest(backend, None)
        mon0_ghostty, mon1_ghostty, nautilus = _pick_ghosttys_and_nautilus(forest)
    if not nautilus:
        return {"ok": False, "error": "no TILE Nautilus after ensure"}
    if not mon0_ghostty or not mon1_ghostty:
        return {
            "ok": False,
            "error": f"missing ghostty mon0={mon0_ghostty} mon1={mon1_ghostty}",
        }

    # 1) Join Nautilus with mon1 Ghostty (tab group on right mon).
    steps_tab = [
        {
            "op": "merge-group",
            "selector": f"id:{nautilus}",
            "with": f"id:{mon1_ghostty}",
        }
    ]
    rc1, out1 = run_mixed_steps(
        backend, steps_tab, stop_on_error=True, print_each=False
    )
    if rc1 != 0:
        return {
            "ok": False,
            "error": "merge-group mon1 failed",
            "result": out1,
            "nautilus": nautilus,
            "mon1Ghostty": mon1_ghostty,
        }
    time.sleep(0.35)

    # 2) Center drop onto mon0 Ghostty with entered-monitor mid GRAB_TILE (R012).
    steps_dnd = [
        {
            "op": "dnd-drop",
            "tile": f"id:{nautilus}",
            "onto": f"id:{mon0_ghostty}",
            "zone": "CENTER",
            "simulateEnteredMonitor": True,
        }
    ]
    rc2, out2 = run_mixed_steps(
        backend, steps_dnd, stop_on_error=True, print_each=False
    )
    return {
        "ok": rc2 == 0,
        "nautilus": nautilus,
        "mon0Ghostty": mon0_ghostty,
        "mon1Ghostty": mon1_ghostty,
        "mergeResult": out1,
        "dndResult": out2,
        "error": None if rc2 == 0 else "dnd-drop center mon0 failed",
    }


def _test_live_r015_empty_mon1_dnd(
    backend: str, *, keep_id: Optional[str] = None
) -> dict[str, Any]:
    """
    R015 live action: ensure mon1 has no TILE, pick a mon0 TILE (not agent),
    synthetic dnd-drop with destMonitor=1 (empty-mon rehome).
    """
    from live_matrix import (
        _is_ghostty_class,
        _is_nautilus_wm_class,
        _wm_class_str,
        iter_windows_with_mon,
    )

    forest = _test_live_get_forest(backend, None)
    keep = str(keep_id) if keep_id else None

    mon0_tiles: list[str] = []
    mon1_tiles: list[str] = []
    for mon_i, w in iter_windows_with_mon(forest):
        if str(w.get("mode") or "").upper() != "TILE":
            continue
        wid = w.get("windowId")
        if wid is None:
            continue
        sid = str(wid)
        if keep and sid == keep:
            continue
        if mon_i == 0:
            mon0_tiles.append(sid)
        elif mon_i == 1:
            mon1_tiles.append(sid)

    # Clear mon1 tiles so dest is empty (close non-agent).
    for sid in list(mon1_tiles):
        info = _test_live_close_id(backend, sid)
        if not info.get("ok"):
            return {
                "ok": False,
                "error": f"could not clear mon1 tile {sid}: {info}",
            }
        time.sleep(0.25)
    if mon1_tiles:
        time.sleep(0.35)
        forest = _test_live_get_forest(backend, None)
        mon1_tiles = []
        mon0_tiles = []
        for mon_i, w in iter_windows_with_mon(forest):
            if str(w.get("mode") or "").upper() != "TILE":
                continue
            wid = w.get("windowId")
            if wid is None:
                continue
            sid = str(wid)
            if keep and sid == keep:
                continue
            if mon_i == 0:
                mon0_tiles.append(sid)
            elif mon_i == 1:
                mon1_tiles.append(sid)
        if mon1_tiles:
            return {
                "ok": False,
                "error": f"mon1 still has tiles after close: {mon1_tiles}",
            }

    if not mon0_tiles:
        # Prefer Nautilus on mon0; else open one.
        ens = _test_live_ensure_nautilus(backend)
        if ens.get("error") or ens.get("ok") is False:
            return {"ok": False, "error": f"ensure-nautilus: {ens}"}
        time.sleep(0.8)
        forest = _test_live_get_forest(backend, None)
        mon0_tiles = []
        for mon_i, w in iter_windows_with_mon(forest):
            if mon_i != 0 or str(w.get("mode") or "").upper() != "TILE":
                continue
            wid = w.get("windowId")
            if wid is None:
                continue
            sid = str(wid)
            if keep and sid == keep:
                continue
            mon0_tiles.append(sid)
    if not mon0_tiles:
        return {"ok": False, "error": "no mon0 TILE to drag (excluding agent)"}

    # Prefer Nautilus or non-ghostty so we don't peel layout-critical ghostty.
    tile_id = mon0_tiles[0]
    forest = _test_live_get_forest(backend, None)
    for mon_i, w in iter_windows_with_mon(forest):
        if mon_i != 0 or str(w.get("mode") or "").upper() != "TILE":
            continue
        wid = w.get("windowId")
        if wid is None:
            continue
        sid = str(wid)
        if sid not in mon0_tiles:
            continue
        cls = _wm_class_str(w)
        if _is_nautilus_wm_class(cls):
            tile_id = sid
            break
        if not _is_ghostty_class(cls):
            tile_id = sid

    steps = [
        {
            "op": "dnd-drop",
            "tile": f"id:{tile_id}",
            "destMonitor": 1,
            "simulateEnteredMonitor": True,
        }
    ]
    rc, out = run_mixed_steps(backend, steps, stop_on_error=True, print_each=False)
    return {
        "ok": rc == 0,
        "tile": tile_id,
        "destMonitor": 1,
        "dndResult": out,
        "error": None if rc == 0 else "dnd-drop empty mon1 failed",
    }


def cmd_test(backend: Optional[str], args: argparse.Namespace) -> int:
    """
    AI live test matrix: probe capability, select cases by behaviors/regressions,
    plan or execute. See agents/plans/forge-ai-live-test-matrix.md.
    """
    from live_matrix import (
        LIVE_CASES,
        build_env_namespace,
        default_live_report_path,
        evaluate_checks,
        extract_layout_metrics,
        format_selection_text,
        list_cases,
        parse_csv_set,
        recommend_for_work,
        select_cases,
        summarize_metrics,
        summarize_run,
    )

    which = str(getattr(args, "test_which", "live") or "live").strip().lower()
    if which not in ("live",):
        _eprint(f"forge-test: unknown suite kind {which!r} (try: live)")
        return 1

    action = str(getattr(args, "live_action", "plan") or "plan").strip().lower()
    tree_file = getattr(args, "tree_file", None)
    verbose = bool(getattr(args, "verbose", False) or _layout_is_verbose(args))

    # Offline probe/list from tree-file does not need DBus.
    needs_bus = tree_file is None and action not in ("list",)
    if needs_bus and backend is None:
        try:
            backend = _check_deps()
        except SystemExit:
            raise
        except Exception as e:
            _eprint(f"forge-test live: DBus required: {e}")
            return 1

    if action == "list":
        rows = []
        for c in list_cases():
            rows.append(
                {
                    "id": c.id,
                    "layer": c.layer,
                    "title": c.title,
                    "behaviors": list(c.behaviors),
                    "regressions": list(c.regressions),
                    "requiresTrueCold": c.requires_true_cold,
                    "profile": c.profile,
                }
            )
        _print_json(rows, compact=False)
        return 0

    # Probe capability (always for plan/run/probe)
    try:
        probed = _test_live_probe(backend, tree_file=tree_file)
    except Exception as e:
        _eprint(f"forge-test live: probe failed: {e}")
        return 1
    cap = probed["capability"]

    if action == "probe":
        print(probed["text"])
        if verbose:
            _print_json(cap.to_dict(), compact=False)
        return 0 if cap.extension_ok or tree_file else 1

    suite = str(getattr(args, "suite", "auto") or "auto")
    behaviors = parse_csv_set(getattr(args, "behaviors", None))
    tags = parse_csv_set(getattr(args, "tags", None))
    case_ids = parse_csv_set(getattr(args, "cases", None))
    work = getattr(args, "from_work", None)

    if work:
        sel = recommend_for_work(str(work), cap)
        # still allow further AND filters
        if behaviors or tags or case_ids:
            sel = select_cases(
                suite=sel.suite,
                capability=cap,
                behaviors=behaviors or sel.behaviors,
                tags=tags or sel.tags,
                case_ids=case_ids or None,
            )
    else:
        sel = select_cases(
            suite=suite,
            capability=cap,
            behaviors=behaviors or None,
            tags=tags or None,
            case_ids=case_ids or None,
        )

    if action in ("plan", "select"):
        print(probed["text"])
        print()
        print(format_selection_text(sel, cap))
        if not sel.cases:
            _eprint("forge-test live: no cases selected")
            return 2
        if verbose:
            _print_json(
                {"capability": cap.to_dict(), "selection": sel.to_dict()},
                compact=False,
            )
        return 0

    if action not in ("run", "execute"):
        _eprint(
            f"forge-test live: unknown action {action!r} "
            "(probe|list|plan|run)"
        )
        return 1

    if tree_file:
        _eprint("forge-test live: --tree-file is probe/plan only (not run)")
        return 1
    if backend is None:
        _eprint("forge-test live: run requires DBus")
        return 1
    if not sel.cases:
        print(probed["text"])
        print(format_selection_text(sel, cap))
        _eprint("forge-test live: no cases selected")
        return 2

    print(probed["text"])
    print()
    print(format_selection_text(sel, cap))
    print()
    _eprint(f"forge-test live: executing {len(sel.cases)} case(s)…")

    case_results: list[dict[str, Any]] = []
    for c in sel.cases:
        _eprint(f"  → {c.id}: {c.title}")
        entry: dict[str, Any] = {
            "id": c.id,
            "title": c.title,
            "ok": False,
            "setup": [],
            "layoutRc": None,
            "checks": [],
        }
        try:
            # Re-probe agent id each case (survives closes)
            forest0 = _test_live_get_forest(backend, None)
            from live_matrix import capability_from_forest

            cap_case = capability_from_forest(forest0)
            # Prefer initial agent id if still present
            if cap.agent_window_id:
                from live_matrix import iter_windows

                ids = {
                    str(w.get("windowId"))
                    for w in iter_windows(forest0)
                    if w.get("windowId") is not None
                }
                if cap.agent_window_id in ids:
                    cap_case.agent_window_id = cap.agent_window_id

            for step in c.setup:
                if step == "close-chrome":
                    closed = _test_live_close_chrome(backend)
                    entry["setup"].append({"step": step, "closed": closed})
                    time.sleep(0.5)
                elif step == "close-mon0-chrome":
                    closed = _test_live_close_chrome(backend, mon_index=0)
                    entry["setup"].append(
                        {"step": step, "closed": closed, "monIndex": 0}
                    )
                    time.sleep(0.5)
                elif step == "close-mon1-chrome":
                    closed = _test_live_close_chrome(backend, mon_index=1)
                    entry["setup"].append(
                        {"step": step, "closed": closed, "monIndex": 1}
                    )
                    time.sleep(0.5)
                elif step == "close-all-tiles":
                    # Durable leader: close agent TILE too (true empty desk).
                    keep = cap_case.agent_window_id
                    if getattr(cap_case, "agent_window_optional", False):
                        keep = None
                    closed = _test_live_close_all_tiles(backend, keep)
                    entry["setup"].append(
                        {
                            "step": step,
                            "closed": closed,
                            "keptAgent": keep is not None,
                        }
                    )
                    time.sleep(0.8)
                elif step == "ensure-nautilus":
                    info = _test_live_ensure_nautilus(backend)
                    entry["setup"].append({"step": step, **info})
                elif step == "ensure-dev-shape":
                    info = _test_live_ensure_dev_shape(backend)
                    entry["setup"].append({"step": step, **info})
                elif step == "ensure-some-tiles":
                    info = _test_live_ensure_some_tiles(
                        backend, keep_id=cap_case.agent_window_id
                    )
                    entry["setup"].append({"step": step, **info})
                elif step in (
                    "keep-agent",
                    "keep-ghostty-tiles",
                    "keep-mon1",
                ):
                    # Declarative: agent survival is enforced by close helpers
                    # (never close agent id) + post-checks; no setup action.
                    entry["setup"].append({"step": step, "note": "declarative"})
                else:
                    entry["setup"].append({"step": step, "unknown": True})

            run_layout = bool(getattr(c, "run_layout", True))
            layout_ok = True
            if run_layout and c.profile:
                rc, layout_out, wall_ms = _test_live_run_layout(c.profile)
                entry["layoutRc"] = rc
                entry["layoutTail"] = layout_out[-800:]
                entry["metrics"] = extract_layout_metrics(
                    layout_out, wall_ms=wall_ms
                )
                layout_ok = rc == 0

            # Optional post-setup actions (FC3 close/unfocus).
            closed_window_id: Optional[str] = None
            lft_before: Optional[str] = None
            action_ok = True
            entry["actions"] = []
            forest_mid = _test_live_get_forest(backend, None)
            if isinstance(forest_mid, dict) and forest_mid.get(
                "lastTileFocusWindowId"
            ) is not None:
                lft_before = str(forest_mid.get("lastTileFocusWindowId"))
            for act in getattr(c, "actions", ()) or ():
                if act == "focus-disposable-chrome":
                    forest_a = _test_live_get_forest(backend, None)
                    wid = _test_live_pick_disposable_chrome(
                        forest_a, keep_id=cap_case.agent_window_id
                    )
                    if not wid:
                        entry["actions"].append(
                            {"step": act, "ok": False, "error": "no chrome TILE"}
                        )
                        action_ok = False
                        break
                    info = _test_live_focus_id(backend, wid)
                    entry["actions"].append({"step": act, **info})
                    if not info.get("ok"):
                        action_ok = False
                        break
                    time.sleep(0.25)
                elif act == "focus-any-tile":
                    forest_a = _test_live_get_forest(backend, None)
                    wid = _test_live_pick_any_tile(
                        forest_a, keep_id=cap_case.agent_window_id
                    )
                    if not wid:
                        entry["actions"].append(
                            {"step": act, "ok": False, "error": "no TILE"}
                        )
                        action_ok = False
                        break
                    info = _test_live_focus_id(backend, wid)
                    # Capture LFT after intentional focus (should be this tile).
                    forest_b = _test_live_get_forest(backend, None)
                    if isinstance(forest_b, dict) and forest_b.get(
                        "lastTileFocusWindowId"
                    ) is not None:
                        lft_before = str(forest_b.get("lastTileFocusWindowId"))
                    elif wid:
                        lft_before = wid
                    entry["actions"].append({"step": act, **info})
                    if not info.get("ok"):
                        action_ok = False
                        break
                    time.sleep(0.25)
                elif act == "close-focus":
                    forest_a = _test_live_get_forest(backend, None)
                    fid = None
                    if isinstance(forest_a, dict) and forest_a.get(
                        "focusWindowId"
                    ) is not None:
                        fid = str(forest_a.get("focusWindowId"))
                    if not fid:
                        entry["actions"].append(
                            {"step": act, "ok": False, "error": "no focus"}
                        )
                        action_ok = False
                        break
                    if (
                        cap_case.agent_window_id
                        and fid == cap_case.agent_window_id
                    ):
                        entry["actions"].append(
                            {
                                "step": act,
                                "ok": False,
                                "error": "refusing to close agent",
                            }
                        )
                        action_ok = False
                        break
                    info = _test_live_close_id(backend, fid)
                    closed_window_id = fid
                    entry["actions"].append({"step": act, **info})
                    if not info.get("ok"):
                        action_ok = False
                        break
                    time.sleep(0.45)
                elif act == "unfocus":
                    info = _test_live_unfocus(backend)
                    entry["actions"].append({"step": act, **info})
                    if not info.get("ok"):
                        action_ok = False
                        break
                    time.sleep(0.3)
                elif act == "r012-tab-mon1-then-center-join-mon0":
                    info = _test_live_r012_tab_mon1_then_center_join_mon0(
                        backend, keep_id=cap_case.agent_window_id
                    )
                    entry["actions"].append({"step": act, **info})
                    if not info.get("ok"):
                        action_ok = False
                        break
                    time.sleep(0.45)
                elif act == "r015-empty-mon1-dnd":
                    info = _test_live_r015_empty_mon1_dnd(
                        backend, keep_id=cap_case.agent_window_id
                    )
                    entry["actions"].append({"step": act, **info})
                    if not info.get("ok"):
                        action_ok = False
                        break
                    time.sleep(0.45)
                elif act == "r016-noop-workareas-note":
                    # No automated ApplyMonitorsConfig inject yet (L0 owns no-op).
                    # Dual layout + structure checks; operator may force same-config apply.
                    entry["actions"].append(
                        {
                            "step": act,
                            "ok": True,
                            "detail": (
                                "noop inject pending; "
                                "structure checks after dual layout (L0: bug-r016)"
                            ),
                        }
                    )
                elif act == "r032-tab-click-responsive-note":
                    entry["actions"].append(
                        {
                            "step": act,
                            "ok": True,
                            "detail": (
                                "human: after layout, repeated tab-strip "
                                "clicks switch open leaf (no body click first)"
                            ),
                        }
                    )
                elif act == "r055-dnd-center-join-raise-note":
                    entry["actions"].append(
                        {
                            "step": act,
                            "ok": True,
                            "detail": (
                                "host/agent: DnD TILE onto TAB CENTER; "
                                "joiner raise+focus (nest smoke-layout-tabbed-edge)"
                            ),
                        }
                    )
                else:
                    entry["actions"].append({"step": act, "unknown": True})
                    action_ok = False
                    break

            phase_ok = layout_ok and action_ok
            time.sleep(0.3)
            forest1 = _test_live_get_forest(backend, None)
            cap_after = capability_from_forest(forest1)
            if cap_case.agent_window_id:
                cap_after.agent_window_id = cap_case.agent_window_id
            checks = evaluate_checks(
                forest1,
                c.checks,
                capability=cap_after,
                layout_ok=phase_ok,
                closed_window_id=closed_window_id,
                lft_before=lft_before,
            )
            entry["checks"] = checks
            entry["ok"] = phase_ok and all(ch.get("ok") for ch in checks)
            status = "PASS" if entry["ok"] else "FAIL"
            _eprint(f"    {status}")
            for ch in checks:
                mark = "ok" if ch.get("ok") else "FAIL"
                _eprint(f"      [{mark}] {ch.get('check')}: {ch.get('detail')}")
        except Exception as e:
            entry["ok"] = False
            entry["error"] = str(e)
            _eprint(f"    FAIL error: {e}")
        case_results.append(entry)

    summary = summarize_run(case_results)
    metrics_summary = summarize_metrics(case_results)
    print()
    print(
        f"forge-test live: "
        f"{'PASS' if summary['ok'] else 'FAIL'} "
        f"({summary['passed']} passed, {summary['failed']} failed)"
    )
    if metrics_summary.get("wallMsTotal") is not None:
        _eprint(
            f"  metrics: wallMsTotal={metrics_summary.get('wallMsTotal')} "
            f"wallMsMax={metrics_summary.get('wallMsMax')} "
            f"softCorrections={metrics_summary.get('softCorrectionsTotal')} "
            f"expectationMisses={metrics_summary.get('expectationMissesTotal')} "
            f"hardReadyWarn={metrics_summary.get('hardReadyWarningsTotal')} "
            f"delayTimeoutsLikelyOk={metrics_summary.get('delayTimeoutsLikelyOkTotal')}"
        )

    # Nested status for env namespace (best-effort; never fails the suite).
    nested_running: Optional[bool] = None
    try:
        from nested_wayland import is_running as nested_is_running

        nested_running = bool(nested_is_running())
    except Exception:
        nested_running = None

    env_ns = build_env_namespace(cap, nested_running=nested_running)
    report = {
        "schemaVersion": 1,
        "kind": "forge-test-live",
        "env": env_ns,
        "capability": cap.to_dict(),
        "selection": sel.to_dict(),
        "summary": summary,
        "metricsSummary": metrics_summary,
        "cases": case_results,
    }

    report_path = getattr(args, "report", None) or os.environ.get(
        "FORGE_LIVE_REPORT"
    )
    if report_path is None or str(report_path).strip() in ("", "auto", "1", "true"):
        # Default: always write RC-comparable report for live runs.
        report_path = default_live_report_path(session=cap.session)
    report_path = str(report_path).strip()
    if report_path and report_path.lower() not in ("none", "off", "0", "false"):
        try:
            Path(report_path).parent.mkdir(parents=True, exist_ok=True)
            Path(report_path).write_text(
                json.dumps(report, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            _eprint(f"forge-test live: report → {report_path}")
        except OSError as e:
            _eprint(f"forge-test live: could not write report {report_path}: {e}")

    if verbose or not summary["ok"]:
        _print_json(
            {
                "env": env_ns,
                "capability": cap.to_dict(),
                "selection": sel.to_dict(),
                "summary": summary,
                "metricsSummary": metrics_summary,
            },
            compact=False,
        )

    # Headless leader: if true-cold/clean closed the agent TILE, reopen a head
    # so the operator can see results. Only the durable leader process reaches
    # here after window death — a non-leader client dies with its TTY.
    try:
        reattach = _test_live_reattach_agent_head(backend, cap, case_results)
        if reattach:
            report["reattach"] = reattach
            if report_path and report_path.lower() not in (
                "none",
                "off",
                "0",
                "false",
            ):
                try:
                    Path(report_path).write_text(
                        json.dumps(report, indent=2, sort_keys=True) + "\n",
                        encoding="utf-8",
                    )
                except OSError:
                    pass
    except Exception as e:
        _eprint(f"forge-test live: reattach head failed: {e}")

    return 0 if summary["ok"] else 1


def _test_live_reattach_agent_head(
    backend: Optional[str],
    cap: Any,
    case_results: list[dict[str, Any]],
) -> Optional[dict[str, Any]]:
    """
    Reopen Ghostty on the host after a live suite that may have closed the agent.

    FIRM: only meaningful under durable Grok leader (agent_window_optional).
    Non-headless agents cannot self-heal after their TTY dies.
    """
    if not getattr(cap, "agent_window_optional", False) and not getattr(
        cap, "can_true_cold", False
    ):
        # Still reattach if any case closed all tiles / agent missing after run
        closed_agent = False
        for r in case_results:
            for ch in r.get("checks") or []:
                det = str(ch.get("detail") or "")
                if "agent window optional" in det or "missing from tree" in det:
                    closed_agent = True
        if not closed_agent:
            return None

    leader = (os.environ.get("GROK_LEADER_SOCKET") or "").strip()
    if not leader:
        _eprint(
            "forge-test live: agent head may be gone; no GROK_LEADER_SOCKET — "
            "cannot self-reattach (run under durable leader for true cold)"
        )
        return {"ok": False, "reason": "no-leader"}

    # Prefer host session bus (do not leave nest env).
    env = os.environ.copy()
    try:
        out = subprocess.run(
            ["systemctl", "--user", "show-environment"],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
        for line in (out.stdout or "").splitlines():
            if line.startswith("DBUS_SESSION_BUS_ADDRESS="):
                env["DBUS_SESSION_BUS_ADDRESS"] = line.split("=", 1)[1]
            if line.startswith("WAYLAND_DISPLAY="):
                wd = line.split("=", 1)[1]
                if wd and "forge" not in wd and "nested" not in wd:
                    env["WAYLAND_DISPLAY"] = wd
        env["XDG_SESSION_TYPE"] = env.get("XDG_SESSION_TYPE") or "wayland"
    except (OSError, subprocess.TimeoutExpired):
        pass

    # If a ghostty already exists on host tree, skip launch.
    try:
        forest = _test_live_get_forest(backend or _check_deps(), None)
        from live_matrix import iter_windows

        for w in iter_windows(forest):
            cls = str(w.get("wmClass") or w.get("wm_class") or "").lower()
            if "ghostty" in cls:
                _eprint(
                    "forge-test live: agent head reattach — Ghostty already present "
                    f"id={w.get('windowId')}; reattach UI: grok -r <session-id>"
                )
                return {
                    "ok": True,
                    "launched": False,
                    "existingWindowId": w.get("windowId"),
                    "hint": "grok -r <session-id>",
                }
    except Exception:
        pass

    # Launch Ghostty detached on host so operator can reattach the head.
    try:
        subprocess.Popen(
            ["ghostty"],
            env=env,
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        _eprint(
            "forge-test live: reopened Ghostty for agent head — "
            "reattach with: grok -r <session-id>  (or /resume in an open client)"
        )
        return {"ok": True, "launched": True, "hint": "grok -r <session-id>"}
    except OSError as e:
        _eprint(f"forge-test live: could not launch Ghostty for reattach: {e}")
        return {"ok": False, "error": str(e)}

