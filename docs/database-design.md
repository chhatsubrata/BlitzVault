# Database Design

## Engine

- Postgres 16. Extensions: `uuid-ossp`, `pg_trgm`, `pgcrypto`, `pgvector` (Phase 6), `pg_stat_statements`.
- Migrations only. `synchronize: false` outside local dev.
- All ids `uuid` v7 (time-ordered, index-friendly) — `gen_random_uuid()` until Postgres-native uuidv7.

## Naming

- Tables snake_case plural (`files`, `folder_versions`).
- Columns snake_case.
- FKs: `<table>_id`.
- Timestamps: `created_at`, `updated_at`, `deleted_at` (soft delete).
- Booleans: `is_*`.

## Core tables

### `users`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| clerk_user_id | text UNIQUE NOT NULL | |
| email | citext UNIQUE NOT NULL | |
| username | text UNIQUE | |
| avatar_url | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

(Existing `password` column to be dropped Phase 0 — Clerk owns auth.)

### `organizations` (Phase 3)
| col | type |
|---|---|
| id | uuid PK |
| name | text NOT NULL |
| slug | text UNIQUE NOT NULL |
| created_by | uuid → users(id) |
| created_at, updated_at | timestamptz |

### `workspaces` (Phase 3)
| col | type |
|---|---|
| id | uuid PK |
| organization_id | uuid → organizations(id) NULL (personal workspace if null) |
| name | text NOT NULL |
| owner_id | uuid → users(id) |
| storage_quota_bytes | bigint |
| storage_used_bytes | bigint default 0 |
| created_at, updated_at | timestamptz |

Index: `(organization_id)`, `(owner_id)`.

### `workspace_members` (Phase 3)
| col | type |
|---|---|
| workspace_id | uuid → workspaces |
| user_id | uuid → users |
| role | text (`owner`/`admin`/`member`/`viewer`) — mirrored to OpenFGA |
| invited_at, joined_at | timestamptz |
| PRIMARY KEY (workspace_id, user_id) | |

### `folders`
| col | type |
|---|---|
| id | uuid PK |
| workspace_id | uuid → workspaces |
| parent_id | uuid → folders NULL |
| name | text NOT NULL |
| owner_id | uuid → users |
| path | ltree (materialized path for fast subtree queries) |
| created_at, updated_at, deleted_at | timestamptz |

Indexes:
- `(workspace_id, parent_id, lower(name)) WHERE deleted_at IS NULL` (uniqueness + listing).
- `gist (path)` for ancestor/descendant queries.
- `(deleted_at)` partial for trash listing.

Constraint: unique `(workspace_id, parent_id, lower(name)) WHERE deleted_at IS NULL`.

### `files`
| col | type |
|---|---|
| id | uuid PK |
| workspace_id | uuid → workspaces |
| folder_id | uuid → folders |
| name | text NOT NULL |
| size_bytes | bigint NOT NULL |
| mime | text NOT NULL |
| storage_key | text NOT NULL UNIQUE |
| storage_provider | text (`s3` / `r2` / `cloudinary`) |
| checksum_sha256 | bytea |
| perceptual_hash | bytea NULL (Phase 4, dedupe) |
| owner_id | uuid → users |
| current_version_id | uuid → file_versions NULL |
| status | text (`pending`/`scanning`/`ready`/`infected`/`failed`) |
| created_at, updated_at, deleted_at | timestamptz |

Indexes:
- `(folder_id, deleted_at)`.
- `(workspace_id, status)`.
- `gin (name gin_trgm_ops)` for filename search.
- `(checksum_sha256)` for dedupe.

### `file_versions` (Phase 4)
| col | type |
|---|---|
| id | uuid PK |
| file_id | uuid → files |
| version_number | int |
| size_bytes | bigint |
| storage_key | text UNIQUE |
| checksum_sha256 | bytea |
| created_by | uuid → users |
| created_at | timestamptz |

Unique `(file_id, version_number)`.

### `share_links` (Phase 2)
| col | type |
|---|---|
| id | uuid PK |
| resource_type | text (`file`/`folder`) |
| resource_id | uuid |
| token | text UNIQUE (256-bit base64url) |
| permission | text (`viewer`/`editor`) |
| password_hash | text NULL |
| expires_at | timestamptz NULL |
| created_by | uuid → users |
| revoked_at | timestamptz NULL |
| created_at | timestamptz |

Index: `(token) WHERE revoked_at IS NULL`.

### `activity_events` (Phase 3)
| col | type |
|---|---|
| id | uuid PK |
| workspace_id | uuid |
| actor_id | uuid → users |
| verb | text (`file.created`/`file.renamed`/...) |
| object_type | text |
| object_id | uuid |
| metadata | jsonb |
| created_at | timestamptz |

Indexes: `(workspace_id, created_at DESC)`, `(object_type, object_id, created_at DESC)`.
Append-only. Partitioned by month for retention.

### `audit_log` (Phase 3)
Same shape + `prev_hash` + `hash` (sha256 chain) for tamper-evidence. Immutable.

### `notifications` (Phase 3)
| col | type |
|---|---|
| id | uuid PK |
| user_id | uuid |
| kind | text |
| payload | jsonb |
| read_at | timestamptz NULL |
| created_at | timestamptz |

Index: `(user_id, read_at, created_at DESC)`.

### `fga_outbox` (Phase 2)
| col | type |
|---|---|
| id | uuid PK |
| op | text (`write`/`delete`) |
| tuple | jsonb |
| status | text (`pending`/`done`/`failed`) |
| attempts | int |
| created_at, processed_at | timestamptz |

Worker drains; deletes on success after N days.

### `file_embeddings` (Phase 6, pgvector)
| col | type |
|---|---|
| file_id | uuid PK → files |
| chunk_index | int |
| content_text | text |
| embedding | vector(1536) |
| created_at | timestamptz |

Index: `ivfflat (embedding vector_cosine_ops) WITH (lists=100)` — tune after data volume known.

## Soft delete

- `deleted_at` column on files/folders.
- All listing queries filter `WHERE deleted_at IS NULL` by default.
- Trash view: `WHERE deleted_at IS NOT NULL AND deleted_at > now() - interval '30 days'`.
- Hard-delete worker purges > 30 days.

## Cascades

- `folders.parent_id` → `folders` ON DELETE RESTRICT (force explicit handling).
- `files.folder_id` → `folders` ON DELETE RESTRICT.
- `workspace_members.workspace_id` → `workspaces` ON DELETE CASCADE.

Move/delete logic in service layer, not via FK cascade for files/folders (need OpenFGA + storage cleanup).

## Search

- Phase 4: trigram on `files.name`, `folders.name` + Postgres FTS over extracted text (stored in `file_text_content` table).
- Phase 6: vector search via `file_embeddings`.

## Partitioning

- `activity_events` partitioned by month from launch — retention policy 12 months hot, archive to S3 after.
- `audit_log` same.

## Backups

- Daily full snapshot.
- PITR via WAL archiving, 7-day window.
- Quarterly restore drill.

## Migration discipline

- One migration per PR.
- `up` + `down` both implemented.
- Destructive migrations (drop column / table) require feature flag + two-release window (write-both → cut-over → drop).
- CI runs `migration:run` then `migration:revert` then `migration:run` to verify reversibility.
