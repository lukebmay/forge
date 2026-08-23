#!/usr/bin/env python3
"""
p.py — High-performance colored printer (Python port of p.js / zsh `p`)

Matches the behavior of the Node version as closely as possible.

Library (pythonic):
    from p import p, pstr, ps
    p("+r", "error")                    # print with colors
    s = pstr("+g", "ok")                # colored string, NO print (prefer)
    s = p("+g", "ok", str=True)         # compat; also as_str=True
    p("a", "b", sep="|", end="")        # like print(sep, end)
    p("msg", color="always")

CLI / script (unchanged):
    ./p.py +r hello --end= --sep=...
    python util/python/p.py ...

- When run as __main__ or passed "--end=..." string args, behaves exactly
  like before (and like p.zsh).
- In library mode, prefer sep=, end=, color= kwargs; use pstr/ps for strings.
"""

import sys
import os
import re
from typing import Any, List, Dict, Optional, Tuple

try:
    from ansi_color import color_enabled
except ImportError:
    from .ansi_color import color_enabled

P_COLOR_DEFAULT = os.environ.get("P_COLOR_DEFAULT") or "auto"

RESET = "\x1b[0m"
CSI = "\x1b["
END = "m"

TABLE: Dict[str, str] = {
    "r": "31",
    "g": "32",
    "b": "34",
    "c": "36",
    "m": "35",
    "y": "33",
    "k": "30",
    "w": "37",
    "a": "38;5;244",
    "n": "39",
    "R": "41",
    "G": "42",
    "B": "44",
    "C": "46",
    "M": "45",
    "Y": "43",
    "K": "40",
    "W": "47",
    "A": "100",
    "N": "49",
    "*": "1",
    "~": "2",
    "%": "3",
    "_": "4",
    "!": "5",
    "^": "7",
    "#": "9",
}

fgList = ["r", "g", "b", "c", "m", "y", "k", "w", "a", "n"]
bgList = ["R", "G", "B", "C", "M", "Y", "K", "W", "A", "N"]
spList = ["*", "~", "%", "_", "!", "^", "#"]

exact_cache: Dict[str, str] = {}
canonical_cache: Dict[str, str] = {}


def init_caches() -> None:
    """Seed single-token styles; multi-char combos fill on first use."""
    exact_cache.clear()
    canonical_cache.clear()

    for ch in fgList + bgList + spList:
        seq = CSI + TABLE[ch] + END
        exact_cache["+" + ch] = seq
        canonical_cache[ch] = seq

    exact_cache["+"] = RESET
    exact_cache["+-"] = RESET


def _cache_style(arg: str, seq: str) -> None:
    if not seq:
        return
    exact_cache[arg] = seq
    if "h" not in arg and "H" not in arg:
        canonical_cache["".join(sorted(arg[1:]))] = seq


init_caches()


def parse_style_spec(input_str: str = "") -> List[str]:
    if not input_str:
        return []
    # Remove characters that are not style-related (same charset as JS)
    spec = re.sub(r'[\s\[\]()<>{}.,;:\\\/+=&?`@]', '', input_str)
    if not spec or spec in ("-", "+"):
        return ["-"]

    tokens: List[str] = []
    i = 0
    length = len(spec)

    while i < length:
        ch = spec[i]
        if ch in ("h", "H"):
            candidate = spec[i:i + 7]
            if re.match(r"^[hH][0-9a-fA-F]{6}$", candidate):
                tokens.append(candidate)
                i += 7
                continue
        if ch in "rRgGbByYcCmMwWkKaA*nN_!%~#^":
            tokens.append(ch)
        elif ch == "-":
            tokens.clear()
        i += 1
    return tokens


# --- Style state machine ---

style_state: Dict[str, str] = {
    "fg": "",
    "bg": "",
    "bold": "",
    "dim": "",
    "italic": "",
    "underline": "",
    "blink": "",
    "reverse": "",
    "strike": "",
}


def reset_style_state() -> None:
    for k in style_state:
        style_state[k] = ""


def apply_token(token: str) -> None:
    if not token:
        return
    if token == "-":
        reset_style_state()
        return
    if token == "n":
        style_state["fg"] = ""
        return
    if token == "N":
        style_state["bg"] = ""
        return

    # Hex colors: hRRGGBB (fg) or HRRGGBB (bg)
    if token[0] in ("h", "H") and re.match(r"^[hH][0-9a-fA-F]{6}$", token):
        hex_val = token[1:]
        r = int(hex_val[0:2], 16)
        g = int(hex_val[2:4], 16)
        b = int(hex_val[4:6], 16)
        if token[0] == "h":
            style_state["fg"] = f"38;2;{r};{g};{b}"
        else:
            style_state["bg"] = f"48;2;{r};{g};{b}"
        return

    code = TABLE.get(token)
    if not code:
        return

    if token in "rgbcmykwa":
        style_state["fg"] = code
    elif token in "RGBCMYKWA":
        style_state["bg"] = code
    elif token == "a":
        style_state["fg"] = TABLE["a"]
    elif token == "A":
        style_state["bg"] = TABLE["A"]
    else:
        attr_map = {
            "*": "bold",
            "~": "dim",
            "%": "italic",
            "_": "underline",
            "!": "blink",
            "^": "reverse",
            "#": "strike",
        }
        if token in attr_map:
            style_state[attr_map[token]] = code


def render_current_style() -> str:
    out = ""
    if style_state["fg"]:
        out += CSI + style_state["fg"] + END
    if style_state["bg"]:
        out += CSI + style_state["bg"] + END
    for attr in ("bold", "dim", "italic", "underline", "blink", "reverse",
                 "strike"):
        if style_state[attr]:
            out += CSI + style_state[attr] + END
    return out


def p(
    *args: Any,
    sep: Optional[str] = None,
    end: Optional[str] = None,
    as_str: bool = False,
    color: Optional[str] = None,
    escaped: Optional[bool] = None,
    default: Optional[str] = None,
    stderr: bool = False,
    **kw,
) -> str:
    """Colored printer. Library-friendly with kwargs; CLI --opt strings still supported.

    Pythonic usage:
        p("+r", "error", sep=" ", end="\n")
        s = p("+g", "ok", str=True)      # or as_str=True; colored string, do not print
        p("hello", sep="", end="")       # no separator, no trailing newline
        p("to stderr", stderr=True)
        p("msg", file=sys.stderr, flush=True)  # extra kwargs forwarded to print() when not as_str

    When invoked as script or with --style args, --sep= --end= --color= etc
    continue to work for full backward compat with p.zsh / direct calls.
    Additional kwargs (e.g. file=, flush=) are passed through to print() only when
    actually printing (as_str=False); ignored for string capture.
    """
    # map alias and pop known from kw for print extras
    if not as_str and kw.get("str"):
        as_str = bool(kw.pop("str", False))
    if not stderr and kw.get("stderr") is not False:
        # allow stderr in ** too, but prefer explicit param
        if kw.get("stderr"):
            stderr = bool(kw.pop("stderr", False))

    if not args:
        if not as_str:
            target = sys.stderr if stderr else sys.stdout
            # use print to allow extra kwargs
            pk = dict(kw)
            if stderr and "file" not in pk:
                pk["file"] = sys.stderr
            print("", sep="", end="\n", **pk)
        return "\n"

    reset_style_state()
    parts: List[str] = []
    _sep = " "
    _end = "\n"
    cli_mode: Optional[str] = None
    _escaped = False
    default_ansi = ""
    i = 0
    n = len(args)

    # Parse leading --options (for CLI and legacy string-arg calls)
    while i < n and isinstance(args[i], str) and args[i].startswith("--"):
        a = args[i]
        if a.startswith("--sep="):
            _sep = a[6:]
            i += 1
            continue
        if a.startswith("--end="):
            _end = a[6:]
            i += 1
            continue
        if a in ("--reset", "+-"):
            reset_style_state()
            i += 1
            continue
        if a.startswith("--color="):
            cli_mode = a[8:] or "always"
            i += 1
            continue
        if a == "--color":
            cli_mode = "always"
            i += 1
            continue
        if a in ("--escaped", "--escape", "-E"):
            _escaped = True
            i += 1
            continue
        if a.startswith("--default="):
            style = a[10:]
            reset_style_state()
            prefix = "+" if not style.startswith("+") else ""
            for t in parse_style_spec(prefix + style):
                apply_token(t)
            default_ansi = render_current_style()
            reset_style_state()
            i += 1
            continue
        if a == "--stderr" or a == "-e":
            stderr = True
            i += 1
            continue
        i += 1  # unknown --option, skip

    # Apply pythonic kwargs (take precedence over --parsed values)
    if sep is not None:
        _sep = sep
    if end is not None:
        _end = end
    if color is not None:
        cli_mode = color
    if escaped is not None:
        _escaped = bool(escaped)
    if default is not None:
        reset_style_state()
        style = default
        prefix = "+" if not style.startswith("+") else ""
        for t in parse_style_spec(prefix + style):
            apply_token(t)
        default_ansi = render_current_style()
        reset_style_state()

    # stderr from opts/kw (if passed as kw even after param bind)
    if not stderr and kw.get("stderr"):
        stderr = bool(kw.pop("stderr", False))

    # Allow str=True (user friendly) even though param is as_str to avoid shadowing builtin
    if not as_str and kw.get("str"):
        as_str = bool(kw.pop("str", False))

    if cli_mode is None or str(cli_mode).strip() == "":
        cli_mode = P_COLOR_DEFAULT or "auto"
    target_for_color = sys.stderr if stderr else sys.stdout
    use_color = color_enabled(
        target_for_color,
        cli_mode=cli_mode,
        tool_color_keys=("P_COLOR",),
    )

    while i < n:
        arg = args[i]

        # Style token starting with +
        if isinstance(arg, str) and arg.startswith("+"):
            ansi = exact_cache.get(arg)
            if not ansi:
                sorted_key = "".join(sorted(arg[1:]))
                ansi = canonical_cache.get(sorted_key)

            next_arg = args[i + 1] if i + 1 < n else None
            is_text_next = (next_arg is not None and isinstance(next_arg, str)
                            and not next_arg.startswith("+")
                            and not next_arg.startswith("--"))

            if is_text_next:
                if ansi:
                    colored = (ansi + next_arg +
                               RESET) if use_color else next_arg
                    parts.append(colored)
                    i += 2
                    reset_style_state()
                    continue
                for t in parse_style_spec(arg):
                    apply_token(t)
                st = render_current_style()
                _cache_style(arg, st)
                colored = (st + next_arg +
                           RESET) if (use_color and st) else next_arg
                parts.append(colored)
                i += 2
                reset_style_state()
                continue

            # Style only (no immediate text) — accumulate in state
            for t in parse_style_spec(arg):
                apply_token(t)
            i += 1
            continue

        # Skip stray --options inside the arg list
        if isinstance(arg, str) and arg.startswith("--"):
            i += 1
            continue

        # Plain text
        st = render_current_style()
        if not st and default_ansi:
            st = default_ansi
        colored = (st + str(arg) + RESET) if (use_color and st) else str(arg)
        parts.append(colored)

        # Re-apply default for next items (zsh-like)
        if default_ansi:
            reset_style_state()
            # keep default_ansi ready for next plain text
        else:
            reset_style_state()
        i += 1

    output = _sep.join(parts) + _end

    if not use_color:
        output = re.sub(r"\x1b\[[0-9;]*m", "", output)

    if _escaped:
        output = ansi_escape(output)
        if output.endswith("\\n"):
            output = output[:-2]

    if as_str:
        return output
    # Output using print() so that additional **kwargs (file=, flush=, etc) are
    # forwarded directly when in print mode. stderr convenience sets file if not overridden.
    # In string mode (as_str), we ignore extra kwargs as requested.
    pk = dict(kw)
    if stderr and "file" not in pk:
        pk["file"] = sys.stderr
    print(output, sep="", end="", **pk)
    return output


def pstr(*args: Any, **kwargs: Any) -> str:
    """Render styled string without printing. Prefer over p(..., str=True).

    Same kwargs as p (sep=, end=, color=, …). Forces string capture; ignores
    stderr=/file= side effects. Alias: ps.
    """
    kwargs.pop("str", None)
    kwargs["as_str"] = True
    return p(*args, **kwargs)


ps = pstr


def ansi_strip(s: str = "") -> str:
    if not isinstance(s, str):
        s = str(s)
    return re.sub(r"\x1b\[[0-9;]*[@-~]", "", s)


def ansi_escape(s: str = "") -> str:
    if not isinstance(s, str):
        s = str(s)
    return (s.replace("\x1b", "\\x1b").replace("\n", "\\n").replace(
        "\r", "\\r").replace("\t", "\\t").replace("\x07", "\\a"))


def ansi_unescape(s: str = "") -> str:
    if not isinstance(s, str):
        s = str(s)
    return (s.replace("\\x1b", "\x1b").replace("\\e", "\x1b").replace(
        "\\033", "\x1b").replace("\\n", "\n").replace("\\r", "\r").replace(
            "\\t", "\t").replace("\\a", "\x07"))


# === Direct CLI execution (parity with Node version) ===
if __name__ == "__main__":
    argv = sys.argv[1:]

    if "--help" in argv or "-?" in argv:
        print("Usage: p [OPTIONS] [+STYLE|--STYLE ...] [TEXT ...]")
        print("")
        print("Options:")
        print("  --sep=STR           Separator between items (default: space)")
        print(
            "  --end=STR           String appended at the end (default: newline)"
        )
        print("  --color=auto|always|never")
        print("  --reset, +-         Reset all styles")
        print("  --default=STYLE     Default style for plain text items")
        print("  --escaped, -E       Output ANSI-escaped string (for pasting)")
        print("  --stderr, -e        Output to stderr instead of stdout")
        print("")
        print("Styles: +r +g +b ...  +rG +rG*  +hff0000H00ff00")
        sys.exit(0)

    p(*argv)
