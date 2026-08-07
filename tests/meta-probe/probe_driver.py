#!/usr/bin/env python3
"""
Meta Probe driver — serial app/op matrix with agreement settle.

Does not import Forge. Requires meta-probe@forge-test.local enabled;
Forge and rival tilers must be disabled.

Agreement model (see AGREEMENT.md): intervalic hard/soft checks; soft never
resets settle duration. Default: checkpoint write after each app; open_warm
opt-in only; sticky window for non-open ops; open_fresh open→settle→close.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from lib.ext_state import parse_info_enabled, parse_list_enabled  # noqa: E402
from lib.results import (  # noqa: E402
    apply_suite,
    checkpoint_run,
    namespace_dir,
    new_run_doc,
    run_output_path,
    settle_to_dict,
    trial_record,
    write_per_app_enabled,
    write_run,
)
from lib.settle import (  # noqa: E402
    DisagreementCatalog,
    SettleConfig,
    SettleResult,
    agreement_contract_doc,
    classify_check,
    derive_knobs_from_calibration,
    match_window,
    settle_config_from_dict,
)
from lib.sweep import (  # noqa: E402
    compare_hypothesis,
    delay_schedule,
    hypothesis_from_two_step,
    isolation_plan,
    isolation_safe_d2,
    joint_near_edge_candidates,
    record_last_good_first_fail,
)
from lib.thrash import (  # noqa: E402
    is_thrash_from_settle,
    thrash_config_from_dict,
    trial_is_thrash,
)

BUS_NAME = "org.gnome.Shell.Extensions.MetaProbe"
BUS_PATH = "/org/gnome/Shell/Extensions/MetaProbe"
BUS_IFACE = "org.gnome.Shell.Extensions.MetaProbe"
FORGE_UUID = "forge@jmmaranan.com"
PROBE_UUID = "meta-probe@forge-test.local"


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _gdbus_call(method: str, *args: str) -> str:
    cmd = [
        "gdbus",
        "call",
        "--session",
        "-d",
        BUS_NAME,
        "-o",
        BUS_PATH,
        "-m",
        f"{BUS_IFACE}.{method}",
        *args,
    ]
    try:
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT, timeout=60)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"gdbus {method} failed: {e.output}") from e
    except FileNotFoundError as e:
        raise RuntimeError("gdbus not found") from e
    text = out.strip()
    if text.startswith("(") and text.endswith(")"):
        text = text[1:-1].strip()
    if text.endswith(","):
        text = text[:-1].strip()
    if (text.startswith("'") and text.endswith("'")) or (
        text.startswith('"') and text.endswith('"')
    ):
        inner = text[1:-1]
        inner = inner.replace("\\'", "'").replace("\\\\", "\\")
        return inner
    return text


def probe_json(method: str, *args: str) -> dict[str, Any]:
    raw = _gdbus_call(method, *args)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"bad JSON from {method}: {raw[:200]}") from e


def _gnome_extensions_info(uuid: str) -> Optional[str]:
    try:
        return subprocess.check_output(
            ["gnome-extensions", "info", uuid], text=True, stderr=subprocess.DEVNULL
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _gnome_extensions_list_enabled() -> Optional[str]:
    try:
        return subprocess.check_output(
            ["gnome-extensions", "list", "--enabled"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def extension_enabled(uuid: str) -> Optional[bool]:
    info = _gnome_extensions_info(uuid)
    if info is None:
        listed = _gnome_extensions_list_enabled()
        if listed is None:
            return None
        return parse_list_enabled(listed, uuid)
    parsed = parse_info_enabled(info)
    if parsed is not None:
        return parsed
    listed = _gnome_extensions_list_enabled()
    if listed is None:
        return None
    return parse_list_enabled(listed, uuid)


def mono_from_probe() -> float:
    return float(probe_json("Ping")["monoMs"])


def clear_events() -> None:
    probe_json("ClearEvents")


def get_events(since_seq: int) -> dict[str, Any]:
    return probe_json("GetEvents", str(int(since_seq)))


def list_windows() -> list[dict[str, Any]]:
    return probe_json("ListWindows").get("windows") or []


def find_matching_windows(match: dict[str, Any]) -> list[dict[str, Any]]:
    return [w for w in list_windows() if match_window(w, match)]


def find_matching_window(match: dict[str, Any]) -> Optional[dict[str, Any]]:
    wins = find_matching_windows(match)
    return wins[-1] if wins else None


def _is_guake_snap(snap: Optional[dict[str, Any]]) -> bool:
    if not snap:
        return False
    wc = (snap.get("wmClass") or "").lower()
    wi = (snap.get("wmClassInstance") or "").lower()
    title = (snap.get("title") or "").lower()
    return "guake" in wc or "guake" in wi or title.startswith("guake")


def close_window(window_id: int, *, allow_guake: bool = False) -> None:
    """Close by id. Never closes Guake unless allow_guake (app under test is guake)."""
    wid = int(window_id)
    if not allow_guake:
        try:
            snap = probe_json("SnapshotWindow", str(wid)).get("window")
            if _is_guake_snap(snap):
                print(f"  skip close Guake windowId={wid}", file=sys.stderr)
                return
        except Exception:
            # If snapshot fails, still refuse when id might be guake: list-check
            try:
                for w in list_windows():
                    if int(w.get("windowId") or 0) == wid and _is_guake_snap(w):
                        print(f"  skip close Guake windowId={wid}", file=sys.stderr)
                        return
            except Exception:
                pass
    try:
        probe_json("Close", str(wid))
    except Exception:
        pass


def close_windows(ids: set[int] | list[int], *, allow_guake: bool = False) -> None:
    for wid in list(ids):
        if wid:
            close_window(int(wid), allow_guake=allow_guake)
            time.sleep(0.05)


def close_matching(match: dict[str, Any], *, allow_guake: bool = False) -> None:
    for w in find_matching_windows(match):
        wid = int(w.get("windowId") or 0)
        if not wid:
            continue
        if not allow_guake and _is_guake_snap(w):
            print(f"  skip close Guake (match) windowId={wid}", file=sys.stderr)
            continue
        close_window(wid, allow_guake=allow_guake)
    time.sleep(0.3)


def wait_settled(
    cfg: SettleConfig,
    *,
    window_id: Optional[int],
    t0_mono: float,
    since_seq: int,
    catalog: DisagreementCatalog,
) -> tuple[SettleResult, int]:
    """
    Poll every check_interval_ms. Hard disagreement resets stable duration.
    Soft disagreement is recorded only. Settled when stable >= settle_duration_ms.
    """
    checks: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    last_seq = since_seq
    stable_ms = 0.0
    last_mono = t0_mono
    hard_resets = 0
    soft_n = 0
    agree_n = 0
    first_agree: Optional[float] = None
    last_hard: Optional[float] = None
    prev_snap: Optional[dict[str, Any]] = None
    new_catalog: dict[str, Any] = {}
    catalog_before = set(catalog.entries.keys())

    if window_id:
        try:
            prev_snap = probe_json("SnapshotWindow", str(int(window_id))).get("window")
        except Exception:
            prev_snap = None

    while True:
        time.sleep(cfg.check_interval_ms / 1000.0)
        batch = get_events(last_seq)
        last_seq = int(batch.get("lastSeq") or last_seq)
        now = float(batch.get("monoMs") or mono_from_probe())
        new_ev = batch.get("events") or []
        dt = max(0.0, now - last_mono)
        last_mono = now
        wait_ms = now - t0_mono

        curr_snap = None
        if window_id:
            try:
                curr_snap = probe_json("SnapshotWindow", str(int(window_id))).get("window")
            except Exception:
                curr_snap = prev_snap

        outcome, severity, _components = classify_check(
            events=new_ev,
            window_id=window_id,
            prev_snap=prev_snap,
            curr_snap=curr_snap,
            catalog=catalog,
        )
        for k in catalog.entries:
            if k not in catalog_before:
                new_catalog[k] = catalog.entries[k]
                catalog_before.add(k)

        t_rel = wait_ms
        checks.append({"tMs": round(t_rel, 3), "out": outcome})
        counts[outcome] = counts.get(outcome, 0) + 1

        if severity == "hard":
            stable_ms = 0.0
            hard_resets += 1
            last_hard = wait_ms
        elif severity == "soft":
            soft_n += 1
            # soft does not reset; still accumulate stable time
            stable_ms += dt
        else:
            agree_n += 1
            if first_agree is None:
                first_agree = wait_ms
            stable_ms += dt

        if curr_snap:
            prev_snap = curr_snap

        if wait_ms >= cfg.max_wait_ms:
            return (
                SettleResult(
                    settled=False,
                    reason="max_wait",
                    wait_ms=wait_ms,
                    check_interval_ms=cfg.check_interval_ms,
                    settle_duration_ms=cfg.settle_duration_ms,
                    stable_ms=stable_ms,
                    check_count=len(checks),
                    hard_reset_count=hard_resets,
                    soft_count=soft_n,
                    agreement_count=agree_n,
                    time_to_first_agreement_ms=first_agree,
                    time_to_last_hard_ms=last_hard,
                    time_to_settled_ms=None,
                    checks=checks,
                    disagreement_counts=counts,
                    new_catalog_entries=new_catalog,
                ),
                last_seq,
            )

        if stable_ms >= cfg.settle_duration_ms and severity != "hard":
            return (
                SettleResult(
                    settled=True,
                    reason="hard_stable_duration",
                    wait_ms=wait_ms,
                    check_interval_ms=cfg.check_interval_ms,
                    settle_duration_ms=cfg.settle_duration_ms,
                    stable_ms=stable_ms,
                    check_count=len(checks),
                    hard_reset_count=hard_resets,
                    soft_count=soft_n,
                    agreement_count=agree_n,
                    time_to_first_agreement_ms=first_agree,
                    time_to_last_hard_ms=last_hard,
                    time_to_settled_ms=wait_ms,
                    checks=checks,
                    disagreement_counts=counts,
                    new_catalog_entries=new_catalog,
                ),
                last_seq,
            )


def _desktop_candidates(name: str) -> list[Path]:
    bases = [
        Path.home() / ".local/share/applications",
        Path("/usr/share/applications"),
        Path("/var/lib/snapd/desktop/applications"),
    ]
    out: list[Path] = []
    for base in bases:
        p = base / name
        if p.exists():
            out.append(p)
    return out


def app_launchable(app: dict[str, Any]) -> tuple[bool, str]:
    open_spec = app.get("open") or {}
    desktop = open_spec.get("desktop")
    argv = open_spec.get("argv")
    fallback = open_spec.get("fallbackArgv")
    if desktop and _desktop_candidates(desktop):
        return True, "desktop"
    for cand in (argv, fallback):
        if cand and shutil.which(str(cand[0])):
            return True, "argv"
    if desktop:
        return False, f"missing desktop/binary for {desktop}"
    if argv:
        return False, f"missing binary {argv[0]}"
    return False, "no open spec"


def open_app(app: dict[str, Any]) -> subprocess.Popen:
    open_spec = app.get("open") or {}
    desktop = open_spec.get("desktop")
    argv = open_spec.get("argv")
    fallback = open_spec.get("fallbackArgv")

    if desktop:
        for p in _desktop_candidates(desktop):
            return subprocess.Popen(
                ["gio", "launch", str(p)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
        if fallback:
            argv = fallback

    if not argv:
        raise RuntimeError(f"app {app.get('id')}: no open argv/desktop")

    if not shutil.which(str(argv[0])):
        raise RuntimeError(f"app {app.get('id')}: binary not found: {argv[0]}")

    return subprocess.Popen(
        argv,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def safety_check(
    config: dict[str, Any],
    *,
    allow_forge: bool,
    env: Optional[dict[str, Any]] = None,
) -> list[str]:
    errs: list[str] = []
    safety = config.get("safety") or {}
    shell_enabled: Optional[set[str]] = None
    if env and isinstance(env.get("enabledExtensions"), list):
        shell_enabled = set(env["enabledExtensions"])

    def is_on(uuid: str) -> bool:
        if shell_enabled is not None and uuid in shell_enabled:
            return True
        return extension_enabled(uuid) is True

    if safety.get("requireForgeDisabled", True) and not allow_forge:
        if is_on(FORGE_UUID):
            errs.append(f"Forge enabled ({FORGE_UUID}) — disable before measuring")
    if safety.get("requireRivalsDisabled", True):
        for uuid in safety.get("rivalUuids") or []:
            if is_on(uuid):
                errs.append(f"rival tiler enabled: {uuid}")
    return errs


def ensure_workspace(config: dict[str, Any], *, no_switch: bool) -> None:
    """Switch to test desk only — never operator WS1."""
    if no_switch:
        return
    ws = (config.get("workspace") or {}).get("preferIndex")
    if ws is None:
        return
    try:
        probe_json("FocusWorkspace", str(int(ws)))
        time.sleep(0.4)
    except Exception as e:
        print(f"warn: FocusWorkspace: {e}", file=sys.stderr)


def focus_workspace_index(index: int) -> dict[str, Any]:
    return probe_json("FocusWorkspace", str(int(index)))


def return_to_operator_desk(config: dict[str, Any]) -> None:
    """Call only when measurement is finished."""
    ws = (config.get("workspace") or {}).get("returnIndex", 0)
    try:
        focus_workspace_index(int(ws))
        time.sleep(0.3)
        print(f"returned to workspace index {ws} (human WS{int(ws) + 1})", file=sys.stderr)
    except Exception as e:
        print(f"warn: return FocusWorkspace: {e}", file=sys.stderr)


def cmd_ping(_args: argparse.Namespace) -> int:
    try:
        p = probe_json("Ping")
    except Exception as e:
        print(f"probe ping failed: {e}", file=sys.stderr)
        print(
            f"Enable {PROBE_UUID} after Wayland logout. "
            f"install: tests/meta-probe/install-probe.sh",
            file=sys.stderr,
        )
        return 1
    print(json.dumps(p, indent=2))
    print(
        f"forge={extension_enabled(FORGE_UUID)} probe={extension_enabled(PROBE_UUID)}",
        file=sys.stderr,
    )
    return 0


def cmd_env(_args: argparse.Namespace) -> int:
    print(json.dumps(probe_json("GetEnv"), indent=2))
    return 0


def cmd_preflight(args: argparse.Namespace) -> int:
    config = _load_json(Path(args.config) if args.config else ROOT / "config.default.json")
    try:
        ping = probe_json("Ping")
        env = probe_json("GetEnv")
    except Exception as e:
        print(f"FAIL probe: {e}", file=sys.stderr)
        print(
            "hint: run prep after Wayland login: python3 probe_driver.py prep --host black",
            file=sys.stderr,
        )
        return 1
    errs = safety_check(config, allow_forge=args.allow_forge, env=env)
    out = {
        "ping": ping,
        "env": env,
        "errors": errs,
        "cli": {
            "forgeEnabled": extension_enabled(FORGE_UUID),
            "probeEnabled": extension_enabled(PROBE_UUID),
        },
    }
    if getattr(args, "host", None):
        out["host"] = args.host
    print(json.dumps(out, indent=2))
    if errs:
        for e in errs:
            print(f"error: {e}", file=sys.stderr)
        return 2
    print("preflight OK", file=sys.stderr)
    return 0


def cmd_focus_workspace(args: argparse.Namespace) -> int:
    try:
        out = focus_workspace_index(int(args.index))
    except Exception as e:
        print(f"FocusWorkspace failed: {e}", file=sys.stderr)
        return 1
    print(json.dumps(out, indent=2))
    return 0 if out.get("ok", True) else 2


def _app_allow_guake(app: dict[str, Any]) -> bool:
    return str(app.get("id") or "").lower() == "guake"


def _run_open_fresh(
    app: dict[str, Any],
    cfg: SettleConfig,
    catalog: DisagreementCatalog,
    sample: int,
    owned: dict[str, Any],
    *,
    close_after: bool = False,
) -> tuple[Optional[dict[str, Any]], Optional[SettleResult], dict[str, Any]]:
    """
    Open fresh window and settle. If close_after, close the window after settle
    (open_fresh matrix samples — no leftover pile). Multi-op maneuvers leave open.
    """
    match = app.get("match") or {}
    allow_guake = _app_allow_guake(app)
    map_max = 120000.0

    if owned.get("windowId"):
        close_window(int(owned["windowId"]), allow_guake=allow_guake)
        time.sleep(0.4)
    close_matching(match, allow_guake=allow_guake)

    clear_events()
    mark = probe_json("BeginMark", f"open_fresh:{app['id']}:{sample}")
    since = int(mark.get("mark", {}).get("seq") or 0)
    t0 = float(mark.get("mark", {}).get("monoMs") or mono_from_probe())

    try:
        open_app(app)
    except Exception as e:
        return None, None, {"ok": False, "error": str(e)}

    deadline = time.time() + map_max / 1000.0
    window = None
    while time.time() < deadline:
        window = find_matching_window(match)
        if window:
            break
        time.sleep(0.1)

    if not window:
        return (
            None,
            SettleResult(
                settled=False,
                reason="map_timeout",
                wait_ms=mono_from_probe() - t0,
                check_interval_ms=cfg.check_interval_ms,
                settle_duration_ms=cfg.settle_duration_ms,
                stable_ms=0,
                check_count=0,
                hard_reset_count=0,
                soft_count=0,
                agreement_count=0,
                time_to_first_agreement_ms=None,
                time_to_last_hard_ms=None,
                time_to_settled_ms=None,
                checks=[],
                disagreement_counts={},
            ),
            {"ok": False, "error": "map_timeout"},
        )

    settle, _ = wait_settled(
        cfg,
        window_id=int(window["windowId"]),
        t0_mono=t0,
        since_seq=since,
        catalog=catalog,
    )
    snap = probe_json("SnapshotWindow", str(int(window["windowId"])))
    window = snap.get("window") or window
    op_res: dict[str, Any] = {"ok": True, "kind": "open_fresh"}
    if close_after and window and window.get("windowId"):
        close_window(int(window["windowId"]), allow_guake=allow_guake)
        time.sleep(0.25)
        op_res["closedAfter"] = True
        window = None
    return window, settle, op_res


def _run_open_warm(
    app: dict[str, Any],
    cfg: SettleConfig,
    catalog: DisagreementCatalog,
    sample: int,
    existing: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], Optional[SettleResult], dict[str, Any]]:
    match = app.get("match") or {}
    before_ids = {int(w["windowId"]) for w in find_matching_windows(match)}

    clear_events()
    mark = probe_json("BeginMark", f"open_warm:{app['id']}:{sample}")
    since = int(mark.get("mark", {}).get("seq") or 0)
    t0 = float(mark.get("mark", {}).get("monoMs") or mono_from_probe())

    try:
        open_app(app)
    except Exception as e:
        return existing, None, {"ok": False, "error": str(e)}

    map_max = 120000.0
    deadline = time.time() + map_max / 1000.0
    target = None
    while time.time() < deadline:
        wins = find_matching_windows(match)
        new_ones = [w for w in wins if int(w["windowId"]) not in before_ids]
        if new_ones:
            target = new_ones[-1]
            break
        if wins and time.time() > deadline - (map_max / 1000.0) + 2.0:
            target = existing
            break
        time.sleep(0.1)

    if not target:
        target = find_matching_window(match) or existing

    settle, _ = wait_settled(
        cfg,
        window_id=int(target["windowId"]),
        t0_mono=t0,
        since_seq=since,
        catalog=catalog,
    )
    snap = probe_json("SnapshotWindow", str(int(target["windowId"])))
    target = snap.get("window") or target
    return (
        target,
        settle,
        {
            "ok": True,
            "kind": "open_warm",
            "newWindow": int(target["windowId"]) not in before_ids,
        },
    )


def run_op(
    op: dict[str, Any],
    window: dict[str, Any],
    cfg: SettleConfig,
    catalog: DisagreementCatalog,
    home_monitor: int,
    home_workspace: int,
) -> tuple[dict[str, Any], Optional[SettleResult], dict[str, Any]]:
    wid = int(window["windowId"])
    kind = op.get("kind")

    clear_events()
    mark = probe_json("BeginMark", f"op:{op['id']}")
    since = int(mark.get("mark", {}).get("seq") or 0)
    t0 = float(mark.get("mark", {}).get("monoMs") or mono_from_probe())
    op_result: dict[str, Any]

    if kind == "move_resize":
        frame = window.get("frame") or {}
        p = op.get("params") or {}
        x = int(frame.get("x", 0)) + int(p.get("dx", 0))
        y = int(frame.get("y", 0)) + int(p.get("dy", 0))
        w = max(200, int(frame.get("width", 800)) + int(p.get("dw", 0)))
        h = max(200, int(frame.get("height", 600)) + int(p.get("dh", 0)))
        op_result = probe_json("MoveResize", str(wid), str(x), str(y), str(w), str(h))
    elif kind == "move_resize_restore":
        frame = window.get("frame") or {}
        op_result = probe_json(
            "MoveResize",
            str(wid),
            str(int(frame.get("x", 0))),
            str(int(frame.get("y", 0))),
            str(int(frame.get("width", 800))),
            str(int(frame.get("height", 600))),
        )
    elif kind == "move_to_monitor":
        env = probe_json("GetEnv")
        n = int(env.get("nMonitors") or 1)
        if n < 2:
            return {"ok": True, "skipped": True, "reason": "single_monitor"}, None, window
        cur = int(window.get("monitor", 0))
        dest = 1 if cur == 0 else 0
        op_result = probe_json("MoveToMonitor", str(wid), str(dest))
    elif kind == "move_to_monitor_home":
        op_result = probe_json("MoveToMonitor", str(wid), str(int(home_monitor)))
    elif kind == "move_to_workspace":
        env = probe_json("GetEnv")
        nws = int(env.get("nWorkspaces") or 1)
        cur = int(window.get("workspace", home_workspace))
        dest = (cur + int((op.get("params") or {}).get("delta", 1))) % max(nws, 1)
        op_result = probe_json("MoveToWorkspace", str(wid), str(dest))
    elif kind == "focus_workspace_roundtrip":
        env = probe_json("GetEnv")
        nws = int(env.get("nWorkspaces") or 1)
        home = int(env.get("activeWorkspace") or 0)
        other = (home + 1) % max(nws, 1)
        probe_json("FocusWorkspace", str(other))
        time.sleep(0.3)
        op_result = probe_json("FocusWorkspace", str(home))
    elif kind == "activate":
        op_result = probe_json("Activate", str(wid))
    elif kind == "raise":
        op_result = probe_json("Raise", str(wid))
    elif kind == "unmaximize":
        op_result = probe_json("Unmaximize", str(wid))
    elif kind == "minimize_unminimize":
        probe_json("Minimize", str(wid))
        time.sleep(0.2)
        op_result = probe_json("Unminimize", str(wid))
    elif kind == "make_above_toggle":
        probe_json("MakeAbove", str(wid), "true")
        time.sleep(0.2)
        op_result = probe_json("MakeAbove", str(wid), "false")
    elif kind == "fullscreen_toggle":
        probe_json("Fullscreen", str(wid), "true")
        time.sleep(0.3)
        op_result = probe_json("Fullscreen", str(wid), "false")
    else:
        return {"ok": False, "error": f"unknown kind {kind}"}, None, window

    settle, _ = wait_settled(
        cfg,
        window_id=wid,
        t0_mono=t0,
        since_seq=since,
        catalog=catalog,
    )
    snap = probe_json("SnapshotWindow", str(wid))
    if snap.get("window"):
        window = snap["window"]
    return op_result, settle, window


def _annotate_thrash(
    trial: dict[str, Any], thrash_cfg: dict[str, Any]
) -> dict[str, Any]:
    # skipped ops (e.g. single-monitor move_to_monitor) must not count as thrash
    thrash, reason = trial_is_thrash(trial, thrash_cfg)
    trial["thrash"] = thrash
    trial["thrashReason"] = reason
    return trial


def run_matrix(
    *,
    host: Optional[str],
    config: dict[str, Any],
    apps: list[dict[str, Any]],
    ops: list[dict[str, Any]],
    samples: int,
    allow_forge: bool,
    no_switch_workspace: bool,
    out_dir: Optional[Path],
    phase_label: Optional[str] = None,
    session: Optional[str] = None,
    return_ws_when_done: bool = True,
) -> Path:
    """
    Per app+op: 1 calibration then `samples` full trials (unless samples=0).
    Sticky window for non-open ops; open_fresh closes each sample.
    Checkpoints after each app when writePerApp (default).
    """
    env = probe_json("GetEnv")
    errs = safety_check(config, allow_forge=allow_forge, env=env)
    if errs:
        raise RuntimeError("; ".join(errs))

    config = dict(config)
    if phase_label:
        config["phase"] = phase_label

    settle_cfg = config.get("settle") or {}
    thrash_cfg = thrash_config_from_dict(config.get("thrash"))
    live_duration = float(settle_cfg.get("settleDurationMs") or 3000)
    live_interval = float(settle_cfg.get("checkIntervalMs") or 100)
    knobs = {
        "settleDurationMs": live_duration,
        "checkIntervalMs": live_interval,
        "calibrationCheckIntervalMs": float(
            settle_cfg.get("calibrationCheckIntervalMs") or 50
        ),
        "bootstrapSettleDurationMs": float(
            settle_cfg.get("bootstrapSettleDurationMs") or 10000
        ),
        "bootstrapCheckIntervalMs": float(
            settle_cfg.get("bootstrapCheckIntervalMs") or 50
        ),
        "maxWaitMs": float(settle_cfg.get("maxWaitMs") or 120000),
    }

    catalog = DisagreementCatalog()
    contract = agreement_contract_doc(knobs["settleDurationMs"], knobs["checkIntervalMs"])
    apps_doc = {"version": 2, "apps": apps}
    ops_doc = {"version": 2, "ops": ops}
    doc = new_run_doc(
        host=host,
        config=config,
        apps=apps_doc,
        ops=ops_doc,
        env=env,
        session=session,
        agreement_contract=contract,
    )
    doc["thrashConfig"] = thrash_cfg
    doc["probeVersion"] = config.get("probeVersion", doc.get("probeVersion"))

    ensure_workspace(config, no_switch=no_switch_workspace)
    cooldown = float(config.get("cooldownMs") or 500) / 1000.0
    between_apps = float(config.get("betweenAppsMs") or 2000) / 1000.0
    per_op_cal = bool((config.get("matrix") or {}).get("calibrateEachOp", True))
    full_samples = int(samples)
    per_app_write = write_per_app_enabled(config)

    open_ops = [o for o in ops if o.get("kind") in ("open_fresh", "open_warm")]
    other_ops = [o for o in ops if o.get("kind") not in ("open_fresh", "open_warm")]

    results_root = ROOT / (config.get("output") or {}).get("dir", "results")
    if out_dir is not None:
        out = Path(out_dir)
    else:
        ns0 = doc.get("namespace") or {}
        if (config.get("output") or {}).get("namespace", True):
            out = namespace_dir(
                results_root,
                host=str(ns0.get("host") or "host"),
                session=str(ns0.get("session") or "unknown"),
                suite=str(ns0.get("suite") or "default"),
            )
        else:
            out = results_root
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    run_path = run_output_path(out, doc)

    ns = doc.get("namespace") or {}
    print(
        f"run host={ns.get('host')} session={ns.get('session')} suite={ns.get('suite')} "
        f"full_samples={full_samples} apps={len(apps)} ops={len(ops)} "
        f"cal_each_op={per_op_cal} write_per_app={per_app_write} path={run_path}",
        file=sys.stderr,
    )

    bootstrap_done = False
    owned_all: set[int] = set()

    def cfg_for(phase: str) -> SettleConfig:
        s = dict(settle_cfg)
        s.update(
            {
                "settleDurationMs": knobs["settleDurationMs"],
                "checkIntervalMs": knobs["checkIntervalMs"],
                "calibrationCheckIntervalMs": knobs["calibrationCheckIntervalMs"],
                "bootstrapSettleDurationMs": knobs["bootstrapSettleDurationMs"],
                "bootstrapCheckIntervalMs": knobs["bootstrapCheckIntervalMs"],
                "maxWaitMs": knobs["maxWaitMs"],
            }
        )
        return settle_config_from_dict(s, phase=phase)

    def flush_checkpoint(*, final: bool = False) -> None:
        doc["disagreementCatalog"] = catalog.to_dict()
        doc["agreementContract"] = agreement_contract_doc(
            knobs["settleDurationMs"], knobs["checkIntervalMs"]
        )
        doc["derivedKnobs"] = dict(knobs)
        if final:
            write_run(
                doc,
                out,
                latest=True,
                results_root=results_root,
                path=run_path,
                update_latest=True,
            )
        else:
            checkpoint_run(
                doc,
                run_path,
                results_root=results_root,
                update_latest=False,
            )
            print(f"  checkpoint → {run_path}", file=sys.stderr)

    def append_trial(
        *,
        app_id: str,
        op_id: str,
        sample: int,
        role: str,
        ok: bool,
        settle: Optional[SettleResult],
        op_result: Optional[dict[str, Any]],
        window: Optional[dict[str, Any]],
        notes: str = "",
        skipped: bool = False,
        skip_reason: Optional[str] = None,
    ) -> None:
        rec = trial_record(
            app_id=app_id,
            op_id=op_id,
            sample=sample,
            ok=ok,
            settle=settle_to_dict(settle) if settle else {},
            op_result=op_result,
            window=window,
            notes=notes,
            role=role,
            knobs={
                "checkIntervalMs": knobs["checkIntervalMs"]
                if role == "full"
                else knobs["calibrationCheckIntervalMs"],
                "settleDurationMs": knobs["settleDurationMs"]
                if bootstrap_done or role == "full"
                else knobs["bootstrapSettleDurationMs"],
            },
            skipped=skipped,
            skip_reason=skip_reason,
        )
        _annotate_thrash(rec, thrash_cfg)
        doc["trials"].append(rec)

    def run_cal_and_full(
        *,
        app: dict[str, Any],
        op: dict[str, Any],
        window: Optional[dict[str, Any]],
        home_monitor: int,
        home_workspace: int,
        is_open_fresh: bool,
        is_open_warm: bool,
    ) -> tuple[Optional[dict[str, Any]], int, int]:
        nonlocal bootstrap_done, knobs
        allow_guake = _app_allow_guake(app)
        phase = "bootstrap" if not bootstrap_done else "calibration"
        cal_cfg = cfg_for(phase)
        print(
            f"  {op['id']} CAL ({phase}) interval={cal_cfg.check_interval_ms}ms "
            f"duration={cal_cfg.settle_duration_ms}ms…",
            file=sys.stderr,
        )

        if is_open_fresh:
            window, settle, op_res = _run_open_fresh(
                app, cal_cfg, catalog, 0, window or {}, close_after=True
            )
        elif is_open_warm:
            if not window:
                window, settle, _ = _run_open_fresh(
                    app, cal_cfg, catalog, 0, {}, close_after=False
                )
                time.sleep(cooldown)
            window, settle, op_res = _run_open_warm(
                app, cal_cfg, catalog, 0, window or {}
            )
        else:
            if not window:
                return None, home_monitor, home_workspace
            op_res, settle, window = run_op(
                op, window, cal_cfg, catalog, home_monitor, home_workspace
            )
            if op_res.get("skipped"):
                append_trial(
                    app_id=app["id"],
                    op_id=op["id"],
                    sample=0,
                    role="calibration",
                    ok=True,
                    settle=None,
                    op_result=op_res,
                    window=window,
                    skipped=True,
                    skip_reason=op_res.get("reason"),
                )
                return window, home_monitor, home_workspace

        # open_fresh close_after → window None; ok from settle alone
        if is_open_fresh:
            ok = bool(settle and settle.settled and (op_res or {}).get("ok", True))
        else:
            ok = bool(window and settle and settle.settled)
        append_trial(
            app_id=app["id"],
            op_id=op["id"],
            sample=0,
            role="calibration" if bootstrap_done else "bootstrap",
            ok=ok,
            settle=settle,
            op_result=op_res,
            window=window,
            notes=(op_res or {}).get("error") or "",
        )
        print(
            f"    cal ok={ok} wait={getattr(settle, 'wait_ms', None)} "
            f"hard={getattr(settle, 'hard_reset_count', None)} "
            f"soft={getattr(settle, 'soft_count', None)}",
            file=sys.stderr,
        )

        if settle and settle.settled:
            derived = derive_knobs_from_calibration(
                settle,
                prev_duration_ms=knobs["settleDurationMs"],
                prev_interval_ms=knobs["checkIntervalMs"],
            )
            if not bootstrap_done:
                knobs["settleDurationMs"] = derived["settleDurationMs"]
                knobs["checkIntervalMs"] = derived["checkIntervalMs"]
                bootstrap_done = True
                doc["derivedKnobs"] = dict(knobs)
                print(f"    bootstrap knobs → {knobs}", file=sys.stderr)
            else:
                knobs["settleDurationMs"] = max(
                    knobs["settleDurationMs"], derived["settleDurationMs"]
                )
                knobs["checkIntervalMs"] = max(
                    50.0, min(500.0, derived["checkIntervalMs"])
                )
                doc["derivedKnobs"] = dict(knobs)

        if window and window.get("windowId"):
            owned_all.add(int(window["windowId"]))
            home_monitor = int(window.get("monitor") or home_monitor)
            home_workspace = int(window.get("workspace") or home_workspace)

        time.sleep(cooldown)

        full_cfg = cfg_for("full")
        for sample in range(full_samples):
            print(
                f"  {op['id']} full {sample + 1}/{full_samples} "
                f"interval={full_cfg.check_interval_ms}ms "
                f"duration={full_cfg.settle_duration_ms}ms…",
                file=sys.stderr,
            )
            if is_open_fresh:
                window, settle, op_res = _run_open_fresh(
                    app,
                    full_cfg,
                    catalog,
                    sample,
                    window or {},
                    close_after=True,
                )
            elif is_open_warm:
                window, settle, op_res = _run_open_warm(
                    app, full_cfg, catalog, sample, window or {}
                )
            else:
                if not window:
                    break
                op_res, settle, window = run_op(
                    op, window, full_cfg, catalog, home_monitor, home_workspace
                )
                if op_res.get("skipped"):
                    append_trial(
                        app_id=app["id"],
                        op_id=op["id"],
                        sample=sample,
                        role="full",
                        ok=True,
                        settle=None,
                        op_result=op_res,
                        window=window,
                        skipped=True,
                        skip_reason=op_res.get("reason"),
                    )
                    break

            if is_open_fresh:
                ok = bool(settle and settle.settled and (op_res or {}).get("ok", True))
            elif is_open_warm:
                ok = bool(window and settle and settle.settled)
            else:
                ok = bool(
                    (op_res or {}).get("ok", True)
                    and settle
                    and settle.settled
                    and window
                )
            append_trial(
                app_id=app["id"],
                op_id=op["id"],
                sample=sample,
                role="full",
                ok=ok,
                settle=settle,
                op_result={
                    k: v
                    for k, v in (op_res or {}).items()
                    if k not in ("before", "after")
                },
                window=window,
            )
            print(
                f"    ok={ok} thrash={doc['trials'][-1].get('thrash')} "
                f"wait={getattr(settle, 'wait_ms', None)} "
                f"hard={getattr(settle, 'hard_reset_count', None)}",
                file=sys.stderr,
            )
            if window and window.get("windowId"):
                owned_all.add(int(window["windowId"]))
            time.sleep(cooldown)

        return window, home_monitor, home_workspace

    try:
        for ai, app in enumerate(apps):
            print(f"\n=== app {app['id']} ===", file=sys.stderr)
            tags = app.get("tags") or []
            allow_guake = _app_allow_guake(app)
            ok_launch, why = app_launchable(app)
            if not ok_launch:
                print(f"  skip {app['id']}: {why}", file=sys.stderr)
                if "skip-if-missing" in tags or "optional" in tags:
                    doc["errors"].append(
                        {"app": app["id"], "skipped": True, "reason": why}
                    )
                else:
                    doc["errors"].append({"app": app["id"], "error": why})
                if per_app_write:
                    flush_checkpoint(final=False)
                continue

            window: Optional[dict[str, Any]] = None
            home_monitor = 0
            home_workspace = 0
            match = app.get("match") or {}

            # sticky seed once for non-open ops; open_fresh is open→settle→close
            for op in open_ops + other_ops:
                kind = op.get("kind")
                is_of = kind == "open_fresh"
                is_ow = kind == "open_warm"
                if not is_of and not is_ow and not window:
                    seed_cfg = cfg_for("full" if bootstrap_done else "bootstrap")
                    window, settle, _ = _run_open_fresh(
                        app, seed_cfg, catalog, 0, {}, close_after=False
                    )
                    if window:
                        owned_all.add(int(window["windowId"]))
                        home_monitor = int(window.get("monitor") or 0)
                        home_workspace = int(window.get("workspace") or 0)
                        # sticky seed may also bootstrap knobs
                        if settle and settle.settled and not bootstrap_done:
                            derived = derive_knobs_from_calibration(
                                settle,
                                prev_duration_ms=knobs["settleDurationMs"],
                                prev_interval_ms=knobs["checkIntervalMs"],
                            )
                            knobs["settleDurationMs"] = derived["settleDurationMs"]
                            knobs["checkIntervalMs"] = derived["checkIntervalMs"]
                            bootstrap_done = True
                            doc["derivedKnobs"] = dict(knobs)
                            print(f"    seed bootstrap knobs → {knobs}", file=sys.stderr)
                    time.sleep(cooldown)
                if not is_of and not is_ow and not window:
                    print(f"  skip {op['id']}: no window", file=sys.stderr)
                    continue

                window, home_monitor, home_workspace = run_cal_and_full(
                    app=app,
                    op=op,
                    window=window,
                    home_monitor=home_monitor,
                    home_workspace=home_workspace,
                    is_open_fresh=is_of,
                    is_open_warm=is_ow,
                )

            print(f"  cleanup windows for {app['id']}", file=sys.stderr)
            if window and window.get("windowId"):
                owned_all.add(int(window["windowId"]))
            close_matching(match, allow_guake=allow_guake)
            close_windows(owned_all, allow_guake=allow_guake)
            owned_all.clear()
            time.sleep(0.5)

            if per_app_write:
                flush_checkpoint(final=False)

            if ai + 1 < len(apps):
                time.sleep(between_apps)
    finally:
        print("final window cleanup…", file=sys.stderr)
        close_windows(owned_all)
        for app in apps:
            try:
                close_matching(
                    app.get("match") or {},
                    allow_guake=_app_allow_guake(app),
                )
            except Exception:
                pass
        if return_ws_when_done:
            return_to_operator_desk(config)
        # durable even on exception mid-run
        try:
            flush_checkpoint(final=True)
        except Exception as e:
            print(f"warn: final write failed: {e}", file=sys.stderr)

    print(f"\nwrote {run_path}", file=sys.stderr)
    return run_path


def _load_config(args: argparse.Namespace, *, default_suite: str) -> dict[str, Any]:
    config = _load_json(Path(args.config) if args.config else ROOT / "config.default.json")
    suite = getattr(args, "suite", None) or default_suite
    if getattr(args, "keep_detail", False):
        config = dict(config)
        config["recordDetail"] = "full"
    return apply_suite(config, suite)


def select_default_apps(
    apps_doc: dict[str, Any],
    config: dict[str, Any],
    *,
    include_guake: bool = False,
) -> list[dict[str, Any]]:
    """Default full-suite apps: tag `core` (or config.defaultAppTag)."""
    tag = str(config.get("defaultAppTag") or "core")
    apps = list(apps_doc.get("apps") or [])
    core = [a for a in apps if tag in (a.get("tags") or [])]
    if not core:
        # fallback: pilot+full if catalog not tagged yet
        core = [
            a
            for a in apps
            if "full" in (a.get("tags") or []) or "pilot" in (a.get("tags") or [])
        ]
    core = [a for a in core if "optional" not in (a.get("tags") or [])]
    if not include_guake:
        core = [a for a in core if a.get("id") != "guake"]
    return core


def select_default_ops(ops_doc: dict[str, Any], config: dict[str, Any]) -> list[dict[str, Any]]:
    """Exclude open_warm and any defaultExclude / optIn ops unless --ops given."""
    ops = list(ops_doc.get("ops") or [])
    exclude = set(ops_doc.get("defaultExclude") or [])
    if (config.get("matrix") or {}).get("excludeOpenWarmByDefault", True):
        exclude.add("open_warm")
    out = []
    for o in ops:
        if o.get("id") in exclude:
            continue
        if o.get("optIn"):
            continue
        out.append(o)
    return out


def _move_resize_params(window: dict[str, Any]) -> tuple[int, int, int, int]:
    frame = window.get("frame") or {}
    x = int(frame.get("x", 0)) + 48
    y = int(frame.get("y", 0)) + 48
    w = max(200, int(frame.get("width", 800)) - 96)
    h = max(200, int(frame.get("height", 600)) - 96)
    return x, y, w, h


def run_maneuver_once(
    *,
    maneuver: str,
    app: dict[str, Any],
    cfg: SettleConfig,
    catalog: DisagreementCatalog,
    thrash_cfg: dict[str, Any],
    d_ms: float = 0.0,
    d1_ms: float = 0.0,
    d2_ms: float = 0.0,
    sample: int = 0,
) -> dict[str, Any]:
    """
    Execute one multi-op maneuver; always close app windows after.
    Returns trial-like dict with thrash, delays, settle of final step.
    """
    allow_guake = _app_allow_guake(app)
    match = app.get("match") or {}
    close_matching(match, allow_guake=allow_guake)

    result: dict[str, Any] = {
        "maneuver": maneuver,
        "appId": app["id"],
        "sample": sample,
        "dMs": d_ms,
        "d1Ms": d1_ms,
        "d2Ms": d2_ms,
        "ok": False,
        "thrash": True,
        "thrashReason": "",
        "steps": [],
    }

    def step_settle(label: str, settle: Optional[SettleResult], extra: Optional[dict] = None):
        thrash, reason = is_thrash_from_settle(settle, thrash_cfg)
        entry = {
            "step": label,
            "settle": settle_to_dict(settle) if settle else {},
            "thrash": thrash,
            "thrashReason": reason,
        }
        if extra:
            entry.update(extra)
        result["steps"].append(entry)
        return thrash, reason

    try:
        window, settle_open, open_res = _run_open_fresh(
            app, cfg, catalog, sample, {}, close_after=False
        )
        thrash, reason = step_settle("open", settle_open, {"opResult": open_res})
        if thrash or not window:
            result["thrash"] = True
            result["thrashReason"] = reason or "open_failed"
            result["ok"] = False
            return result

        wid = int(window["windowId"])
        home_monitor = int(window.get("monitor") or 0)

        if maneuver == "launch_then_move":
            time.sleep(max(0.0, d_ms) / 1000.0)
            clear_events()
            mark = probe_json("BeginMark", f"maneuver:{maneuver}:move")
            since = int(mark.get("mark", {}).get("seq") or 0)
            t0 = float(mark.get("mark", {}).get("monoMs") or mono_from_probe())
            x, y, w, h = _move_resize_params(window)
            op_res = probe_json("MoveResize", str(wid), str(x), str(y), str(w), str(h))
            settle, _ = wait_settled(
                cfg, window_id=wid, t0_mono=t0, since_seq=since, catalog=catalog
            )
            thrash, reason = step_settle("move_resize", settle, {"opResult": op_res, "delayMs": d_ms})

        elif maneuver == "launch_then_monitor":
            env = probe_json("GetEnv")
            n = int(env.get("nMonitors") or 1)
            if n < 2:
                result["ok"] = True
                result["thrash"] = False
                result["skipped"] = True
                result["skipReason"] = "single_monitor"
                result["thrashReason"] = ""
                return result
            time.sleep(max(0.0, d_ms) / 1000.0)
            clear_events()
            mark = probe_json("BeginMark", f"maneuver:{maneuver}:monitor")
            since = int(mark.get("mark", {}).get("seq") or 0)
            t0 = float(mark.get("mark", {}).get("monoMs") or mono_from_probe())
            cur = int(window.get("monitor", 0))
            dest = 1 if cur == 0 else 0
            op_res = probe_json("MoveToMonitor", str(wid), str(dest))
            settle, _ = wait_settled(
                cfg, window_id=wid, t0_mono=t0, since_seq=since, catalog=catalog
            )
            thrash, reason = step_settle(
                "move_to_monitor", settle, {"opResult": op_res, "delayMs": d_ms}
            )

        elif maneuver == "launch_monitor_move":
            env = probe_json("GetEnv")
            n = int(env.get("nMonitors") or 1)
            if n < 2:
                result["ok"] = True
                result["thrash"] = False
                result["skipped"] = True
                result["skipReason"] = "single_monitor"
                return result
            time.sleep(max(0.0, d1_ms) / 1000.0)
            clear_events()
            mark = probe_json("BeginMark", f"maneuver:{maneuver}:monitor")
            since = int(mark.get("mark", {}).get("seq") or 0)
            t0 = float(mark.get("mark", {}).get("monoMs") or mono_from_probe())
            cur = int(window.get("monitor", 0))
            dest = 1 if cur == 0 else 0
            op_res = probe_json("MoveToMonitor", str(wid), str(dest))
            settle_m, _ = wait_settled(
                cfg, window_id=wid, t0_mono=t0, since_seq=since, catalog=catalog
            )
            thrash, reason = step_settle(
                "move_to_monitor", settle_m, {"opResult": op_res, "delayMs": d1_ms}
            )
            if thrash:
                result["thrash"] = True
                result["thrashReason"] = reason
                result["ok"] = False
                return result
            snap = probe_json("SnapshotWindow", str(wid)).get("window") or window
            time.sleep(max(0.0, d2_ms) / 1000.0)
            clear_events()
            mark = probe_json("BeginMark", f"maneuver:{maneuver}:move")
            since = int(mark.get("mark", {}).get("seq") or 0)
            t0 = float(mark.get("mark", {}).get("monoMs") or mono_from_probe())
            x, y, w, h = _move_resize_params(snap)
            op_res = probe_json("MoveResize", str(wid), str(x), str(y), str(w), str(h))
            settle, _ = wait_settled(
                cfg, window_id=wid, t0_mono=t0, since_seq=since, catalog=catalog
            )
            thrash, reason = step_settle(
                "move_resize", settle, {"opResult": op_res, "delayMs": d2_ms}
            )
        else:
            result["thrashReason"] = f"unknown_maneuver:{maneuver}"
            return result

        result["thrash"] = thrash
        result["thrashReason"] = reason
        result["ok"] = not thrash
        # final settle on last step
        if result["steps"]:
            result["settle"] = result["steps"][-1].get("settle") or {}
        return result
    finally:
        close_matching(match, allow_guake=allow_guake)


def run_two_step_sweep(
    *,
    host: Optional[str],
    config: dict[str, Any],
    apps: list[dict[str, Any]],
    maneuver: str,
    d_start: float,
    d_step: float,
    d_min: float,
    allow_forge: bool,
    no_switch_workspace: bool,
    out_dir: Optional[Path],
    session: Optional[str] = None,
    stop_on_thrash: bool = True,
) -> Path:
    env = probe_json("GetEnv")
    errs = safety_check(config, allow_forge=allow_forge, env=env)
    if errs:
        raise RuntimeError("; ".join(errs))

    config = dict(config)
    config["phase"] = config.get("phase") or "thrash-sweep"
    config["suite"] = config.get("suite") or "thrash-sweep"
    thrash_cfg = thrash_config_from_dict(config.get("thrash"))
    settle_cfg = config.get("settle") or {}
    cfg = settle_config_from_dict(settle_cfg, phase="full")
    catalog = DisagreementCatalog()
    schedule = delay_schedule(d_start, d_step, d_min=d_min)

    doc = new_run_doc(
        host=host,
        config=config,
        apps={"version": 2, "apps": apps},
        ops={"version": 3, "maneuvers": [maneuver]},
        env=env,
        session=session,
        agreement_contract=agreement_contract_doc(
            cfg.settle_duration_ms, cfg.check_interval_ms
        ),
    )
    doc["thrashConfig"] = thrash_cfg
    doc["sweep"] = {
        "maneuver": maneuver,
        "kind": "two_step",
        "dStartMs": d_start,
        "dStepMs": d_step,
        "dMinMs": d_min,
        "scheduleMs": schedule,
    }
    doc["sweepResults"] = {}

    ensure_workspace(config, no_switch=no_switch_workspace)
    results_root = ROOT / (config.get("output") or {}).get("dir", "results")
    if out_dir is not None:
        out = Path(out_dir)
    else:
        ns = doc.get("namespace") or {}
        out = namespace_dir(
            results_root,
            host=str(ns.get("host") or "host"),
            session=str(ns.get("session") or "unknown"),
            suite=str(ns.get("suite") or "thrash-sweep"),
        )
    out.mkdir(parents=True, exist_ok=True)
    run_path = run_output_path(out, doc)
    cooldown = float(config.get("cooldownMs") or 500) / 1000.0

    try:
        for app in apps:
            print(f"\n=== sweep {maneuver} app={app['id']} ===", file=sys.stderr)
            ok_launch, why = app_launchable(app)
            if not ok_launch:
                doc["errors"].append({"app": app["id"], "error": why})
                continue
            pairs: list[tuple[float, bool]] = []
            for d in schedule:
                print(f"  D={d}ms…", file=sys.stderr)
                trial = run_maneuver_once(
                    maneuver=maneuver,
                    app=app,
                    cfg=cfg,
                    catalog=catalog,
                    thrash_cfg=thrash_cfg,
                    d_ms=d,
                )
                trial["appId"] = app["id"]
                trial["opId"] = maneuver
                trial["role"] = "sweep"
                doc["trials"].append(trial)
                thrash = bool(trial.get("thrash"))
                pairs.append((d, thrash))
                print(
                    f"    thrash={thrash} reason={trial.get('thrashReason')}",
                    file=sys.stderr,
                )
                time.sleep(cooldown)
                if thrash and stop_on_thrash:
                    break
            summary = record_last_good_first_fail(pairs)
            doc["sweepResults"][app["id"]] = summary
            print(f"  lastGood={summary.get('lastGoodMs')} firstFail={summary.get('firstFailMs')}", file=sys.stderr)
            if write_per_app_enabled(config):
                checkpoint_run(doc, run_path, results_root=results_root)
    finally:
        return_to_operator_desk(config)
        doc["disagreementCatalog"] = catalog.to_dict()
        write_run(doc, out, latest=True, results_root=results_root, path=run_path)
    print(f"\nwrote {run_path}", file=sys.stderr)
    return run_path


def run_three_step_isolation(
    *,
    host: Optional[str],
    config: dict[str, Any],
    apps: list[dict[str, Any]],
    d1_0: float,
    d2_0: float,
    d_step: float,
    d_min: float,
    pad_ms: float,
    joint_pad_ms: float,
    joint_steps: int,
    allow_forge: bool,
    no_switch_workspace: bool,
    out_dir: Optional[Path],
    session: Optional[str] = None,
    hypothesis: Optional[dict[str, float]] = None,
    stop_on_thrash: bool = True,
) -> Path:
    env = probe_json("GetEnv")
    errs = safety_check(config, allow_forge=allow_forge, env=env)
    if errs:
        raise RuntimeError("; ".join(errs))

    config = dict(config)
    config["phase"] = "thrash-sweep"
    config["suite"] = config.get("suite") or "thrash-sweep"
    thrash_cfg = thrash_config_from_dict(config.get("thrash"))
    settle_cfg = config.get("settle") or {}
    cfg = settle_config_from_dict(settle_cfg, phase="full")
    catalog = DisagreementCatalog()
    plan = isolation_plan(
        d1_0=d1_0,
        d2_0=d2_0,
        d_step=d_step,
        d_min=d_min,
        joint_pad_ms=joint_pad_ms,
        joint_steps=joint_steps,
    )
    hyp = hypothesis or {"d1Ms": d1_0, "d2Ms": d2_0, "padMs": pad_ms}

    doc = new_run_doc(
        host=host,
        config=config,
        apps={"version": 2, "apps": apps},
        ops={"version": 3, "maneuvers": ["launch_monitor_move"]},
        env=env,
        session=session,
        agreement_contract=agreement_contract_doc(
            cfg.settle_duration_ms, cfg.check_interval_ms
        ),
    )
    doc["thrashConfig"] = thrash_cfg
    doc["sweep"] = {
        "maneuver": "launch_monitor_move",
        "kind": "three_step_isolation",
        "plan": plan,
        "hypothesis": hyp,
    }
    doc["sweepResults"] = {}

    ensure_workspace(config, no_switch=no_switch_workspace)
    results_root = ROOT / (config.get("output") or {}).get("dir", "results")
    if out_dir is not None:
        out = Path(out_dir)
    else:
        ns = doc.get("namespace") or {}
        out = namespace_dir(
            results_root,
            host=str(ns.get("host") or "host"),
            session=str(ns.get("session") or "unknown"),
            suite=str(ns.get("suite") or "thrash-sweep"),
        )
    out.mkdir(parents=True, exist_ok=True)
    run_path = run_output_path(out, doc)
    cooldown = float(config.get("cooldownMs") or 500) / 1000.0
    maneuver = "launch_monitor_move"

    def once(app: dict[str, Any], d1: float, d2: float, role: str) -> dict[str, Any]:
        trial = run_maneuver_once(
            maneuver=maneuver,
            app=app,
            cfg=cfg,
            catalog=catalog,
            thrash_cfg=thrash_cfg,
            d1_ms=d1,
            d2_ms=d2,
        )
        trial["appId"] = app["id"]
        trial["opId"] = maneuver
        trial["role"] = role
        trial["d1Ms"] = d1
        trial["d2Ms"] = d2
        doc["trials"].append(trial)
        time.sleep(cooldown)
        return trial

    try:
        for app in apps:
            print(f"\n=== 3-step isolation app={app['id']} ===", file=sys.stderr)
            ok_launch, why = app_launchable(app)
            if not ok_launch:
                doc["errors"].append({"app": app["id"], "error": why})
                continue

            app_res: dict[str, Any] = {"hypothesis": hyp}

            # 1. confirm thrashless at (D1⁰, D2⁰)
            print(f"  confirm D1={d1_0} D2={d2_0}…", file=sys.stderr)
            t = once(app, d1_0, d2_0, "confirm")
            app_res["confirm"] = {
                "d1Ms": d1_0,
                "d2Ms": d2_0,
                "thrash": t.get("thrash"),
                "thrashReason": t.get("thrashReason"),
            }
            if t.get("thrash") and not t.get("skipped"):
                app_res["error"] = "confirm_thrashed"
                doc["sweepResults"][app["id"]] = app_res
                if write_per_app_enabled(config):
                    checkpoint_run(doc, run_path, results_root=results_root)
                continue
            if t.get("skipped"):
                app_res["skipped"] = t.get("skipReason")
                doc["sweepResults"][app["id"]] = app_res
                continue

            # 2. lock D1, sweep D2 down
            pairs_d2: list[tuple[float, bool]] = []
            for d2 in plan["sweepD2"]["scheduleMs"]:
                print(f"  lock D1={d1_0} sweep D2={d2}…", file=sys.stderr)
                t = once(app, d1_0, d2, "sweep_d2")
                pairs_d2.append((d2, bool(t.get("thrash"))))
                if t.get("thrash") and stop_on_thrash:
                    break
            sum_d2 = record_last_good_first_fail(pairs_d2)
            app_res["d2"] = sum_d2
            safe_d2 = isolation_safe_d2(
                d2_0=d2_0, last_good_d2=sum_d2.get("lastGoodMs"), pad_ms=pad_ms
            )
            app_res["safeD2Ms"] = safe_d2

            # 3. lock D2 safe, sweep D1 down
            pairs_d1: list[tuple[float, bool]] = []
            for d1 in plan["sweepD1"]["scheduleMs"]:
                print(f"  lock D2={safe_d2} sweep D1={d1}…", file=sys.stderr)
                t = once(app, d1, safe_d2, "sweep_d1")
                pairs_d1.append((d1, bool(t.get("thrash"))))
                if t.get("thrash") and stop_on_thrash:
                    break
            sum_d1 = record_last_good_first_fail(pairs_d1)
            app_res["d1"] = sum_d1

            d1_star = sum_d1.get("lastGoodMs")
            d2_star = sum_d2.get("lastGoodMs")
            app_res["lastGood"] = {"d1Ms": d1_star, "d2Ms": d2_star}
            app_res["firstFail"] = {
                "d1Ms": sum_d1.get("firstFailMs"),
                "d2Ms": sum_d2.get("firstFailMs"),
            }

            # 4. joint near-edge
            joint_rows = []
            candidates = joint_near_edge_candidates(
                d1_star=d1_star,
                d2_star=d2_star,
                pad_ms=joint_pad_ms,
                step_ms=d_step,
                max_steps=joint_steps,
            )
            best_joint: Optional[tuple[float, float]] = None
            for d1, d2 in candidates:
                print(f"  joint D1={d1} D2={d2}…", file=sys.stderr)
                t = once(app, d1, d2, "joint")
                joint_rows.append(
                    {"d1Ms": d1, "d2Ms": d2, "thrash": t.get("thrash")}
                )
                if not t.get("thrash"):
                    best_joint = (d1, d2)
                elif stop_on_thrash and best_joint is not None:
                    break
            app_res["joint"] = joint_rows
            if best_joint:
                measured = {"d1Ms": best_joint[0], "d2Ms": best_joint[1]}
            else:
                measured = {"d1Ms": d1_star, "d2Ms": d2_star}
            app_res["measured"] = measured
            app_res["hypothesisCompare"] = compare_hypothesis(hyp, measured)
            doc["sweepResults"][app["id"]] = app_res
            print(
                f"  measured={measured} vs hyp={hyp} → {app_res['hypothesisCompare']}",
                file=sys.stderr,
            )
            if write_per_app_enabled(config):
                checkpoint_run(doc, run_path, results_root=results_root)
    finally:
        return_to_operator_desk(config)
        doc["disagreementCatalog"] = catalog.to_dict()
        write_run(doc, out, latest=True, results_root=results_root, path=run_path)
    print(f"\nwrote {run_path}", file=sys.stderr)
    return run_path


def cmd_run(args: argparse.Namespace) -> int:
    config = _load_config(args, default_suite="full-suite")
    apps_doc = _load_json(ROOT / "apps.json")
    ops_doc = _load_json(ROOT / "ops.json")

    try:
        probe_json("Ping")
    except Exception as e:
        print(f"error: probe not reachable: {e}", file=sys.stderr)
        return 1

    app_filter = set(args.apps.split(",")) if args.apps else None
    op_filter = set(args.ops.split(",")) if args.ops else None
    samples = int(args.samples if args.samples is not None else config.get("samples") or 5)

    if app_filter:
        apps = [a for a in apps_doc.get("apps") or [] if a["id"] in app_filter]
    else:
        apps = select_default_apps(
            apps_doc, config, include_guake=getattr(args, "include_guake", False)
        )

    if op_filter:
        ops = [o for o in ops_doc.get("ops") or [] if o["id"] in op_filter]
    else:
        ops = select_default_ops(ops_doc, config)

    try:
        path = run_matrix(
            host=args.host,
            config=config,
            apps=apps,
            ops=ops,
            samples=samples,
            allow_forge=args.allow_forge,
            no_switch_workspace=args.no_switch_workspace,
            out_dir=Path(args.out_dir) if args.out_dir else None,
            session=getattr(args, "session", None),
            return_ws_when_done=not getattr(args, "no_return_ws", False),
        )
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    print(path)
    return 0


def cmd_sweep(args: argparse.Namespace) -> int:
    config = _load_config(args, default_suite="thrash-sweep")
    apps_doc = _load_json(ROOT / "apps.json")
    sw = config.get("sweep") or {}

    try:
        probe_json("Ping")
    except Exception as e:
        print(f"error: probe not reachable: {e}", file=sys.stderr)
        return 1

    app_filter = set(args.apps.split(",")) if args.apps else None
    if app_filter:
        apps = [a for a in apps_doc.get("apps") or [] if a["id"] in app_filter]
    else:
        apps = select_default_apps(apps_doc, config)

    d_start = float(args.d_start if args.d_start is not None else sw.get("dStartMs", 2000))
    d_step = float(args.d_step if args.d_step is not None else sw.get("dStepMs", 100))
    d_min = float(args.d_min if args.d_min is not None else sw.get("dMinMs", 0))
    pad_ms = float(args.pad if args.pad is not None else sw.get("padMs", 200))
    stop = not getattr(args, "no_stop_on_thrash", False)

    maneuver = args.maneuver
    try:
        if maneuver in ("launch_then_move", "launch_then_monitor"):
            path = run_two_step_sweep(
                host=args.host,
                config=config,
                apps=apps,
                maneuver=maneuver,
                d_start=d_start,
                d_step=d_step,
                d_min=d_min,
                allow_forge=args.allow_forge,
                no_switch_workspace=args.no_switch_workspace,
                out_dir=Path(args.out_dir) if args.out_dir else None,
                session=getattr(args, "session", None),
                stop_on_thrash=stop,
            )
        elif maneuver == "launch_monitor_move":
            d1 = float(args.d1 if args.d1 is not None else d_start)
            d2 = float(args.d2 if args.d2 is not None else d_start)
            # optional hypothesis from prior 2-step last-goods
            hyp = None
            if args.hyp_monitor is not None or args.hyp_move is not None:
                hyp = hypothesis_from_two_step(
                    launch_then_monitor_last_good=args.hyp_monitor,
                    launch_then_move_last_good=args.hyp_move,
                    pad_ms=pad_ms,
                    default_ms=d_start,
                )
                d1 = hyp["d1Ms"]
                d2 = hyp["d2Ms"]
            path = run_three_step_isolation(
                host=args.host,
                config=config,
                apps=apps,
                d1_0=d1,
                d2_0=d2,
                d_step=d_step,
                d_min=d_min,
                pad_ms=pad_ms,
                joint_pad_ms=float(sw.get("jointPadMs", 50)),
                joint_steps=int(sw.get("jointSteps", 3)),
                allow_forge=args.allow_forge,
                no_switch_workspace=args.no_switch_workspace,
                out_dir=Path(args.out_dir) if args.out_dir else None,
                session=getattr(args, "session", None),
                hypothesis=hyp,
                stop_on_thrash=stop,
            )
        else:
            print(f"error: unknown maneuver {maneuver}", file=sys.stderr)
            return 2
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    print(path)
    return 0


def cmd_pilot(args: argparse.Namespace) -> int:
    config = _load_config(args, default_suite="pilot")
    apps_doc = _load_json(ROOT / "apps.json")
    ops_doc = _load_json(ROOT / "ops.json")
    by_id = {a["id"]: a for a in apps_doc.get("apps") or []}
    ops_all = ops_doc.get("ops") or []

    try:
        probe_json("Ping")
    except Exception as e:
        print(f"error: probe not reachable: {e}", file=sys.stderr)
        return 1

    stages = (config.get("pilot") or {}).get("stages") or []
    if args.stage:
        stages = [s for s in stages if s["id"] == args.stage]
        if not stages:
            print(f"unknown stage {args.stage}", file=sys.stderr)
            return 2

    if args.ops:
        op_filter = set(args.ops.split(","))
        ops_all = [o for o in ops_all if o["id"] in op_filter]

    # one matrix for all pilot apps (keeps bootstrap once)
    apps: list[dict[str, Any]] = []
    for stage in stages:
        for i in stage.get("apps") or []:
            if i in by_id and by_id[i] not in apps:
                apps.append(by_id[i])
    samples = int(
        args.samples if args.samples is not None else config.get("samples") or 5
    )
    if not args.ops:
        ops_all = select_default_ops(ops_doc, config)
    try:
        path = run_matrix(
            host=args.host,
            config=config,
            apps=apps,
            ops=ops_all,
            samples=samples,
            allow_forge=args.allow_forge,
            no_switch_workspace=args.no_switch_workspace,
            out_dir=Path(args.out_dir) if args.out_dir else None,
            phase_label="pilot",
            session=getattr(args, "session", None),
        )
        print(path)
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    return 0


def cmd_calibrate(args: argparse.Namespace) -> int:
    args.suite = "calibration"
    if not args.apps:
        args.apps = "nautilus,ghostty,inkscape,gnome-terminal"
    if args.samples is None:
        args.samples = 0  # cal-only path: still runs cal; full_samples=0
    return cmd_run(args)


def cmd_prep(args: argparse.Namespace) -> int:
    cmd = [str(ROOT / "prep.sh")]
    if args.host:
        cmd.append(args.host)
    return subprocess.call(cmd)


def cmd_cleanup(_args: argparse.Namespace) -> int:
    return subprocess.call([str(ROOT / "cleanup.sh")])


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Meta/Mutter probe driver (Forge-independent)")
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("ping", help="Ping probe extension")
    sp.set_defaults(func=cmd_ping)

    se = sub.add_parser("env", help="Print probe GetEnv")
    se.set_defaults(func=cmd_env)

    spr = sub.add_parser(
        "prep",
        help="Install/enable probe; disable Forge+rivals; inhibit sleep/idle",
    )
    spr.add_argument("--host", default=None)
    spr.set_defaults(func=cmd_prep)

    sc = sub.add_parser(
        "cleanup",
        help="Disable probe; restore Forge+rivals+sleep; WS1",
    )
    sc.set_defaults(func=cmd_cleanup)

    sf = sub.add_parser("preflight", help="Ping + safety (Forge/rivals off)")
    sf.add_argument("--config", default=None)
    sf.add_argument("--allow-forge", action="store_true")
    sf.add_argument("--host", default=None)
    sf.set_defaults(func=cmd_preflight)

    for name, help_ in (
        ("run", "Matrix: 1 cal + N full samples per app+op (core apps; no open_warm)"),
        ("pilot", "Pilot apps with agreement settle"),
        ("calibrate", "Calibration suite (dense interval; bootstrap duration)"),
    ):
        sr = sub.add_parser(name, help=help_)
        sr.add_argument("--host", default=None, help="Host label: black | gray | green")
        sr.add_argument(
            "--session",
            default=None,
            help="wayland | x11 (default: XDG_SESSION_TYPE)",
        )
        sr.add_argument(
            "--suite",
            default=None,
            help="calibration | full-suite | pilot | strict | thrash-sweep",
        )
        sr.add_argument("--config", default=None)
        sr.add_argument(
            "--apps",
            default=None,
            help="comma app ids (default: tag core — nautilus,ghostty,inkscape,grok,obs)",
        )
        sr.add_argument(
            "--ops",
            default=None,
            help="comma op ids (default: all except open_warm; pass open_warm to opt in)",
        )
        sr.add_argument(
            "--samples",
            type=int,
            default=None,
            help="full samples per op after calibration (default 5)",
        )
        sr.add_argument("--out-dir", default=None)
        sr.add_argument("--allow-forge", action="store_true")
        sr.add_argument("--no-switch-workspace", action="store_true")
        sr.add_argument(
            "--no-return-ws",
            action="store_true",
            help="Do not FocusWorkspace(returnIndex) at end (cleanup still does)",
        )
        sr.add_argument(
            "--keep-detail",
            action="store_true",
            help="Reserved; checks timeline is always stored",
        )
        if name == "run":
            sr.add_argument(
                "--include-guake",
                action="store_true",
                help="Include guake in default app list",
            )
            sr.set_defaults(func=cmd_run)
        elif name == "pilot":
            sr.add_argument("--stage", default=None, help="unused; all pilot stages merge")
            sr.set_defaults(func=cmd_pilot)
        else:
            sr.set_defaults(func=cmd_calibrate)

    ss = sub.add_parser(
        "sweep",
        help="Multi-op delay thrash sweep (2-step or 3-step isolation)",
    )
    ss.add_argument("--host", default=None)
    ss.add_argument("--session", default=None)
    ss.add_argument("--suite", default="thrash-sweep")
    ss.add_argument("--config", default=None)
    ss.add_argument(
        "--apps",
        default=None,
        help="comma app ids (default: core)",
    )
    ss.add_argument(
        "--maneuver",
        required=True,
        choices=["launch_then_move", "launch_then_monitor", "launch_monitor_move"],
        help="2-step: launch_then_move|launch_then_monitor; 3-step: launch_monitor_move",
    )
    ss.add_argument("--d-start", type=float, default=None, help="start delay ms (high)")
    ss.add_argument("--d-step", type=float, default=None, help="step down ms")
    ss.add_argument("--d-min", type=float, default=None, help="minimum delay ms")
    ss.add_argument("--d1", type=float, default=None, help="3-step D1 start (ms)")
    ss.add_argument("--d2", type=float, default=None, help="3-step D2 start (ms)")
    ss.add_argument("--pad", type=float, default=None, help="pad above last-good (ms)")
    ss.add_argument(
        "--hyp-monitor",
        type=float,
        default=None,
        help="2-step launch_then_monitor last-good → pad into D1",
    )
    ss.add_argument(
        "--hyp-move",
        type=float,
        default=None,
        help="2-step launch_then_move last-good → pad into D2",
    )
    ss.add_argument("--out-dir", default=None)
    ss.add_argument("--allow-forge", action="store_true")
    ss.add_argument("--no-switch-workspace", action="store_true")
    ss.add_argument(
        "--no-stop-on-thrash",
        action="store_true",
        help="Continue full schedule after first thrash",
    )
    ss.add_argument("--keep-detail", action="store_true")
    ss.set_defaults(func=cmd_sweep)

    sw = sub.add_parser(
        "focus-workspace",
        help="Switch workspace (0-based). Use 0 only when finished testing.",
    )
    sw.add_argument("index", type=int, nargs="?", default=None)
    sw.add_argument("--config", default=None)
    sw.set_defaults(func=cmd_focus_workspace_cli)

    return p


def cmd_focus_workspace_cli(args: argparse.Namespace) -> int:
    config = _load_json(Path(args.config) if args.config else ROOT / "config.default.json")
    if args.index is not None:
        idx = int(args.index)
    else:
        idx = int((config.get("workspace") or {}).get("returnIndex", 0))
    args.index = idx
    return cmd_focus_workspace(args)


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
