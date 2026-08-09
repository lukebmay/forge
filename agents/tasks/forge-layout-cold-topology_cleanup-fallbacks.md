# CT-cleanup — Strip patchwork; architecture holds the weight

**Status:** ready — **P0 next** (operator 2026-08-08)  
**Plan:** [forge-layout-cold-topology.md](../plans/forge-layout-cold-topology.md)  
**Branch:** `plan/forge-layout-cold-topology`  
**Test host:** **X11** preferred (agent `./install` + Shell HUP). Wayland logout for extension-only when needed.  
**Doctrine:** [HANDOFF.md](../HANDOFF.md) — patches bad; spine good; **no personal-layout special cases**

---

## Goal

Stop duct-taping cold/open/layout. **Delete or demote** fallbacks that only exist because construction order or open policy was wrong. After this task, the **CT0 phase model** is the only happy path — not belt + retry + re-focus + Mode B.

This is not “docs only.” Audit real call sites, remove weight, keep unit suite green with **abstract** fixtures (roles a/b/c, dual mon), not one host desk.

---

## Why this is P0

Stacked mitigations (belt ensure, preserve lastTabFocus, final focus quiet/reassert, postOpenRetry, Mode B as cold success, mon-root patches) make the next failure harder to see and encourage more patches. Operator: **architecture holds the weight; clean off the patchwork when the real fix exists.**

---

## Spine (do not invent another pass)

```text
skeleton → open → bind → order/size → focus once (post-settle) → residual
```

Thrash mid-batch forbidden. Mode B = true chaos / explicit recover only.

---

## Candidate removals / demotions (audit each)

| Area | Likely demote / delete | Keep if |
| --- | --- | --- |
| CLI belt structure re-ensure after residual | Happy-path topology rewrite after bind | Only wrong-mon rehome for just-opened, not full ensure invent |
| Cold `postOpenRetry` / plan4 as success | Opt-in recover only (already partly true) | Explicit env / `--recover` |
| Mid-flight focus before opens settle | Already stripped when opens; verify no residual paths reintroduce | — |
| Extra final-focus reassert sleeps | One post-settle focus; drop double reassert if race owned | Minimal quiet if Meta requires |
| Preserve lastTabFocus on every re-ensure | If re-ensure gone on happy path, preserve is less critical | Still OK as generic safety |
| Mode B park on cold / just_opened | Report-only already; ensure no success path | Mid-session chaos |
| Ensure-after-open-only topology rebuild | Skeleton owns empty desk | Mid-session structure repair without skeleton |
| Timing “try again” sleeps | Papered construction races | Documented Meta settle only |
| Docs/help Mode B as normal cold | One-shot language only | Recover docs separate |
| Personal-layout framing in comments/tests | Abstract roles; desk only in optional live notes | — |

**Keep always:** AC1–AC6 settle; Mode A collect; Mode B true thrash; `--safe`; idempotent settled re-run; fail-open PH; generic dock/LFT policy (not app-name branches).

---

## Acceptance

- [ ] Written audit table: each candidate → **keep / demote / delete** + path/symbol  
- [ ] Dead cold success paths removed or gated behind explicit recover  
- [ ] No new happy-path “plan twice / belt invent / multi-focus” without removing an old one  
- [ ] Unit suite green; tests describe **policy**, not one profile’s apps  
- [ ] `docs/user/layout.md` cold section = one-shot spine only  
- [ ] DECISIONS / archive: what was removed and why  
- [ ] HANDOFF + PRIORITY updated after ship  
- [ ] Prefer X11 live smoke for any behavior change that needs Shell  

---

## Session note

**2026-08-08:** Operator elevated cleanup to **P0** before more feature patches. Strong anti-patch doctrine in HANDOFF. Test on **X11**. Do not custom-code personal layouts.

Created 2026-08-08; unparked as P0 same day.
