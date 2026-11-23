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
| `bun run dev:inbox` | Run the webhook tester inbox Worker on `http://localhost:8787` |
| `bun run deploy:inbox` | Deploy the inbox Worker and its `in.cascadehook.com` custom domain |
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
| `cascadehook-inbox` | `apps/inbox` | `in.cascadehook.com` |

For the web and docs Workers, use build command `bun install --frozen-lockfile && bun run build:cloudflare`
and deploy command `bun run deploy:cloudflare`. Build variables:
`NODE_VERSION=22.23.3`, `BUN_VERSION=1.3.13`, `SKIP_DEPENDENCY_INSTALL=true`, and
`NEXT_PUBLIC_API_BASE_URL=https://api.cascadehook.com`. The web Worker also needs
`NEXT_PUBLIC_INBOX_BASE_URL=https://in.cascadehook.com` for the webhook tester.

The web Worker also needs production Clerk keys at build time and runtime.
Production docs links always use the current origin.
Keep the root custom domain on the web Worker; the docs
[configuration](apps/docs/wrangler.jsonc) adds the required path routes.

### Webhook tester inbox

`cascadehook-inbox` backs the free webhook tester at `/tools/webhook-tester`. It's a
separate Worker with one SQLite Durable Object per temporary inbox, and it never
touches the Go API or PostgreSQL. Deploy it with `bun run deploy:inbox`. The
`custom_domain` route creates the `in.cascadehook.com` DNS record and certificate,
so there must be no existing `in` record. For local development, copy
`apps/inbox/.dev.vars.example` to `apps/inbox/.dev.vars`.

On the Workers Free plan, the 100K requests a day limit is shared by every Worker
on the account. To protect the main site:

- Add the zone's WAF rate-limiting rule for `hostname eq "in.cascadehook.com"`:
  100 requests per 10 seconds per IP, then block for 10 seconds.
- Kill switch: block `in.cascadehook.com` with a WAF custom rule, or remove the
  Worker's custom domain. Neither affects the web Worker.

[Dashboard setup](apps/web/README.md) · [Integration guide](apps/docs/content/docs/agents/integration.md)

[Support and policy setup](docs/support-setup.md) · [Deferred billing draft](docs/billing-setup.md)
