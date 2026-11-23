#!/usr/bin/env bash
# Cloudflare builds clone shallowly; docs need full history for per-page lastmod.
# A failed fetch only costs the dates (source.config.ts omits them), not the build.
set -u
if [ "$(git rev-parse --is-shallow-repository 2>/dev/null)" = "true" ]; then
  git fetch --unshallow --filter=blob:none --quiet || echo "unshallow failed; docs will omit lastModified" >&2
fi
exit 0
