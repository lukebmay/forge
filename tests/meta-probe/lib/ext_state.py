#!/usr/bin/env python3
"""Parse gnome-extensions info / list output (pure; unit-testable)."""

from __future__ import annotations

from typing import Optional


def parse_info_enabled(info_text: str) -> Optional[bool]:
    """
    True = enabled/active, False = disabled/inactive, None = unknown.

    GNOME 45+ reports:
      Enabled: Yes|No
      State: ACTIVE|INACTIVE
    Older / alternate wording used State: ENABLED|DISABLED.
    Prefer Enabled:; fall back to State:.
    """
    enabled_field: Optional[bool] = None
    state_field: Optional[str] = None
    for raw in info_text.splitlines():
        line = raw.strip()
        low = line.lower()
        if low.startswith("enabled:"):
            val = line.split(":", 1)[1].strip().lower()
            if val in ("yes", "true", "1", "enabled"):
                enabled_field = True
            elif val in ("no", "false", "0", "disabled"):
                enabled_field = False
        elif low.startswith("state:"):
            state_field = line.split(":", 1)[1].strip().lower()

    if enabled_field is not None:
        return enabled_field
    if state_field is not None:
        if state_field in ("active", "enabled"):
            return True
        if state_field in ("inactive", "disabled"):
            return False
    return None


def parse_list_enabled(list_text: str, uuid: str) -> bool:
    """True if uuid appears as a full line in `gnome-extensions list --enabled`."""
    for line in list_text.splitlines():
        if line.strip() == uuid:
            return True
    return False


def classify_extension(
    *,
    info_text: Optional[str] = None,
    list_enabled_text: Optional[str] = None,
    uuid: Optional[str] = None,
    info_missing: bool = False,
) -> str:
    """
    Return one of: enabled | disabled | missing.

    Prefer info Enabled/State; if unknown, use list --enabled when uuid given.
    """
    if info_missing or info_text is None:
        if list_enabled_text is not None and uuid is not None:
            return "enabled" if parse_list_enabled(list_enabled_text, uuid) else "missing"
        return "missing"

    parsed = parse_info_enabled(info_text)
    if parsed is True:
        return "enabled"
    if parsed is False:
        return "disabled"
    if list_enabled_text is not None and uuid is not None:
        return "enabled" if parse_list_enabled(list_enabled_text, uuid) else "disabled"
    return "disabled"
