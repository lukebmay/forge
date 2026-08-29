# Container motion prototype — Tiling Object Model (TOM)

Interactive sandbox for **tiling control surfaces**. The point is not to
paint GNOME Shell. The point is to invent and A/B several ways a human
steers a tiling tree — without Mutter, Meta, or Forge's presenter.

Related plan:
[`agents/plans/forge-container-motion-design.md`](../../agents/plans/forge-container-motion-design.md).

## Mission

Forge will eventually keep a **Tiling Object Model (TOM)** in memory — a
faithful tree of monitors, containers, and windows, analogous to the DOM.

1. **TOM** is a pure in-memory tree. Fast. No Shell. No HTML. No keybinds.
2. **TreeOps** mutate that tree: DOM-like **atomics** (`appendChild`,
   `insertBefore`, `removeChild`, `replaceChildren`, …) plus a small set of
   **composed TreeOps** every control surface needs (`swapSiblings`,
   `breakout`, `wrapNodes`, `collapseUnary`, …).
3. **OpSets** are the control surfaces. Each OpSet is a named pack of
   **SurfaceOps** (Mark 2: `Move`, `Join`, `Promote`, …) built only from
   TreeOps + **tree rules** (settle / invariants). Keybinds map onto an
   OpSet. We will ship one or more OpSets; this prototype exists to decide
   which.
4. After the TOM is mutated, **any presenter** may consume it: this HTML
   desk, a tree graph, later Forge proper (Mutter/Meta). Presenters paint.
   They do not own tiling policy.

Green abstract tests + a wrong-looking desk means **paint**, not the TOM.

### Why this split

Previous proto work mixed motion policy into "atomics" (`moveDir` wrapped,
crossed monitors, knew Mark 2 order). That is how you get a patch loop:
each edge-case fix reorders branches in a god-function. The TOM must stay
clean enough to port into Forge as `lib/shared/`-style gi-free ESM.

**"Molecule" is retired.** It used to mean Mark 2 SurfaceOps. That overloaded
the chemistry metaphor and kept leaking policy into the kernel. Universal
compositions of atomics are **composed TreeOps**. OpSet-specific work is
**SurfaceOps**. Do not revive "molecular" for either.

## Layers (do not collapse)

This proto is **ForgeAdapterWebView** + **KeybindAdapterWebView** on the
shared kernel (`lib/tom/`, `lib/rulesets/`, `lib/opsets/`,
`lib/keybinds/`). GNOME Shell is **ForgeAdapterGnome**, not a second
TOM.

```text
ForgeAdapterWebView   HTML desk / tree graph
ForgeAdapterGnome     Mutter / Meta / St   (not this proto)
     ↑
Keybind adapters      WebView = stripSuper ∪ overlay
                      Gnome = Super-bearing accels
     ↑
OpSet (kernel)        Mark 2 SurfaceOps + bound RuleSet
     ↑
TreeOps (kernel)      atomics + composed (no settle)
     ↑
TOM kernel            Forest + Node (MONITOR | CON | WINDOW)
World                 workarea bag — host adapter fills
```

| Layer | Owns | Must not |
| --- | --- | --- |
| **TOM atomics** | Child list + attributes | Wrap-vs-cross-mon, peel models, same-type coerce |
| **Composed TreeOps** | Builds of atomics every OpSet needs | Mark 2 max-1-mon-child, invent-join layout |
| **OpSet** | Directional Move/Join, settle, invariants | Splice `childIds` by hand; import DOM/cytoscape |
| **Presenter** | Paint, keys, launch *button* | Encode tiling policy "because the desk looked wrong" |

Forge D023 names (`appendChild` / `insertBefore` / `removeChild` /
`replaceChildren`) are the atomics. Kernel lives at `lib/tom/` (this
tree's `src/tom/` re-exports). D085: kernel is host-portable; this
desk is one adapter.

## Run

```sh
cd prototypes/container-motion
npm install
npm start
```

Open [http://localhost:5177/](http://localhost:5177/). Port **5177**.
Hard-refresh after policy edits. Dump tree also prints the proto plog ring.

State persists in `localStorage` (`forge.container-motion.v1`). **Reset all**
clears it.

## Tests (FIRM)

```sh
npm test                 # all layers
npm test -- wrap-h       # filter by case id
npm run test:atomics
npm run test:composed
npm run test:mark2
npm run test:workflows
```

| Layer | What | Where |
| --- | --- | --- |
| **atomics** | Child-list / attribute contracts | `test/cases-atomics.mjs` |
| **composed** | wrap / breakout / unary / prune | `test/cases-composed.mjs` |
| **opset** | Each Mark 2 SurfaceOp, including edges | `test/cases-mark2.mjs` |
| **workflow** | Given TOM → Expect TOM every OpSet must solve | `test/cases-workflows.mjs` |

**New desk bug:** failing case first (`layer: opset` if it is Mark 2; `workflow`
if it is a user job), then fix. Do not reorder branches without a case that
would have caught the last regression.

`workflow` cases are the capability suite: swap a pair, rotate at edge, flip
axis, tabify, peel from a tab, flatten a nested grid, cross-mon, close a
middle window, … An OpSet may use any SurfaceOps it likes; it must register
a `byOpSet.<id>` sequence. Adding a second OpSet means filling those
sequences (or skipping with a written reason).

## TOM shorthand (chat + tests)

Not a product DSL. It is how we talk about desks. One parser, no extra doc.

```text
Given:   Mon1(H(V(A,B),V(C,D))) Mon2(H(E, TAB(F,G)))
Actions: Select(C); Join(left)
Expect:  Mon1(H(A,B,C,D)) Mon2(H(E,TAB(F,G)))
```

- Layout aliases: `H` `V` `TAB` `STACK` (long names also work)
- Bare `H(A,B)` means `Mon1(H(A,B))`
- `Mon1(A,B)` is two children under the monitor (atomics allow this; Mark 2
  settle does not)
- Actions: `Select(A)`, `SelectParent()`, `Move(left)`, `Join(right)`,
  `Launch()`, `Launch(Mon2)`, `ToggleSplit()`, `Promote()`, `Remove()`,
  `SetLayout(TAB)`, `Ungroup()`, …

Kernel tests may use a `run(t)` function when a single action name would be
forced.

## Mark 2 OpSet (prototype experiment)

**Rules:** [`src/opsets/mark2.md`](./src/opsets/mark2.md) — source of truth.
Change that file and the OpSet + tests in the same effort.

Toggle in Settings. Newest meeting wins; Shell stays Mark 0 Move + Mark 1 C4
until an explicit adopt.

TOM spine: `ROOT → WORKSPACE → MONITOR (0 or 1 child) → CON | WINDOW`.
Shorthand prints monitors only. Breakout and Promote are the same tree
operation (a node becomes a sibling of its parent). Unary collapse deletes
a CON that has exactly one child; that child takes the CON’s place.

**Move:** in-axis swap → edge wrap → cross-mon (only if wrap cannot apply) →
breakout.

**Join:** wrap-pair any-dir only when breakout is impossible (mon sole-child).
Else edge/cross → breakout → unary cleanup → join. Cross-axis sibling CON →
**promote** kids into parent; in-axis CON → enter. Same-type H/V → **TABBED**.

**Settle** after SurfaceOps: prune empty CONs, collapse unary, coerce
same-type. TreeOp `Delete()` does **not** settle; OpSet `Remove()` does.

**Promote** of the monitor's sole child CON is refused (max-1 invariant).

**Launch:** selected means a WINDOW or CON on that monitor (`p` parent
counts). None on that monitor → append at the end of that tree. Next to
a slot: TAB/STACK → next sibling; HSPLIT + wider-than-tall → sibling,
else wrap VSPLIT; VSPLIT + taller-than-wide → sibling, else wrap
HSPLIT. MONITOR sole child wraps in place (max-1). Same-type wrap of an
H/V CON: MONITOR → opposite split; nested → last child of that CON.
If an H/V insert or wrap would break the 10% floor → wrap TAB instead.
Worked: `H(TAB(A,B),C)` select TAB → `H(V(TAB(A,B),D),C)`.

Prefs: Mark 1 `edgeMove=noop` migrates once to `wrap` under Mark 2.

## Sizing (TreeOps, not Mark 2)

HSPLIT/VSPLIT children have an **in-axis** share (`percent`). Default is
equal split among siblings. A **float** child is not `userSized`: leftover
space after sized siblings is split equally among floaters.

When a child **leaves** an H/V (close, move, breakout), it becomes a
floater; sized shares do not follow it into the new parent. If that
leave leaves **no floaters**, remaining sized shares **rescale** to fill
100% at the same ratios (`H(A 25%*, B 50%*, C float)` close C →
`H(A 33%*, B 67%*)`). Unary collapse still copies the CON’s slot share
onto the surviving child.

Cross-axis size is the **parent container’s** share in *its* split. TAB/STACK
peers share one pane; **all** size ops from a tab/stack leaf (nudge, preset,
float this, equalize) target the TAB/STACK node, not the leaf. Equalize
on a selected H/V CON still equalizes that CON’s children.

For float chords, **parent** means the ancestor whose share controls this
node’s **cross-axis** size (e.g. the V in `H(V(A,B),C)` when A is selected).
Not the immediate CON if that CON only splits the other axis.

Hard floor **10%**, ceiling **100%**. If a floater would drop below 10%, the
op is a no-op. Step is 5%. Proto keys omit Super (`Alt+…` not `Super+Alt+…`).

| Keys | Action |
| --- | --- |
| `Alt+h` / `Alt+l` | Decrease / increase **x** share |
| `Alt+j` / `Alt+k` | Decrease / increase **y** share |
| `Alt+y` | This node floats |
| `Alt+u` | This node and siblings float |
| `Alt+i` | Only siblings float |
| `Alt+o` | This node, siblings, and parent float |
| `Alt+n` | Parent floats |
| `Alt+m` | Parent and parent’s siblings float |
| `Alt+,` | Only parent’s siblings float |
| `Alt+.` | This node + siblings, and parent + parent’s siblings |
| `Alt+/` | Float every node in the tree (equalize each H/V) |
| `Alt+7` `8` `9` `0` | In-axis 75% / 66.7% / 50% / 33.3% |

## Keys (Vim − Super)

| Keys | Action |
| --- | --- |
| `hjkl` | Select (focus) |
| `Shift+hjkl` | Mark 2 `Move` |
| `Ctrl+hjkl` | Mark 2 `Join` |
| `p` / `Shift+p` | Parent / child |
| `[` / `]` | Cycle layout |
| `m` / `n` | Toggle split / tab-stack |
| `{` / `}` | PromoteChildren / recursive |
| `Alt+hjkl` | Resize x/y share |
| `Alt+yuio` | Float this / this+sibs / sibs / this+sibs+parent |
| `Alt+nm,.` | Float parent / parent group / parent sibs / both groups |
| `Alt+/` | Float all shares in the tree |
| `Alt+7890` | In-axis presets |

This **is** the product vim / Mark 2 kit (add Super on Forge). Proto overlay
only: `a` launch, `q`/`Backspace` remove, `Delete` destroy, `t`/`Escape`
tags, `f` flatten. Not product: leftover `yuio` extra-focus, TreeOp swap.

Proto plog is **local only** (`src/plog.mjs`). Tests write
`logs/motion-test.log`. Not forge dual-tape.

## Chrome

| Control | Where |
| --- | --- |
| **☰** | Settings |
| **TreeOps** | Left drawer (open by default) |
| **Keybinds** | Right overlay |
| **Dump tree** | `console.log` summary + forest + plog ring |

## Known seams (do not "fix" by stuffing policy into the TOM)

- Monitor neighbor / `transferLeafToMonitor` still live in `monitors.mjs`
  (world + a bit of max-1 wrap). Next cleanup: transfer should be TreeOps
  + Mark 2 wrap rule, not a world-module splice.
- Session prefs (`decisions`, `mergeTags`, `peelModel`) live in
  `lib/session/` (WeakMap), not on Forest (D082).
- Peel Model A vs B / merge-tags are presenter or Mark 1 leftovers, not TOM
  atomics. Mark 2 owns Launch.
