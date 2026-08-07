#!/usr/bin/env python3
"""Delay-sweep helpers for multi-op thrash campaigns (pure; no DBus).

Sweep direction: high D → step down until thrash.
Record last-good (highest-to-lowest last thrashless) and first-fail.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional, Sequence


def delay_schedule(
    d_start: float,
    d_step: float,
    *,
    d_min: float = 0.0,
    include_start: bool = True,
) -> list[float]:
    """
    High → low inclusive schedule. d_step must be > 0.
    Stops when next value would be < d_min (last value may be d_min).
    """
    if d_step <= 0:
        raise ValueError("d_step must be > 0")
    out: list[float] = []
    d = float(d_start)
    if not include_start:
        d = d - d_step
    while d >= d_min - 1e-9:
        val = max(d_min, d) if abs(d - d_min) < 1e-9 else d
        if val < d_min:
            break
        # snap near zero
        if abs(val) < 1e-9:
            val = 0.0
        out.append(float(val))
        if val <= d_min:
            break
        d = d - d_step
        if d < d_min and (not out or out[-1] > d_min):
            out.append(float(d_min))
            break
    # de-dupe while preserving order
    seen: set[float] = set()
    uniq: list[float] = []
    for x in out:
        key = round(x, 6)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(x)
    return uniq


def record_last_good_first_fail(
    trials: Sequence[tuple[float, bool]],
) -> dict[str, Any]:
    """
    trials: ordered high D → low D, each (delay_ms, is_thrash).

    lastGoodMs: last thrash-free delay before first thrash (or lowest thrash-free if never thrash).
    firstFailMs: first thrashing delay (None if never thrashed).
    """
    last_good: Optional[float] = None
    first_fail: Optional[float] = None
    for d, thrash in trials:
        d = float(d)
        if thrash:
            if first_fail is None:
                first_fail = d
        else:
            # only update last_good while we have not yet failed
            if first_fail is None:
                last_good = d
    return {
        "lastGoodMs": last_good,
        "firstFailMs": first_fail,
        "thrashFree": first_fail is None,
        "nTrials": len(trials),
    }


def pad_delay(last_good: Optional[float], *, pad_ms: float, floor_ms: float = 0.0) -> float:
    """
    Conservative start: last-good + pad.
    If last_good is None, return floor_ms (caller supplies default high start).
    """
    if last_good is None:
        return float(floor_ms)
    return max(0.0, float(last_good) + float(pad_ms))


def isolation_plan(
    *,
    d1_0: float,
    d2_0: float,
    d_step: float,
    d_min: float = 0.0,
    joint_pad_ms: float = 50.0,
    joint_steps: int = 3,
) -> dict[str, Any]:
    """
    Build the 3-step isolation procedure schedule (SESSION_HANDOFF §2c).

    Does not execute — returns phases the driver should run:
      1. confirm (D1⁰, D2⁰)
      2. lock D1, sweep D2 down
      3. reset D2 safe, lock D2, sweep D1 down
      4. optional joint near-edge small steps
    """
    d2_schedule = delay_schedule(d2_0, d_step, d_min=d_min)
    d1_schedule = delay_schedule(d1_0, d_step, d_min=d_min)
    return {
        "confirm": {"d1Ms": float(d1_0), "d2Ms": float(d2_0)},
        "sweepD2": {
            "lock": "d1",
            "lockMs": float(d1_0),
            "scheduleMs": d2_schedule,
        },
        "sweepD1": {
            "lock": "d2",
            # lock value filled after sweepD2 (safe padded); plan lists schedule only
            "scheduleMs": d1_schedule,
            "safeD2FallbackMs": float(d2_0),
        },
        "joint": {
            "padMs": float(joint_pad_ms),
            "maxSteps": int(joint_steps),
        },
        "dStepMs": float(d_step),
        "dMinMs": float(d_min),
    }


def isolation_safe_d2(
    *,
    d2_0: float,
    last_good_d2: Optional[float],
    pad_ms: float,
) -> float:
    """After D2 thrash search, pick safe lock value for D1 sweep (last-good+pad or D2⁰)."""
    if last_good_d2 is not None:
        return pad_delay(last_good_d2, pad_ms=pad_ms, floor_ms=float(d2_0))
    return float(d2_0)


def joint_near_edge_candidates(
    *,
    d1_star: Optional[float],
    d2_star: Optional[float],
    pad_ms: float,
    step_ms: float,
    max_steps: int = 3,
) -> list[tuple[float, float]]:
    """
    Small joint descent near (D1*, D2*): start padded, then step both down
    toward thrash edges for max_steps pairs (including start).
    """
    if d1_star is None or d2_star is None:
        return []
    d1 = float(d1_star) + float(pad_ms)
    d2 = float(d2_star) + float(pad_ms)
    out: list[tuple[float, float]] = []
    for _ in range(max(1, max_steps)):
        out.append((max(0.0, d1), max(0.0, d2)))
        d1 = max(0.0, d1 - step_ms)
        d2 = max(0.0, d2 - step_ms)
    return out


def hypothesis_from_two_step(
    *,
    launch_then_monitor_last_good: Optional[float],
    launch_then_move_last_good: Optional[float],
    pad_ms: float,
    default_ms: float = 2000.0,
) -> dict[str, float]:
    """
    2b: D1 from launch→monitor last-good; D2 from launch→move last-good; pad both.
    """
    d1 = pad_delay(
        launch_then_monitor_last_good,
        pad_ms=pad_ms,
        floor_ms=default_ms,
    )
    d2 = pad_delay(
        launch_then_move_last_good,
        pad_ms=pad_ms,
        floor_ms=default_ms,
    )
    return {"d1Ms": d1, "d2Ms": d2, "padMs": float(pad_ms)}


def compare_hypothesis(
    hypothesis: dict[str, float],
    measured: dict[str, Any],
) -> dict[str, Any]:
    """Ratio / error of measured thrashless pair vs 2b hypothesis."""
    h1 = float(hypothesis.get("d1Ms") or 0)
    h2 = float(hypothesis.get("d2Ms") or 0)
    m1 = measured.get("d1Ms")
    m2 = measured.get("d2Ms")
    out: dict[str, Any] = {
        "hypothesis": {"d1Ms": h1, "d2Ms": h2},
        "measured": {"d1Ms": m1, "d2Ms": m2},
    }
    if m1 is not None and h1 > 0:
        out["d1Ratio"] = float(m1) / h1
        out["d1ErrorMs"] = float(m1) - h1
    if m2 is not None and h2 > 0:
        out["d2Ratio"] = float(m2) / h2
        out["d2ErrorMs"] = float(m2) - h2
    return out


def merge_trial_rows(
    delays: Iterable[float],
    thrash_flags: Sequence[bool],
) -> list[tuple[float, bool]]:
    delays_l = list(delays)
    if len(delays_l) != len(thrash_flags):
        raise ValueError("delays and thrash_flags length mismatch")
    return list(zip(delays_l, thrash_flags))
