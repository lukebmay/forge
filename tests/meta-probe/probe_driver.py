#!/usr/bin/env python3
"""
Meta Probe driver — serial app/op matrix with agreement settle.

Does not import Forge. Requires meta-probe@forge-test.local enabled;
Forge and rival tilers must be disabled.

Agreement model (see AGREEMENT.md): intervalic hard/soft checks; soft never
resets settle duration. Results stay in memory until the run finishes.
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
    namespace_dir,
    new_run_doc,
    settle_to_dict,
    trial_record,
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


def close_window(window_id: int) -> None:
    try:
        probe_json("Close", str(int(window_id)))
    except Exception:
        pass


def close_windows(ids: set[int] | list[int]) -> None:
    for wid in list(ids):
        if wid:
            close_window(int(wid))
            time.sleep(0.05)


def close_matching(match: dict[str, Any]) -> None:
    for w in find_matching_windows(match):
        wid = int(w.get("windowId") or 0)
        if wid:
            close_window(wid)
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


def _run_open_fresh(
    app: dict[str, Any],
    cfg: SettleConfig,
    catalog: DisagreementCatalog,
    sample: int,
    owned: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], Optional[SettleResult], dict[str, Any]]:
    match = app.get("match") or {}
    map_max = 120000.0

    if owned.get("windowId"):
        close_window(int(owned["windowId"]))
        time.sleep(0.4)
    close_matching(match)

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
    return window, settle, {"ok": True, "kind": "open_fresh"}


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
    In-memory collection only; single write_run at the end.
    Per app+op: 1 calibration then `samples` full trials (unless samples=0).
    """
    env = probe_json("GetEnv")
    errs = safety_check(config, allow_forge=allow_forge, env=env)
    if errs:
        raise RuntimeError("; ".join(errs))

    config = dict(config)
    if phase_label:
        config["phase"] = phase_label

    settle_cfg = config.get("settle") or {}
    live_duration = float(settle_cfg.get("settleDurationMs") or 3000)
    live_interval = float(settle_cfg.get("checkIntervalMs") or 100)
    # mutate settle knobs in a local dict for derivation
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

    ensure_workspace(config, no_switch=no_switch_workspace)
    cooldown = float(config.get("cooldownMs") or 500) / 1000.0
    between_apps = float(config.get("betweenAppsMs") or 2000) / 1000.0
    per_op_cal = bool((config.get("matrix") or {}).get("calibrateEachOp", True))
    full_samples = int(samples)

    open_ops = [o for o in ops if o.get("kind") in ("open_fresh", "open_warm")]
    other_ops = [o for o in ops if o.get("kind") not in ("open_fresh", "open_warm")]

    ns = doc.get("namespace") or {}
    print(
        f"run host={ns.get('host')} session={ns.get('session')} suite={ns.get('suite')} "
        f"full_samples={full_samples} apps={len(apps)} ops={len(ops)} "
        f"cal_each_op={per_op_cal} (memory-only until end)",
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
        doc["trials"].append(
            trial_record(
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
        )

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
        phase = "bootstrap" if not bootstrap_done else "calibration"
        cal_cfg = cfg_for(phase)
        print(
            f"  {op['id']} CAL ({phase}) interval={cal_cfg.check_interval_ms}ms "
            f"duration={cal_cfg.settle_duration_ms}ms…",
            file=sys.stderr,
        )

        if is_open_fresh:
            window, settle, op_res = _run_open_fresh(app, cal_cfg, catalog, 0, window or {})
        elif is_open_warm:
            if not window:
                window, settle, _ = _run_open_fresh(app, cal_cfg, catalog, 0, {})
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
                # first cal is bootstrap at 10s — adopt derived for rest of session
                knobs["settleDurationMs"] = derived["settleDurationMs"]
                knobs["checkIntervalMs"] = derived["checkIntervalMs"]
                bootstrap_done = True
                doc["derivedKnobs"] = dict(knobs)
                print(f"    bootstrap knobs → {knobs}", file=sys.stderr)
            else:
                # later cals may only coarsen interval slightly / raise duration on thrash
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

        # full samples
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
                    app, full_cfg, catalog, sample, window or {}
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

            ok = bool(
                (op_res or {}).get("ok", True)
                and settle
                and settle.settled
                and (window or not is_open_fresh)
            )
            if is_open_fresh or is_open_warm:
                ok = bool(window and settle and settle.settled)
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
                f"    ok={ok} wait={getattr(settle, 'wait_ms', None)} "
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
            ok_launch, why = app_launchable(app)
            if not ok_launch:
                print(f"  skip {app['id']}: {why}", file=sys.stderr)
                if "skip-if-missing" in tags or "optional" in tags:
                    doc["errors"].append(
                        {"app": app["id"], "skipped": True, "reason": why}
                    )
                    continue
                doc["errors"].append({"app": app["id"], "error": why})
                continue

            window: Optional[dict[str, Any]] = None
            home_monitor = 0
            home_workspace = 0
            match = app.get("match") or {}

            # sequential ops: finish each fully before next
            for op in open_ops + other_ops:
                kind = op.get("kind")
                is_of = kind == "open_fresh"
                is_ow = kind == "open_warm"
                if not is_of and not is_ow and not window:
                    # seed window with open_fresh settle only (not a counted op sample)
                    seed_cfg = cfg_for("full" if bootstrap_done else "bootstrap")
                    window, settle, _ = _run_open_fresh(app, seed_cfg, catalog, 0, {})
                    if window:
                        owned_all.add(int(window["windowId"]))
                        home_monitor = int(window.get("monitor") or 0)
                        home_workspace = int(window.get("workspace") or 0)
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

            # teardown app windows
            print(f"  cleanup windows for {app['id']}", file=sys.stderr)
            if window and window.get("windowId"):
                owned_all.add(int(window["windowId"]))
            close_matching(match)
            close_windows(owned_all)
            owned_all.clear()
            time.sleep(0.5)

            if ai + 1 < len(apps):
                time.sleep(between_apps)
    finally:
        # always close leftovers; only return to WS1 when done
        print("final window cleanup…", file=sys.stderr)
        close_windows(owned_all)
        for app in apps:
            try:
                close_matching(app.get("match") or {})
            except Exception:
                pass
        if return_ws_when_done:
            return_to_operator_desk(config)

    doc["disagreementCatalog"] = catalog.to_dict()
    doc["agreementContract"] = agreement_contract_doc(
        knobs["settleDurationMs"], knobs["checkIntervalMs"]
    )
    doc["derivedKnobs"] = dict(knobs)

    # single disk write after all measurement
    results_root = ROOT / (config.get("output") or {}).get("dir", "results")
    if out_dir is not None:
        out = Path(out_dir)
    else:
        ns = doc.get("namespace") or {}
        if (config.get("output") or {}).get("namespace", True):
            out = namespace_dir(
                results_root,
                host=str(ns.get("host") or "host"),
                session=str(ns.get("session") or "unknown"),
                suite=str(ns.get("suite") or "default"),
            )
        else:
            out = results_root
    path = write_run(doc, Path(out), latest=True, results_root=results_root)
    print(f"\nwrote {path}", file=sys.stderr)
    return path


def _load_config(args: argparse.Namespace, *, default_suite: str) -> dict[str, Any]:
    config = _load_json(Path(args.config) if args.config else ROOT / "config.default.json")
    suite = getattr(args, "suite", None) or default_suite
    if getattr(args, "keep_detail", False):
        config = dict(config)
        config["recordDetail"] = "full"
    return apply_suite(config, suite)


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
    samples = int(args.samples if args.samples is not None else config.get("samples") or 10)

    apps = [a for a in apps_doc.get("apps") or [] if not app_filter or a["id"] in app_filter]
    if not app_filter:
        apps = [
            a
            for a in apps
            if "full" in (a.get("tags") or []) or "pilot" in (a.get("tags") or [])
        ]
        apps = [a for a in apps if "optional" not in (a.get("tags") or [])]
        if not getattr(args, "include_guake", False):
            apps = [a for a in apps if a.get("id") != "guake"]
    ops = [o for o in ops_doc.get("ops") or [] if not op_filter or o["id"] in op_filter]

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
    samples = int(args.samples if args.samples is not None else 2)
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

    spr = sub.add_parser("prep", help="Install/enable probe; disable Forge+rivals")
    spr.add_argument("--host", default=None)
    spr.set_defaults(func=cmd_prep)

    sc = sub.add_parser("cleanup", help="Disable probe; restore Forge+rivals; WS1")
    sc.set_defaults(func=cmd_cleanup)

    sf = sub.add_parser("preflight", help="Ping + safety (Forge/rivals off)")
    sf.add_argument("--config", default=None)
    sf.add_argument("--allow-forge", action="store_true")
    sf.add_argument("--host", default=None)
    sf.set_defaults(func=cmd_preflight)

    for name, help_ in (
        ("run", "Matrix: 1 cal + N full samples per app+op"),
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
            help="calibration | full-suite | pilot | strict",
        )
        sr.add_argument("--config", default=None)
        sr.add_argument("--apps", default=None, help="comma app ids")
        sr.add_argument("--ops", default=None, help="comma op ids")
        sr.add_argument(
            "--samples",
            type=int,
            default=None,
            help="full samples per op after calibration (default 10)",
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
