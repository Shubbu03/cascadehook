<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Styling

- Use Tailwind CSS v4 utilities in JSX for component and page styling.
- Check the current Tailwind docs and installed version before introducing utilities. Prefer current names, theme tokens, CSS variable shorthand, and state variants.
- Define shared design tokens with `@theme` in `app/globals.css`. Keep light, dark, and system theme behavior consistent.
- Share repeated UI through React components with explicit variants. Keep complete utility names in source so Tailwind can detect them.
- Reserve custom CSS for global base rules, custom keyframes, view transitions, and browser or third-party selectors that cannot reasonably live in JSX.
- Preserve responsive behavior, visible keyboard focus, forced colors, and reduced motion when migrating styles.
- Do not open a browser or GUI preview to verify changes. Run non-browser checks and ask the user to verify the UI manually.
