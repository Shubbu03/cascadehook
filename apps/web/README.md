# Cascadehook web

Next.js App Router dashboard and public documentation, managed by the root Bun
workspace. The frontend uses Clerk sessions and calls the Go API; Go owns
organization membership, roles, quotas, and resource authorization.

## Setup

From the repository root:

```sh
bun install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
```

Configure these variables before starting the frontend:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Publishable key for the Clerk application used by Go |
| `CLERK_SECRET_KEY` | Server-only secret for that application |
| `NEXT_PUBLIC_API_BASE_URL` | Public Go API origin, without `/v1` or credentials |

The example also configures local sign-in/sign-up routes. Sign-in returns to
`/dashboard`; sign-up starts at `/onboarding`. Keep secrets out of `NEXT_PUBLIC_`
variables. Public variables are set at build time; restart development after
changing environment files.

Configure the API's Clerk issuer/public key and add the exact frontend origin to
`CLERK_AUTHORIZED_PARTIES`. Local development uses `http://localhost:3000`; update
the origin if the port changes. Public hosts require HTTPS. Apply migrations
through `00019` before using the dashboard.

```sh
bun run dev:web
```

The public landing page works without Clerk configuration. Account routes show
an unavailable state when Clerk keys are missing. Missing API configuration
produces a connection error in the authenticated workspace.

## Routes and behavior

| Route | Purpose |
| --- | --- |
| `/` | Landing page with illustrative delivery examples |
| `/docs/quickstart` | Setup, publication, and troubleshooting |
| `/docs/receivers` | Copy/download Node.js and Bun receiver examples |
| `/sign-in`, `/sign-up` | Clerk account access |
| `/onboarding/organization`, `/onboarding/project` | First workspace setup |
| `/dashboard` | Organization and project selection |
| `/dashboard/projects/:projectId` | Project overview and receiver setup checklist |
| `/dashboard/projects/:projectId/endpoints` | Register, edit, verify, enable, and delete receivers |
| `/dashboard/projects/:projectId/events` | Publish events and view accepted payloads |
| `/dashboard/projects/:projectId/deliveries` | Attempt history, filters, and replay |
| `/dashboard/projects/:projectId/api-keys` | Create, rotate, and revoke project credentials |
| `/dashboard/projects/:projectId/usage` | Project counters and organization quotas |
| `/dashboard/projects/:projectId/settings` | Rename or delete a project |
| `/dashboard/organizations/:organizationId/settings` | Memberships, invitations, and organization settings |
| `/dashboard/organizations/:organizationId/usage` | Organization resource usage and quotas |
| `/account` | Account settings and deletion |
| `/invitations/accept` | Accept an invitation using the invited verified email |

First-time setup resumes from the account's persisted onboarding state. Deleting
the last project shows an empty workspace without restarting onboarding. Owners
and admins manage resources; members see permitted reads. The API checks the
role again for every request.

Event publication preserves JSON payload bytes and limits the complete envelope
to 256 KiB. Explicit retries reuse the frozen payload and idempotency key;
acceptance is shown separately from delivery success. Delivery details show
attempt metadata without response bodies or sensitive response headers.

API keys, signing secrets, invitation tokens, and publication drafts stay out of
browser storage and query/mutation caches. Newly disclosed credentials clear
when their route is hidden or unmounted. Signing-secret and API-key rotation
retain the previous credential for five minutes. Changing an endpoint URL clears
verification and disables delivery until the new receiver is verified.

Invitations are shared manually; the UI sends no email. The API uses its Clerk
secret key to verify the recipient's email. Deletion requests block access and
queue cleanup; the backend janitor completes local/provider deletion.

Receiver examples share `public/examples/receiver-core.mjs`. They validate
raw-body signatures, enforce a bounded timestamp, answer ownership challenges,
and sync ordinary events to a local inbox before acknowledging. These are
single-process references: deploy behind public HTTPS and adapt persistence to
your durable queue or database.

## UI conventions

Feature code lives in `features/`, shared controls in `components/`, API/session
helpers in `lib/`, and route entry points in `app/`. Global stylesheets are
imported from the root layout. IBM Plex fonts are self-hosted with licenses in
`app/fonts`.

The system theme is the default. Explicit choices are saved and synchronized
across tabs; blocked browser storage still allows a temporary choice. Use
`notify` from `@/lib/notify` for success/error/warn/info notifications. Important
form errors also remain inline.

## Checks

From the repository root:

```sh
bun run lint:web
bun run typecheck:web
bun run build:web
```

ESLint rejects unused variables, debugger statements, and debug console output.
Next.js generates route types before TypeScript checks. Turbopack evaluates CSS
loaders in worker threads; use a supported Node.js version for builds.

Verify manually:

1. Landing/docs navigation, code copying, and receiver downloads.
2. Sign-up/sign-in, interrupted onboarding, organization/project switching, and
   access with owner/admin/member roles.
3. Receiver registration, signing-secret disclosure, verification, enabling,
   event publication, attempt history, and replay.
4. Key rotation/revocation, membership changes, invitation acceptance, and
   deletion confirmations with the appropriate roles.
5. Mobile navigation, keyboard focus and dialogs, theme persistence, loading,
   empty, error, and expired-session states.
