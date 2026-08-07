#!/usr/bin/env python3
"""Thrash detection for meta-probe trials (pure; no DBus).

Thrash = any of:
  - settle fail (!settled)
  - excess hard resets (hard_reset_count > maxHardResets)
  - wait_ms ≫ settleDurationMs (wait > waitFactor * settleDuration)
"""

from __future__ import annotations

from typing import Any, Optional


# Defaults used when config omits thrash block
DEFAULT_MAX_HARD_RESETS = 20
DEFAULT_WAIT_FACTOR = 4.0


def thrash_config_from_dict(cfg: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Normalize thrash knobs from config.thrash or empty."""
    t = dict(cfg or {})
    return {
        "maxHardResets": int(t.get("maxHardResets", DEFAULT_MAX_HARD_RESETS)),
        "waitFactor": float(t.get("waitFactor", DEFAULT_WAIT_FACTOR)),
    }


def is_thrash(
    *,
    settled: bool,
    hard_reset_count: int = 0,
    wait_ms: float = 0.0,
    settle_duration_ms: float = 3000.0,
    max_hard_resets: int = DEFAULT_MAX_HARD_RESETS,
    wait_factor: float = DEFAULT_WAIT_FACTOR,
) -> tuple[bool, str]:
    """
    Return (is_thrash, reason). reason empty when thrash-free.
    """
    if not settled:
        return True, "settle_fail"
    if hard_reset_count > max_hard_resets:
        return True, f"excess_hard_resets:{hard_reset_count}>{max_hard_resets}"
    threshold = wait_factor * settle_duration_ms
    if settle_duration_ms > 0 and wait_ms > threshold:
        return True, f"wait_exceeds_factor:{wait_ms:.0f}>{threshold:.0f}"
    return False, ""


def is_thrash_from_settle(
    settle: Any,
    thrash_cfg: Optional[dict[str, Any]] = None,
) -> tuple[bool, str]:
    """Convenience: settle may be SettleResult, dict, or None (None → thrash)."""
    knobs = thrash_config_from_dict(thrash_cfg)
    if settle is None:
        return True, "settle_missing"
    if isinstance(settle, dict):
        settled = bool(settle.get("settled"))
        hard = int(settle.get("hardResetCount") or settle.get("hard_reset_count") or 0)
        wait = float(settle.get("waitMs") or settle.get("wait_ms") or 0)
        duration = float(
            settle.get("settleDurationMs") or settle.get("settle_duration_ms") or 3000
        )
    else:
        settled = bool(getattr(settle, "settled", False))
        hard = int(getattr(settle, "hard_reset_count", 0) or 0)
        wait = float(getattr(settle, "wait_ms", 0) or 0)
        duration = float(getattr(settle, "settle_duration_ms", 3000) or 3000)
    return is_thrash(
        settled=settled,
        hard_reset_count=hard,
        wait_ms=wait,
        settle_duration_ms=duration,
        max_hard_resets=int(knobs["maxHardResets"]),
        wait_factor=float(knobs["waitFactor"]),
    )


def trial_is_thrash(
    trial: dict[str, Any],
    thrash_cfg: Optional[dict[str, Any]] = None,
) -> tuple[bool, str]:
    """Thrash from a trial_record-shaped dict (uses settle + ok)."""
    if trial.get("skipped"):
        return False, ""
    if trial.get("ok") is False and not (trial.get("settle") or {}).get("settled"):
        # still use settle details when present
        pass
    thrash, reason = is_thrash_from_settle(trial.get("settle") or {}, thrash_cfg)
    if thrash:
        return thrash, reason
    if trial.get("ok") is False:
        return True, "trial_not_ok"
    return False, ""
