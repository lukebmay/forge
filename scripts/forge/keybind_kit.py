#!/usr/bin/env python3
"""Keybind kit backup/apply — live gsettings ↔ profile JSON / built-in kits.

Profiles dir: FORGE_KEYBIND_PROFILES_DIR, else ~/.config/forge/config/keybinding-profiles.
Kits (vim/safe/i3) load from lib/shared/keybind-presets.js via Node (no GJS).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

SCHEMA_KBD = "org.gnome.shell.extensions.forge.keybindings"
DCONF_KBD = "/org/gnome/shell/extensions/forge/keybindings/"
MOD_MASK_KEY = "mod-mask-mouse-tile"

_SCRIPT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPT_DIR.parent.parent
_XDG_PROFILES = Path.home() / ".config" / "forge" / "config" / "keybinding-profiles"

# Prefer user-installed extension schema, then source-tree schemas/
_DEFAULT_SCHEMA_CANDIDATES = (
    Path.home()
    / ".local"
    / "share"
    / "gnome-shell"
    / "extensions"
    / "forge@jmmaranan.com"
    / "schemas",
    _REPO_ROOT / "schemas",
)


def profiles_dir(env: Optional[dict[str, str]] = None) -> Path:
    e = env if env is not None else os.environ
    raw = (e.get("FORGE_KEYBIND_PROFILES_DIR") or "").strip()
    if raw:
        return Path(raw).expanduser()
    return _XDG_PROFILES


def ensure_profiles_dir(path: Optional[Path] = None) -> Path:
    d = path if path is not None else profiles_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d


def sanitize_profile_name(name: str) -> Optional[str]:
    if name is None:
        return None
    trimmed = str(name).strip()
    if not trimmed:
        return None
    if "/" in trimmed or "\\" in trimmed or ".." in trimmed:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_-]+", trimmed):
        return None
    return trimmed


def resolve_schema_dir(
    env: Optional[dict[str, str]] = None,
    *,
    prefer_source: bool = False,
) -> Optional[Path]:
    """Directory with gschemas.compiled for forge keybindings."""
    e = env if env is not None else os.environ
    override = (e.get("FORGE_GSETTINGS_SCHEMA_DIR") or "").strip()
    if override:
        p = Path(override).expanduser()
        if (p / "gschemas.compiled").is_file():
            return p

    candidates = list(_DEFAULT_SCHEMA_CANDIDATES)
    if prefer_source:
        candidates = [candidates[-1], *candidates[:-1]]

    for c in candidates:
        if (c / "gschemas.compiled").is_file():
            return c
    return None


def compile_source_schemas() -> Path:
    """glib-compile-schemas on repo schemas/ (needed for Phase 1 keys)."""
    schema_dir = _REPO_ROOT / "schemas"
    if not schema_dir.is_dir():
        raise FileNotFoundError(f"schemas dir missing: {schema_dir}")
    cmd = shutil.which("glib-compile-schemas")
    if not cmd:
        raise RuntimeError(
            "glib-compile-schemas not found (needed for Phase 1 key schema)"
        )
    subprocess.run([cmd, str(schema_dir)], check=True)
    compiled = schema_dir / "gschemas.compiled"
    if not compiled.is_file():
        raise RuntimeError(f"compile failed: missing {compiled}")
    return schema_dir


def _gsettings_env(schema_dir: Optional[Path]) -> dict[str, str]:
    env = os.environ.copy()
    if schema_dir is not None:
        env["GSETTINGS_SCHEMA_DIR"] = str(schema_dir)
    return env


def gsettings_list_keys(schema_dir: Optional[Path]) -> list[str]:
    r = subprocess.run(
        ["gsettings", "list-keys", SCHEMA_KBD],
        capture_output=True,
        text=True,
        env=_gsettings_env(schema_dir),
    )
    if r.returncode != 0:
        return []
    return [ln.strip() for ln in r.stdout.splitlines() if ln.strip()]


def gsettings_get(key: str, schema_dir: Optional[Path]) -> Optional[str]:
    r = subprocess.run(
        ["gsettings", "get", SCHEMA_KBD, key],
        capture_output=True,
        text=True,
        env=_gsettings_env(schema_dir),
    )
    if r.returncode != 0:
        return None
    return r.stdout.strip()


def gsettings_set(key: str, gvariant: str, schema_dir: Optional[Path]) -> None:
    r = subprocess.run(
        ["gsettings", "set", SCHEMA_KBD, key, gvariant],
        capture_output=True,
        text=True,
        env=_gsettings_env(schema_dir),
    )
    if r.returncode != 0:
        err = (r.stderr or r.stdout or "").strip()
        raise RuntimeError(f"gsettings set {key}: {err or 'failed'}")


def _parse_gvariant_strv(raw: str) -> list[str]:
    """Parse gsettings/dconf strv output into a Python list of strings."""
    s = (raw or "").strip()
    if not s or s in ("@as []", "[]"):
        return []
    # Prefer GLib when available
    try:
        from gi.repository import GLib  # type: ignore

        v = GLib.Variant.parse(None, s, None, None)
        return list(v.unpack())
    except Exception:
        pass
    # Fallback: JSON-ish after quote normalize
    try:
        j = s
        if j.startswith("@as "):
            j = j[4:].strip()
        j = j.replace("'", '"')
        out = json.loads(j)
        if isinstance(out, list):
            return [str(x) for x in out]
    except Exception:
        pass
    raise ValueError(f"cannot parse strv: {raw!r}")


def _parse_gvariant_string(raw: str) -> str:
    s = (raw or "").strip()
    if len(s) >= 2 and s[0] == s[-1] == "'":
        return s[1:-1]
    if len(s) >= 2 and s[0] == s[-1] == '"':
        return s[1:-1]
    return s


def format_strv(accels: list[str]) -> str:
    if not accels:
        return "@as []"
    # gsettings accepts Python-repr style with single quotes
    inner = ", ".join("'" + a.replace("'", r"\'") + "'" for a in accels)
    return f"[{inner}]"


def format_string(value: str) -> str:
    return value  # gsettings set for type s accepts bare or quoted


def dconf_dump_kbd() -> dict[str, str]:
    """Raw dconf keys under forge keybindings (values as GVariant text)."""
    r = subprocess.run(
        ["dconf", "dump", DCONF_KBD],
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        return {}
    out: dict[str, str] = {}
    for line in r.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("[") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        out[k.strip()] = v.strip()
    return out


def load_kit_from_presets(kit_id: str) -> dict[str, Any]:
    """Load built-in kit via Node import of keybind-presets.js."""
    kit_id = kit_id.strip().lower()
    if kit_id not in ("vim", "safe", "i3"):
        raise ValueError(f"unknown kit: {kit_id} (vim|safe|i3)")

    node = shutil.which("node")
    if not node:
        raise RuntimeError("node not found (needed to load keybind-presets.js)")

    script = f"""
import {{ getKit, buildProfileProps, KEYBINDING_PRESET_KEYS }} from {_repo_url("lib/shared/keybind-presets.js")};
const kit = getKit({kit_id!r});
if (!kit) {{ throw new Error("kit not found"); }}
const props = buildProfileProps({{
  modMaskMouseTile: kit.modMaskMouseTile,
  bindings: kit.bindings,
  name: kit.id,
}});
props.keys = [...KEYBINDING_PRESET_KEYS];
console.log(JSON.stringify(props));
"""
    r = subprocess.run(
        [node, "--input-type=module", "-e", script],
        capture_output=True,
        text=True,
        cwd=str(_REPO_ROOT),
    )
    if r.returncode != 0:
        raise RuntimeError(
            f"node kit load failed: {(r.stderr or r.stdout or '').strip()}"
        )
    # node may print warnings on stderr; stdout is JSON
    line = r.stdout.strip().splitlines()[-1]
    return json.loads(line)


def _repo_url(rel: str) -> str:
    """file:// URL for ESM import."""
    p = (_REPO_ROOT / rel).resolve()
    return json.dumps(p.as_uri())


def keybinding_keys_from_presets() -> list[str]:
    data = load_kit_from_presets("safe")
    keys = data.get("keys")
    if isinstance(keys, list) and keys:
        return [str(k) for k in keys]
    # fall back to binding keys
    bindings = data.get("bindings") or {}
    return sorted(bindings.keys())


def build_profile_props(
    *,
    mod_mask: str,
    bindings: dict[str, list[str]],
    name: Optional[str] = None,
    note: Optional[str] = None,
) -> dict[str, Any]:
    props: dict[str, Any] = {
        "version": 1,
        "mod-mask-mouse-tile": mod_mask or "None",
        "bindings": bindings,
    }
    if name:
        props["name"] = name
    if note:
        props["note"] = note
    props["savedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return props


def backup_live(
    name: Optional[str] = None,
    *,
    schema_dir: Optional[Path] = None,
    out_dir: Optional[Path] = None,
) -> Path:
    """Dump live keybindings to profile JSON. Returns written path."""
    if name is None:
        stamp = datetime.now().strftime("%Y%m%d")
        name = f"backup-before-vim-{stamp}"
    safe = sanitize_profile_name(name)
    if not safe:
        raise ValueError(f"invalid profile name: {name!r}")

    dest_dir = ensure_profiles_dir(out_dir)
    dest = dest_dir / f"{safe}.json"

    if schema_dir is None:
        schema_dir = resolve_schema_dir()

    bindings: dict[str, list[str]] = {}
    mod_mask = "None"

    # Prefer full KEYBINDING_KEYS list from presets when node works
    try:
        keys = keybinding_keys_from_presets()
    except Exception:
        keys = [k for k in gsettings_list_keys(schema_dir) if k != MOD_MASK_KEY]

    dconf_raw = dconf_dump_kbd()

    for key in keys:
        raw = None
        if schema_dir is not None:
            raw = gsettings_get(key, schema_dir)
        if raw is None and key in dconf_raw:
            raw = dconf_raw[key]
        if raw is None:
            bindings[key] = []
            continue
        try:
            bindings[key] = _parse_gvariant_strv(raw)
        except ValueError:
            bindings[key] = []

    # mod mask
    raw_mod = None
    if schema_dir is not None:
        raw_mod = gsettings_get(MOD_MASK_KEY, schema_dir)
    if raw_mod is None and MOD_MASK_KEY in dconf_raw:
        raw_mod = dconf_raw[MOD_MASK_KEY]
    if raw_mod is not None:
        mod_mask = _parse_gvariant_string(raw_mod)

    # Include any extra dconf keys not in allowlist (forward-compat)
    for key, raw in dconf_raw.items():
        if key == MOD_MASK_KEY or key in bindings:
            continue
        try:
            bindings[key] = _parse_gvariant_strv(raw)
        except ValueError:
            pass

    props = build_profile_props(
        mod_mask=mod_mask,
        bindings=bindings,
        name=safe,
        note="Live keybindings snapshot (forge keybind backup)",
    )
    dest.write_text(json.dumps(props, indent=2) + "\n", encoding="utf-8")
    return dest


def load_profile_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"profile not an object: {path}")
    return data


def apply_profile_props(
    props: dict[str, Any],
    *,
    schema_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> list[str]:
    """Apply profile props to live gsettings. Returns list of keys set."""
    if schema_dir is None:
        schema_dir = resolve_schema_dir(prefer_source=True)
        # If source has newer keys, prefer compiled source
        if schema_dir is None or not _schema_has_key(
            schema_dir, "con-stack-tab-layout-toggle"
        ):
            try:
                schema_dir = compile_source_schemas()
            except Exception as e:
                if schema_dir is None:
                    raise RuntimeError(
                        f"no usable GSettings schema dir ({e})"
                    ) from e

    bindings = props.get("bindings") or {}
    if not isinstance(bindings, dict):
        raise ValueError("profile bindings must be an object")

    mod_mask = props.get("mod-mask-mouse-tile", "None")
    if not isinstance(mod_mask, str):
        mod_mask = "None"

    known = set(gsettings_list_keys(schema_dir))
    if not known:
        raise RuntimeError(
            f"schema {SCHEMA_KBD} not available (schema_dir={schema_dir})"
        )

    applied: list[str] = []

    if MOD_MASK_KEY in known:
        if not dry_run:
            gsettings_set(MOD_MASK_KEY, format_string(mod_mask), schema_dir)
        applied.append(MOD_MASK_KEY)

    # Apply every KEYBINDING_KEYS entry present in kit; empty list unbinds
    for key, accels in bindings.items():
        if key not in known:
            continue
        if not isinstance(accels, list):
            continue
        str_accels = [str(a) for a in accels]
        if not dry_run:
            gsettings_set(key, format_strv(str_accels), schema_dir)
        applied.append(key)

    return applied


def _schema_has_key(schema_dir: Path, key: str) -> bool:
    return key in gsettings_list_keys(schema_dir)


def apply_kit(
    kit_id: str,
    *,
    schema_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> tuple[dict[str, Any], list[str]]:
    props = load_kit_from_presets(kit_id)
    # drop helper field
    props.pop("keys", None)
    applied = apply_profile_props(props, schema_dir=schema_dir, dry_run=dry_run)
    return props, applied


def apply_profile_file(
    path: Path,
    *,
    schema_dir: Optional[Path] = None,
    dry_run: bool = False,
) -> list[str]:
    props = load_profile_json(path)
    return apply_profile_props(props, schema_dir=schema_dir, dry_run=dry_run)


def list_profiles(out_dir: Optional[Path] = None) -> list[str]:
    d = out_dir if out_dir is not None else profiles_dir()
    if not d.is_dir():
        return []
    names: list[str] = []
    for p in sorted(d.glob("*.json")):
        stem = p.stem
        if sanitize_profile_name(stem):
            names.append(stem)
    return names


# --- CLI entry (standalone or forge subcommand) ---


def _eprint(*args: object) -> None:
    print(*args, file=sys.stderr)


def cmd_backup(args: Any) -> int:
    try:
        path = backup_live(args.name, out_dir=Path(args.dir) if args.dir else None)
    except Exception as e:
        _eprint(f"forge keybind backup: {e}")
        return 1
    print(path)
    return 0


def cmd_apply(args: Any) -> int:
    kit = (args.kit or "").strip().lower()
    profile = getattr(args, "profile", None)
    dry = bool(getattr(args, "dry_run", False))
    try:
        if profile:
            p = Path(profile).expanduser()
            if not p.is_file():
                # try profiles dir
                cand = profiles_dir() / f"{sanitize_profile_name(profile) or profile}.json"
                if cand.is_file():
                    p = cand
                else:
                    _eprint(f"forge keybind apply: profile not found: {profile}")
                    return 1
            applied = apply_profile_file(p, dry_run=dry)
            label = str(p)
        elif kit:
            _props, applied = apply_kit(kit, dry_run=dry)
            label = f"kit:{kit}"
        else:
            _eprint("forge keybind apply: need kit name (vim|safe|i3) or --profile")
            return 1
    except Exception as e:
        _eprint(f"forge keybind apply: {e}")
        return 1

    mode = "dry-run " if dry else ""
    _eprint(f"forge keybind: {mode}applied {label} ({len(applied)} keys)")
    if getattr(args, "verbose", False):
        for k in applied:
            print(k)
    return 0


def cmd_list(args: Any) -> int:
    d = Path(args.dir) if getattr(args, "dir", None) else profiles_dir()
    print(f"# {d}")
    for name in list_profiles(d):
        print(name)
    return 0


def cmd_dir(_args: Any) -> int:
    print(profiles_dir())
    return 0


def build_keybind_subparser(sub: Any) -> None:
    """Attach `keybind` command group to forge argparse subparsers."""
    kb = sub.add_parser(
        "keybind",
        help="Backup/apply keybind kits (gsettings; no DBus)",
        description=(
            "Backup live Forge keybindings to a profile JSON, or apply a built-in "
            "kit (vim|safe|i3) / saved profile.\n"
            "Dir: FORGE_KEYBIND_PROFILES_DIR or ~/.config/forge/config/keybinding-profiles\n"
            "Schema: extension schemas/ or repo schemas/ (auto-compiles source if needed)."
        ),
        formatter_class=__import__("argparse").RawDescriptionHelpFormatter,
    )
    kb_sub = kb.add_subparsers(dest="keybind_action", required=True)

    b = kb_sub.add_parser("backup", help="Dump live keybindings to profile JSON")
    b.add_argument(
        "name",
        nargs="?",
        default=None,
        help="Profile stem (default: backup-before-vim-YYYYMMDD)",
    )
    b.add_argument(
        "--dir",
        metavar="PATH",
        help="Override profiles directory",
    )
    b.set_defaults(func=_dispatch_keybind, keybind_handler=cmd_backup)

    a = kb_sub.add_parser("apply", help="Apply kit or profile to live gsettings")
    a.add_argument(
        "kit",
        nargs="?",
        default=None,
        help="Built-in kit: vim | safe | i3",
    )
    a.add_argument(
        "--profile",
        "-p",
        metavar="NAME|PATH",
        help="Saved profile name or JSON path",
    )
    a.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolve kit/schema only; do not write gsettings",
    )
    a.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="List keys applied",
    )
    a.set_defaults(func=_dispatch_keybind, keybind_handler=cmd_apply)

    ls = kb_sub.add_parser("list", help="List saved profile names")
    ls.add_argument("--dir", metavar="PATH", help="Override profiles directory")
    ls.set_defaults(func=_dispatch_keybind, keybind_handler=cmd_list)

    d = kb_sub.add_parser("dir", help="Print resolved profiles directory")
    d.set_defaults(func=_dispatch_keybind, keybind_handler=cmd_dir)


def _dispatch_keybind(_backend: Any, args: Any) -> int:
    handler = getattr(args, "keybind_handler", None)
    if handler is None:
        _eprint("forge keybind: missing action")
        return 1
    return int(handler(args))


def main(argv: Optional[list[str]] = None) -> int:
    import argparse

    p = argparse.ArgumentParser(prog="keybind_kit.py")
    sub = p.add_subparsers(dest="command")
    # reuse forge-style subcommands via a tiny shim
    class _Sub:
        def add_parser(self, *a, **k):
            return sub.add_parser(*a, **k)

    # Standalone: keybind_kit.py backup|apply|list|dir
    for name, help_ in (
        ("backup", "Dump live keybindings"),
        ("apply", "Apply kit or profile"),
        ("list", "List profiles"),
        ("dir", "Print profiles dir"),
    ):
        pass

    b = sub.add_parser("backup")
    b.add_argument("name", nargs="?", default=None)
    b.add_argument("--dir", default=None)
    b.set_defaults(func=cmd_backup)

    a = sub.add_parser("apply")
    a.add_argument("kit", nargs="?", default=None)
    a.add_argument("--profile", "-p", default=None)
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("-v", "--verbose", action="store_true")
    a.set_defaults(func=cmd_apply)

    ls = sub.add_parser("list")
    ls.add_argument("--dir", default=None)
    ls.set_defaults(func=cmd_list)

    d = sub.add_parser("dir")
    d.set_defaults(func=cmd_dir)

    args = p.parse_args(argv)
    if not getattr(args, "func", None):
        p.print_help()
        return 2
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
