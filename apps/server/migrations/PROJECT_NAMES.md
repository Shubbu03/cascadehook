# Project name uniqueness

Migration `00020` makes names unique among active projects in the same
organization. Comparisons ignore case and surrounding Unicode whitespace;
display names and project IDs stay unchanged. Different organizations can use
the same name. A project marked for deletion no longer reserves its name.

## Existing duplicates

Before deploying binaries that require migration `00020`, explicitly rename
conflicting projects using the current application's project settings. The
migration stops with the organization ID and conflicting project IDs if it
finds duplicates. It does not rename or delete any project, and its transaction
rolls back completely. Resolve each reported group and retry:

```sh
bun run db:migrate
```

Use the project IDs to distinguish identically named projects. Renaming keeps
their endpoints, API keys, events, delivery history, and URLs tied to the same
project ID.

Apply the migration before starting the updated API and worker. Readiness fails
until the uniqueness index exists. The database index serializes conflicting
creates and renames; the API returns HTTP `409` with code `project_name_exists`,
which the dashboard displays beside the name field.

