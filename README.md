# CascadeHook

Webhook delivery with signed requests, retries, delivery history, and replay.
Go and PostgreSQL backend, Next.js dashboard and docs, Clerk authentication.

## Development

Requires Node.js 22.16+, Bun 1.3.13, Go 1.27.3, PostgreSQL, and a Clerk app.

```sh
bun install --frozen-lockfile
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/docs/.env.example apps/docs/.env.local
```

Set the database URL, signing encryption key, and Clerk credentials in these
files. Use the same Clerk app for the API and dashboard. For local development,
set `CLERK_AUTHORIZED_PARTIES=http://localhost:3000` on the API and
`NEXT_PUBLIC_API_BASE_URL=http://localhost:8080` in both frontend apps.

```sh
bun run db:migrate
```

Run each service in a separate terminal:

```sh
bun run dev:api
bun run dev:worker
bun run dev:web
bun run dev:docs
```

Dashboard: `http://localhost:3000`. Docs: `http://localhost:3001/docs`.

## Commands

| Command | Purpose |
| --- | --- |
| `bun run check` | Lint, type checks, Go vet, Go build, and Go tests |
| `bun run build:cloudflare:web` | Build the web Worker |
| `bun run build:cloudflare:docs` | Build the docs Worker |
| `bun run db:cleanup` | Run retention and account cleanup |

## Deployment

Run the API, worker, and PostgreSQL on the VM using
[Docker Compose](deploy/compose.yaml) and its [environment template](deploy/.env.example).
Apply migrations before starting the app; schedule cleanup regularly.

Deploy the frontends as separate Cloudflare Workers:

| Worker | Root directory | Public URL |
| --- | --- | --- |
| `cascadehook-web` | `apps/web` | `cascadehook.com` |
| `cascadehook-docs` | `apps/docs` | `cascadehook.com/docs` |

For both, use build command `bun install --frozen-lockfile && bun run build:cloudflare`
and deploy command `bun run deploy:cloudflare`. Build variables:
`NODE_VERSION=22.23.3`, `BUN_VERSION=1.3.13`, `SKIP_DEPENDENCY_INSTALL=true`, and
`NEXT_PUBLIC_API_BASE_URL=https://api.cascadehook.com`.

The web Worker also needs production Clerk keys at build time and runtime.
Production docs links always use the current origin.
Keep the root custom domain on the web Worker; the docs
[configuration](apps/docs/wrangler.jsonc) adds the required path routes.

[Dashboard setup](apps/web/README.md) · [Integration guide](apps/docs/content/docs/agents/integration.md)

[Support and policy setup](docs/support-setup.md).
