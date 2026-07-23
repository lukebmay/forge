# ANSI Colors

## `--color=`

Support: `always` | `never` | `auto` (default).

`auto`: color only on interactive TTY; off when piped/non-TTY.

## Roles

| Color | Use |
| --- | --- |
| **Cyan** | Files, dirs, URLs, identifiers; main table values |
| **Blue** | Runnable commands; standout numbers/versions (also inside other colors) |
| **Magenta** | Headings, labels, section names |
| **Green** | Success (may nest colors) |
| **Red** | Errors (may nest colors) |
| **Yellow** | Warnings (may nest colors) |
| **Default** | Table keys, punctuation, body text (avoid hard-coded white) |

In **yellow** warnings, use **blue** (not cyan) for paths/URLs/ids so contrast holds.

Tables: default keys, colored values (cyan mostly; paths yellow; numbers blue). One space between tokens unless aligning columns.

Times: default parens, blue number. Green `✓` only for step/task ticks — not overall success lines (overall success = green text, no leading check).

## Emphasis

**Bold** primary · *italic* secondary · underline sparingly.

## Rules

- Reset after every sequence (`p` does this when used).
- No external ANSI libs unless stated.
- In `scripts/` / `shell-sources/`, prefer `util/<lang>/p.*` when present. Portable scripts: prefix ANSI ids with `ansi_`. If color code gets heavy, ask before adding a third-party lib.
