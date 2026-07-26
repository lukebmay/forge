#!/usr/bin/env python3
"""Pure helpers for forge workon profiles (FC5). No DBus / process spawn."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

PROFILE_VERSION = 1
WORKON_DIR_NAME = "workon"
DEFAULT_CONFIG_ROOT = Path.home() / ".config" / "forge"

CLI_ONLY_OPS = frozenset({"launch", "wait-window", "wait"})
EXTENSION_OPS = frozenset(
    {"ping", "focus", "swap", "move", "layout", "place-next", "set"}
)

_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def workon_dir(config_root: Optional[Path] = None) -> Path:
    root = Path(config_root) if config_root is not None else DEFAULT_CONFIG_ROOT
    return root / WORKON_DIR_NAME


def profile_path(name: str, config_root: Optional[Path] = None) -> Path:
    """Resolve ~/.config/forge/workon/<name>.json (no existence check)."""
    if not name or not isinstance(name, str):
        raise ValueError("profile name required")
    name = name.strip()
    if not _NAME_RE.match(name):
        raise ValueError("invalid profile name (use A-Za-z0-9_-)")
    return workon_dir(config_root) / f"{name}.json"


def list_profiles(config_root: Optional[Path] = None) -> list[dict[str, Any]]:
    """
    List profiles on disk: [{name, path, description?}…], sorted by name.
    Skips unreadable / non-object JSON; still returns name+path for those.
    """
    d = workon_dir(config_root)
    if not d.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(d.glob("*.json")):
        name = p.stem
        if not _NAME_RE.match(name):
            continue
        entry: dict[str, Any] = {"name": name, "path": str(p)}
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                desc = data.get("description")
                if isinstance(desc, str) and desc.strip():
                    entry["description"] = desc.strip()
        except (OSError, json.JSONDecodeError, UnicodeError):
            pass
        out.append(entry)
    return out


def load_profile_file(path: Path | str) -> dict[str, Any]:
    """Read JSON object from path; raise ValueError on bad JSON / non-object."""
    p = Path(path).expanduser()
    if not p.is_file():
        raise FileNotFoundError(f"profile not found: {p}")
    try:
        raw = p.read_text(encoding="utf-8")
    except OSError as e:
        raise ValueError(f"cannot read profile: {e}") from e
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"invalid JSON: {e}") from e
    if not isinstance(data, dict):
        raise ValueError("profile must be a JSON object")
    return data


def validate_profile(data: Any) -> dict[str, Any]:
    """
    Validate workon profile schema v1.
    Returns normalized dict: version, description?, displays?, settings?,
    stopOnError (bool), steps (list).
    Raises ValueError with a clear message.
    """
    if not isinstance(data, dict):
        raise ValueError("profile must be a JSON object")

    if "version" not in data:
        raise ValueError("profile version required (want version: 1)")
    ver = data["version"]
    if ver != PROFILE_VERSION and ver != str(PROFILE_VERSION):
        raise ValueError(f"unsupported profile version: {ver!r} (want {PROFILE_VERSION})")

    if "steps" not in data:
        raise ValueError("profile steps required (array; may be empty)")
    steps = data["steps"]
    if not isinstance(steps, list):
        raise ValueError("profile steps must be an array")

    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            raise ValueError(f"steps[{i}]: must be an object")
        op = step.get("op") or step.get("action") or step.get("type")
        if op is None or str(op).strip() == "":
            raise ValueError(f"steps[{i}]: op required")
        op_name = str(op).strip().lower()
        if op_name not in CLI_ONLY_OPS and op_name not in EXTENSION_OPS:
            raise ValueError(
                f"steps[{i}]: unknown op {op_name!r} "
                f"(extension: {', '.join(sorted(EXTENSION_OPS))}; "
                f"cli: {', '.join(sorted(CLI_ONLY_OPS))})"
            )
        _validate_step_fields(i, op_name, step)

    out: dict[str, Any] = {
        "version": PROFILE_VERSION,
        "stopOnError": True,
        "steps": steps,
    }

    if "stopOnError" in data:
        soe = data["stopOnError"]
        if not isinstance(soe, bool):
            raise ValueError("stopOnError must be a boolean")
        out["stopOnError"] = soe

    desc = data.get("description")
    if desc is not None:
        if not isinstance(desc, str):
            raise ValueError("description must be a string")
        out["description"] = desc

    displays = data.get("displays")
    if displays is not None:
        if not isinstance(displays, str) or not displays.strip():
            raise ValueError("displays must be a non-empty string (gdisplays scene name)")
        out["displays"] = displays.strip()

    settings = data.get("settings")
    if settings is not None:
        if not isinstance(settings, str) or not settings.strip():
            raise ValueError("settings must be a non-empty string (config-sync profile name)")
        out["settings"] = settings.strip()

    return out


def _validate_step_fields(i: int, op: str, step: dict[str, Any]) -> None:
    if op == "launch":
        app = step.get("app") or step.get("desktop") or step.get("command")
        if app is None or str(app).strip() == "":
            raise ValueError(f"steps[{i}]: launch requires app (or desktop/command)")
    elif op == "wait":
        ms = step.get("ms") if "ms" in step else step.get("timeout")
        if ms is None:
            raise ValueError(f"steps[{i}]: wait requires ms")
        try:
            n = int(ms)
        except (TypeError, ValueError) as e:
            raise ValueError(f"steps[{i}]: wait ms must be an integer") from e
        if n < 0:
            raise ValueError(f"steps[{i}]: wait ms must be >= 0")
    elif op == "wait-window":
        wc = step.get("wmClass") or step.get("wm_class")
        if wc is None or str(wc).strip() == "":
            raise ValueError(f"steps[{i}]: wait-window requires wmClass")


def partition_mixed_steps(steps: Any) -> list[dict[str, Any]]:
    """
    Split steps into extension vs CLI chunks (mirrors partitionMixedSteps in JS).
    Returns [{kind: "extension"|"cli", steps: [...]}, …].
    """
    if not isinstance(steps, list):
        return []
    chunks: list[dict[str, Any]] = []
    for step in steps:
        op_raw = None
        if isinstance(step, dict):
            op_raw = step.get("op") or step.get("action") or step.get("type")
        op = str(op_raw).strip().lower() if op_raw is not None else ""
        kind = "cli" if op in CLI_ONLY_OPS else "extension"
        if chunks and chunks[-1]["kind"] == kind:
            chunks[-1]["steps"].append(step)
        else:
            chunks.append({"kind": kind, "steps": [step]})
    return chunks


def extract_steps_and_stop(payload: Any) -> tuple[list[Any], bool]:
    """
    From a run file payload (array or {steps, stopOnError?}), return
    (steps, stopOnError). stopOnError defaults True.
    """
    if isinstance(payload, list):
        return payload, True
    if isinstance(payload, dict):
        steps = payload.get("steps")
        if not isinstance(steps, list):
            raise ValueError("payload must be a steps array or {steps: [...]}")
        soe = payload.get("stopOnError", True)
        if not isinstance(soe, bool):
            raise ValueError("stopOnError must be a boolean")
        return steps, soe
    raise ValueError("payload must be a steps array or {steps: [...]}")


def launch_fields_from_step(step: dict[str, Any]) -> dict[str, Any]:
    """Map a launch step dict to shared launch kwargs."""
    app = step.get("app") or step.get("desktop") or step.get("command")
    fields: dict[str, Any] = {
        "app": str(app).strip() if app is not None else "",
    }
    mon = step.get("monitor")
    if mon is not None and str(mon).strip() != "":
        fields["monitor"] = mon
    path = step.get("treePath") or step.get("path") or step.get("tree_path")
    if path is not None and str(path).strip() != "":
        fields["tree_path"] = str(path).strip()
    wc = step.get("wmClass") or step.get("wm_class")
    if wc is not None and str(wc).strip() != "":
        fields["wm_class"] = str(wc).strip()
    timeout = step.get("timeout") if "timeout" in step else step.get("timeoutMs")
    if timeout is not None:
        fields["timeout"] = int(timeout)
    no_wait = step.get("noWait") if "noWait" in step else step.get("no_wait")
    if no_wait is not None:
        fields["no_wait"] = bool(no_wait)
    if step.get("first") is not None:
        fields["first"] = bool(step["first"])
    return fields
