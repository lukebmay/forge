#!/usr/bin/env python3
"""Result document helpers for meta-probe."""

from __future__ import annotations

import json
import os
import platform
import socket
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


def host_meta(host: Optional[str] = None) -> dict[str, Any]:
    return {
        "host": host or socket.gethostname().split(".")[0],
        "platform": platform.platform(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "sessionType": os.environ.get("XDG_SESSION_TYPE"),
        "waylandDisplay": os.environ.get("WAYLAND_DISPLAY"),
        "display": os.environ.get("DISPLAY"),
        "user": os.environ.get("USER"),
    }


def new_run_doc(
    *,
    host: Optional[str],
    config: dict[str, Any],
    apps: dict[str, Any],
    ops: dict[str, Any],
    env: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "schemaVersion": 2,
        "probeVersion": config.get("probeVersion", "0.2.0"),
        "phase": config.get("phase", "A-serial-single-op"),
        "createdAt": now,
        "host": host_meta(host),
        "env": env or {},
        "config": config,
        "appsCatalogVersion": apps.get("version"),
        "opsCatalogVersion": ops.get("version"),
        "trials": [],
        "errors": [],
    }


def trial_record(
    *,
    app_id: str,
    op_id: str,
    sample: int,
    ok: bool,
    settle: dict[str, Any],
    op_result: Optional[dict[str, Any]] = None,
    skipped: bool = False,
    skip_reason: Optional[str] = None,
    window: Optional[dict[str, Any]] = None,
    notes: str = "",
) -> dict[str, Any]:
    return {
        "appId": app_id,
        "opId": op_id,
        "sample": sample,
        "ok": ok,
        "skipped": skipped,
        "skipReason": skip_reason,
        "verifyMode": (settle or {}).get("verifyMode")
        or (op_result or {}).get("verifyMode"),
        "window": window,
        "opResult": op_result,
        "settle": settle,
        "notes": notes,
        "recordedAt": datetime.now(timezone.utc).isoformat(),
    }


def settle_to_dict(s: Any) -> dict[str, Any]:
    if s is None:
        return {}
    if isinstance(s, dict):
        return s
    return {
        "settled": s.settled,
        "reason": s.reason,
        "waitMs": s.wait_ms,
        "quietMsUsed": s.quiet_ms_used,
        "agreeCountUsed": s.agree_count_used,
        "agreementIntervalMs": s.agreement_interval_ms,
        "agreementReached": s.agreement_reached,
        "verifyMode": s.verify_mode,
        "verificationCount": s.verification_count,
        "eventCount": s.event_count,
        "relevantEventCount": s.relevant_event_count,
        "firstEventMs": s.first_event_ms,
        "lastEventMs": s.last_event_ms,
        "timeToQuietMs": s.time_to_quiet_ms,
        "timeToSettledMs": s.time_to_settled_ms,
        "countsBySignal": s.counts_by_signal,
        "interEventDeltasMs": s.inter_event_deltas_ms,
        "verifications": s.verifications,
        "events": s.events,
    }


def write_run(doc: dict[str, Any], out_dir: Path, *, latest: bool = True) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    host = doc.get("host", {}).get("host", "host")
    phase = str(doc.get("phase") or "run").replace("/", "-").replace(":", "-")
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    path = out_dir / f"run-{host}-{phase}-{ts}.json"
    path.write_text(json.dumps(doc, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    if latest:
        latest_path = out_dir / "latest.json"
        try:
            if latest_path.is_symlink() or latest_path.exists():
                latest_path.unlink()
            latest_path.symlink_to(path.name)
        except OSError:
            latest_path.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return path
