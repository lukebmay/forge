#!/usr/bin/env python3
"""Pure settle helpers for meta-probe (no DBus)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Optional


@dataclass
class SettleConfig:
    quiet_ms: float = 500.0
    agree_count: int = 5
    agreement_interval_ms: float = 2000.0
    poll_ms: float = 50.0
    max_wait_ms: float = 120000.0
    snapshot_each_poll: bool = True
    relevant_signals: list[str] = field(
        default_factory=lambda: [
            "window-created",
            "size-changed",
            "position-changed",
            "raised",
            "workspace-changed",
            "notify::wm-class",
            "notify::title",
            "notify::appears-focused",
            "notify::fullscreen",
            "notify::maximized-horizontally",
            "notify::maximized-vertically",
            "notify::minimized",
            "unmanaged",
        ]
    )


@dataclass
class SettleResult:
    settled: bool
    reason: str
    wait_ms: float
    quiet_ms_used: float
    agree_count_used: int
    agreement_interval_ms: float
    agreement_reached: int
    verify_mode: str
    verification_count: int
    event_count: int
    relevant_event_count: int
    first_event_ms: Optional[float]
    last_event_ms: Optional[float]
    time_to_quiet_ms: Optional[float]
    time_to_settled_ms: Optional[float]
    counts_by_signal: dict[str, int]
    inter_event_deltas_ms: list[float]
    verifications: list[dict[str, Any]]
    events: list[dict[str, Any]]


def is_relevant(event: dict[str, Any], cfg: SettleConfig, window_id: Optional[int] = None) -> bool:
    sig = event.get("signal") or ""
    if sig not in cfg.relevant_signals:
        return False
    if window_id is not None and window_id > 0:
        wid = int(event.get("windowId") or 0)
        if wid != window_id:
            return False
    return True


def count_signals(events: Iterable[dict[str, Any]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for e in events:
        s = e.get("signal") or "?"
        out[s] = out.get(s, 0) + 1
    return out


def inter_event_deltas(events: list[dict[str, Any]]) -> list[float]:
    if len(events) < 2:
        return []
    deltas = []
    for a, b in zip(events, events[1:]):
        try:
            deltas.append(float(b["monoMs"]) - float(a["monoMs"]))
        except (KeyError, TypeError, ValueError):
            continue
    return deltas


def relevant_events(
    events: list[dict[str, Any]], cfg: SettleConfig, window_id: Optional[int]
) -> list[dict[str, Any]]:
    return [e for e in events if is_relevant(e, cfg, window_id)]


def summarize_events(
    events: list[dict[str, Any]],
    cfg: SettleConfig,
    *,
    t0_mono: float,
    window_id: Optional[int] = None,
    settled: bool,
    reason: str,
    wait_ms: float,
    agreement_reached: int,
    verify_mode: str = "dense",
    verifications: Optional[list[dict[str, Any]]] = None,
) -> SettleResult:
    rel = relevant_events(events, cfg, window_id)
    first = last = tq = None
    if rel:
        first = float(rel[0]["monoMs"]) - t0_mono
        last = float(rel[-1]["monoMs"]) - t0_mono
        tq = last
    return SettleResult(
        settled=settled,
        reason=reason,
        wait_ms=wait_ms,
        quiet_ms_used=cfg.quiet_ms,
        agree_count_used=cfg.agree_count,
        agreement_interval_ms=cfg.agreement_interval_ms,
        agreement_reached=agreement_reached,
        verify_mode=verify_mode,
        verification_count=len(verifications or []),
        event_count=len(events),
        relevant_event_count=len(rel),
        first_event_ms=first,
        last_event_ms=last,
        time_to_quiet_ms=tq,
        time_to_settled_ms=wait_ms if settled else None,
        counts_by_signal=count_signals(rel),
        inter_event_deltas_ms=inter_event_deltas(rel),
        verifications=list(verifications or []),
        events=events,
    )


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


def verify_mode_for_sample(config: dict[str, Any], sample: int) -> tuple[str, SettleConfig]:
    """Build SettleConfig for sample index from config.default verifyModes."""
    base = config.get("settle") or {}
    modes = base.get("verifyModes") or {}
    mode_name = "dense"
    mode_cfg: dict[str, Any] = modes.get("dense") or {}
    for name, mc in modes.items():
        samples = mc.get("samples") or []
        if sample in samples:
            mode_name = name
            mode_cfg = mc
            break
    cfg = SettleConfig(
        quiet_ms=float(base.get("quietMs", 500)),
        agree_count=int(base.get("agreeCount", 5)),
        agreement_interval_ms=float(base.get("agreementIntervalMs", 2000)),
        poll_ms=float(mode_cfg.get("pollMs", base.get("pollMs", 50))),
        max_wait_ms=float(base.get("maxWaitMs", 120000)),
        snapshot_each_poll=bool(mode_cfg.get("snapshotEachPoll", True)),
        relevant_signals=list(base.get("relevantSignals") or SettleConfig().relevant_signals),
    )
    return mode_name, cfg
