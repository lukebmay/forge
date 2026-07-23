# PostgreSQL

**Precedence:** project migrations, `postgresql.conf`, connection pool settings, and DBA conventions override this file.

## Style & SQL

- Parameterized queries only (`$1` / bind params) — never interpolate user input
- Prefer explicit column lists over `SELECT *` in app code
- Migrations forward-only in prod discipline; review locks/index builds
- Types: use proper types (`timestamptz`, `numeric`, `uuid`, enums/domains) over stringly data
- Constraints in the DB (PK/FK/UNIQUE/CHECK) for invariants that must always hold

## Schema

- Normalize until it hurts; denormalize with a measured reason
- Index for **actual** predicates/joins/order-by; drop unused indexes
- Partial / expression indexes when they match real filters
- Avoid long transactions that hold row/table locks
- Big changes: expand → backfill → contract when zero-downtime matters

## Access

- Least-privilege roles; app role ≠ superuser/migration role when practical
- Pool connections (PgBouncer or app pool); set statement timeouts
- Use transactions for multi-step writes; keep them short
- Read replicas: only for traffic that tolerates lag; never for read-your-writes unless handled

## Safety

- Backups + tested restore; PITR when the project requires it
- Sensitive columns: encrypt/tokenize at rest per policy; minimize logging of PII
- `EXPLAIN (ANALYZE, BUFFERS)` before “optimizing” hot queries

## Tools

- `psql`, project migrator (Flyway/Liquibase/golang-migrate/Alembic/etc.)
- Prefer app’s query layer conventions (SQL, sqlc, ORM) already in tree
