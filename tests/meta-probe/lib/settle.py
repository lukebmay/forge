#!/usr/bin/env python3
"""Agreement settle helpers (pure; no DBus).

Hard disagreements reset the stable-duration timer.
Soft disagreements are recorded only (no reset).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Optional

CONTRACT_VERSION = 1

# Signals that reset settle duration
HARD_SIGNALS = frozenset({
    "window-created",
    "size-changed",
    "position-changed",
    "workspace-changed",
    "notify::maximized-horizontally",
    "notify::maximized-vertically",
    "notify::fullscreen",
    "notify::minimized",
    "notify::wm-class",
    "unmanaged",
})

# Signals recorded as soft (never reset timer)
SOFT_SIGNALS = frozenset({
    "notify::title",
    "notify::appears-focused",
    "raised",
})

# Snapshot fields compared for soft-only thrash (do not reset timer)
SOFT_SNAP_FIELDS = frozenset({"title", "focused", "above"})

# Layout snapshot fields — if they differ without a hard event, still soft for now
# (events usually fire; contract may promote later via version bump)
HARD_SNAP_FIELDS = frozenset({
    "frame", "monitor", "workspace", "maximized", "fullscreen", "minimized",
    "wmClass", "wmClassInstance"
})

KNOWN_HARD = {
    "d_size": {
        "signals": ["size-changed"]
    },
    "d_pos": {
        "signals": ["position-changed"]
    },
    "d_workspace": {
        "signals": ["workspace-changed"]
    },
    "d_max": {
        "signals":
        ["notify::maximized-horizontally", "notify::maximized-vertically"]
    },
    "d_fs": {
        "signals": ["notify::fullscreen"]
    },
    "d_min": {
        "signals": ["notify::minimized"]
    },
    "d_class": {
        "signals": ["notify::wm-class"]
    },
    "d_create": {
        "signals": ["window-created"]
    },
    "d_unmanaged": {
        "signals": ["unmanaged"]
    },
}

KNOWN_SOFT = {
    "s_title": {
        "signals": ["notify::title"],
        "fields": ["title"]
    },
    "s_focus": {
        "signals": ["notify::appears-focused"],
        "fields": ["focused"]
    },
    "s_raise": {
        "signals": ["raised"]
    },
    "s_snap_frame": {
        "fields": ["frame"]
    },
    "s_snap_monitor": {
        "fields": ["monitor"]
    },
    "s_snap_workspace": {
        "fields": ["workspace"]
    },
    "s_snap_max": {
        "fields": ["maximized"]
    },
    "s_snap_fs": {
        "fields": ["fullscreen"]
    },
    "s_snap_min": {
        "fields": ["minimized"]
    },
    "s_snap_class": {
        "fields": ["wmClass", "wmClassInstance"]
    },
    "s_snap_title": {
        "fields": ["title"]
    },
    "s_snap_focus": {
        "fields": ["focused"]
    },
    "s_snap_above": {
        "fields": ["above"]
    },
}


def agreement_contract_doc(settle_duration_ms: float,
                           check_interval_ms: float) -> dict[str, Any]:
    return {
        "version":
        CONTRACT_VERSION,
        "checkIntervalMs":
        check_interval_ms,
        "settleDurationMs":
        settle_duration_ms,
        "hardSignals":
        sorted(HARD_SIGNALS),
        "softSignals":
        sorted(SOFT_SIGNALS),
        "softSnapFields":
        sorted(SOFT_SNAP_FIELDS),
        "hardSnapFieldsSoftForNow":
        sorted(HARD_SNAP_FIELDS),
        "note":
        ("Hard signal → reset timer. Soft signal/snapshot thrash → record only. "
         "Snapshot-only layout diffs are soft in v1 (may promote later)."),
    }


@dataclass
class SettleConfig:
    check_interval_ms: float = 50.0
    settle_duration_ms: float = 3000.0
    max_wait_ms: float = 120000.0
    # legacy aliases unused by new path
    quiet_ms: float = 0.0
    agree_count: int = 0
    agreement_interval_ms: float = 0.0
    poll_ms: float = 50.0
    snapshot_each_poll: bool = True
    relevant_signals: list[str] = field(
        default_factory=lambda: sorted(HARD_SIGNALS | SOFT_SIGNALS))


@dataclass
class SettleResult:
    settled: bool
    reason: str
    wait_ms: float
    check_interval_ms: float
    settle_duration_ms: float
    stable_ms: float
    check_count: int
    hard_reset_count: int
    soft_count: int
    agreement_count: int
    time_to_first_agreement_ms: Optional[float]
    time_to_last_hard_ms: Optional[float]
    time_to_settled_ms: Optional[float]
    checks: list[dict[str, Any]]
    disagreement_counts: dict[str, int]
    # run may merge catalogs
    new_catalog_entries: dict[str, Any] = field(default_factory=dict)


class DisagreementCatalog:
    """Named disagreement shapes for one run (in memory)."""

    def __init__(self) -> None:
        self.entries: dict[str, dict[str, Any]] = {}
        for k, v in KNOWN_HARD.items():
            self.entries[k] = {"kind": "hard", **v}
        for k, v in KNOWN_SOFT.items():
            self.entries[k] = {"kind": "soft", **v}

    def ensure(
        self,
        *,
        kind: str,
        signals: list[str],
        fields: list[str],
        preferred: Optional[str] = None,
    ) -> str:
        if preferred and preferred in self.entries:
            return preferred
        # match existing by shape
        sig_set = set(signals)
        field_set = set(fields)
        for name, ent in self.entries.items():
            if ent.get("kind") != kind:
                continue
            if set(ent.get("signals") or []) == sig_set and set(
                    ent.get("fields") or []) == field_set:
                return name
        # mint new id
        blob = f"{kind}|{','.join(sorted(sig_set))}|{','.join(sorted(field_set))}"
        h = hashlib.sha1(blob.encode()).hexdigest()[:8]
        prefix = "d_auto_" if kind == "hard" else "s_auto_"
        name = f"{prefix}{h}"
        if name not in self.entries:
            self.entries[name] = {
                "kind": kind,
                "signals": sorted(sig_set),
                "fields": sorted(field_set),
                "auto": True,
            }
        return name

    def to_dict(self) -> dict[str, Any]:
        return dict(self.entries)


def _frame_eq(a: Any, b: Any) -> bool:
    if not isinstance(a, dict) or not isinstance(b, dict):
        return a == b
    for k in ("x", "y", "width", "height"):
        if int(a.get(k) or 0) != int(b.get(k) or 0):
            return False
    return True


def snapshot_field_diffs(prev: Optional[dict[str, Any]],
                         curr: Optional[dict[str, Any]]) -> list[str]:
    if not prev or not curr:
        return []
    diffs: list[str] = []
    for k in (
            "frame",
            "monitor",
            "workspace",
            "maximized",
            "fullscreen",
            "minimized",
            "wmClass",
            "wmClassInstance",
            "title",
            "focused",
            "above",
    ):
        if k == "frame":
            if not _frame_eq(prev.get("frame"), curr.get("frame")):
                diffs.append("frame")
        else:
            if prev.get(k) != curr.get(k):
                diffs.append(k)
    return diffs


def classify_check(
    *,
    events: list[dict[str, Any]],
    window_id: Optional[int],
    prev_snap: Optional[dict[str, Any]],
    curr_snap: Optional[dict[str, Any]],
    catalog: DisagreementCatalog,
) -> tuple[str, str, list[str]]:
    """
    Returns (outcome_id, severity, component_ids)
    severity: agreement | hard | soft
    """
    hard_sigs: list[str] = []
    soft_sigs: list[str] = []
    unknown_sigs: list[str] = []

    for e in events:
        if window_id and int(e.get("windowId") or 0) not in (0, window_id):
            continue
        sig = e.get("signal") or ""
        if sig in HARD_SIGNALS:
            hard_sigs.append(sig)
        elif sig in SOFT_SIGNALS:
            soft_sigs.append(sig)
        elif sig.startswith("op-"):
            continue
        elif sig:
            unknown_sigs.append(sig)

    field_diffs = snapshot_field_diffs(prev_snap, curr_snap)

    # Hard path: hard signals only (reset timer)
    if hard_sigs:
        ids: list[str] = []
        for sig in sorted(set(hard_sigs)):
            pref = None
            for name, meta in KNOWN_HARD.items():
                if sig in (meta.get("signals") or []):
                    pref = name
                    break
            ids.append(
                catalog.ensure(kind="hard",
                               signals=[sig],
                               fields=[],
                               preferred=pref))
        if len(set(ids)) == 1:
            return ids[0], "hard", ids
        multi = catalog.ensure(
            kind="hard",
            signals=sorted(set(hard_sigs)),
            fields=[],
            preferred="d_multi" if "d_multi" in catalog.entries else None,
        )
        if multi not in catalog.entries or catalog.entries[multi].get("auto"):
            catalog.entries["d_multi"] = {
                "kind": "hard",
                "signals": sorted(set(hard_sigs)),
                "fields": [],
                "components": ids,
            }
            multi = "d_multi"
        else:
            catalog.entries["d_multi"] = {
                "kind": "hard",
                "signals": sorted(set(hard_sigs)),
                "fields": [],
                "components": ids,
            }
            multi = "d_multi"
        return multi, "hard", ids

    # Unknown signals → mint hard (conservative: reset) or soft?
    # Treat unknown as hard so we don't miss layout thrash.
    if unknown_sigs:
        name = catalog.ensure(
            kind="hard",
            signals=sorted(set(unknown_sigs)),
            fields=[],
        )
        return name, "hard", [name]

    # Soft path: soft signals + all snapshot thrash (v1: snapshot never hard-resets alone)
    soft_ids: list[str] = []
    for sig in sorted(set(soft_sigs)):
        pref = None
        for name, meta in KNOWN_SOFT.items():
            if sig in (meta.get("signals") or []):
                pref = name
                break
        soft_ids.append(
            catalog.ensure(kind="soft",
                           signals=[sig],
                           fields=[],
                           preferred=pref))

    for f in field_diffs:
        pref = {
            "frame": "s_snap_frame",
            "monitor": "s_snap_monitor",
            "workspace": "s_snap_workspace",
            "maximized": "s_snap_max",
            "fullscreen": "s_snap_fs",
            "minimized": "s_snap_min",
            "wmClass": "s_snap_class",
            "wmClassInstance": "s_snap_class",
            "title": "s_snap_title",
            "focused": "s_snap_focus",
            "above": "s_snap_above",
        }.get(f)
        soft_ids.append(
            catalog.ensure(kind="soft", signals=[], fields=[f],
                           preferred=pref))

    if soft_ids:
        if len(set(soft_ids)) == 1:
            return soft_ids[0], "soft", soft_ids
        name = catalog.ensure(
            kind="soft",
            signals=sorted(set(soft_sigs)),
            fields=sorted(field_diffs),
        )
        return name, "soft", soft_ids

    return "agreement", "agreement", []


def match_window(snap: dict[str, Any], match: dict[str, Any]) -> bool:
    """Match probe window snapshot against apps.json match block."""
    if not snap:
        return False
    want_class = match.get("wmClass")
    if want_class:
        got_class = (snap.get("wmClass") or "").lower()
        got_inst = (snap.get("wmClassInstance") or "").lower()
        want = want_class.lower()
        if want != got_class and want not in got_class and want not in got_inst:
            return False
    title_sub = match.get("titleContains")
    if title_sub:
        title = snap.get("title") or ""
        if title_sub.lower() not in title.lower():
            return False
    return True


def settle_config_from_dict(settle: dict[str, Any],
                            *,
                            phase: str = "full") -> SettleConfig:
    """phase: bootstrap | calibration | full"""
    base_interval = float(settle.get("checkIntervalMs") or 50)
    base_duration = float(settle.get("settleDurationMs") or 3000)
    max_wait = float(settle.get("maxWaitMs") or 120000)
    if phase == "bootstrap":
        interval = float(settle.get("bootstrapCheckIntervalMs") or 50)
        duration = float(settle.get("bootstrapSettleDurationMs") or 10000)
    elif phase == "calibration":
        interval = float(settle.get("calibrationCheckIntervalMs") or 50)
        duration = base_duration
    else:
        interval = base_interval
        duration = base_duration
    return SettleConfig(
        check_interval_ms=interval,
        settle_duration_ms=duration,
        max_wait_ms=max_wait,
        poll_ms=interval,
    )


def derive_knobs_from_calibration(
    result: SettleResult,
    *,
    prev_duration_ms: float,
    prev_interval_ms: float,
) -> dict[str, float]:
    """
    After a calibration (esp. bootstrap), derive knobs for full samples + later cals.

    Slow machines → longer settleDurationMs (more jitter spacing, not less).
    Clean quiet → can raise checkIntervalMs for full suite (token/time save).
    """
    duration = prev_duration_ms
    interval = prev_interval_ms

    if result.settled and result.time_to_settled_ms is not None:
        tts = result.time_to_settled_ms
        last_hard = result.time_to_last_hard_ms or 0.0
        # Time spent in final hard-stable streak ≈ duration used
        thrash_tail = last_hard
        # If thrash lasted long, require longer continuous stability
        if thrash_tail > 2000:
            duration = max(duration, min(15000.0, thrash_tail * 0.5 + 3000.0))
        # Floor duration at least 3s; bootstrap may set higher
        duration = max(3000.0, duration)
        # If settled near bootstrap floor with no hard after t=0, can keep 3s
        if last_hard < 500 and tts <= prev_duration_ms + 200:
            duration = max(3000.0, min(duration, 5000.0))

    # Full-suite check interval: coarser when hard silence after thrash
    if result.hard_reset_count <= 2 and (result.time_to_last_hard_ms
                                         or 0) < 1500:
        interval = min(500.0, max(100.0, prev_interval_ms * 4))
    elif result.hard_reset_count <= 8:
        interval = min(250.0, max(50.0, prev_interval_ms * 2))
    else:
        interval = max(50.0, min(150.0, prev_interval_ms))

    return {
        "settleDurationMs": float(duration),
        "checkIntervalMs": float(interval),
        "calibrationCheckIntervalMs": 50.0,
    }


def settle_result_to_dict(r: SettleResult) -> dict[str, Any]:
    return {
        "settled": r.settled,
        "reason": r.reason,
        "waitMs": r.wait_ms,
        "checkIntervalMs": r.check_interval_ms,
        "settleDurationMs": r.settle_duration_ms,
        "stableMs": r.stable_ms,
        "checkCount": r.check_count,
        "hardResetCount": r.hard_reset_count,
        "softCount": r.soft_count,
        "agreementCount": r.agreement_count,
        "timeToFirstAgreementMs": r.time_to_first_agreement_ms,
        "timeToLastHardMs": r.time_to_last_hard_ms,
        "timeToSettledMs": r.time_to_settled_ms,
        "disagreementCounts": r.disagreement_counts,
        "checks": r.checks,
    }
