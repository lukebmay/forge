# Redis

**Precedence:** deployment topology (standalone/sentinel/cluster), maxmemory policy, and project key conventions override this file.

## When

Cache, session store, rate limits, locks, queues/streams — not the system of record unless the product explicitly chose that.

## Keys & data

- Namespaced keys (`app:env:entity:id`); document TTLs
- Pick structures deliberately (string/hash/zset/stream); avoid giant values
- Always set TTL on cache entries unless intentionally permanent
- Multi-key ops: understand atomicity limits; use Lua/transactions when needed

## Safety

- Treat as **lossy** under eviction/failover unless configured durable and accepted
- AUTH/ACL + TLS in shared networks; don’t expose to the public internet
- Careful with `KEYS *` / heavy `SMEMBERS` on hot large sets in prod
- Distributed locks: use a known pattern (e.g. Redlock caveats) or a purpose-built system

## Performance

- Pipeline when chatting multiple commands
- Avoid huge fan-out blocking commands on the main thread
- Monitor hit rate, evictions, memory fragmentation

## Tools

- `redis-cli`; app clients already in the tree
