---
title: ANSI colors
read_when: Adding terminal colors or formatting CLI output
order: 80
---

# ANSI Colors

## `--color=`

Support: `always` | `never` | `auto` (default).  
`auto`: color only on interactive TTY.

## Roles

| Color | Use |
| --- | --- |
| **Cyan** | Files, dirs, URLs, identifiers; main table values |
| **Blue** | Runnable commands; standout numbers/versions |
| **Magenta** | Headings, labels, section names |
| **Green** | Success |
| **Red** | Errors |
| **Yellow** | Warnings (paths/ids in yellow warnings: use **blue**, not cyan) |
| **Default** | Keys, punctuation, body |

Tables: default keys, colored values. Times: default parens, blue number. Green `✓` only for step ticks — not overall success lines.

## Rules

- Reset after every sequence
- No external ANSI libs unless stated
- Prefer project `util/<lang>/p.*` when present; prefix portable ids with `ansi_`
