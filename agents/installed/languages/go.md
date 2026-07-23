# Go

**Precedence:** `gofmt`/`gofumpt`, `golangci-lint`, `go.mod`, and gopls settings override this file.

## Style

- Always `gofmt` (tabs as gofmt emits)
- Standard project layout: `cmd/`, `internal/`, `pkg/` only if the repo already uses them
- Errors: return `error`; wrap with `%w`; handle or deliberately ignore with `_ =` + reason
- Context: first param on blocking/IO calls (`ctx context.Context`)
- No stutter: `package foo` → type `Client` not `FooClient` unless needed
- Exported ids need docs comments starting with the name
- Prefer stdlib; small interfaces at consumer side
- Concurrency: cancel via context; don’t leak goroutines

## Tools

- Format: `gofmt` / `goimports`
- Lint: `golangci-lint` or project Makefile targets
- LSP: gopls
