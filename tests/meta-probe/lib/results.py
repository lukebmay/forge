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


def session_type_label(explicit: Optional[str] = None) -> str:
    """Normalize session for path namespace: wayland | x11 | unknown."""
    raw = (explicit or os.environ.get("XDG_SESSION_TYPE") or "unknown").strip().lower()
    if raw in ("wayland", "waylands"):
        return "wayland"
    if raw in ("x11", "xorg", "mir"):
        return "x11"
    return raw or "unknown"


def host_meta(host: Optional[str] = None, *, session: Optional[str] = None) -> dict[str, Any]:
    st = session_type_label(session)
    return {
        "host": host or socket.gethostname().split(".")[0],
        "platform": platform.platform(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "sessionType": st,
        "sessionTypeRaw": os.environ.get("XDG_SESSION_TYPE"),
        "waylandDisplay": os.environ.get("WAYLAND_DISPLAY"),
        "display": os.environ.get("DISPLAY"),
        "user": os.environ.get("USER"),
    }


def deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    """Recursive dict merge; overlay wins. Lists/scalars replace."""
    out = dict(base)
    for k, v in overlay.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def apply_suite(config: dict[str, Any], suite: str) -> dict[str, Any]:
    """
    Merge suites.<suite> over base config. Sets suite + phase if not already set.
    Unknown suite → config unchanged except suite label.
    """
    cfg = dict(config)
    suites = cfg.get("suites") or {}
    overlay = suites.get(suite) or {}
    if overlay:
        # do not nest suites into merged output forever with self-reference noise
        body = {k: v for k, v in overlay.items() if k != "comment"}
        cfg = deep_merge(cfg, body)
    cfg["suite"] = suite
    if not cfg.get("phase") or cfg.get("phase") == config.get("phase"):
        cfg["phase"] = overlay.get("phase") or suite
    return cfg


def namespace_dir(
    results_root: Path,
    *,
    host: str,
    session: str,
    suite: str,
) -> Path:
    """results/<host>/<session>/<suite>/"""
    safe = lambda s: "".join(c if c.isalnum() or c in "-_." else "-" for c in s)
    return results_root / safe(host) / safe(session) / safe(suite)


def new_run_doc(
    *,
    host: Optional[str],
    config: dict[str, Any],
    apps: dict[str, Any],
    ops: dict[str, Any],
    env: Optional[dict[str, Any]] = None,
    session: Optional[str] = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    h = host_meta(host, session=session)
    return {
        "schemaVersion": 3,
        "probeVersion": config.get("probeVersion", "0.2.0"),
        "suite": config.get("suite") or "default",
        "phase": config.get("phase", "A-serial-single-op"),
        "createdAt": now,
        "host": h,
        "namespace": {
            "host": h["host"],
            "session": h["sessionType"],
            "suite": config.get("suite") or "default",
        },
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


def settle_to_dict(s: Any, *, detail: str = "summary") -> dict[str, Any]:
    """
    detail:
      summary — counts, timings, signal totals (default; small JSON)
      full — include events + every verification poll (huge; calibration debug)
    """
    if s is None:
        return {}
    if isinstance(s, dict):
        d = dict(s)
    else:
        d = {
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
    if detail != "full":
        # Keep agreement-tick samples only if present (tiny); drop dense poll spam + raw events
        verifs = d.get("verifications") or []
        ticks = [v for v in verifs if v.get("agreementTick")]
        d["verifications"] = ticks
        d.pop("events", None)
        d["recordDetail"] = "summary"
    else:
        d["recordDetail"] = "full"
    return d


def write_run(
    doc: dict[str, Any],
    out_dir: Path,
    *,
    latest: bool = True,
    results_root: Optional[Path] = None,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    ns = doc.get("namespace") or {}
    host = ns.get("host") or doc.get("host", {}).get("host", "host")
    session = ns.get("session") or doc.get("host", {}).get("sessionType", "unknown")
    suite = ns.get("suite") or doc.get("suite") or "run"
    phase = str(doc.get("phase") or suite).replace("/", "-").replace(":", "-")
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    # path already namespaces host/session/suite; filename keeps phase + time
    path = out_dir / f"run-{phase}-{ts}.json"
    path.write_text(json.dumps(doc, indent=2, sort_keys=False) + "\n", encoding="utf-8")

    def _link_latest(link_path: Path, target: Path) -> None:
        try:
            if link_path.is_symlink() or link_path.exists():
                link_path.unlink()
            # relative link when same dir
            if link_path.parent == target.parent:
                link_path.symlink_to(target.name)
            else:
                link_path.symlink_to(os.path.relpath(target, link_path.parent))
        except OSError:
            link_path.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")

    if latest:
        _link_latest(out_dir / "latest.json", path)
        if results_root is not None:
            results_root.mkdir(parents=True, exist_ok=True)
            _link_latest(results_root / "latest.json", path)
            # also host/session latest for browsing
            host_sess = results_root / str(host) / str(session)
            host_sess.mkdir(parents=True, exist_ok=True)
            _link_latest(host_sess / "latest.json", path)

    return path
