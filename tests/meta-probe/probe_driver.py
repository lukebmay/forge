#!/usr/bin/env python3
"""
Meta Probe driver — serial app/op matrix with settle gates.

Does not import Forge. Requires meta-probe@forge-test.local enabled;
Forge and rival tilers must be disabled.
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
    session_type_label,
    settle_to_dict,
    trial_record,
    write_run,
)
from lib.settle import match_window, summarize_events, verify_mode_for_sample  # noqa: E402

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


def extension_state(uuid: str) -> Optional[str]:
    """Raw State: value (active/inactive/…) or None if missing."""
    out = _gnome_extensions_info(uuid)
    if out is None:
        return None
    for line in out.splitlines():
        if line.strip().lower().startswith("state:"):
            return line.split(":", 1)[1].strip().lower()
    return None


def extension_enabled(uuid: str) -> Optional[bool]:
    """
    True if extension is on. GNOME 45+ uses Enabled: Yes + State: ACTIVE
    (not State: ENABLED). Fall back to `list --enabled`.
    """
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


def wait_settled(
    cfg,
    *,
    window_id: Optional[int],
    t0_mono: float,
    since_seq: int,
    verify_mode: str,
) -> tuple[Any, int]:
    """
    Poll until agree_count official agreement ticks spaced by agreement_interval_ms
    while quiet for quiet_ms, or max_wait.

    Verification = one poll (events + optional snapshot). Official agreement tick
    only when quiet and ≥ agreement_interval_ms since last agreement tick.
    """
    agreement = 0
    all_events: list[dict[str, Any]] = []
    verifications: list[dict[str, Any]] = []
    last_seq = since_seq
    last_agreement_mono: Optional[float] = None

    while True:
        time.sleep(cfg.poll_ms / 1000.0)
        batch = get_events(last_seq)
        last_seq = int(batch.get("lastSeq") or last_seq)
        now = float(batch.get("monoMs") or mono_from_probe())
        new_ev = batch.get("events") or []
        if new_ev:
            all_events.extend(new_ev)

        snap = None
        if cfg.snapshot_each_poll and window_id:
            try:
                snap = probe_json("SnapshotWindow", str(int(window_id))).get("window")
            except Exception:
                snap = None

        rel = [
            e
            for e in all_events
            if (e.get("signal") in cfg.relevant_signals)
            and (
                window_id is None
                or window_id <= 0
                or int(e.get("windowId") or 0) == window_id
            )
        ]
        wait_ms = now - t0_mono
        last_rel_mono = float(rel[-1]["monoMs"]) if rel else t0_mono
        quiet_for = now - last_rel_mono

        v = {
            "monoMs": now,
            "waitMs": wait_ms,
            "quietForMs": quiet_for,
            "relevantEventCount": len(rel),
            "newEventsThisPoll": len(new_ev),
            "frame": (snap or {}).get("frame") if snap else None,
            "monitor": (snap or {}).get("monitor") if snap else None,
            "agreementSoFar": agreement,
        }
        verifications.append(v)

        if wait_ms >= cfg.max_wait_ms:
            return (
                summarize_events(
                    all_events,
                    cfg,
                    t0_mono=t0_mono,
                    window_id=window_id,
                    settled=False,
                    reason="max_wait",
                    wait_ms=wait_ms,
                    agreement_reached=agreement,
                    verify_mode=verify_mode,
                    verifications=verifications,
                ),
                last_seq,
            )

        # Activity resets official agreement chain
        if quiet_for < cfg.quiet_ms:
            agreement = 0
            last_agreement_mono = None
            continue

        # Quiet: may take an official agreement tick if interval elapsed
        if last_agreement_mono is None:
            can_tick = True
        else:
            can_tick = (now - last_agreement_mono) >= cfg.agreement_interval_ms

        if can_tick:
            agreement += 1
            last_agreement_mono = now
            verifications[-1]["agreementTick"] = True
            verifications[-1]["agreementSoFar"] = agreement
            if agreement >= cfg.agree_count:
                return (
                    summarize_events(
                        all_events,
                        cfg,
                        t0_mono=t0_mono,
                        window_id=window_id,
                        settled=True,
                        reason="quiet_agreement",
                        wait_ms=wait_ms,
                        agreement_reached=agreement,
                        verify_mode=verify_mode,
                        verifications=verifications,
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
    """Return (ok, reason). Used for skip-if-missing."""
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
    # Running Shell list from probe (authoritative when available)
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
    """Switch active workspace (0-based). Requires probe DBus."""
    return probe_json("FocusWorkspace", str(int(index)))


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
        print("hint: run prep after Wayland login: python3 probe_driver.py prep --host black", file=sys.stderr)
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
    """Switch to a workspace by 0-based index (human WS1 = index 0)."""
    try:
        out = focus_workspace_index(int(args.index))
    except Exception as e:
        print(f"FocusWorkspace failed: {e}", file=sys.stderr)
        return 1
    print(json.dumps(out, indent=2))
    return 0 if out.get("ok", True) else 2


def _run_open_fresh(
    app: dict[str, Any],
    config: dict[str, Any],
    sample: int,
    owned: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], Any, dict[str, Any]]:
    """Close owned window if any, spawn, wait map+settle."""
    mode_name, cfg = verify_mode_for_sample(config, sample)
    match = app.get("match") or {}
    map_max = float((config.get("open") or {}).get("mapMaxWaitMs") or 120000)

    # close prior owned
    if owned.get("windowId"):
        close_window(int(owned["windowId"]))
        time.sleep(0.4)

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
        batch = get_events(since)
        settle = summarize_events(
            batch.get("events") or [],
            cfg,
            t0_mono=t0,
            window_id=None,
            settled=False,
            reason="map_timeout",
            wait_ms=mono_from_probe() - t0,
            agreement_reached=0,
            verify_mode=mode_name,
            verifications=[],
        )
        return None, settle, {"ok": False, "error": "map_timeout"}

    settle, _ = wait_settled(
        cfg,
        window_id=int(window["windowId"]),
        t0_mono=t0,
        since_seq=since,
        verify_mode=mode_name,
    )
    snap = probe_json("SnapshotWindow", str(int(window["windowId"])))
    window = snap.get("window") or window
    return window, settle, {"ok": True, "kind": "open_fresh", "verifyMode": mode_name}


def _run_open_warm(
    app: dict[str, Any],
    config: dict[str, Any],
    sample: int,
    existing: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], Any, dict[str, Any]]:
    """Process already has a window; launch again without closing first."""
    mode_name, cfg = verify_mode_for_sample(config, sample)
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

    map_max = float((config.get("open") or {}).get("mapMaxWaitMs") or 120000)
    deadline = time.time() + map_max / 1000.0
    target = None
    while time.time() < deadline:
        wins = find_matching_windows(match)
        new_ones = [w for w in wins if int(w["windowId"]) not in before_ids]
        if new_ones:
            target = new_ones[-1]
            break
        # single-instance: may only focus existing
        if wins and time.time() > deadline - (map_max / 1000.0) + 2.0:
            # after 2s still no new id → treat existing as warm target
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
        verify_mode=mode_name,
    )
    snap = probe_json("SnapshotWindow", str(int(target["windowId"])))
    target = snap.get("window") or target
    return (
        target,
        settle,
        {
            "ok": True,
            "kind": "open_warm",
            "verifyMode": mode_name,
            "newWindow": int(target["windowId"]) not in before_ids,
            "beforeIds": list(before_ids),
        },
    )


def run_op(
    op: dict[str, Any],
    window: dict[str, Any],
    config: dict[str, Any],
    sample: int,
    home_monitor: int,
    home_workspace: int,
) -> tuple[dict[str, Any], Any, dict[str, Any]]:
    """Returns (op_result, settle, window_updated)."""
    mode_name, cfg = verify_mode_for_sample(config, sample)
    wid = int(window["windowId"])
    kind = op.get("kind")

    clear_events()
    mark = probe_json("BeginMark", f"op:{op['id']}:{sample}")
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
        # return home for cleanliness after settle in caller? keep as-is; restore op separate
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
        verify_mode=mode_name,
    )
    snap = probe_json("SnapshotWindow", str(wid))
    if snap.get("window"):
        window = snap["window"]
    op_result = dict(op_result)
    op_result["verifyMode"] = mode_name
    return op_result, settle, window


def _record_detail(config: dict[str, Any]) -> str:
    d = (config.get("recordDetail") or "summary").lower()
    return "full" if d == "full" else "summary"


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
) -> Path:
    env = probe_json("GetEnv")
    errs = safety_check(config, allow_forge=allow_forge, env=env)
    if errs:
        raise RuntimeError("; ".join(errs))

    config = dict(config)
    if phase_label:
        config["phase"] = phase_label

    detail = _record_detail(config)
    apps_doc = {"version": 2, "apps": apps}
    ops_doc = {"version": 2, "ops": ops}
    doc = new_run_doc(
        host=host,
        config=config,
        apps=apps_doc,
        ops=ops_doc,
        env=env,
        session=session,
    )

    ensure_workspace(config, no_switch=no_switch_workspace)
    cooldown = float(config.get("cooldownMs") or 2000) / 1000.0
    between_apps = float(config.get("betweenAppsMs") or 5000) / 1000.0

    open_ops = [o for o in ops if o.get("kind") in ("open_fresh", "open_warm")]
    other_ops = [o for o in ops if o.get("kind") not in ("open_fresh", "open_warm")]

    ns = doc.get("namespace") or {}
    print(
        f"run host={ns.get('host')} session={ns.get('session')} suite={ns.get('suite')} "
        f"samples={samples} apps={len(apps)} ops={len(ops)} phase={config.get('phase')} "
        f"detail={detail} agree={((config.get('settle') or {}).get('agreeCount'))}",
        file=sys.stderr,
    )

    for ai, app in enumerate(apps):
        print(f"\n=== app {app['id']} ===", file=sys.stderr)
        tags = app.get("tags") or []
        ok_launch, why = app_launchable(app)
        if not ok_launch:
            msg = f"skip {app['id']}: {why}"
            print(f"  {msg}", file=sys.stderr)
            if "skip-if-missing" in tags or "optional" in tags:
                doc["errors"].append({"app": app["id"], "skipped": True, "reason": why})
                continue
            doc["errors"].append({"app": app["id"], "error": why})
            continue

        owned: dict[str, Any] = {}
        home_monitor = 0
        home_workspace = 0
        window: Optional[dict[str, Any]] = None

        # open_fresh samples
        for op in open_ops:
            if op.get("kind") == "open_fresh":
                for sample in range(samples):
                    print(f"  {op['id']} sample {sample+1}/{samples}…", file=sys.stderr)
                    window, settle, op_res = _run_open_fresh(app, config, sample, owned)
                    ok = bool(window and settle and settle.settled)
                    if window:
                        owned = window
                        home_monitor = int(window.get("monitor") or 0)
                        home_workspace = int(window.get("workspace") or 0)
                    doc["trials"].append(
                        trial_record(
                            app_id=app["id"],
                            op_id=op["id"],
                            sample=sample,
                            ok=ok,
                            settle=settle_to_dict(settle, detail=detail),
                            op_result=op_res,
                            window=window,
                            notes=op_res.get("error") or "",
                        )
                    )
                    print(
                        f"    ok={ok} settled={getattr(settle, 'settled', None)} "
                        f"wait={getattr(settle, 'wait_ms', None)} "
                        f"mode={getattr(settle, 'verify_mode', None)} "
                        f"rel={getattr(settle, 'relevant_event_count', None)}",
                        file=sys.stderr,
                    )
                    time.sleep(cooldown)

            elif op.get("kind") == "open_warm":
                if not window:
                    # seed with one fresh open (not counted as warm)
                    window, settle, _ = _run_open_fresh(app, config, 0, owned)
                    if window:
                        owned = window
                        home_monitor = int(window.get("monitor") or 0)
                        home_workspace = int(window.get("workspace") or 0)
                    time.sleep(cooldown)
                if not window:
                    doc["errors"].append({"app": app["id"], "error": "no window for open_warm"})
                    continue
                for sample in range(samples):
                    print(f"  {op['id']} sample {sample+1}/{samples}…", file=sys.stderr)
                    window, settle, op_res = _run_open_warm(app, config, sample, window)
                    ok = bool(window and settle and settle.settled)
                    if window:
                        owned = window
                    doc["trials"].append(
                        trial_record(
                            app_id=app["id"],
                            op_id=op["id"],
                            sample=sample,
                            ok=ok,
                            settle=settle_to_dict(settle, detail=detail),
                            op_result=op_res,
                            window=window,
                        )
                    )
                    print(
                        f"    ok={ok} new={op_res.get('newWindow')} "
                        f"wait={getattr(settle, 'wait_ms', None)}",
                        file=sys.stderr,
                    )
                    time.sleep(cooldown)

        if not window and other_ops:
            window, settle, _ = _run_open_fresh(app, config, 0, {})
            if window:
                home_monitor = int(window.get("monitor") or 0)
                home_workspace = int(window.get("workspace") or 0)
            time.sleep(cooldown)

        if not window:
            print(f"  skip non-open ops: no window", file=sys.stderr)
            continue

        for op in other_ops:
            for sample in range(samples):
                print(f"  {op['id']} sample {sample+1}/{samples}…", file=sys.stderr)
                snap = probe_json("SnapshotWindow", str(int(window["windowId"])))
                if not snap.get("ok"):
                    doc["trials"].append(
                        trial_record(
                            app_id=app["id"],
                            op_id=op["id"],
                            sample=sample,
                            ok=False,
                            settle={},
                            notes="window lost",
                        )
                    )
                    break
                window = snap["window"]
                op_result, settle, window = run_op(
                    op, window, config, sample, home_monitor, home_workspace
                )
                if op_result.get("skipped"):
                    doc["trials"].append(
                        trial_record(
                            app_id=app["id"],
                            op_id=op["id"],
                            sample=sample,
                            ok=True,
                            skipped=True,
                            skip_reason=op_result.get("reason"),
                            settle={},
                            op_result=op_result,
                            window=window,
                        )
                    )
                    print(f"    skipped: {op_result.get('reason')}", file=sys.stderr)
                    break
                ok = bool(op_result.get("ok") and settle and settle.settled)
                doc["trials"].append(
                    trial_record(
                        app_id=app["id"],
                        op_id=op["id"],
                        sample=sample,
                        ok=ok,
                        settle=settle_to_dict(settle, detail=detail),
                        op_result={
                            k: v
                            for k, v in op_result.items()
                            if k not in ("before", "after")
                        },
                        window=window,
                    )
                )
                print(
                    f"    ok={ok} wait={getattr(settle, 'wait_ms', None)} "
                    f"mode={getattr(settle, 'verify_mode', None)} "
                    f"rel={getattr(settle, 'relevant_event_count', None)}",
                    file=sys.stderr,
                )
                time.sleep(cooldown)

        # cleanup
        if (config.get("safety") or {}).get("closeAfterApp", True) and window:
            close_window(int(window["windowId"]))
            time.sleep(0.5)

        if ai + 1 < len(apps):
            time.sleep(between_apps)

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
    config = apply_suite(config, suite)
    return config


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
    # default full suite: tag "full"; skip pure optional unless requested
    if not app_filter:
        apps = [
            a
            for a in apps
            if "full" in (a.get("tags") or []) or "pilot" in (a.get("tags") or [])
        ]
        apps = [a for a in apps if "optional" not in (a.get("tags") or [])]
        # do not thrash guake while agent may be running inside it
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
        )
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    print(path)
    return 0


def cmd_pilot(args: argparse.Namespace) -> int:
    """Staged pilot: nautilus → ghostty → inkscape with small sample counts."""
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

    # optional: only a few ops for first micro-pass
    if args.ops:
        op_filter = set(args.ops.split(","))
        ops_all = [o for o in ops_all if o["id"] in op_filter]

    for stage in stages:
        print(f"\n######## PILOT {stage['id']} ########", file=sys.stderr)
        samples = int(args.samples if args.samples is not None else stage.get("samples") or 2)
        apps = [by_id[i] for i in stage.get("apps") or [] if i in by_id]
        if not apps:
            print(f"skip empty stage {stage['id']}", file=sys.stderr)
            continue
        # each stage writes under suite pilot; phase labels stage id
        stage_config = dict(config)
        stage_config["suite"] = "pilot"
        try:
            path = run_matrix(
                host=args.host,
                config=stage_config,
                apps=apps,
                ops=ops_all,
                samples=samples,
                allow_forge=args.allow_forge,
                no_switch_workspace=args.no_switch_workspace,
                out_dir=Path(args.out_dir) if args.out_dir else None,
                phase_label=f"pilot:{stage['id']}",
                session=getattr(args, "session", None),
            )
            print(path)
        except Exception as e:
            print(f"error stage {stage['id']}: {e}", file=sys.stderr)
            return 2
    return 0


def cmd_calibrate(args: argparse.Namespace) -> int:
    """Strict short matrix for knob discovery on a host×session."""
    args.suite = "calibration"
    if not args.apps:
        # default calibration set: stable + thrashy + terminal
        args.apps = "nautilus,ghostty,inkscape,gnome-terminal"
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

    sc = sub.add_parser("cleanup", help="Disable probe; restore Forge+rivals")
    sc.set_defaults(func=cmd_cleanup)

    sf = sub.add_parser("preflight", help="Ping + safety (Forge/rivals off)")
    sf.add_argument("--config", default=None)
    sf.add_argument("--allow-forge", action="store_true")
    sf.add_argument("--host", default=None)
    sf.set_defaults(func=cmd_preflight)

    for name, help_ in (
        ("run", "Full or filtered serial matrix (default suite: full-suite)"),
        ("pilot", "Staged pilot: nautilus → ghostty → inkscape"),
        ("calibrate", "Strict short matrix for host×session knob discovery"),
    ):
        sr = sub.add_parser(name, help=help_)
        sr.add_argument("--host", default=None, help="Host label: black | gray | green")
        sr.add_argument(
            "--session",
            default=None,
            help="wayland | x11 (default: XDG_SESSION_TYPE). Used for result namespace.",
        )
        sr.add_argument(
            "--suite",
            default=None,
            help="calibration | full-suite | pilot | strict (default depends on command)",
        )
        sr.add_argument("--config", default=None)
        sr.add_argument("--apps", default=None, help="comma app ids (run only)")
        sr.add_argument("--ops", default=None, help="comma op ids")
        sr.add_argument("--samples", type=int, default=None)
        sr.add_argument("--out-dir", default=None)
        sr.add_argument("--allow-forge", action="store_true")
        sr.add_argument("--no-switch-workspace", action="store_true")
        sr.add_argument(
            "--keep-detail",
            action="store_true",
            help="Record full verification polls + events (large JSON)",
        )
        if name == "run":
            sr.add_argument(
                "--include-guake",
                action="store_true",
                help="Include guake in default app list (off by default)",
            )
            sr.set_defaults(func=cmd_run)
        elif name == "pilot":
            sr.add_argument(
                "--stage",
                default=None,
                help="only one pilot stage id (e.g. stage1-nautilus)",
            )
            sr.set_defaults(func=cmd_pilot)
        else:
            sr.set_defaults(func=cmd_calibrate)

    sw = sub.add_parser(
        "focus-workspace",
        help="Switch workspace by 0-based index (WS1=0). Call after testing.",
    )
    sw.add_argument(
        "index",
        type=int,
        nargs="?",
        default=None,
        help="0-based workspace index (default: config workspace.returnIndex or 0)",
    )
    sw.add_argument("--config", default=None)
    sw.set_defaults(func=cmd_focus_workspace_cli)

    return p


def cmd_focus_workspace_cli(args: argparse.Namespace) -> int:
    config = _load_json(Path(args.config) if args.config else ROOT / "config.default.json")
    if args.index is not None:
        idx = int(args.index)
    else:
        ws = config.get("workspace") or {}
        idx = int(ws.get("returnIndex", 0))
    args.index = idx
    return cmd_focus_workspace(args)


def main(argv: Optional[list[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
