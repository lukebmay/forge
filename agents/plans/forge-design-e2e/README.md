# forge-design-e2e — working notes

**Spine:** [`../forge-design-e2e.md`](../forge-design-e2e.md)

Children overwrite files here. Orchestrator reads **these files**, not
chat transcripts.

| File | Owner slice | Contents |
| --- | --- | --- |
| `inventory.md` | T0 | Current smokes: valid / helper-mirror / missing |
| `stories.md` | T1 | Design Given/Actions/Expect; tree ids; **no** `lib/` names |
| `harness.md` | T2 | How to run trunk / branch / rc; oracles |
| `session.md` | each child | Last slice: done / red expected / next |

**Orchestrator spawn prompt (copy, do not expand):** model `grok-4.6`.
Read the spine + this directory. Execute only your slice. Write the
disk file. Do not rewrite stories to match code.
