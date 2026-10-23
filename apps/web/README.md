# Cascadehook web

Next.js App Router frontend, managed by the root Bun workspace.

## Run

From the repository root:

    bun install
    cp apps/web/.env.example apps/web/.env.local
    bun run dev:web

Configure the values in the copied file before testing account access:

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Publishable key for the existing Clerk application used by Go |
| CLERK_SECRET_KEY | Server-only secret for that same Clerk application |
| NEXT_PUBLIC_API_BASE_URL | Public Go API origin, without /v1 or embedded credentials |

The example also sets local sign-in/sign-up URLs and the /dashboard fallback.
Keep secrets out of NEXT_PUBLIC_ variables. Configure public variables before a
production build, and restart development after changing the environment.
No Clerk application is created automatically.

The landing page works without account configuration. Without Clerk keys, account
pages show an unavailable state and the workspace cannot be accessed. Without
the API origin, authenticated users see a recoverable connection error.

## Account and API setup

- Use the same Clerk instance as the backend's CLERK_ISSUER_URL and public key.
  Apply the backend's account migrations and configure its session verification.
- Add the frontend's exact HTTPS origin to Go's CLERK_AUTHORIZED_PARTIES. Go
  currently requires HTTPS origins and uses this list for browser CORS as well
  as token authorized-party checks.
- Plain HTTP localhost can preview the frontend, but it does not satisfy that
  backend origin contract. For end-to-end checks, use an allowed HTTPS frontend
  origin; local Next.js HTTPS can be requested with
  bun run dev:web --experimental-https and its origin must still be allowed.
- Configure the desired sign-in methods, email verification, and session tasks
  in the existing Clerk application. Clerk's components handle those configured
  flows; credentials and tokens are never saved in browser storage by app code.
- Go owns organizations and roles. Clerk organization components are deliberately
  not used for product membership.

## Current flow

- / — responsive landing page with explicitly illustrative delivery examples.
- /sign-in and /sign-up — themed Clerk forms, including their catch-all steps.
  Existing active sessions continue to /dashboard.
- /dashboard — server-protected account entry. Connects to /v1/me, lists
  organizations/projects using cursor pagination, and creates them through the
  existing Go endpoints. Other operational dashboard screens are a later slice.

Clerk loads only on account routes. Each signed-in workspace owns its QueryClient;
query keys include the user/project context and auth is checked near the protected
content. Xior obtains a current bearer token per request, omits API cookies,
disables HTTP caching, and uses a bounded timeout. Mutations do not automatically
retry. No live API calls are made during a production build.

## Themes and notifications

System / Light / Dark applies to every screen. A small pre-paint script restores
the preference; CSS follows OS changes in System mode. Preferences synchronize
across tabs. Blocked browser storage still permits a temporary theme selection.
IBM Plex fonts are self-hosted; their licenses are in app/fonts.

Import notify from @/lib/notify and call:

    notify("Project created.", "success");
    notify("Couldn't save your changes.", "error");
    notify("Your browser couldn't save the theme.", "warn");
    notify("Copied to clipboard.");

The helper supports success/error/warn/info and returns the toast ID. A single
top-right Toaster supplies theme-aware surfaces, Phosphor icons, dismissal,
accessible announcements, and consistent typography. Important form errors also
remain inline. To dismiss/update a returned ID, use react-hot-toast's normal API.

## Checks

From the repository root:

    bun run lint:web
    bun run typecheck:web
    bun run build:web

Turbopack uses worker-thread evaluation for CSS loaders to avoid a socket-based
loader process pool. Next.js may fall back to its default strategy on affected
Node.js releases; use a supported Node version for builds.

Manually verify:

1. Landing navigation and code copying at phone, tablet, and desktop widths.
2. Both themes, System mode, persistence, and keyboard focus.
3. Sign-up verification, sign-in, sign-out, and returning-user redirects.
4. Direct unauthenticated /dashboard access.
5. Account bootstrap, organization/project creation, membership roles, and
   pagination against the deployed Go API.
6. API failures, incorrect origin/session configuration, and useful toast
   placement/dismissal in both themes.

Browser and GUI verification is user-owned.
