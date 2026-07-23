# Zig

**Precedence:** `zig fmt`, project `build.zig` / `build.zig.zon`, and any documented style notes override this file.

shellrc formats Zig via `zig fmt` (conform `zigfmt`).

## Style

- Always run `zig fmt` on touched files
- Prefer explicit allocators; pass `Allocator` rather than hidden globals
- Handle `error` unions; avoid `catch unreachable` except true invariants
- `const` by default; `var` only when mutation is needed
- Prefer stdlib; keep `build.zig` minimal and readable
- Safety: respect Debug vs Release modes; don’t disable checks casually
- Comments: short; document unsafe assumptions near `@` builtins

## Tools

- Format: `zig fmt`
- Build/test: `zig build`, `zig test`
