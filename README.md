# Cascadehook

An outbound webhook delivery platform, starting with a Go backend. See
[plan.md](plan.md) for the architecture and roadmap.

The Next.js frontend lives in [apps/web](apps/web/README.md). Start it with
`bun run dev:web` after configuring its environment. It includes the public landing
page, Clerk account access, and initial organization/project setup through Go.
New accounts complete organization and project setup before entering the dashboard.
Local development uses `http://localhost:3000`; set the API's
`CLERK_AUTHORIZED_PARTIES` to that exact origin. Public app origins require HTTPS.

Implementation is continuing before the first deployment. Railway verification
will follow a substantial backend slice: endpoint registration, subscriptions,
and authenticated event ingestion with transactional fan-out.

## Deployment

Deployment targets Railway, with separate API, worker, and PostgreSQL services.
Configure the API and worker from this repository with `apps/server` as their
root directory.

| Service | Build command | Start command |
| --- | --- | --- |
| API | `go build -o bin/api ./cmd/api && go build -o bin/migrate ./cmd/migrate && go build -o bin/seed ./cmd/seed` | `./bin/api` |
| Worker | `go build -o bin/worker ./cmd/worker` | `./bin/worker` |

Run `./bin/migrate` as the API service's
[pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command).
Migrations are embedded SQL files, applied by Goose before the API starts.
The initial database connection check has a five-second timeout; migrations
use the command's original context.

Set `DATABASE_URL` on both services to the Railway PostgreSQL connection URL.
Set the API's `HTTP_ADDR` to `0.0.0.0:8080` and its domain target port to `8080`.
The worker does not need a public domain. Keep the database connection details
in Railway variables; `.env.example` documents the application settings.

## Development account bootstrap

The seed command is implemented for later execution against the development
database. Apply migrations first, then run the seed binary as an explicit
one-off operator command:

```sh
./bin/seed --organization "Development" --project "Example app" --key-name "Development key"
```

It creates an organization, project, and project-scoped API key in one
transaction. Names are trimmed and must contain 1–100 characters. All IDs are
UUIDv7 values generated in Go. The command has a 30-second operation deadline,
including the initial database connection.

The command prints one JSON object to stdout containing `organization_id`,
`project_id`, `api_key_id`, `api_key_prefix`, and `api_key`. The full key has the
form `ch_dev_` followed by 64 random hex characters (256 bits of entropy).
Only its SHA-256 hash and a display prefix containing the first 12 hex
characters are stored. The secret cannot be retrieved afterward; save it
securely when created. Operational logs go to stderr and exclude the secret.

Each invocation creates new records, even when names are repeated. It does not
reuse accounts, recover existing keys, or revoke earlier keys. If credential
output fails after commit, the records remain committed and the secret is lost.

Run this command interactively when ready. Keep its credential output out of
deployment logs, and do not add it to build, start, or pre-deploy hooks. The API
build command above compiles the seed binary without executing it.

The new tables enforce organization/project ownership with foreign keys, unique
32-byte key hashes, and cascading deletion of projects and keys with their
parent records. Keys also have a nullable `revoked_at` field for the upcoming
authentication work. HTTP API-key authentication is not implemented yet.

## Configuration

| Variable | Default | Accepted values |
| --- | --- | --- |
| `DATABASE_URL` | none, required | PostgreSQL connection URL supplied through Railway variables |
| `HTTP_ADDR` | `127.0.0.1:8080` | API listener; set `0.0.0.0:8080` on Railway |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` (case insensitive) |
| `SHUTDOWN_TIMEOUT` | `10s` | Positive Go duration, such as `10s` or `500ms` |

`HTTP_ADDR` applies to the API only. An explicitly empty variable is rejected.
Logs are JSON with `service=api`, `service=worker`, `service=migrate`, or
`service=seed`.

## Deployed behavior

- `GET /healthz` reports process liveness with `200` and `{"status":"ok"}`.
- `GET /readyz` checks PostgreSQL and returns a `503` problem with code
  `not_ready` if the database is unreachable. Both probes support `HEAD`.
- The worker connects to PostgreSQL and pings every five seconds. Successful
  ticks are logged at `debug`; failures produce warnings and the loop continues.
- SIGTERM stops the worker cleanly. The API drains active requests up to
  `SHUTDOWN_TIMEOUT`, then closes remaining connections. A second signal exits
  immediately.

Verify behavior manually on Railway through the deployed API and service logs.
No event ingestion or webhook delivery exists yet.

## Repository tooling

Bun 1.3.13 manages the private root workspace. Go 1.27.3 owns the backend module
in `apps/server`. Root scripts wrap Go commands:

```sh
bun install
bun run build:go
bun run fmt:go
bun run vet:go
bun run test:go
```

`dev:api`, `dev:worker`, `db:migrate`, and `db:seed` are also available as wrappers for the
corresponding Go commands when explicitly needed. These commands, `db:cleanup`,
and the `ops:*` commands explicitly load the repository root `.env` before
launching Go. Configure that file yourself; Go does not load dotenv files.
Application verification is performed on Railway.

The backend lives in `apps/server`; `apps/web`, `apps/docs`, and
`packages/sdk-typescript` are reserved for later phases. Empty directories have
no placeholder files and are not tracked by Git.
