# Exploration notes — scheme

**Audience:** agents writing or reading notes under this directory.
**Goal:** one pass of expensive reading → durable map. Later sessions
open the note instead of re-walking 4k–7k line files.

## File names

`explore/NN-slug.md` as listed in [INDEX.md](../INDEX.md). Do not invent
extra top-level notes. If a domain overflows, add `##` sections in the
assigned file.

## Hard rules

1. **Cite, do not dump.** `path` + symbol + line (or line range). Quote
   ≤8 lines only when the quote *is* the evidence.
2. **One word, one meaning.** Tiling vocabulary = Mark 2
   [`mark2.md`](../../../../prototypes/container-motion/src/opsets/mark2.md).
   If a Forge name disagrees, say “Forge calls X, Mark 2 calls Y.”
3. **Proven vs guessed.** Tag each non-obvious claim `proven` (you read
   the code) or `guess` (inferred). Guesses go in **Open questions**.
4. **No product edits.** Notes only. No `tree.js` patches, no commits.
5. **Overwrite.** Refine the same file; do not append session diaries.
6. **Soft wrap** ~80–100 cols. Headings `##` / `###`. Lists `-` / `1.`

## Required sections (every domain note)

Use these headings, in this order. Skip a section only if truly N/A
(write `N/A — …`).

### Scope

What you opened. Paths. What you did **not** open.

### Current objects (as the code is)

Table: name → file:symbol → what it actually does today (not what the
comment wishes).

### Intended layer vs actual layer

Map each object onto the **target layers** below. Say where it is
contaminated (policy in kernel, paint in model, Meta in Node, …).

### Strengths (keep)

Concrete. “H1 dual monitor-resolve is two policies on purpose” beats
“recovery is good.”

### Weaknesses / duck-tape

Each row: **failure class** → **symptom in code** → **why the
abstraction is wrong** (not “file too long”). Size is a symptom.

### Twins / bypasses

Named API vs hand-rolled path. Cite both. Use
[`docs/dev/contracts.md`](../../../../docs/dev/contracts.md) as the
claimed catalog.

### Import recommendation

`keep` | `port` | `reshape` | `discard` | `park` + one sentence why.
This feeds `import-map.md`.

### Entry points for later agents

10–20 lines max: “if you need X, open Y, call Z.”

### Open questions

Only things that block layer assignment. Number them.

### Do-not-rescan traps

Things that cost a lot of tokens to rediscover (e.g. `childNodes`
setter still exists; `Tree` *is* ROOT; two monitor-resolve functions).

## Target layers (D079 + D080)

Use these names even if the current code does not have them. That is
the point of the meeting.

| Layer | Owns | Must not own |
| --- | --- | --- |
| **TOM** | In-memory tiling tree: kinds, child list, layout, percent / `userSized`, lastTabFocus, spine ROOT→WS→MONITOR | Mutter, GObject, St, DOM, keybinds, OpSet policy, paint, settle laws |
| **Atomics + composed** | Child-list + breakout/wrap/promoteChildren (**no settle**) | Super+h; `move_resize`; unary-after-breakout |
| **RuleSet** | Named settle OpSets bind/extend/replace | Launch/Move policy; keybinds |
| **OpSet** | Named control surface (Mark 2 first): Move / Join / Launch / Remove. Glossary in the OpSet doc. Calls atomics + RuleSet | Child-list splicing; presenter; private settle |
| **Keybind core** | Action id → Super-bearing Mark 2 chords | Proto `a`/`q`; Forge lock/zoom |
| **Presenter** | Slots from TOM + workarea → paint (Meta frames, proto DOM, tab chrome, borders) | Mutating topology (except writing computed `renderRect` as a *view* if needed) |
| **Host** | Mutter/GNOME: Meta.Window ↔ WINDOW id, signals, monitors, workspaces, SourceBag/SignalBag | Tiling policy; child-list |
| **Epochs** | ApplyEpoch, session restore, H1 monitor-recovery — writers of desired or recovered TOM | Idle keybind path; a third monitor-resolve |
| **Surfaces** | DnD gesture, CLI, DBus, prefs, host key overlays — intent → OpSet | A private tree API; a second Mark 2 chord table |
| **Product data** | Profiles, settings, windows.json, heuristics timings | Engine branches on role names |

**TOM, RuleSet, OpSet, and Mark 2 action ids are shared.** Presenters
differ. Proto key overlay (`a`/`q`) is proto-only.

## Evidence format

```text
proven  lib/extension/tree.js:Node constructor (~L115) stores Meta.Window
        or St.Bin in `_data` and calls `_createDecoration` for CON
guess   command.js move path likely duplicates tree.move — confirm in 06
```

Worked tree when describing a mutation:

```text
Given:   Mon1(H(V(A,B),C))
Actions: Select(A); Move(left)
Expect:  Mon1(H(A,B,C))
```
