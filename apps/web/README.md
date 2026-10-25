# Cascadehook web

Next.js App Router frontend, managed by the root Bun workspace.

## Run

From the repository root:

    bun install
    cp apps/web/.env.example apps/web/.env.local
    bun run dev:web

Open http://localhost:3000. Development uses plain HTTP. Set the root API .env's
CLERK_AUTHORIZED_PARTIES to http://localhost:3000 and restart the API after changing
it. If Next.js uses a different port, update the allowed origin to match it.

Configure the values in the copied file before testing account access:

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Publishable key for the existing Clerk application used by Go |
| CLERK_SECRET_KEY | Server-only secret for that same Clerk application |
| NEXT_PUBLIC_API_BASE_URL | Public Go API origin, without /v1 or embedded credentials |

The example also sets local sign-in/sign-up URLs and the /onboarding fallback.
Keep secrets out of NEXT_PUBLIC_ variables. Configure public variables before a
production build, and restart development after changing the environment.
No Clerk application is created automatically.

The landing page works without account configuration. Without Clerk keys, account
pages show an unavailable state and the workspace cannot be accessed. Without
the API origin, authenticated users see a recoverable connection error.

## Account and API setup

- Use the same Clerk instance as the backend's CLERK_ISSUER_URL and public key.
  Apply the backend's account migrations and configure its session verification.
- Add the frontend's exact origin to Go's CLERK_AUTHORIZED_PARTIES. This list
  controls both browser CORS and the session token's authorized-party check.
  HTTPS is required for public hosts. Local development may explicitly allow
  HTTP on localhost, 127.0.0.1, or [::1]. Scheme, host, and port must all match;
  adding one loopback origin does not allow other hosts or ports.
- Configure the desired sign-in methods, email verification, and session tasks
  in the existing Clerk application. Clerk's components handle those configured
  flows; credentials and tokens are never saved in browser storage by app code.
- Go owns organizations and roles. Clerk organization components are deliberately
  not used for product membership.

## Current flow

- / — responsive landing page with explicitly illustrative delivery examples.
- /sign-in and /sign-up — 40/60 split layout with brief, context-specific copy
  and Clerk forms, including their catch-all steps. A back-to-home link is always
  available. Phone layouts show the brand, home link, and form.
  After authentication, /onboarding checks the saved Go workspace state.
- /onboarding/organization — create the first organization.
- /onboarding/project — name and create its first project, then open that
  project's dashboard. Refreshes and returning visits resume from saved state.
  Existing users with an accessible project skip setup. Read-only members of an
  empty organization can create their own organization instead.
- Clerk receives the request's session state during server rendering, so the
  dashboard can render its page subtree before the browser SDK finishes loading.
- /dashboard — server-protected workspace. Incomplete accounts return to setup
  before any dashboard content renders. Connects to /v1/me, lists
  organizations/projects using cursor pagination, and creates them through the
  existing Go endpoints. Header dropdowns switch organizations and projects;
  /dashboard?organization=:organizationId opens that organization's project grid.
  Creation uses small dialogs, with a new organization continuing to its first
  project. Opening or switching a project lands on its Overview.
- /dashboard/projects/:projectId — Overview with a setup checklist for one
  selected endpoint: registration, signing secret, verification/enabling, an
  active API key, publication, and successful delivery. Checks use current Go
  metadata and retained delivery history; no progress flags or credentials are
  stored in the browser. Members inspect setup without API-key reads or publishing
  guidance. Endpoint choices support pagination. Reads refresh every 15 seconds,
  on returning to Overview, or with Refresh. Denied reads hide cached content.
  Owners/admins get a copyable command using a subscribed event type and their
  configured API origin; credentials remain placeholders. Reusing its request key
  is idempotent; Use a new event generates a fresh key without sending a request.
  Pending/failed deliveries link to attempt history and never count as success.
- /dashboard/projects/:projectId/endpoints — real endpoint listing with cursor
  pagination, delivery-status filters, and exact event-type filters.
- /dashboard/projects/:projectId/endpoints/new — register a public HTTPS receiver
  and its exact event subscriptions. Registration leaves delivery disabled.
- /dashboard/projects/:projectId/endpoints/:endpointId — edit the destination or
  subscriptions, generate/rotate its signing secret, verify ownership, and
  explicitly enable or disable delivery. Changing the URL resets verification
  and disables delivery.
- /dashboard/projects/:projectId/receiver-guide — raw-body signature validation,
  challenge-proof instructions, and receiver handling guidance.
- /dashboard/projects/:projectId/deliveries — delivery history with exact state,
  endpoint ID, and event ID filters, cursor pagination, and optional live refresh.
- /dashboard/projects/:projectId/deliveries/:deliveryId — completed attempts across
  replay cycles, in-flight attempt metadata, retry scheduling, and replay with an
  observed-cycle check. Replay acceptance is shown as queued, not delivered.
  Attempts expose status, duration, error codes, and response-read flags; the API
  does not return response bodies or sensitive response headers.
- /dashboard/projects/:projectId/events — accepted events filtered by exact type.
  Event detail shows the accepted JSON envelope and links to its deliveries.
- /dashboard/projects/:projectId/api-keys — owner/admin key creation, optional
  expiry, development/live labels, rotation, and revocation. Both labels grant the
  same project scope. Rotation leaves the previous key usable for five minutes.
  Newly issued credentials stay in local state outside query/mutation caches,
  URLs, logs, and browser storage, and are cleared when the route is hidden or
  unmounted. A publication example uses placeholders rather than embedding a key.
- /dashboard/projects/:projectId/usage — project activity and resource counts,
  with organization-wide monthly event/delivery quotas shown separately.
- /dashboard/projects/:projectId/settings — owner/admin renaming and owner-only
  project deletion with an exact-name confirmation.
- /dashboard/organizations/:organizationId/settings — organization renaming,
  membership roles/removal, and invitation creation/revocation. These mutations
  require the owner role. Members can inspect the membership list; the API exposes
  account IDs rather than display names or member email addresses.
- /invitations/accept — accepts a one-time token or fragment link through Go.
  An unsigned recipient signs in with the invited email, then reopens the link.
  The fragment is removed before acceptance; tokens never enter query/mutation
  caches or storage. Go checks verified emails through its configured Clerk
  backend client (the root API CLERK_SECRET_KEY). Invitation links are shared
  manually; this UI does not send email. New accounts can also reach this page
  from organization onboarding.

Owners and admins can manage endpoints; members can review them. Go enforces
authorization for every request. Paused projects allow inspection, editing,
secret rotation, and disabling, while registration, verification, and activation
remain unavailable. Project availability must load before those actions are
enabled.

Clerk loads only on account routes. Each signed-in workspace owns its QueryClient;
query keys include the user/project context and auth is checked near the protected
content. Xior obtains a current bearer token per request, omits API cookies,
disables HTTP caching, and uses a bounded timeout. Mutations do not automatically
retry. No live API calls are made during a production build.
Failed reads with 401/403/404/410 hide previously cached content. Temporary
connection failures may retain prior results while showing the error.

Dashboard routes share a full-width shell: a 224px sidebar that collapses to an
icon rail, a compact organization/project top bar, and a mobile navigation drawer
below 901px. The drawer supports Escape, backdrop dismissal, and keyboard focus
containment. Project IDs and roles live in Project settings. Page headings,
filter toolbars, tables, empty states, and usage cards share compact spacing;
forms and documentation retain readable maximum widths.
Cmd/Ctrl+B toggles the sidebar, or the drawer at mobile widths, outside text
inputs and other open dialogs. Inputs use borderless surfaces with a subtle
keyboard-focus cue. Filter and role selectors share an inset caret; workspace
menus align to their triggers and stay inside the viewport.

Global stylesheets are imported directly from the root layout so Turbopack tracks
every style entry during development. With the dev server running, check the
actual emitted dashboard CSS without opening a browser:

    bun run --cwd apps/web check:styles

Pass a different HTTP origin as the final argument when using another dev port.

Signing secrets stay in local component state, outside Query caches, browser
storage, URLs, logs, and notification text. They are masked until revealed and
cleared when leaving or hiding the route. Save the secret securely and dismiss
the disclosure before editing, verifying, or enabling the endpoint. Rotation
retains the previous secret for five minutes and preserves existing delivery
settings. The API cannot retrieve an existing secret.

Verification sends a signed challenge and has a visible 30-second cooldown.
Errors remain inline as well as appearing in notifications. Failed or uncertain
mutations refresh endpoint metadata; secret requests never automatically retry.

## Themes and notifications

The system theme is the default. A borderless sun/moon button switches between
light and dark and saves the explicit choice. A small pre-paint script restores
the preference; CSS follows OS changes until a theme is chosen. Preferences
synchronize across tabs. Blocked browser storage still permits a temporary choice.
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
    bun run test:web
    bun run typecheck:web
    bun run build:web

Turbopack uses worker-thread evaluation for CSS loaders to avoid a socket-based
loader process pool. Next.js may fall back to its default strategy on affected
Node.js releases; use a supported Node version for builds.

Manually verify:

1. Landing navigation and code copying at phone, tablet, and desktop widths.
2. System default, icon toggling, saved preferences, and keyboard focus.
3. Sign-up verification, sign-in, sign-out, and returning-user redirects.
4. Fresh-account organization/project setup, refresh between steps, errors,
   returning-user skip, and direct unauthenticated /dashboard and /onboarding access.
5. Header organization/project switching, creation dialogs, membership roles,
   pagination, refresh/back navigation, and keyboard dismissal against the Go API.
6. API failures, incorrect origin/session configuration, and useful toast
   placement/dismissal in both themes.
7. Open a project, register an endpoint, save its one-time secret, implement the
   receiver guide, verify ownership, and explicitly enable delivery.
8. Change subscriptions; change the URL and confirm delivery is disabled until
   verified again. Disable delivery and check the status/event-type filters and
   pagination.
9. Rotate a signing secret and check the grace-period message. Navigate away
   with a revealed secret, then return and confirm it is cleared, including
   browser back/forward navigation. Check sign-out/account-switch isolation.
10. Check member read-only controls, suspended-project restrictions, verification
    failures, cooldowns, and phone-width forms and dialogs in both themes.
11. Create a project API key, save its one-time value, publish the example event,
    and inspect the event, deliveries, completed attempts, and retry scheduling.
    Test state/ID/type filters, pagination, empty results, and background refresh.
12. Replay a failed/succeeded delivery and check its new cycle and retained
    history. Test a stale-cycle conflict, an unavailable endpoint, and a paused
    project. Check member read-only access and direct resource URLs.
13. Rotate/revoke API keys, including expired keys and a pending rotation. Hide a
    route during a secret request and use back/forward navigation to confirm
    one-time values are not restored. Check project and account isolation.
14. Inspect shared organization quotas and separate project counters. Rename a
    project/organization, manage roles, and verify the last-owner protection.
15. Create/share an invitation link, sign in with the matching verified email,
    and accept it. Check mismatched email, expiry, revocation, duplicate invites,
    owner-only controls, and lost-link recovery by revoking/recreating an invite.
16. Request deletion of a disposable project with exact-name confirmation and
    check that further activity is denied while cleanup runs.
17. Check the full-width dashboard, sidebar collapse/expand, nested active links,
    and organization/project switching. At phone/tablet widths, check the drawer,
    Escape/backdrop dismissal, keyboard focus, wrapping filters, and table scroll.
    Check both themes and confirm project metadata appears in Settings.
18. Toggle navigation with Cmd/Ctrl+B. Check that typing in inputs and other
    dialogs does not toggle it. Verify borderless auth/setup/settings fields,
    select labels/carets, and workspace-menu alignment at narrow widths.
19. Open a fresh project's Overview and follow its checklist to a successful
    delivery. Return after each setup step and check refreshed progress, command
    copying, repeat publication/new event keys, and pending/failed delivery links.
    Switch endpoints/projects, disable an endpoint, expire/revoke a key, and check
    member access, paused projects, API failures, and completed setup in both themes.

Browser and GUI verification is user-owned.
