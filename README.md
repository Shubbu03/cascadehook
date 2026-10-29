# Cascadehook

Outbound webhook delivery with signed requests, automatic retries, delivery
history, and replay. Built with Go, PostgreSQL, Next.js, and Clerk.

## Setup

Requires Bun 1.3.13, Go 1.27.3, PostgreSQL, and a Clerk application.

```sh
bun install --frozen-lockfile
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Configure the database, signing encryption key, and Clerk settings using the
[backend](.env.example) and [frontend](apps/web/.env.example) environment examples.
Use the same Clerk application for both services. Set `CLERK_AUTHORIZED_PARTIES`
to `http://localhost:3000` and `NEXT_PUBLIC_API_BASE_URL` to your API origin.

Apply migrations:

```sh
bun run db:migrate
```

Start each process in a separate terminal:

```sh
bun run dev:api
bun run dev:worker
bun run dev:web
```

Open `http://localhost:3000` to create your account and first project.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run check` | Lint, type checking, Go vet, and Go build |
| `bun run build:web` | Production frontend build |
| `bun run db:cleanup` | Run retention and pending deletion cleanup |

## Deployment

Run the frontend, API, and worker as separate services. API and worker share
PostgreSQL and the signing encryption key. Apply migrations before starting the
API and schedule `db:cleanup` regularly. The API exposes `/healthz` and `/readyz`
for health checks.

See [frontend documentation](apps/web/README.md) for dashboard configuration.
