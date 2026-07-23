# MySQL / MariaDB

**Precedence:** project migrations, server config (`sql_mode`, charset), and DBA conventions override this file.

## Style & SQL

- Parameterized queries only
- Prefer InnoDB; explicit PK on every table
- `utf8mb4` + sensible collation for new schemas
- Avoid `SELECT *` in app paths; be explicit about columns
- Know strict `sql_mode` differences vs Postgres (silent truncation history, etc.)

## Schema

- Index for real filters/joins; watch composite left-prefix rules
- FKs when the team uses them consistently; don’t half-enforce integrity
- Online DDL / `pt-online-schema-change` / native INSTANT where ops require it
- JSON columns: fine for flexible attrs; don’t replace relational modeling wholesale

## Access

- Least-privilege users; separate migrate vs runtime when practical
- Connection pooling; timeouts on long queries
- Transactions short; beware gap locks and isolation level effects

## Safety

- Backups (logical + binlog/PITR as required); test restores
- Don’t log passwords/PII; encrypt sensitive columns per policy

## Tools

- `mysql` client, project migrator, EXPLAIN for hot paths
