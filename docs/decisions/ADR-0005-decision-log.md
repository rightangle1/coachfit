# ADR-0005 — Decision-log schema & storage

- **Status:** Accepted
- **Date:** 2026-07-21
- **Phase:** 0

## Context
CLAUDE.md §7 makes decision logging mandatory and non-optional: every engine call
must record its full input context, which implementation produced the output, the
output, and which structured inputs drove which adjustments. This cannot be
reconstructed later and enables future evals/tuning.

## Options considered
- **Dedicated `decision_log` table (JSON columns)** — one row per engine call, with
  JSON blobs for input/output/notes. Simple, queryable by call/date, sync-friendly.
- **Append-only file log** — easy to write, hard to query/sync, weaker guarantees.
- **Fold into session records** — loses adjust/debrief calls and couples concerns.

## Decision
**Dedicated `decision_log` table** in SQLite (via Drizzle), one row per engine
call, with structured metadata columns plus JSON payloads.

Columns (v0): `id`, `created_at`, `call` (`generateSession` | `adjustDuringSession`
| `interpretDebrief`), `engine_id`, `engine_version`, `input_json`, `output_json`,
`drivers_json` (which structured inputs → which adjustments), `session_id?`.

## Consequences
- Queryable by call type / date; ready for local eval tooling later.
- Writing is centralized in a `decision-log` service so no engine call bypasses it.
- Sync-friendly rows (see the later cloud-sync ADR).
- JSON payloads are schema-flexible as domain types evolve; if we later need to
  query inside payloads we can add generated columns.

## Web retention guardrail (v2)
On web, the same JSON rows live in quota-limited browser storage. The log is
therefore capped to its most recent 20 rows and roughly 512 KB total; each JSON
field is separately capped at 64 KB with a marked preview. On a quota error the
oldest diagnostic rows are discarded, and logging fails open so building a
workout is never blocked. Native SQLite retains the full diagnostic log.
