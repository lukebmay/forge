#!/usr/bin/env python3
"""Nest campaign: WS2 occupied 2-slot apply (no open-miss). Use via nested run."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Sequence

_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from layout_lib import layout_tree_root, resolve_profile  # noqa: E402
from nest_invoke import (  # noqa: E402
    InvokeError,
    _gui_env,
    close_window_id,
    get_tree,
)
from nest_layout_dnd_smoke import (  # noqa: E402
    CampaignError,
    dnd_drop_dest_monitor,
    find_bag_con_children,
    is_nautilus_win,
    is_placeholder_win,
    is_tile_win,
    tiled_on_mon,
    window_mon_index,
)
from nest_layout_ws_campaign import (  # noqa: E402
    ghostty_argv,
    nautilus_argv,
    switch_workspace,
)
from nest_log_query import (  # noqa: E402
    LogQueryError,
    query_records,
    record_blob,
)

VERSION = "1"
DEFAULT_PROFILE = "_forge-test-occupied-2slot"
DEFAULT_DEST_MONITOR = 1
DEFAULT_WORKSPACE = 1  # Meta index; human WS2
PERSONAL_PROFILES = frozenset({"dev", "t1", "vinyl"})
ENTRY = (
    "./scripts/forge/forge-test nested run --monitors=2 -- "
    "python3 ./scripts/forge/nest_layout_occupied_smoke.py"
)
_APPLY_FAIL_TOKENS = (
    "open-miss",
    "PlaceNext dest failed",
    "must be slot/PH",
)
_HUNT_GREP = (
    r"open-miss|PlaceNext dest|metric apply|bag-con-child|forest-match"
)
HV_LAYOUTS = frozenset({"HSPLIT", "VSPLIT", "H", "V"})


def smoke_script_path() -> Path:
    return Path(__file__).resolve()


def smoke_script_argv() -> list[str]:
    return [sys.executable, str(smoke_script_path())]


def refuse_personal_profile(name: str) -> str:
    n = (name or "").strip()
    if not n:
        raise CampaignError("layout profile required")
    if n in PERSONAL_PROFILES or not n.startswith("_forge-test-"):
        raise CampaignError(
            f"refusing personal profile {n!r}; use {DEFAULT_PROFILE}"
        )
    return n


def companion_role(second_role: str) -> str:
    """mon1 first-slot class; distinct from seed and from mon0 ghostty."""
    s = str(second_role or "").strip()
    compact = s.lower().replace("-", "").replace(".", "").replace("_", "")
    if "eog" in compact:
        return "org.gnome.TextEditor"
    return "eog"


def profile_body(second_role: str) -> dict[str, Any]:
    role = str(second_role).strip()
    first = companion_role(role)
    return {
        "tiles": [["ghostty"], [first, role]],
        "focus": ["ghostty", 0],
        "description": (
            "FORGE TEST occupied 2-slot: mon0 ghostty; mon1 "
            f"{first}|{role}. WS2 dest mon seed matches second mon1 "
            "role. Not a personal layout."
        ),
    }


def ensure_occupied_profile(
    *,
    env: Optional[Mapping[str, str]] = None,
    profile: str = DEFAULT_PROFILE,
    second_role: str = "nautilus",
) -> dict[str, Any]:
    e = env if env is not None else os.environ
    name = refuse_personal_profile(profile)
    body = profile_body(second_role)
    resolved = resolve_profile(name, env=e)
    dest: Optional[Path] = None
    created = False
    refreshed = False
    if resolved.get("found") and resolved.get("path"):
        dest = Path(str(resolved["path"]))
        try:
            cur = json.loads(dest.read_text(encoding="utf-8"))
        except (OSError, TypeError, json.JSONDecodeError):
            cur = {}
        desc = str(cur.get("description") or "")
        if "FORGE TEST" in desc and cur.get("tiles") != body.get("tiles"):
            dest.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
            refreshed = True
        elif "FORGE TEST" not in desc and not dest.is_file():
            dest.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
            created = True
    else:
        root = layout_tree_root(e)
        dest = root / "common" / f"{name}.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
        created = True
    return {
        "profile": name,
        "path": str(dest) if dest else "",
        "secondRole": second_role,
        "created": created,
        "refreshed": refreshed,
        "body": body,
    }


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="nest_layout_occupied_smoke.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description=(
            "Nested Wayland campaign: WS2 occupied 2-slot apply. Seed one "
            "TILE on dest mon matching the second mon1 role "
            "(gnome-text-editor / eog / gedit / nautilus — never Chrome), "
            "then forge layout _forge-test-occupied-2slot. CTS: apply ok "
            "(not open-miss), PlaceNext dest is slot not mon-root, mon0 one "
            "TILE, mon1 H/V two WINDOW children."
        ),
        epilog=(
            "Requires nest --monitors=2. Never personal dev/t1/vinyl.\n"
            "\n"
            f"Entry (always stops):\n  {ENTRY}\n"
            "Alias (defaults --monitors=2):\n"
            "  ./scripts/forge/forge-test nested smoke-layout-occupied\n"
            "\n"
            "Dependencies: python3, forge, gdbus, ghostty, a second TILE "
            "class, vendored plog-query.\n"
            "Exit: 0 ok; 1 open-miss / forest / PlaceNext fail; "
            "2 not in nest env; 127 missing binary."
        ),
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print campaign plan; do not talk to Shell",
    )
    p.add_argument("--json", dest="json_out", action="store_true", help="Print JSON")
    p.add_argument(
        "--profile",
        default=DEFAULT_PROFILE,
        help=f"Test layout profile (default {DEFAULT_PROFILE})",
    )
    p.add_argument(
        "--dest-monitor",
        dest="dest_monitor",
        type=int,
        default=DEFAULT_DEST_MONITOR,
        help="Occupied dest monitor for the second-role seed (default 1)",
    )
    p.add_argument(
        "--workspace",
        type=int,
        default=DEFAULT_WORKSPACE,
        help="Meta workspace index (default 1 = human WS2)",
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=180.0,
        help="forge layout timeout seconds (default 180)",
    )
    p.add_argument(
        "--dnd-timeout",
        type=float,
        default=8.0,
        help="Shell.Eval dnd-drop timeout seconds (default 8)",
    )
    return p


def parse_argv(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    return build_parser().parse_args(list(argv) if argv is not None else None)


def campaign_plan(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "ok": True,
        "dryRun": True,
        "profile": str(args.profile),
        "destMonitor": int(args.dest_monitor),
        "workspace": int(args.workspace),
        "monitors": 2,
        "entry": ENTRY,
        "steps": [
            "switch/create WS2 (Meta index --workspace, default 1)",
            "seed one TILE on dest mon matching second mon1 role "
            "(eog / gnome-text-editor / gedit / nautilus; never Chrome)",
            f"write/refresh {args.profile} tiles [[companion],[companion, role]]",
            f"forge layout  {args.profile} on that workspace (FORGE_JOB=0)",
            "CTS: apply ok, no open-miss / PlaceNext dest failed, "
            "mon0 one TILE, mon1 H/V two WINDOW children",
        ],
    }


def print_plan(args: argparse.Namespace) -> None:
    plan = campaign_plan(args)
    if getattr(args, "json_out", False):
        print(json.dumps(plan, indent=2))
        return
    print("nest occupied 2-slot smoke (dry-run)")
    print(f"  profile:      {plan['profile']}")
    print(f"  monitors:     {plan['monitors']} (need nest --monitors=2)")
    print(f"  workspace:    {plan['workspace']} (human WS{int(plan['workspace']) + 1})")
    print(f"  dest-monitor: {plan['destMonitor']}")
    print("  steps:")
    for i, step in enumerate(plan["steps"], start=1):
        print(f"    {i}. {step}")
    print(f"  entry: {plan['entry']}")


def _layout_env(base: Optional[Mapping[str, str]] = None) -> dict[str, str]:
    env = _gui_env(base)
    env["FORGE_JOB"] = "0"
    env.pop("FORGE_JOB_WORKER", None)
    return env


def _forge_argv(env: Mapping[str, str]) -> list[str]:
    forge = shutil.which("forge", path=env.get("PATH"))
    if forge:
        return [forge]
    local = _SCRIPT_DIR / "forge"
    if local.is_file():
        return [sys.executable, str(local)]
    raise CampaignError(
        "missing forge on PATH (install: ./install)",
        exit_code=127,
    )


def _require_gdbus() -> None:
    if shutil.which("gdbus"):
        return
    raise CampaignError(
        "missing gdbus on PATH (install: sudo apt install libglib2.0-bin)",
        exit_code=127,
    )


def _wm_class(win: Mapping[str, Any]) -> str:
    return str(win.get("wmClass") or win.get("wm_class") or "").strip()


def _which_argv(*names: str) -> Optional[list[str]]:
    for name in names:
        exe = shutil.which(name)
        if exe:
            return [exe]
    return None


def is_gedit_win(win: Mapping[str, Any]) -> bool:
    c = _wm_class(win).lower()
    return "gedit" in c


def is_text_editor_win(win: Mapping[str, Any]) -> bool:
    c = _wm_class(win).lower().replace("-", "").replace("_", "")
    return "texteditor" in c or "org.gnome.texteditor" in _wm_class(win).lower()


def text_editor_argv() -> Optional[list[str]]:
    exe = shutil.which("gnome-text-editor")
    if not exe:
        return None
    return [exe, "--new-window"]


def eog_argv() -> Optional[list[str]]:
    exe = shutil.which("eog")
    if not exe:
        return None
    return [exe]


def is_eog_win(win: Mapping[str, Any]) -> bool:
    c = _wm_class(win).lower()
    return c == "eog" or c.endswith(".eog")


def second_role_candidates() -> list[dict[str, Any]]:
    # Calculator is float-override in config/windows.json — skip.
    # Nest Nautilus is often a GApplication stub (no TILE).
    return [
        {
            "token": "eog",
            "argv": eog_argv(),
            "match": is_eog_win,
        },
        {
            "token": "org.gnome.TextEditor",
            "argv": text_editor_argv(),
            "match": is_text_editor_win,
        },
        {
            "token": "gedit",
            "argv": _which_argv("gedit"),
            "match": is_gedit_win,
        },
        {
            "token": "nautilus",
            "argv": nautilus_argv(),
            "match": is_nautilus_win,
        },
    ]


def _tiled_now(
    bus_address: str, *, workspace: Optional[int] = None
) -> list[dict[str, Any]]:
    from nest_invoke import tiled_windows

    return [
        w
        for w in tiled_windows(get_tree(bus_address, workspace=workspace))
        if is_tile_win(w) and not is_placeholder_win(w)
    ]


def close_ws_tiles(bus_address: str, workspace: int) -> None:
    extra = _tiled_now(bus_address, workspace=workspace)
    for drop in extra:
        wid = str(drop.get("windowId") or "")
        if wid:
            close_window_id(bus_address, wid)
            time.sleep(0.25)


def layout_failure_reason(rc: int, text: str) -> Optional[str]:
    blob = text or ""
    for tok in _APPLY_FAIL_TOKENS:
        if tok in blob:
            return f"apply fail ({tok})"
    return None


def run_layout(
    profile: str,
    env: Mapping[str, str],
    *,
    timeout_s: float,
    workspace_1based: int,
) -> str:
    token = f"{int(workspace_1based)}:{profile}"
    argv = [*_forge_argv(env), "layout", token]
    try:
        proc = subprocess.run(
            argv,
            env=dict(env),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
    except subprocess.TimeoutExpired as e:
        raise CampaignError(
            f"forge layout {token} timed out after {timeout_s}s"
        ) from e
    text = f"{proc.stdout or ''}\n{proc.stderr or ''}"
    reason = layout_failure_reason(int(proc.returncode), text)
    if reason:
        tail = text.strip()[-2000:]
        raise CampaignError(f"{reason}\n{tail}" if tail else reason)
    return text


def hv_window_children(mon: Mapping[str, Any]) -> list[dict[str, Any]]:
    kids = mon.get("children") or mon.get("childNodes") or []
    if not isinstance(kids, list):
        return []
    if len(kids) == 1 and isinstance(kids[0], dict):
        nt = str(kids[0].get("nodeType") or kids[0].get("type") or "").upper()
        lay = str(kids[0].get("layout") or "").upper()
        if nt == "CON" and lay in HV_LAYOUTS:
            nested = kids[0].get("children") or kids[0].get("childNodes") or []
            kids = nested if isinstance(nested, list) else []
    out: list[dict[str, Any]] = []
    for k in kids:
        if not isinstance(k, dict):
            continue
        nt = str(k.get("nodeType") or k.get("type") or "").upper()
        if nt == "WINDOW":
            out.append(k)
    return out


def assert_occupied_shape(
    forest: Mapping[str, Any],
    *,
    second_match: Callable[[Mapping[str, Any]], bool],
    stage: str,
) -> None:
    bags = find_bag_con_children(forest)
    if bags:
        detail = "; ".join(bags[:8])
        raise CampaignError(f"{stage}: nested TABBED/STACKED CON child: {detail}")
    mons = forest.get("monitors") or []
    if not isinstance(mons, list) or len(mons) < 2:
        n = len(mons) if isinstance(mons, list) else 0
        raise CampaignError(
            f"{stage}: need 2 monitors, have {n} (use nested run --monitors=2)"
        )
    m0 = tiled_on_mon(forest, 0)
    if len(m0) < 1:
        raise CampaignError(f"{stage}: mon0 missing TILE")
    if len(m0) != 1:
        raise CampaignError(f"{stage}: mon0 want 1 TILE, have {len(m0)}")
    mon1 = mons[1] if isinstance(mons[1], dict) else {}
    lay = str(mon1.get("layout") or "").upper()
    if lay and lay not in HV_LAYOUTS:
        raise CampaignError(f"{stage}: mon1 layout {lay} (want HSPLIT/VSPLIT)")
    kids = mon1.get("children") or []
    if isinstance(kids, list):
        for k in kids:
            if not isinstance(k, dict):
                continue
            nt = str(k.get("nodeType") or k.get("type") or "").upper()
            klay = str(k.get("layout") or "").upper()
            if nt == "CON" and klay in ("TABBED", "STACKED"):
                raise CampaignError(f"{stage}: mon1 TABBED/STACKED CON child")
    wins = hv_window_children(mon1)
    tiles = [w for w in wins if is_tile_win(w) and not is_placeholder_win(w)]
    phs = [w for w in wins if is_placeholder_win(w)]
    if phs:
        raise CampaignError(f"{stage}: mon1 leftover PH ({len(phs)})")
    if len(tiles) != 2:
        raise CampaignError(
            f"{stage}: mon1 want H/V two WINDOW children, have {len(tiles)}"
        )
    if not any(second_match(w) for w in tiles):
        raise CampaignError(f"{stage}: mon1 missing second-role TILE")
    if not any(not second_match(w) for w in tiles):
        raise CampaignError(f"{stage}: mon1 missing companion TILE")


def hunt_apply_logs(env: Mapping[str, str]) -> tuple[list[dict[str, Any]], list[str]]:
    recs = query_records(grep=_HUNT_GREP, env=env)
    blobs = [record_blob(r) for r in recs]
    joined = "\n".join(blobs)
    bad: list[str] = []
    for tok in (
        "open-miss",
        "PlaceNext dest failed",
        "must be slot/PH",
        "bag-con-child",
    ):
        if tok in joined:
            bad.append(tok)
    return recs, bad


def session_ids_from(recs: Sequence[Mapping[str, Any]]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for rec in recs:
        sid = rec.get("session") or rec.get("sessionId")
        if sid is None and isinstance(rec.get("payload"), dict):
            sid = rec["payload"].get("session")
        s = str(sid or "").strip()
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _popen_gui(env: Mapping[str, str], argv: Sequence[str]) -> None:
    subprocess.Popen(
        list(argv),
        env=dict(env),
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _find_matching_tile(
    bus_address: str,
    workspace: int,
    match: Callable[[Mapping[str, Any]], bool],
) -> Optional[dict[str, Any]]:
    forest = get_tree(bus_address, workspace=workspace)
    for w in tiled_on_mon(forest, 0) + tiled_on_mon(forest, 1):
        if is_tile_win(w) and not is_placeholder_win(w) and match(w):
            return w
    return None


def seed_second_role(
    bus_address: str,
    env: Mapping[str, str],
    *,
    workspace: int,
    dest_monitor: int,
    dnd_timeout: float,
) -> dict[str, Any]:
    gui = _layout_env(env)
    last_reason = "no second-role TILE app on PATH"
    for cand in second_role_candidates():
        argv = cand.get("argv")
        match = cand.get("match")
        token = str(cand.get("token") or "")
        if not argv or not callable(match) or not token:
            continue
        found = _find_matching_tile(bus_address, workspace, match)
        if found is None:
            _popen_gui(gui, argv)
            deadline = time.monotonic() + 12.0
            while time.monotonic() < deadline:
                found = _find_matching_tile(bus_address, workspace, match)
                if found is not None:
                    break
                time.sleep(0.35)
        if found is None:
            n = len(_tiled_now(bus_address, workspace=workspace))
            last_reason = f"{token} did not map a TILE (have {n})"
            continue
        wid = str(found.get("windowId") or "")
        for extra in _tiled_now(bus_address, workspace=workspace):
            other = str(extra.get("windowId") or "")
            if other and other != wid:
                close_window_id(bus_address, other)
                time.sleep(0.2)
        time.sleep(0.3)
        forest = get_tree(bus_address, workspace=workspace)
        mon = window_mon_index(forest, wid)
        if mon != dest_monitor:
            dnd_drop_dest_monitor(
                bus_address,
                tile=f"id:{wid}",
                dest_monitor=dest_monitor,
                timeout=dnd_timeout,
            )
            time.sleep(0.6)
            mon = window_mon_index(
                get_tree(bus_address, workspace=workspace), wid
            )
        if mon != dest_monitor:
            last_reason = (
                f"{token} TILE {wid} not on dest-monitor {dest_monitor} "
                f"(mon={mon})"
            )
            continue
        return {
            "token": token,
            "windowId": wid,
            "monitor": mon,
            "match": match,
            "wmClass": _wm_class(found),
        }
    if not ghostty_argv():
        raise CampaignError(
            f"{last_reason}; also missing ghostty on PATH",
            exit_code=127,
        )
    raise CampaignError(
        f"{last_reason}; need a distinct TILE class "
        "(gnome-text-editor / eog / gedit / nautilus)"
    )


def run_campaign_on_bus(
    bus_address: str,
    args: argparse.Namespace,
    *,
    env: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    from nested_wayland import wait_forge_ready

    profile = refuse_personal_profile(str(args.profile))
    dest = int(args.dest_monitor)
    ws = int(args.workspace)
    if dest < 0:
        raise CampaignError(f"dest-monitor must be >= 0 (got {dest})")
    if ws < 0:
        raise CampaignError(f"workspace must be >= 0 (got {ws})")
    _require_gdbus()
    if not wait_forge_ready(bus_address, timeout_s=20.0):
        raise CampaignError("Forge DBus not ready")
    gui = _layout_env(env)
    switch_workspace(bus_address, ws)
    close_ws_tiles(bus_address, ws)
    time.sleep(0.3)
    seed = seed_second_role(
        bus_address,
        gui,
        workspace=ws,
        dest_monitor=dest,
        dnd_timeout=float(args.dnd_timeout),
    )
    written = ensure_occupied_profile(
        env=gui, profile=profile, second_role=str(seed["token"])
    )
    time.sleep(0.3)
    layout_out = run_layout(
        profile,
        gui,
        timeout_s=float(args.timeout),
        workspace_1based=ws + 1,
    )
    time.sleep(0.5)
    forest = get_tree(bus_address, workspace=ws)
    assert_occupied_shape(
        forest,
        second_match=seed["match"],
        stage="after-layout",
    )
    recs, hunt_bad = hunt_apply_logs(gui)
    if hunt_bad:
        raise CampaignError(
            "after-layout hunt: " + ", ".join(hunt_bad)
        )
    return {
        "ok": True,
        "profile": profile,
        "secondRole": seed["token"],
        "seedWindowId": seed["windowId"],
        "seedWmClass": seed.get("wmClass"),
        "destMonitor": dest,
        "workspace": ws,
        "profilePath": written.get("path"),
        "sessions": session_ids_from(recs),
        "layoutTail": (layout_out or "")[-800:],
    }


def cmd_from_env(args: Optional[argparse.Namespace] = None) -> int:
    parsed = args if args is not None else parse_argv(sys.argv[1:])
    if parsed.dry_run:
        print_plan(parsed)
        return 0
    bus = str(os.environ.get("DBUS_SESSION_BUS_ADDRESS") or "").strip()
    display = str(os.environ.get("WAYLAND_DISPLAY") or "").strip()
    if not bus or not display:
        print(
            "nest occupied 2-slot: run inside nest env:\n"
            f"  {ENTRY}\n"
            "  ./scripts/forge/forge-test nested smoke-layout-occupied",
            file=sys.stderr,
        )
        return 2
    try:
        payload = run_campaign_on_bus(bus, parsed, env=os.environ)
    except CampaignError as e:
        print(f"nest occupied 2-slot: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    except InvokeError as e:
        print(f"nest occupied 2-slot: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    except LogQueryError as e:
        print(f"nest occupied 2-slot: {e}", file=sys.stderr)
        return int(getattr(e, "exit_code", 1) or 1)
    if parsed.json_out:
        print(json.dumps(payload, indent=2, default=str))
    else:
        print(
            "nest occupied 2-slot: ok "
            f"profile={payload.get('profile')} "
            f"role={payload.get('secondRole')} "
            f"ws={payload.get('workspace')} "
            f"dest-monitor={payload.get('destMonitor')}"
        )
        sessions = payload.get("sessions") or []
        if sessions:
            print("  sessions: " + ",".join(str(s) for s in sessions))
    return 0


def main(argv: Optional[Sequence[str]] = None) -> int:
    try:
        parsed = parse_argv(list(argv) if argv is not None else None)
    except SystemExit as e:
        code = e.code
        return 0 if code in (0, None) else (code if isinstance(code, int) else 1)
    return cmd_from_env(parsed)


if __name__ == "__main__":
    sys.exit(main())
