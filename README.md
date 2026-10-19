# Cascadehook

An outbound webhook delivery platform, starting with a Go backend. See
[plan.md](plan.md) for the architecture and roadmap.

## Deployment

Deployment targets Railway, with separate API, worker, and PostgreSQL services.
Configure the API and worker from this repository with `apps/server` as their
root directory.

| Service | Build command | Start command |
| --- | --- | --- |
| API | `go build -o bin/api ./cmd/api && go build -o bin/migrate ./cmd/migrate` | `./bin/api` |
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

## Configuration

| Variable | Default | Accepted values |
| --- | --- | --- |
| `DATABASE_URL` | none, required | PostgreSQL connection URL supplied through Railway variables |
| `HTTP_ADDR` | `127.0.0.1:8080` | API listener; set `0.0.0.0:8080` on Railway |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` (case insensitive) |
| `SHUTDOWN_TIMEOUT` | `10s` | Positive Go duration, such as `10s` or `500ms` |

`HTTP_ADDR` applies to the API only. An explicitly empty variable is rejected.
Logs are JSON with `service=api`, `service=worker`, or `service=migrate`.

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

Bun 1.3.13 manages the private root workspace. Go 1.27.2 owns the backend module
in `apps/server`. Root scripts wrap Go commands:

```sh
bun install
bun run build:go
bun run fmt:go
bun run vet:go
```

`dev:api`, `dev:worker`, and `db:migrate` are also available as wrappers for the
corresponding Go commands when explicitly needed. Application verification is
performed on Railway.

The backend lives in `apps/server`; `apps/web`, `apps/docs`, and
`packages/sdk-typescript` are reserved for later phases. Empty directories have
no placeholder files and are not tracked by Git.
