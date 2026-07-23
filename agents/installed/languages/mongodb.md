# MongoDB

**Precedence:** project schema validation, replica set/sharding topology, and driver settings override this file.

## When

Document model fits access patterns (flexible docs, hierarchical data). Don’t use as an untyped dumping ground when relational integrity is the real need.

## Modeling

- Model for **query patterns**; embed vs reference deliberately
- Stable `_id`; avoid unbounded array growth on hot docs
- Schema validation or app-level schema (Zod/JSON Schema/etc.) when available
- Indexes for real filters/sorts; compound index order matters

## Writes & safety

- Prefer majority write concern for durable business data
- Transactions only when multi-doc atomicity is required (and supported topology)
- Never build queries by concatenating user strings — use driver APIs
- Auth + TLS in non-local envs; least-privilege DB users

## Ops

- Know working set vs RAM; watch slow query log
- Backups/PITR per deployment; test restore
- Migrations: versioned scripts or expand/contract on documents

## Tools

- `mongosh`; project ODM/driver (Mongoose, official drivers, etc.)
