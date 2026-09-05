# forge-tab-group-insert-order — CENTER end + strip index + join order

**Status:** Accepted
**Branch:** master
**Blocker:** (none)
**Updated:** 2026-09-04
**Design:** Mark 2 Group / Join / pointer (`mark2.md` FIRM same-effort).
D101 pointer → named Ops. No `Mark2Drop*`.
**Related:** [forge-design-e2e.md](./forge-design-e2e.md)
(`leaf.mark2.pointer-center-group`), R055 CENTER Group.

## Goal

Tab insert position is deterministic and matches desktop expectation:

1. DnD onto the **CENTER** overlay for TAB grouping places the item at
   the **end** of the TAB child list (not random, not a strip gap).
1. DnD onto an **existing tab strip at a tab location** inserts **at
   that index**.
1. Keybind Join/Group into a TAB bag:
   - **right→left** or **bottom→top** (`dir` left / up) → **append**
   - **left→right** or **top→bottom** (`dir` right / down) → **prepend**

## Acceptance

- [x] `mark2.md` states the three rules above (Group enter + pointer
      CENTER vs strip). Same effort as code + tests
      (`agents/documentation.md` FIRM)
- [x] Pointer CENTER Group: joiner is always last child of the dest
      TAB. Geometry `dirTowardNodes` must not pick prepend vs append
- [x] Pointer `strip` hit with `insertIndex`: joiner sits at that
      insert-before gap (existing strip reorder / foreign-strip Group)
- [x] Keyboard Join into TAB: `Join(left)` / `Join(up)` append;
      `Join(right)` / `Join(down)` prepend. Proto expect trees already
      match (`join-enter-tab-from-left` → `TAB(A,B,C)`;
      `join-tab-into-left-tab` → `TAB(A,B,C)`); lock child order in
      unit if missing
- [x] CENTER must **not** pass or honor `insertIndex`. Strip is the
      only insertIndex source
- [ ] Proto brake green. L0 mark2-pointer + mark2 Group/Join. Nest
      `--trunk trunk.mark2.join-enter` (fail →
      `leaf.mark2.pointer-center-group`)
      **TGI0–TGI2:** proto **159** + mark2-pointer **31** green.
      **TGI3 leftover:** nest `--trunk` returned `rc=-15` (SIGTERM),
      not an oracle. Nest **stopped**. Catalog not edited.
- [ ] Host: CENTER-drop onto a 2-tab group → new tab last; strip-drop
      between tabs → that index

## Context for the next agent (complete + succinct)

### Contract (write into `mark2.md`)

**Enter a TAB/STACK bag — child index:**

| Gesture | Child list |
| --- | --- |
| Keyboard Join/Group `dir=left` or `up` | **append** (end) |
| Keyboard Join/Group `dir=right` or `down` | **prepend** (index 0) |
| Pointer **CENTER** (five-zone Group) | **append** (end). Ignore grab→onto dir for index |
| Pointer **strip** `insertIndex` | insert-before that gap |

Worked:

```text
Given:   Mon0(H(A, TAB(B,C)))
Actions: Pointer release grab=A hit=window B center
Expect:  Mon0(TAB(B,C,A))
         not TAB(A,B,C) unless A was already first
```

```text
Given:   Mon0(H(A, TAB(B,C)))
Actions: Select(A); Join(right)
Expect:  Mon0(TAB(A,B,C))
```

```text
Given:   Mon0(H(TAB(A,B), C))
Actions: Select(C); Join(left)
Expect:  Mon0(TAB(A,B,C))
```

```text
Given:   Mon0(TAB(A,B,C))
Actions: Pointer strip grab=D insertIndex=1
Expect:  Mon0(TAB(A,D,B,C))
```

### Proven (code today)

`enterConNearEdge` / `enterBagDirect` already:

```text
if (dir === "left" || dir === "up") appendChild
else insertBefore first
```

That **is** the keyboard rule (arrive from right/bottom → append).
Proto `join-enter-tab-from-left` Expect `TAB(A,B,C)` (prepend on
Join-right). Do **not** invert that.

`applyBagInsertIndex` only runs when `ptr.insertIndex` is finite.
Pointer CENTER (`mark2-pointer.js` zone `center`) does **not** pass
`insertIndex` — it passes `dir = dirTowardNodes(grab, onto) || "right"`.
That dir is **geometry**, so CENTER prepend vs append follows which
side the grab came from → feels random.

Strip hits **do** pass `insertIndex` (`resolvePointerWould` strip
branch). Keep that.

### Failed / trap

Do not “fix” CENTER by stuffing a guessed `insertIndex` from pointer
coords. CENTER is not a strip gap.

Do not change keyboard near-edge to always-append.

Do not use Join for CENTER (D101 / R055 — Group).

### Paths / symbols

- Glossary: `prototypes/container-motion/src/opsets/mark2.md`
  Group + Pointer zone table
- `lib/opsets/mark2.js` — `enterConNearEdge`, `enterBagDirect`,
  `applyBagInsertIndex`, `mark2Group`, `mark2Join`
- `lib/opsets/mark2-pointer.js` — CENTER `resolvePointerWould` (pass
  a place/end flag **or** omit dir-for-index; strip keeps
  `insertIndex`)
- Tests: `tests/unit/opsets/mark2-pointer.test.js`; proto
  `prototypes/container-motion/test/cases-mark2.mjs`

### Implementation sketch

1. Tests first against the contract (design is spec).
1. Pointer CENTER Group args: no `insertIndex`; explicit
   `place: "end"` (or equivalent) so enter helpers append.
1. Enter helpers: finite `insertIndex` → strip gap; else `place:end`
   / CENTER → append; else dir left/up append, right/down prepend.
1. Same-effort `mark2.md` + proto cases for CENTER-end **both**
   grab-from-left and grab-from-right (joiner still last).

## Implementation slices

| Slice | What | Exit |
| --- | --- | --- |
| **TGI0** | This plan + `mark2.md` pointer/Group child-index table | **done** |
| **TGI1** | Failing tests: CENTER always last; strip index; keyboard prepend/append | **done** |
| **TGI2** | `mark2-pointer` CENTER place=end; enter helpers honor place vs dir vs insertIndex | **done** (31 + 159) |
| **TGI3** | Nest `--trunk trunk.mark2.join-enter`; CENTER leaf if trunk fail | **leftover** `rc=-15` |

**Order:** TGI0 → TGI1 → TGI2 → TGI3.

## Do not

- Branch: **master**. No commit/push unless operator asks
- Invent `Mark2Drop*`. No Forest←GObject dual-write. No
  `live-handle.js` growth
- Do not skip ROOT `move*`. Do not relocate dual-write into
  tree-api-nav
- Do not patch-only `computeSizes`. Do not ship whole-forest
  `MON_MISMATCH` RESYNC
- Do not reintroduce raw `move_to_monitor` at map. Do not port belt /
  Mode B / title→`renderTree` / entered-monitor maze
- Nest: `./scripts/forge/forge-test nested --trunk <id>` one CLI;
  hunt `forge-test nested log`; always stop nest. Agent does **not**
  host `layout`. Test layouts only `_forge-test-*`
- Install from `~/dev/me/forge` with `./install --dev` (TRACE)
- Proto brake: `cd prototypes/container-motion && npm test`
- Do not invert keyboard near-edge (left/up append is already correct)
- Do not honor `insertIndex` on CENTER

## Enable / test

```text
cd prototypes/container-motion && npm test
npm test -- tests/unit/opsets/mark2-pointer.test.js
cd ~/dev/me/forge && ./install --dev
./scripts/forge/forge-test nested --trunk trunk.mark2.join-enter
./scripts/forge/forge-test nested stop
```

## Session note

2026-09-04 — TGI0–TGI2 landed. **TGI3 leftover.** No commit.

**Product:** Pointer CENTER Group `place: "end"` (no `insertIndex`);
enter helpers: finite `insertIndex` → strip gap; else `place:end` →
append; else `dir` left/up append, right/down prepend. Keyboard
**not** inverted.

**Paths:**
- `prototypes/container-motion/src/opsets/mark2.md` — child-index table
- `lib/opsets/mark2-pointer.js` — CENTER `place: "end"`
- `lib/opsets/mark2.js` — `bagChildPlace` / `enterBagChild` /
  `applyBagChildOrder`; `ptr` through foreign/non-sibling enter
- `lib/extension/forest-run.js` + `drag-drop.js` — pass `place` (host)
- `tests/unit/opsets/mark2-pointer.test.js` — CENTER both sides last;
  Join/Group prepend/append; strip gap
- proto `cases-mark2.mjs` — `join-enter-tab-from-right`;
  `pointer-center-group-from-{left,right}-end`;
  `pointer-strip-group-insert-index`
- D108 in `agents/design/CHANGELOG.md`; `agents/design.md` Mark 2
  pointer sentence

**Proven:**
- `npm test -- tests/unit/opsets/mark2-pointer.test.js` — **31 PASS**
- `cd prototypes/container-motion && npm test` — **159 PASS**
  (was 155; +4 cases). Existing `join-enter-tab-from-left` /
  `join-tab-into-left-tab` still `TAB(A,B,C)` / `H(TAB(A,B,C),D)`
- `./install --dev` — overlay; Wayland tip deferred

**TGI3:** `--trunk trunk.mark2.join-enter` **PASS** (2026-09-04).
Proof-loop `H(TAB,V)` was Given child-order (CENTER joiner last →
in-tab wrap-pair), not Join enter-con. Harness Joins right-TAB
left-edge; proto `join-tab-peer-left-wrap-pair` locks wrap-pair.
Nest **stopped**.

**Host leftover:** CENTER-drop onto 2-tab → joiner last; strip-drop
at gap. Logout for `--dev` tip.
