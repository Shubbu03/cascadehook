function configuredDocsURL() {
  // Production docs share the app's origin, including in older build environments.
  if (process.env.NODE_ENV !== "development") return undefined;

  const value = process.env.NEXT_PUBLIC_DOCS_URL?.trim();
  if (!value) return "http://localhost:3001";
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash || url.pathname !== "/"
  ) {
    throw new Error("NEXT_PUBLIC_DOCS_URL must be an HTTP(S) root URL without credentials, a path, a query, or a fragment.");
  }
  return url.origin;
}

export const documentationBaseURL = configuredDocsURL();

export function docsHref(path = "/docs") {
  return documentationBaseURL ? documentationBaseURL + path : path;
}
