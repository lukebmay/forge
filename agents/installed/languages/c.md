# C

**Precedence:** `.clang-format`, `.clang-tidy`, compile_flags/compile_commands, and project Makefiles override this file.

## Style

- C11 or the standard the project already uses
- Indent: follow project (often 2 or 4 spaces); never mix tabs/spaces unless K&R/gofmt-like tooling requires tabs
- Pointers: `type *name` or project-local convention — stay consistent in-file
- Always check alloc/syscall failure paths you introduce
- Prefer size-aware APIs (`snprintf`, `memcpy` with known lengths)
- Headers: include guards or `#pragma once` as the tree does; minimal includes
- No VLAs if the project forbids them; prefer heap/fixed buffers with bounds
- Comments: why, not what (`agents/comments.md`)

## Tools

- Format: `clang-format`
- Lint: `clang-tidy` / compiler `-Wall -Wextra` as configured
