# Lua

**Precedence:** `stylua.toml` / `.stylua.toml`, luacheck, lua_ls settings in the project override this file.

shellrc nvim defaults (inspiration): `configs/stylua.toml` — width 120, 2-space indent, Unix endings, AutoPreferDouble quotes, always call parens.

## When

Neovim config, small high-efficiency tools, embedded scripting.

## Style

- Indent 2 spaces; no tabs
- Prefer local variables; avoid polluting `_G` unless intentional (e.g. nvim `globalize`)
- Modules: return a table; require once; no side effects at require-time unless documented
- Names: `snake_case` for locals/functions; avoid Hungarian notation
- Types: annotations (`---@param`) when they help LSP; not required for tiny scripts
- Comments: short; see `agents/comments.md`

## Neovim (this repo)

- Runtime: LuaJIT via Neovim
- LSP globals may include `vim`, project helpers — follow local `lua_ls` config
- Prefer existing `util/` helpers over reimplementation

## Tools

- Format: `stylua`
- LSP: `lua_ls`
