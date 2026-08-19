#!/usr/bin/env python3
"""Thin ApplyLayout client (AL8). Observe DBus; do not poll GetTree."""

from __future__ import annotations

import json
import os
import queue
import signal
import threading
import time
from pathlib import Path
from typing import Any, Callable, Mapping, Optional

APPLY_LAYOUT_MIN_API = 10
DEFAULT_POLL_INTERVAL_S = 0.25
DEFAULT_TIMEOUT_S = 300.0

BUS_NAME = "org.gnome.Shell.Extensions.Forge"
OBJECT_PATH = "/org/gnome/Shell/Extensions/Forge"
INTERFACE = "org.gnome.Shell.Extensions.Forge"

JsonFn = Callable[[str], dict[str, Any]]
PrintFn = Callable[..., None]


def ping_supports_apply_layout(ping: Any) -> bool:
    if not isinstance(ping, dict):
        return False
    try:
        return int(ping.get("apiVersion") or 0) >= APPLY_LAYOUT_MIN_API
    except (TypeError, ValueError):
        return False


def build_apply_layout_request(
    *,
    profile: Any,
    name: Optional[str] = None,
    host_job_id: Optional[str] = None,
    workspace: int = 0,
    flags: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    """Shape D038 ApplyLayout request. profile is required (raw file JSON)."""
    src = flags if isinstance(flags, Mapping) else {}
    out_flags = {
        "clean": True if src.get("clean") is None else bool(src.get("clean")),
        "keepOthers": bool(src.get("keepOthers")),
        "safe": bool(src.get("safe")),
        "forceClose": bool(src.get("forceClose")),
        "waitTreeStable": bool(src.get("waitTreeStable")),
    }
    req: dict[str, Any] = {
        "profile": profile,
        "workspace": int(workspace) if workspace is not None else 0,
        "flags": out_flags,
    }
    if name is not None and str(name).strip() != "":
        req["name"] = str(name).strip()
    hid = host_job_id if host_job_id is not None else ""
    if str(hid).strip() != "":
        req["hostJobId"] = str(hid).strip()
    return req


def format_progress_line(payload: Any) -> str:
    """Human phase line from LayoutApplyProgress (or a phase-only snapshot)."""
    if not isinstance(payload, dict):
        return ""
    phase = str(payload.get("phase") or "").strip()
    event = str(payload.get("event") or "").strip()
    message = str(payload.get("message") or "").strip()
    if message:
        body = message
    elif event and phase:
        body = f"{event} {phase}"
    elif event:
        body = event
    else:
        body = phase
    if not body:
        return ""
    if phase and not body.startswith(phase):
        return f"  {phase}  {body}"
    return f"  {body}"


def parse_json_obj(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if raw is None:
        return {}
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="replace")
    text = str(raw).strip()
    if not text:
        return {}
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("expected JSON object")
    return data


def terminal_from_snapshot(snap: Any) -> Optional[dict[str, Any]]:
    """Done payload from GetLayoutApply snapshot, or None if still live/idle."""
    if not isinstance(snap, dict):
        return None
    term = snap.get("terminal")
    if isinstance(term, dict) and ("ok" in term or "phase" in term or "applyId" in term):
        return term
    return None


def done_exit_code(done: Any) -> int:
    if not isinstance(done, dict):
        return 1
    if done.get("ok") is True:
        return 0
    code = str(done.get("code") or "").strip().lower()
    if code == "cancel":
        return 130
    return 1


def host_job_id_from_env(env: Optional[Mapping[str, str]] = None) -> Optional[str]:
    e = os.environ if env is None else env
    hid = str(e.get("FORGE_JOB_ID") or "").strip()
    return hid or None


def write_job_apply_id(
    apply_id: str,
    env: Optional[Mapping[str, str]] = None,
) -> None:
    """Record extension applyId on the D021 job status (observer only)."""
    e = os.environ if env is None else env
    aid = str(apply_id or "").strip()
    if not aid:
        return
    try:
        from job_runner import ENV_JOB_DIR, is_job_worker, update_status
    except Exception:
        return
    if not is_job_worker(e):
        return
    jdir_raw = str(e.get(ENV_JOB_DIR) or "").strip()
    if not jdir_raw:
        return
    try:
        update_status(Path(jdir_raw), applyId=aid)
    except Exception:
        return


def start_gi_signal_watcher(
    apply_id_holder: dict[str, Any],
    events: "queue.Queue[tuple[str, dict[str, Any]]]",
) -> Optional[Callable[[], None]]:
    """Subscribe LayoutApply Progress/Done. Returns stop(), or None if gi missing."""
    try:
        import gi

        gi.require_version("Gio", "2.0")
        gi.require_version("GLib", "2.0")
        from gi.repository import Gio, GLib
    except Exception:
        return None

    stop = threading.Event()

    def _on_signal(
        _conn: Any,
        _sender: Any,
        _path: Any,
        _iface: Any,
        signal_name: str,
        params: Any,
    ) -> None:
        try:
            payload = parse_json_obj(params.unpack()[0])
        except Exception:
            return
        want = str(apply_id_holder.get("id") or "").strip()
        got = str(payload.get("applyId") or "").strip()
        if want and got and want != got:
            return
        kind = "done" if signal_name == "LayoutApplyDone" else "progress"
        try:
            events.put((kind, payload))
        except Exception:
            return
        if kind == "done":
            stop.set()

    def _thread_main() -> None:
        try:
            bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
            loop = GLib.MainLoop()
            flags = Gio.DBusSignalFlags.NONE
            bus.signal_subscribe(
                BUS_NAME,
                INTERFACE,
                "LayoutApplyProgress",
                OBJECT_PATH,
                None,
                flags,
                _on_signal,
            )
            bus.signal_subscribe(
                BUS_NAME,
                INTERFACE,
                "LayoutApplyDone",
                OBJECT_PATH,
                None,
                flags,
                _on_signal,
            )

            def _tick() -> bool:
                if stop.is_set():
                    try:
                        loop.quit()
                    except Exception:
                        pass
                    return False
                return True

            GLib.timeout_add(200, _tick)
            loop.run()
        except Exception:
            return

    t = threading.Thread(
        target=_thread_main, name="forge-layout-apply-signals", daemon=True
    )
    t.start()
    return stop.set


def run_apply_layout_client(
    *,
    request: Mapping[str, Any],
    apply_fn: JsonFn,
    get_fn: JsonFn,
    cancel_fn: JsonFn,
    print_fn: PrintFn,
    write_apply_id_fn: Optional[Callable[[str], None]] = None,
    start_watcher_fn: Optional[
        Callable[
            [dict[str, Any], "queue.Queue[tuple[str, dict[str, Any]]]"],
            Optional[Callable[[], None]],
        ]
    ] = None,
    poll_interval_s: float = DEFAULT_POLL_INTERVAL_S,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    sleep_fn: Callable[[float], None] = time.sleep,
    now_fn: Callable[[], float] = time.monotonic,
    verbose: bool = False,
) -> tuple[int, Optional[dict[str, Any]]]:
    """
    ApplyLayout → stream Progress → wait Done.

    apply/get/cancel take/return JSON objects (callers wrap DBus strings).
    Ctrl+C / KeyboardInterrupt → CancelLayoutApply, exit 130.
    Phase/applyId lines only when verbose; errors always print.
    """
    events: "queue.Queue[tuple[str, dict[str, Any]]]" = queue.Queue()
    apply_id_holder: dict[str, Any] = {"id": None}
    stop_watch: Optional[Callable[[], None]] = None
    if start_watcher_fn is not None:
        try:
            stop_watch = start_watcher_fn(apply_id_holder, events)
        except Exception:
            stop_watch = None

    apply_id = ""
    last_line = ""
    last_phase = ""

    def _emit(payload: Any) -> None:
        nonlocal last_line, last_phase
        if isinstance(payload, dict) and payload.get("phase"):
            last_phase = str(payload.get("phase") or last_phase)
        if not verbose:
            return
        line = format_progress_line(payload)
        if not line or line == last_line:
            return
        last_line = line
        print_fn(line)

    def _drain() -> Optional[dict[str, Any]]:
        done: Optional[dict[str, Any]] = None
        while True:
            try:
                kind, payload = events.get_nowait()
            except queue.Empty:
                break
            if kind == "done":
                done = payload
            else:
                _emit(payload)
        return done

    def _finish(done: Optional[dict[str, Any]], *, rc: Optional[int] = None) -> tuple[int, Optional[dict[str, Any]]]:
        if stop_watch is not None:
            try:
                stop_watch()
            except Exception:
                pass
        if done is None:
            return (1 if rc is None else rc), None
        code = done_exit_code(done) if rc is None else rc
        if done.get("ok") is True:
            if verbose:
                print_fn("  ok")
        else:
            phase = str(done.get("phase") or last_phase or "?")
            err = str(done.get("error") or done.get("code") or "apply failed")
            print_fn(f"  failed  phase={phase}  {err}")
        return code, done

    try:
        start = apply_fn(json.dumps(request, ensure_ascii=False))
    except Exception as e:
        if stop_watch is not None:
            try:
                stop_watch()
            except Exception:
                pass
        print_fn(f"forge layout: ApplyLayout failed: {e}")
        return 1, None

    if not isinstance(start, dict):
        print_fn("forge layout: ApplyLayout returned non-object")
        return _finish(None, rc=1)

    if start.get("ok") is not True:
        code = str(start.get("code") or "").strip().lower()
        err = str(start.get("error") or "ApplyLayout rejected")
        if code == "busy":
            existing = str(start.get("applyId") or "").strip()
            extra = f" applyId={existing}" if existing else ""
            print_fn(f"forge layout: apply already running{extra}")
        else:
            print_fn(f"forge layout: {err}")
        return _finish(None, rc=1)

    apply_id = str(start.get("applyId") or "").strip()
    if not apply_id:
        print_fn("forge layout: ApplyLayout missing applyId")
        return _finish(None, rc=1)
    apply_id_holder["id"] = apply_id
    if write_apply_id_fn is not None:
        try:
            write_apply_id_fn(apply_id)
        except Exception:
            pass
    if verbose:
        print_fn(f"  applyId  {apply_id}")
    start_phase = str(start.get("phase") or "").strip()
    if start_phase:
        _emit({"phase": start_phase, "event": "enter", "message": f"enter {start_phase}"})

    deadline = float(now_fn()) + max(1.0, float(timeout_s))
    interrupted = False

    def _on_sigint(_signum: int, _frame: Any) -> None:
        nonlocal interrupted
        interrupted = True

    prev_sigint = None
    try:
        prev_sigint = signal.getsignal(signal.SIGINT)
        signal.signal(signal.SIGINT, _on_sigint)
    except Exception:
        prev_sigint = None

    try:
        while True:
            queued_done = _drain()
            if queued_done is not None:
                return _finish(queued_done)

            if interrupted:
                print_fn("  cancel requested")
                try:
                    cancel_fn(apply_id)
                except Exception as e:
                    print_fn(f"forge layout: CancelLayoutApply failed: {e}")
                try:
                    snap = get_fn(apply_id)
                    term = terminal_from_snapshot(snap)
                    if term is not None:
                        return _finish(term, rc=130)
                except Exception:
                    pass
                return _finish({"ok": False, "code": "cancel", "phase": last_phase}, rc=130)

            try:
                snap = get_fn(apply_id)
            except Exception as e:
                print_fn(f"forge layout: GetLayoutApply failed: {e}")
                return _finish(None, rc=1)

            term = terminal_from_snapshot(snap)
            if term is not None:
                _emit(term)
                return _finish(term)

            if isinstance(snap, dict):
                phase = str(snap.get("phase") or "").strip()
                if phase and phase != last_phase:
                    _emit({"phase": phase, "event": "enter", "message": f"enter {phase}"})

            if float(now_fn()) >= deadline:
                print_fn("  timeout waiting for ApplyLayout Done")
                try:
                    cancel_fn(apply_id)
                except Exception:
                    pass
                return _finish(
                    {"ok": False, "code": "timeout", "phase": last_phase or "timeout"},
                    rc=124,
                )

            try:
                sleep_fn(float(poll_interval_s))
            except KeyboardInterrupt:
                interrupted = True
    finally:
        if prev_sigint is not None:
            try:
                signal.signal(signal.SIGINT, prev_sigint)
            except Exception:
                pass
        if stop_watch is not None:
            try:
                stop_watch()
            except Exception:
                pass
