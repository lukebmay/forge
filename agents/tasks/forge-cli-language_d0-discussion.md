# forge-cli-language_d0-discussion — Gradual CLI off Python

**Status:** draft  
**Plan:** (none) — design session first; plan only after lock  
**Branch:** master  
**Blocker:** (none)  
**Updated:** 2026-08-14  
**Kind:** D0 design discussion only (no implementation in this task)

## Goal

Hold a **design session** on migrating the user-facing `forge` CLI **away from
Python gradually**, toward Node/JS where it shares product logic with the
extension and prefs. Lock: language strategy, migration order, subcommand
contracts, job-runner implications, and what *not* to rewrite first.

No code or rewrite in this task. Follow-up plan + implement slices only after
**user lock**.

## Why this exists

- Extension + prefs are **GJS/JS**. Portable product logic lives under
  `lib/shared/` (e.g. keybind kits).
- The control CLI (`scripts/forge/forge` and modules) is **Python**, built in
  this fork (not EGO / not jcrussell product CLI).
- Dual implementations already caused drift (keybind save/load policy vs prefs).
- Operator preference: **JS codebase → Node for CLI** makes more sense long-term
  than growing a second language for product surfaces.

## Scope of the session

1. Confirm history / non-goals (what “CLI” means vs install zsh).
2. Agree target architecture (router + facades, not big-bang rewrite).
3. Rank features for gradual migration (easy → hard).
4. Define subcommand contract (argv, exit codes, JSON, env, jobs).
5. Decide job_runner worker model when mutators leave Python.
6. Write DECISIONS row + optional short DESIGN section after lock.
7. Draft follow-up implement tasks **only after lock**.

## Acceptance

- [ ] Design session held with operator (human).
- [ ] Written **options + recommendation** in this task (or linked plan).
- [ ] Explicit **user locks** on: target language(s), first slice, job strategy,
      what stays Python for now.
- [ ] DECISIONS entry (e.g. D0xx) when locked.
- [ ] Follow-up implement task(s) drafted only after lock.
- [ ] No CLI rewrite code required for D0 completion.

## Non-goals (this task)

- Rewriting `forge layout` / `job_runner` / nest in this task.
- Choosing a full monorepo language policy for non-CLI code.
- Breaking `forge` on PATH or install-origin wiring.

---

## Notes — Grok4.5-med

Label: **`Grok4.5-med`** (session notes for the design discussion; not locks).

### History (facts)

| Fact | Detail |
| --- | --- |
| Who built the control CLI | **This tree (lukebmay)** — not EGO, not jcrussell product surface |
| Birth | FC0 **2026-07-25** (`e19e863`): DBus Ping/GetTree + `scripts/forge/forge` |
| Shebang from day one | `#!/usr/bin/env python3` |
| Plan language wording | forge-command plan said CLI could be **“Node or zsh+python”** — not a Python-only lock |
| No DECISIONS row | No recorded “CLI language = Python” decision |
| Why Python landed | Convenience at FC0: session **DBus** via PyGObject/`gdbus` + argparse; then path dependence |
| Growth | layout, jobs, nest, live matrix, keybind all accreted on the same Python entrypoint |
| Keybind bolt-on | **2026-07-28** (`6f50596`): Python kit CLI; already shells **Node** only to import `keybind-presets.js` |
| Pre-CLI install helpers | zsh (`forge-ctl`, save/migrate) also this fork (~2026-07-22) — install plane, not tiling control |

### Current shape (architecture)

```text
~/.local/bin/forge → scripts/forge/forge   (~7k lines Python)
  argparse → args.func(backend, args)
  modules: keybind_kit, layout_*, job_runner, nested_wayland, live_matrix, …
```

| Module | ~LOC | Coupling | Migrate first? |
| --- | --- | --- | --- |
| `keybind_kit.py` | ~0.9k | **Low** — gsettings/files; standalone `main`; install calls it | **Yes** |
| `cli_help` / `cli_ansi` | small | Presentation | Later with entrypoint |
| `nested_wayland.py` | ~1.6k | Medium | Later |
| `job_runner.py` | ~1.2k | **High** — re-execs **this** `forge` as worker | Design before mutators move |
| `layout_plan` / `layout_apply` / … | large | **High** — core mutator graph | **Last** |
| Most of `forge` body | large | DBus helpers + many cmds in one file | Per-command |

Dispatch is already **subcommand-shaped** (`set_defaults(func=…)`). That supports
**process-level replacement** of one command without rewriting all of `forge`.
There is **no** multi-language plugin host yet — only “import Python and call.”

### What cannot be one shared process

| | Prefs / extension | CLI |
| --- | --- | --- |
| Runtime | GJS in Shell / prefs | Host process |
| Live GSettings | `Gio.Settings` in-process | `gsettings` / dconf |
| Files | Gio | `fs` / open |

So **GUI should not primarily shell out to `forge` for every Save**. Right model:
**shared pure policy in `lib/shared/*.js`**, GJS adapters for prefs, Node adapters
for CLI. Same backend (policy), different I/O.

### Recommended direction (Grok4.5-med — proposal, not lock)

1. **Treat `forge` as a stable facade** (`forge <cmd> …` stays the UX).
2. **Target language for product-adjacent CLI:** **Node** importing `lib/shared/`.
3. **Gradual migration** via subcommand boundaries:
   - Python (or thin shell) **router** parses global flags / color / jobs meta.
   - Body of a migrated command is `exec`/`spawn` of a Node implementation.
4. **First slice:** `forge keybind` (save/load/list/status/dir).
   - Product truth already in `keybind-presets.js`.
   - No DBus; not on job_runner mutator list (today).
   - Install already invokes `keybind_kit.py` by path — same for Node.
5. **Last:** `layout` apply, `run`, live matrix, nest — largest, most Python-native.
6. **Job runner:** before moving mutators, lock “worker argv = implementing
   process” (not hard-coded “always re-exec this Python file”). Non-mutators
   can migrate without job_runner changes.
7. **Do not** require rewriting all of `forge` to Node before any value lands.

### Incremental feasibility (Grok4.5-med)

| Question | Answer |
| --- | --- |
| One feature at a time? | **Yes** for isolated subcommands (argv + stdout/stderr + exit code contract) |
| Free for everything? | **No** — layout/jobs need process contracts + large ports |
| Architecture today? | Subcommand modules help; not yet a polyglot plugin system |
| Best first feature | **`keybind`** |
| Hard blockers for step 1 | None structural; need Node on PATH (already a forge build dep) |

### Suggested migration order (Grok4.5-med)

1. **`keybind`** — pure JS policy + Node gsettings/fs; thin Python/exec shim.
2. Other offline / file tools if any.
3. Thin DBus clients (`ping`, `tree`, focus/swap/move) once a shared Node DBus
   helper exists.
4. **`layout` / `run` / jobs / nest** last.

### Open questions for the human design session

1. Is **Node the only** long-term CLI language, or is a permanent **Python router**
   + Node feature bodies OK indefinitely?
2. First implement slice: **keybind only** vs also ping/tree?
3. Job worker: re-exec `forge` forever as dispatcher, or allow direct Node worker
   argv?
4. Accept **Node as runtime dep** for end users of `forge keybind` (today Python
   + optional Node for kits already)?
5. Where does **install zsh** stay (always zsh) vs moving install family later?
6. Testing: Vitest for pure shared JS; how much CLI smoke stays pytest?

### Risks (Grok4.5-med)

- Half-migrated world: two languages until layout moves (acceptable if contracts
  are clear).
- Job runner assumes Python re-exec — footgun if mutators move without design.
- Drift returns if a feature is “ported” without deleting the old implementation.
- Big-bang rewrite of layout is high cost / high regression risk — reject for v1.

### References

- Entrypoint: `scripts/forge/forge`
- Keybind: `scripts/forge/keybind_kit.py`, `lib/shared/keybind-presets.js`,
  prefs `lib/prefs/keyboard.js`
- Jobs: `scripts/forge/job_runner.py`, D021
- Plan lineage: `agents/plans/forge-command.md` (FC0–FC5)
- Prior discussion in chat: CLI history, shared JS backend, gradual migration

---

## Discussion agenda (for the session)

1. Confirm history and “we own the whole control CLI.”
2. Lock target: shared pure JS + Node bodies + optional Python router.
3. Lock first implement slice (recommend keybind).
4. Lock job_runner rules for non-Python workers (or defer mutators).
5. Lock deps story (Node required for which subcommands).
6. Capture DECISIONS + follow-up task ids.

## Session note

**2026-08-14:** Task created for design session. Notes labeled **Grok4.5-med**
from CLI language / architecture discussion (no implementation). Operator asked
for gradual off-Python design, not a rewrite now.
