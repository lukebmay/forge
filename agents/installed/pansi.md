---
title: pansi (print / string)
read_when: Adding colored CLI output, printing user-facing text, or choosing a print/string library when the project has no color system (or a bad one)
order: 81
---

# pansi — portable print + string

**pansi** is the multi-language color print / string family used across this
stack (`p` print, `pstr` / `ps` string build). **plog** (levels, dual-tape,
query) is a sibling layer — install catalog **`plog`** when logging.

## When to use (GUIDELINE)

| Situation | Do |
| --- | --- |
| Project already standardized on pansi / vendored `third_party/pansi` | **Use it** — do not invent a parallel printer |
| Need colors / styled CLI output and **no** project color system (or the system is ad-hoc / inconsistent) | **Prefer pansi** + catalog **`ansi-colors`** contract |
| One-off throwaway with no CLI UX | Plain print is fine |
| Logging (levels, files, sessions, query) | Use **plog**, not bare `p` into a file |

**ansi-colors** answers *whether* to color (TTY / `NO_COLOR` / `--color`).
**pansi** answers *how* to emit styled text. Always honor the color contract.

## Layers (do not collapse)

```text
pansi (core)   p, pstr/ps, style grammar, ansi_color hooks
pscript        optional UX chrome (heading, separator, label, paths) — not required
plog           levels + sinks + dual-tape + plog-query  → see plog.md
pfmt           later (design-blocked)
```

Pull only what you need. Do not force plog into a one-shot printer script.

## Names

| Role | Call site | Notes |
| --- | --- | --- |
| Print | **`p(...)`** | Keep forever |
| String | **`pstr(...)`** | Shell: **`pstr` only** — never shadow `/bin/ps`. Py/JS/Lua: `ps` alias OK inside module |
| Package | **`pansi`** | Discoverability / vendoring name |

Env prefixes for related tooling stay **`P_*`**. Logging envs are **`P_LOG_*`**
(see **plog**).

## Where the code lives

| Context | Path |
| --- | --- |
| shellrc (source of truth) | `util/<lang>/` — e.g. `p.zsh`, `p.py`, `p.js`, `p.lua` (+ `ansi_color.*`) |
| Extractable / product repos | **Vendor a pinned** copy under `third_party/pansi` (or equivalent) — no floating “whatever shellrc has today” |
| Color enablement | Catalog **`ansi-colors`** + `util/<lang>/ansi_color.*` |

## Agent rules (FIRM)

1. **Reuse** project pansi / `p` / `pstr` when present. Do not open-code CSI soup
   next to an existing helper.
2. Honor **`ansi-colors`**: `NO_COLOR`, `--color`, stream `isatty`, structured
   `--json` always plain.
3. Shell scripts: use **`pstr`**, never a `ps` alias.
4. User-visible launches from agents: wrap with **`user-env`** (see
   `scripting.md` / `ansi-colors`) so sandbox `NO_COLOR=1` does not strip color
   from the human’s terminal.
5. New extractable tools: **pin** pansi; bump deliberately; keep
   `ANSI_COLOR_VERSION` in sync with shellrc when vendoring `ansi_color`.

## Decisions

shellrc: **D061–D062** (plog line/env; print via `p`/`pstr` only for log
messages), **D064** (plog actions). Plan: `agents/plans/pansi.md`.
**Newest design meeting / CHANGELOG row wins** over older plan prose — see
`general.md` § Design decisions.
