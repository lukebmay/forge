# Rust

**Precedence:** `rustfmt.toml`, `clippy` lints, `Cargo.toml` / workspace config override this file.

## Style

- `rustfmt` defaults unless the repo pins otherwise
- Idiomatic ownership; avoid unnecessary `.clone()`
- Errors: `Result` + `thiserror`/`anyhow` as the crate already does
- Prefer `rustdoc` on public items
- Clippy: fix warnings in code you touch unless project allows them
- Modules: small, cohesive; `pub use` re-exports only at intentional API boundaries
- Unsafe: minimize; document invariants

## Tools

- Format: `cargo fmt`
- Lint: `cargo clippy`
- Build/test: `cargo test`
