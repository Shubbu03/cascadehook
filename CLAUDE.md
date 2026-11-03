# CLAUDE.md

CascadeHook is a webhook delivery service: signed requests, retries, attempt
history, and replay. Setup, commands, and deployment are in `README.md`.

## Layout

- `apps/server`: Go module `cascadehook`, using pgx, goose, jwt, and Prometheus.
  - `cmd/api`: HTTP API built on stdlib `net/http`.
  - `cmd/worker`: delivery engine. It also runs the email outbox and notification maintenance.
  - `cmd/janitor`: one-shot retention and account cleanup.
  - `cmd/{migrate,seed,projectctl,tenantctl,secretctl}`: operator tools.
  - `internal/store`: all SQL. Domain packages (`deliveries`, `endpoints`,
    `events`, `accounts`, ...) hold types and validation. `httpapi` holds handlers.
  - `migrations/`: numbered goose SQL files, embedded through `migrations.go`.
- `apps/web`: Next.js 16 dashboard and landing page (Clerk, React Query, Tailwind v4).
  Route files under `app/` are thin. Logic lives in `features/*`.
- `apps/docs`: Fumadocs site, including the OpenAPI reference (`openapi/project-api.json`).
- `deploy/`: Docker Compose for API, worker, and Postgres on the VM, plus the systemd janitor timer.

## Checks

Run `bun run check` (web and docs lint and typecheck, `go vet`, `go build`).
The Go code has no test suite.

## Architecture

- **Two API surfaces, shared handlers.** Project API keys (`ch_(dev|live)_…`,
  stored as SHA-256 only) authenticate `/v1/{endpoints,events,deliveries,api-keys}`.
  Clerk session tokens authenticate `/v1/organizations/...` and
  `/v1/projects/{project_id}/...`, which wrap the same handlers through
  `withSessionProject`. Writes and credential routes require the owner or admin role.
- **Publish** (`store/events.go`): one transaction stores the event, fans out
  one `deliveries` row per subscribed enabled and verified endpoint, and
  records usage. `Idempotency-Key` is required and expires after 24h. The same
  key with a different body returns `idempotency_conflict`.
- **Delivery state machine.** A delivery moves `pending → leased → succeeded | failed | canceled`.
  1. Claim with `FOR UPDATE SKIP LOCKED`, taking a 90s lease.
  2. `BeginDeliveryAttempt` commits the attempt *intent* before any HTTP call.
  3. `CompleteDelivery` appends an immutable `delivery_attempts` row and is idempotent.
  4. Recovery finalizes expired leases as `interrupted`.
  5. Replay starts a new `cycle` with a fresh 72h window.
  - Limits are set in `deliveries/lease.go` and `delivery/outcome.go`: 8
    attempts and a 72h horizon, with jittered backoff from 15s to 18h.
- **Outbound HTTP** (`delivery/client.go`) dials public IPs only, never follows
  redirects, and reads at most 4 KiB of the response. Callers can't bypass it.
- **Signing** (`signing/`): HMAC-SHA256 over `id.timestamp.body` in the
  `Webhook-Id`, `Webhook-Timestamp`, and `Webhook-Signature` headers. The
  previous secret also signs during the 5-minute rotation grace period.
  Secrets are stored AES-GCM encrypted, with the project and endpoint IDs as
  associated data. `SIGNING_ENCRYPTION_PREVIOUS_KEY` allows key rotation.
- **Endpoint verification** sends a signed challenge and requires an HMAC proof
  back. Verifying never enables an endpoint; enabling is a separate PATCH.

## Conventions

- **Lock order** is organization → project → endpoint → delivery, in parent→child
  direction. New transactions must follow it to stay deadlock-free and safe
  against project and organization deletion.
- **Time:** use database time (`clock_timestamp()`, read after acquiring locks)
  for lease and expiry decisions, never the worker's wall clock. `now()` is
  fixed at transaction start.
- **Never send after an ambiguous commit.** Leave it for recovery.
- **IDs** are UUIDv7, generated in Go.
- **Errors:** API errors are RFC 7807 `application/problem+json` with a stable
  snake_case `code`. When you add a code, add its user-facing message in
  `apps/web/lib/api.ts` (`problemMessage`).
- **Never log or persist secrets, API keys, payloads, destination URLs, raw
  outbound errors, or response bodies.** Secret types implement redacting
  `String`, `GoString`, and `LogValue` methods.
- **Config:** env vars are parsed and bounded in `internal/config`. An
  explicitly empty value is an error, not a default.
- **Schema:**
  - Enforce invariants in the database with CHECK constraints, composite
    `(project_id, id)` foreign keys, and partial indexes.
  - Audit actor IDs are snapshots, deliberately without foreign keys.
  - Down migrations refuse to run when they would drop audit data or
    resurrect partially deleted data.
  - Never edit an applied migration; add a new one.
- **Comments** explain *why*, especially concurrency and failure reasoning.
  Match that density.

## Frontend

Follow `apps/web/AGENTS.md`:
- Next 16 has breaking changes, so read `node_modules/next/dist/docs/` first.
- Use Tailwind v4 utilities, with shared tokens in `app/globals.css` via `@theme`.
- Don't open a browser to verify UI. Run the checks and ask the user to verify.

The web app calls the Go API directly from the client with the Clerk bearer
token (`lib/api.ts`). Keep `middleware.ts`, because OpenNext needs Edge middleware.
