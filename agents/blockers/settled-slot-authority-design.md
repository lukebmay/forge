# B-settled-slot-authority — Design meeting: settled slot authority

**Status:** open
**Owner:** human
**Kind:** design
**Plan:** [forge-settled-slot-authority](../plans/forge-settled-slot-authority.md)
**Unblocks:** opportunistic Meta re-heal cleanup (post-meeting slices)
**Priority:** P0

## What the human must do

- [ ] Brief design meeting (agenda in the plan § Meeting agenda)
- [ ] Lock SoT for “window is in its slot” + `force: true` allowlist
- [ ] Same effort: CHANGELOG row + `design.md` update (agent can write after you decide)

## Done when

- Plan status → Accepted (or rejected with written reason)
- New D0xx (or explicit amend of D069) in `agents/design/CHANGELOG.md`
- Follow-up implementation slices listed on the plan (or wontfix)

## Notes

Thesis: once settled in a slot, never `move_resize` again unless Forge
**knows** drift (or the slot changed). No “maybe / heal everything” world.
Audit table is on the plan.
