# Plan-scan pipeline (token-safe)

**As of:** 2026-08-27
**Why this exists:** One agent reading every plan into one file at the end
dies mid-context and leaves nothing. This pipeline writes a verdict **per
item, immediately**, so a later session resumes from disk.

## Pickup (read this first if the meeting died)

1. Open [INVENTORY.md](./INVENTORY.md). Rows with an `items/<id>.md`
   file are **done**. Do not re-read those plans.
2. Launch **only** batches whose `batches/B0N.md` is missing the line
   `BATCH: complete`, and only for remaining `pending` ids.
3. Do **not** restart the killed monolith
   (`Scan all open plans` / old `07-plan-scan.md` writer).
4. Merge is **last**: [explore/07-plan-scan.md](../explore/07-plan-scan.md)
   is assembled from `items/*.md` by the orchestrator (or a merge agent).
   Do not merge until inventory pending count is 0 **or** the operator
   stops the meeting.

## Agent levels (who does what)

| Level | Role | Tools / skill | Writes | Must not |
| --- | --- | --- | --- | --- |
| **L0 orchestrator** | This meeting’s main agent. Owns inventory, batch spawn, merge, PRIORITY/HANDOFF | general-purpose parent | `INVENTORY.md`, `00-pipeline.md`, `explore/07-plan-scan.md`, PRIORITY, HANDOFF, design.md **after** merge | Re-read every plan body; implement product code |
| **L1 batch scanner** | One disjoint subset of inventory ids | `general-purpose`, `read-write`, isolation `none`. **Not** `explore` (cannot write). **Not** design-writer/reviewer | `items/<id>.md` **after each id**, then append that id to own `batches/B0N.md` | Edit PRIORITY, HANDOFF, INDEX, product JS, other batches’ files |
| **L1b archive auditor** | Batch B04 only: archived/completed + ideas | same as L1 | `items/archive-audit.md` + per-id only if a reopen is recommended | Un-archive files |
| **L2 merge** | After batches complete (or on operator stop) | orchestrator **or** one fresh general-purpose | `explore/07-plan-scan.md` + inventory status column | New plan verdicts from memory |
| **Not used** | `/design` writer-reviewer loop, `/review`, `explore` read-only, workflows | — | — | Wrong job (cataloguing, not a design doc) |

Domain explorers `explore/01–06-*.md` are a **sibling** fan-out (code).
Do not kill them for this scan. Do not mix their files with `scan/`.

## Verdict vocabulary (FIRM)

| Verdict | Meaning | Later action (orchestrator, not L1) |
| --- | --- | --- |
| **close** | Done or obsolete; no leftover work | Archive spine → `plans/archived/completed/` if still live |
| **abandon** | Will not do (design path or wontfix) | Archive → `plans/archived/abandoned/` |
| **pull-in-refactor** | Constraint, slice, or import on **forge-firm-abstractions** | Named on that plan; live plan closed or parked as “absorbed” |
| **post-refactor** | Still real work; **after** kernel/import | PRIORITY parked list |
| **keep-parallel** | Independent of TOM rewrite (rare). Must say why it does not wait | May stay on PRIORITY beside refactor **only** if it cannot wait |

Design path for judgments: **option 2** — TOM kernel first, then import
surfaces. Duck-tape on `tree.js`/`window.js` is not a reason to keep a
live plan; import the **strategy** instead.

## Per-item file (write before opening the next plan)

Path: `scan/items/<id>.md`  
`<id>` = inventory id (plan stem, `blocker-<stem>`, `idea-<stem>`).

```markdown
# <id>

**Verdict:** close | abandon | pull-in-refactor | post-refactor | keep-parallel
**Confidence:** high | medium | low
**As of:** 2026-08-27
**Path:** agents/plans/…

## Stated status
(one line from the file)

## Leftovers
- …

## Why this verdict
(option 2 lens; cite a lock if any)

## Destination
(slice name on firm-abstractions / PRIORITY parked / archive path)

## Absorb
(what the refactor must not lose — APIs, locks, tests. empty if none)
```

**Write this file as soon as the verdict is decided.** Then append one
row to `batches/B0N.md`. Then open the next id. Never hold all verdicts
until the end.

## Batch ledger

Path: `scan/batches/B0N.md`

Start (first action of the scanner):

```markdown
# Batch B0N
**Status:** in progress
**Assigned:** id1, id2, …
BATCH: start
```

After each item: append `| id | verdict | destination |`

End:

```markdown
BATCH: complete
**Status:** complete
**Wrote:** N item files
```

If context is high (~70%+): finish the **current** item file, append
`BATCH: paused`, stop. Remaining ids stay pending in inventory.

## Inventory rules

- L1 **does not** edit `INVENTORY.md` (merge races).
- L0 marks rows done when merging, or a later pickup agent can treat
  “item file exists” as done without editing inventory.
- Pickup = inventory ids minus `scan/items/*.md` basenames.

## Merge output

`explore/07-plan-scan.md` tables:

1. Verdict table (all ids)
2. Pull-in-refactor (what firm-abstractions absorbs)
3. Post-refactor queue (ordered)
4. Close / abandon (archive list)
5. Keep-parallel (if any)
6. PRIORITY rebuild sketch

Do **not** archive/move plan files until L0 accepts the merge (and the
operator has not objected). Scan = recommend; archive = later slice.
