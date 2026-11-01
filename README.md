# Cascadehook

Outbound webhook delivery with signed requests, automatic retries, delivery
history, and replay. Built with Go, PostgreSQL, Next.js, and Clerk.

## Setup

Requires Bun 1.3.13, Go 1.27.3, PostgreSQL, and a Clerk application.

```sh
bun install --frozen-lockfile
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/docs/.env.example apps/docs/.env.local
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
bun run dev:docs
```

Open `http://localhost:3000` to create your account and first project.
Documentation runs separately at `http://localhost:3001/docs`. Configure the
docs API origin using [its environment example](apps/docs/.env.example).

## Commands

| Command | Purpose |
| --- | --- |
| `bun run check` | Lint, type checking, Go vet, and Go build |
| `bun run build:web` | Production frontend build |
| `bun run dev:docs` | Documentation development server on port 3001 |
| `bun run build:docs` | Production documentation build |
| `bun run db:cleanup` | Run retention and pending deletion cleanup |

## Deployment

Run the frontend, API, and worker as separate services. API and worker share
PostgreSQL and the signing encryption key. Apply migrations before starting the
API and schedule `db:cleanup` regularly. The API exposes `/healthz` and `/readyz`
for health checks.

The [notification backend](apps/server/NOTIFICATIONS.md) requires migration
`00021`. It provides organization-scoped personal inbox APIs and notification
generation. Schedule cleanup with `NOTIFICATION_RETENTION_DAYS` (default 90).

Invitation emails require migration `00022` and Resend/Clerk configuration on
the API and worker. Follow [email setup](apps/server/EMAIL.md) for sender-domain
verification, delivery webhooks, and passwordless invitation onboarding.

See [frontend documentation](apps/web/README.md) for dashboard configuration.
The standalone [docs app](apps/docs/README.md) has its own build and deployment.
Set `NEXT_PUBLIC_DOCS_URL` on the web app to its public root URL when deploying.

## Agent-assisted integration

After creating an account, organization, and project, open the project's
Overview and select **Set up with AI**. Create a project API key and store it
locally as `CASCADEHOOK_API_KEY`, then copy the project-specific prompt into
your coding agent. The prompt contains context and documentation links without
credentials. Keys currently grant project-wide access; Development and Live
labels have identical permissions.

The docs app publishes a [Markdown agent guide](apps/docs/content/docs/agents/integration.md)
at `/docs/agents.md` and the project API schema at `/openapi.json`. The schema
uses `NEXT_PUBLIC_API_BASE_URL` for the API server address and returns 503 if
that configuration is missing or invalid. The human guide is at `/docs/agents`.
