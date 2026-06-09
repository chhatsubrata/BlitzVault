# ADR-0001: Database name `blitz_vault`

- **Status:** Accepted
- **Date:** 2026-06-09
- **Deciders:** Dev1, Dev2, Dev3
- **Amends:** [docs/contracts-week1-monday.md](../contracts-week1-monday.md) (Database table)

## Context

The Monday Week 1 contract froze the local/dev database name as `DB_DATABASE=drive_clone`.
This conflicts with the rest of the project's naming:

- Product and repo are **BlitzVault**.
- Compose resources already use `blitzvault-*` (`name: blitzvault-dev`, `container_name: blitzvault-pg`).
- `drive_clone` was the only off-brand identifier, and at least one local `.env.local`
  had already diverged to `blitz_vault`, causing compose-vs-host DB mismatches.

The Monday contract requires an ADR for changes after freeze. This is a config-only
rename (no schema or migration code change — TypeORM connects by database name).

## Decision

Standardize the database name to **`blitz_vault`** across all committed config and docs:

- `docker-compose.dev.yml` — `POSTGRES_DB` + healthcheck `pg_isready -d`
- `backend/.env.example`, root `.env.example`
- `README.md`, `docs/contracts-week1-monday.md`

## Consequences

- **No schema change.** Tables are unaffected; no new migration is needed.
- Each developer must point their `backend/.env.local` at `blitz_vault` and either:
  - rename an existing DB: `ALTER DATABASE drive_clone RENAME TO blitz_vault;`, or
  - recreate it: `createdb blitz_vault && pnpm migration:run`, or
  - use the updated compose (creates `blitz_vault` automatically).
- No production impact — no production database exists yet.
- Establishes `docs/adr/` as the location for future architecture decision records.
