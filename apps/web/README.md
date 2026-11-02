# CascadeHook Web

Next.js dashboard and landing page. Clerk handles sign-in; the Go API owns
application data and permissions.

## Setup

From the repository root:

```sh
bun install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
```

Configure the environment file:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Matching Clerk secret key |
| `NEXT_PUBLIC_API_BASE_URL` | API origin, without `/v1` |
| `NEXT_PUBLIC_DOCS_URL` | Optional docs origin; empty for same-domain docs |

Use the API's Clerk app and allow the frontend origin in its
`CLERK_AUTHORIZED_PARTIES`. Local docs default to `http://localhost:3001`.

```sh
bun run dev:web
```

Open `http://localhost:3000`. Account access starts at `/login`.

## Checks and deployment

```sh
bun run lint:web
bun run typecheck:web
bun run build:cloudflare:web
```

Deploy from `apps/web` with `bun run deploy:cloudflare`. Set production Clerk
keys in Cloudflare's build settings and runtime Variables and Secrets.
Public environment changes require a rebuild.

For `cascadehook.com/docs`, leave `NEXT_PUBLIC_DOCS_URL` empty. Use `DocsLink`
for links into the separately deployed docs app.

Keep `middleware.ts` while the pinned OpenNext adapter requires Edge middleware;
the Next.js deprecation warning is expected.

[Deployment settings](../../README.md#deployment)
