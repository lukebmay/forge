# CT2 — Live Wayland one-shot cold layout

**Status:** in progress — code green on X11 matrix; Wayland cold re-smoke  
**Plan:** [forge-layout-cold-topology.md](../plans/forge-layout-cold-topology.md)  
**Depends:** CT1  
**Host:** `black` Wayland dual 4K  
**Retest (AT-W1):** prefer `forge nested` over logout for **extension JS reload**

---

## Goal

Single `forge layout dev` from cold/near-cold desk reaches profile topology without Mode B stderr path.

---

## Acceptance

- [ ] mon0 `tab(chrome,Grok)|ghostty`, mon1 `ghostty|tab(YT,Gmail,Voice)`  
- [ ] One CLI invocation; thrashState not required for success  
- [ ] Idempotent second run (moved 0 when correct)  
- [ ] Notes in plan session  
- [x] Root cause + fix for Chrome≠Grok active leaf (belt focus + preserve lastTabFocus)  
- [x] Live partial reopen: close Grok → `layout dev` → Grok reopened + lastTabFocus=Grok  

---

## How to run (2026-08-09 — nested method)

**Canonical workflow (FIRM):** [agents/testing.md](../testing.md) § Wayland live
testing workflow · [HANDOFF](../HANDOFF.md) § Wayland extensive smoke loop.

**Two layers — do not conflate them:**

| Layer | What | Tool |
| --- | --- | --- |
| **A. Extension JS reload** | New `lib/` / extension install must load | **`forge nested restart`** (no host logout) |
| **B. Dual-mon cold desk** | Real dual 4K host topology | Host Wayland session (`forge layout dev` on host) |

### A — Reload extension without logout

```bash
# After ./install or forge install on a Wayland login:
forge nested doctor          # can_nested?
forge nested start           # once per login (or restart if already up)
eval $(forge nested env --export)
forge ping                   # nested Forge
# after more code installs:
forge nested restart
```

Nest is **single virtual monitor** — not a substitute for dual-mon CT geometry.

### B — Dual-mon cold smoke (host)

```bash
# Host session must already be running the tip (logout once after install
# if host Shell never loaded this build; thereafter nested handles retests).
forge test live probe        # expect can_nested + can_retest on Wayland
gsettings set org.gnome.shell.extensions.forge logging-enabled true
gsettings set org.gnome.shell.extensions.forge log-level 4
# near-cold / cold desk then:
forge layout dev
forge tree                   # mon0 Grok open leaf; mon1 YouTube; structure OK
```

### Agent selective live (host desk)

```bash
forge test live plan --from-work cold
forge test live run --from-work open-leaf   # etc. — host dual-mon
```

### X11 note

`forge nested` **refuses on X11** (exit 2) with HUP guidance. On X11 use
`killall -HUP gnome-shell` for reload; nested is Wayland-host only.

---

## Session note

**2026-08-09 (RC campaign):** Wayland suite recorded in
[`agents/plans/forge-wayland-rc-test-suite.md`](../plans/forge-wayland-rc-test-suite.md)
+ results under `agents/test-results/wayland/`. L0 green. Host dual-mon: settled
partials (left-chrome after good desk, settled-rerun, close-focus, ghosttys-multi)
PASS; **one-shot ghosttys-only / multi-open still fails** (R010 — Mode B second
layout repairs). Unfocus FAIL until host loads tip unfocus float handoff. Nest
start flaky after first success. Host runtime tip lag: disk install newer than
Shell-loaded 279 until logout.

**2026-08-09:** AT-W1 harness shipped. CT2 procedure updated to nested reload + host dual-mon.

**2026-08-08 (agent CT2 work + late-focus):**

### Root causes (Chrome open instead of Grok)
1. Belt `ensure_layout` anchored chrome and stomped lastTabFocus (no re-focus).  
2. **Even with mid-flight focus:** chrome/PWA **late activate** after Grok raise steals open leaf on cold open. Operator: wait until launches stable.

### Fix
1. Mid-flight structure **without focus** when opens are in flight  
2. **Final focus pass** after residual+belt: settle pins → quiet 400ms → focus → reassert 250ms (D012)  
3. `_layoutOp` preserves valid lastTabFocus (D011); chrome-clear after residual (D010)  

### Live
- Settled focus Grok sticks  
- Partial reopen can still mis-mon Grok once (Mode B second run repaired); final focus sets open leaf when structure correct  
- Units green  

Created 2026-08-08. Wayland is a daily driver.
