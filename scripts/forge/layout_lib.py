#!/usr/bin/env python3
"""Pure helpers for forge layout profiles (FC5). No DBus / process spawn."""

from __future__ import annotations

import json
import os
import re
import socket
from pathlib import Path
from typing import Any, Mapping, Optional

PROFILE_VERSION = 1
LAYOUT_DIR_NAME = "layout"
DEFAULT_CONFIG_ROOT = Path.home() / ".config" / "forge"

CLI_ONLY_OPS = frozenset({"launch", "wait-window", "wait"})
EXTENSION_OPS = frozenset(
    {
        "ping",
        "focus",
        "swap",
        "move",
        "layout",
        "layout-cycle",
        "merge-group",
        "float",
        "order",
        "place-next",
        "set",
        "close",
    }
)

_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")

# resolve_profile / list_profiles_resolved source tags
SOURCE_ENV_PATH = "env-path"
SOURCE_HOST = "host"
SOURCE_HOST_DIR = "host-dir"
SOURCE_COMMON = "common"
SOURCE_XDG = "xdg"
SOURCE_NOT_FOUND = "not-found"


def layout_dir(config_root: Optional[Path] = None) -> Path:
    root = Path(config_root) if config_root is not None else DEFAULT_CONFIG_ROOT
    return root / LAYOUT_DIR_NAME


def _normalize_profile_name(name: str) -> str:
    if not name or not isinstance(name, str):
        raise ValueError("profile name required")
    name = name.strip()
    if ":" in name or "@" in name:
        raise ValueError(
            "name must not contain ':' or '@' (reserved for workspace targeting)"
        )
    if not _NAME_RE.match(name):
        raise ValueError("invalid profile name (use A-Za-z0-9_-)")
    return name


def profile_path(name: str, config_root: Optional[Path] = None) -> Path:
    """Resolve ~/.config/forge/layout/<name>.json (no existence check)."""
    name = _normalize_profile_name(name)
    return layout_dir(config_root) / f"{name}.json"


def list_profiles(config_root: Optional[Path] = None) -> list[dict[str, Any]]:
    """
    List XDG profiles: [{name, path, description?}…], sorted by name.
    Skips unreadable / non-object JSON; still returns name+path for those.
    """
    d = layout_dir(config_root)
    if not d.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for p in sorted(d.glob("*.json")):
        name = p.stem
        if not _NAME_RE.match(name):
            continue
        entry: dict[str, Any] = {"name": name, "path": str(p)}
        _maybe_add_description(entry, p)
        out.append(entry)
    return out


def resolve_host(env: Optional[Mapping[str, str]] = None) -> str:
    """FORGE_HOST if set, else short hostname (strip domain)."""
    e = env if env is not None else os.environ
    raw = e.get("FORGE_HOST")
    if raw is not None and str(raw).strip():
        return str(raw).strip()
    return socket.gethostname().split(".")[0]


def layout_tree_root(
    env: Optional[Mapping[str, str]] = None,
    *,
    config_root: Optional[Path] = None,
    layout_dir_env: Optional[Path] = None,
) -> Path:
    """
    Root for hosts/ + common/ trees (same as layout save).

    Prefer FORGE_LAYOUT_DIR (or layout_dir_env override); else XDG
    ~/.config/forge/layout (or config_root/layout).
    """
    e = env if env is not None else os.environ
    if layout_dir_env is not None:
        return Path(layout_dir_env).expanduser()
    raw = e.get("FORGE_LAYOUT_DIR") if e is not None else None
    if raw is not None and str(raw).strip():
        return Path(str(raw).strip()).expanduser()
    return layout_dir(config_root)


def _env_layout_dir(
    env: Mapping[str, str],
    layout_dir_env: Optional[Path] = None,
    *,
    config_root: Optional[Path] = None,
) -> Path:
    """Alias for layout_tree_root (always a path; never None)."""
    return layout_tree_root(env, config_root=config_root, layout_dir_env=layout_dir_env)


def _profile_candidates(
    name: str,
    host: str,
    *,
    config_root: Optional[Path],
    wdir: Path,
    env: Mapping[str, str],
) -> list[tuple[Path, str]]:
    """Ordered (path, source) candidates for first-hit resolve."""
    out: list[tuple[Path, str]] = []
    path_env = env.get("FORGE_LAYOUT_PATH")
    if path_env is not None and str(path_env).strip():
        out.append((Path(str(path_env).strip()).expanduser(), SOURCE_ENV_PATH))
    root = Path(wdir)
    out.append((root / "hosts" / host / f"{name}.json", SOURCE_HOST))
    out.append((root / "hosts" / host / name / "profile.json", SOURCE_HOST_DIR))
    out.append((root / "common" / f"{name}.json", SOURCE_COMMON))
    # Flat drop-in next to hosts/ (tree root) and, if different, XDG layout/
    flat_tree = root / f"{name}.json"
    out.append((flat_tree, SOURCE_XDG))
    flat_xdg = profile_path(name, config_root=config_root)
    if flat_xdg != flat_tree:
        out.append((flat_xdg, SOURCE_XDG))
    return out


def resolve_profile(
    name: str,
    *,
    config_root: Optional[Path] = None,
    layout_dir_env: Optional[Path] = None,
    env: Optional[Mapping[str, str]] = None,
) -> dict[str, Any]:
    """
    Host-aware profile path resolve (first hit wins).

    Order: FORGE_LAYOUT_PATH (stem must match name + file exists) →
    <tree>/hosts/<host>/<name>.json →
    <tree>/hosts/<host>/<name>/profile.json →
    <tree>/common/<name>.json →
    flat <tree or XDG>/<name>.json

    Tree root = FORGE_LAYOUT_DIR if set, else ~/.config/forge/layout
    (same root layout save uses).
    """
    name = _normalize_profile_name(name)
    e = env if env is not None else os.environ
    host = resolve_host(e)
    wdir = layout_tree_root(e, config_root=config_root, layout_dir_env=layout_dir_env)
    candidates = _profile_candidates(
        name, host, config_root=config_root, wdir=wdir, env=e
    )
    candidate_paths = [str(p) for p, _ in candidates]

    for path, source in candidates:
        if source == SOURCE_ENV_PATH:
            if path.is_file() and path.stem == name:
                return {
                    "name": name,
                    "host": host,
                    "path": path,
                    "found": True,
                    "source": source,
                    "candidates": candidate_paths,
                }
            continue
        if path.is_file():
            return {
                "name": name,
                "host": host,
                "path": path,
                "found": True,
                "source": source,
                "candidates": candidate_paths,
            }

    return {
        "name": name,
        "host": host,
        "path": None,
        "found": False,
        "source": SOURCE_NOT_FOUND,
        "candidates": candidate_paths,
    }


def list_profiles_resolved(
    *,
    config_root: Optional[Path] = None,
    layout_dir_env: Optional[Path] = None,
    env: Optional[Mapping[str, str]] = None,
) -> list[dict[str, Any]]:
    """
    Union of profile names under tree hosts/<host>, common, and flat layout/.

    Tree root matches save: FORGE_LAYOUT_DIR if set, else XDG layout/.
    Each entry: name, path, source, host, description? — winning path by resolve order.
    """
    e = env if env is not None else os.environ
    host = resolve_host(e)
    wdir = layout_tree_root(e, config_root=config_root, layout_dir_env=layout_dir_env)
    names: set[str] = set()

    host_dir = Path(wdir) / "hosts" / host
    if host_dir.is_dir():
        for p in host_dir.glob("*.json"):
            if _NAME_RE.match(p.stem):
                names.add(p.stem)
        for p in host_dir.glob("*/profile.json"):
            n = p.parent.name
            if _NAME_RE.match(n):
                names.add(n)
    common_dir = Path(wdir) / "common"
    if common_dir.is_dir():
        for p in common_dir.glob("*.json"):
            if _NAME_RE.match(p.stem):
                names.add(p.stem)

    # Flat files under tree root and (if different) XDG layout/
    for d in (Path(wdir), layout_dir(config_root)):
        if not d.is_dir():
            continue
        for p in d.glob("*.json"):
            if _NAME_RE.match(p.stem):
                names.add(p.stem)

    # One-shot PATH: include stem if file exists and name is valid
    path_env = e.get("FORGE_LAYOUT_PATH")
    if path_env is not None and str(path_env).strip():
        p = Path(str(path_env).strip()).expanduser()
        if p.is_file() and _NAME_RE.match(p.stem):
            names.add(p.stem)

    out: list[dict[str, Any]] = []
    for name in sorted(names):
        resolved = resolve_profile(
            name,
            config_root=config_root,
            layout_dir_env=layout_dir_env,
            env=e,
        )
        if not resolved["found"] or resolved["path"] is None:
            continue
        entry: dict[str, Any] = {
            "name": name,
            "path": str(resolved["path"]),
            "source": resolved["source"],
            "host": resolved["host"],
        }
        _maybe_add_description(entry, Path(resolved["path"]))
        out.append(entry)
    return out


def _maybe_add_description(entry: dict[str, Any], path: Path) -> None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return
    if not isinstance(data, (dict, list)):
        return
    if isinstance(data, dict):
        desc = data.get("description")
        if isinstance(desc, str) and desc.strip():
            entry["description"] = desc.strip()
            return
    try:
        from layout_plan import format_layout_description

        auto = format_layout_description(data)
        if auto:
            entry["description"] = auto
    except (ValueError, TypeError, ImportError):
        pass


def format_short_path(path: Path | str, *, max_len: int = 36) -> str:
    """Human path: ~ for $HOME; drop leading components with … when long."""
    s = str(path)
    try:
        home = str(Path.home())
        if s == home or s.startswith(home + os.sep):
            s = "~" + s[len(home) :]
    except (OSError, RuntimeError):
        pass
    if len(s) <= max_len:
        return s
    # Drop whole components from the left: …/hosts/<host>/dev.json
    body = s[2:] if s.startswith("~/") else (s[1:] if s.startswith("/") else s)
    parts = [p for p in body.split("/") if p]
    if not parts:
        return "…" + s[-(max(1, max_len - 1)) :]
    for i in range(len(parts)):
        candidate = "…/" + "/".join(parts[i:])
        if len(candidate) <= max_len:
            return candidate
    last = parts[-1]
    if len(last) + 1 <= max_len:
        return "…" + last[-(max_len - 1) :] if len(last) >= max_len else "…/" + last
    return "…" + last[-(max_len - 1) :]


def format_profile_list_line(
    entry: Mapping[str, Any], *, desc_max: int = 40
) -> str:
    """Legacy one-line form (name + desc); prefer format_profile_list_table."""
    name = str(entry.get("name") or "?")
    desc = entry.get("description")
    d = ""
    if isinstance(desc, str) and desc.strip():
        d = desc.strip()
        if len(d) > desc_max:
            d = d[: max(1, desc_max - 1)] + "…"
    return f"{name}  {d}".rstrip()


def host_profiles_only(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep profiles from hosts/<host>/ (host file or host-dir form)."""
    return [
        e
        for e in entries
        if e.get("source") in (SOURCE_HOST, SOURCE_HOST_DIR)
    ]


def format_profile_list_table(
    entries: list[Mapping[str, Any]],
    *,
    stream: Any = None,
    color: Optional[bool] = None,
) -> str:
    """
    Two-column human table: Name (cyan) | Description (default).
    Header labels magenta when color is on.
    """
    try:
        from cli_ansi import color_enabled, cyan, magenta
    except ImportError:
        color_enabled = None  # type: ignore
        cyan = magenta = None  # type: ignore

    use_color = color
    if use_color is None:
        if color_enabled is not None:
            use_color = color_enabled(stream)
        else:
            use_color = False

    names = [str(e.get("name") or "") for e in entries]
    descs: list[str] = []
    for e in entries:
        d = e.get("description")
        descs.append(d.strip() if isinstance(d, str) and d.strip() else "")

    name_w = max([len("Name")] + [len(n) for n in names], default=4)

    def _hdr(label: str) -> str:
        if use_color and magenta is not None:
            return magenta(label, stream=stream)
        return label

    def _name_cell(n: str) -> str:
        pad = " " * max(0, name_w - len(n))
        if use_color and cyan is not None and n:
            return f"{cyan(n, stream=stream)}{pad}"
        return f"{n}{pad}"

    lines = [f"{_hdr('Name')}{' ' * max(0, name_w - len('Name'))}  {_hdr('Description')}"]
    for n, d in zip(names, descs):
        lines.append(f"{_name_cell(n)}  {d}")
    return "\n".join(lines)


def load_profile_file(path: Path | str) -> Any:
    """Read JSON object or bare array from path; raise ValueError on bad JSON/type."""
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
    if not isinstance(data, (dict, list)):
        raise ValueError("profile must be a JSON object or array")
    return data


def validate_profile(data: Any) -> dict[str, Any]:
    """
    Validate layout profile schema v1.
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
