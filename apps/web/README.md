# Cascadehook web

Next.js App Router dashboard and marketing site, managed by the root Bun
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
| `NEXT_PUBLIC_DOCS_URL` | Public root URL of `apps/docs`; defaults to port 3001 in development |

The example configures `/login` for both sign-in and account creation. Sign-in
returns to `/dashboard`; sign-up starts at `/onboarding`. Keep secrets out of `NEXT_PUBLIC_`
variables. Public variables are set at build time; restart development after
changing environment files.

Configure the API's Clerk issuer/public key and add the exact frontend origin to
`CLERK_AUTHORIZED_PARTIES`. Local development uses `http://localhost:3000`; update
the origin if the port changes. Public hosts require HTTPS. Apply migrations
through `00020` before using the dashboard.

```sh
bun run dev:web
```

The public landing page works without Clerk configuration. Account routes show
an unavailable state when Clerk keys are missing. Missing API configuration
produces a connection error in the authenticated workspace.

## Routes and behavior

| Route | Purpose |
| --- | --- |
| `/` | Landing page with a static delivery illustration and request examples |
| `/docs/*`, `/openapi.json` | Compatibility redirects to the standalone docs app |
| `/login` | Google and email account access, with sign-up in the same page |
| `/sign-in/*`, `/sign-up/*` | Compatibility redirects to the matching `/login` form step |
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

The login page starts with sign-in and a Google button above the email form.
"Create account" and "Sign in" switch Clerk's forms within that page using hash
routes, including verification, password recovery and OAuth callbacks. Existing
auth links keep their query parameters when redirected to `/login`. Clerk owns
authentication; the Go API finds or provisions the local account from the
verified session identity, so this flow does not require a separate signup API.

First-time setup resumes from the account's persisted onboarding state. Deleting
the last project shows an empty workspace without restarting onboarding. Owners
and admins manage resources; members see permitted reads. The API checks the
role again for every request.

Members who open project API Keys or Usage URLs are redirected to that project's
Overview. Organization Usage redirects to the organization's project dashboard.
Redirects replace the denied URL in history and show a permission toast on
arrival. The temporary notification marker is removed so refreshing does not
repeat the toast. Shared settings pages retain their permitted read-only views.

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

Guides, the OpenAPI contract, and receiver downloads belong to `apps/docs`.
Help links and AI setup prompts use `NEXT_PUBLIC_DOCS_URL`; old documentation
URLs redirect there. Set it to the deployed docs root in production. Without
that configuration, legacy guide/schema requests return an unavailable response
instead of sending users to a development address.

## UI conventions

The landing page's delivery illustration is a labelled static example. Its
primary calls to action lead to `/login`; delivery logs and replay are
available inside a project after setup.

Use `DocsLink` from `@/components/docs-link` for documentation pages, receiver
guides, Markdown guides, and API schemas. It opens documentation in a new tab
so the current app page stays available.

Feature code lives in `features/`, shared controls in `components/`, API/session
helpers in `lib/`, and route entry points in `app/`. Global stylesheets are
imported from the root layout. IBM Plex fonts are self-hosted with licenses in
`app/fonts`.

The system theme is the default. Explicit choices are saved and synchronized
across tabs; blocked browser storage still allows a temporary choice. The root
`ThemeProvider` synchronizes the resolved theme with the `<html>` dark class and
the existing palette attributes. Theme clicks reveal the new theme from the
click position using View Transitions; unsupported browsers and reduced motion
switch instantly. Animation rules are scoped to a temporary root attribute in
`app/theme-transition.css`. The reusable pixel dissolve experiment is archived
in [this gist](https://gist.github.com/Shubbu03/1e48142e18dc2c2b29b77dee857919a9).

Use `notify` from `@/lib/notify` for success/error/warn/info notifications inside the
signed-in app. The notification provider belongs in the authenticated workspace
and onboarding shells, after their session checks. Its Clerk-dependent toaster
has its own Suspense boundary so it cannot block page content. Public copy
actions show inline confirmation or failure on the button; public theme changes
do not emit toasts. Important form errors also remain inline.

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

1. Landing account links, request-language tabs and copying, docs navigation,
   and receiver downloads.
2. `/login` form switching, Google/email access, interrupted onboarding, organization/project switching, and
   access with owner/admin/member roles. As a member, open project API Keys,
   project Usage, and organization Usage URLs directly; check the destination,
   single permission toast, refresh, and Back behavior. Owners and admins should
   retain access to those pages.
3. Receiver registration, signing-secret disclosure, verification, enabling,
   event publication, attempt history, and replay.
4. Key rotation/revocation, membership changes, invitation acceptance, and
   deletion confirmations with the appropriate roles.
5. Mobile navigation, keyboard focus and dialogs, theme persistence, loading,
   empty, error, and expired-session states.
