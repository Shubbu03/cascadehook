const origin = new URL(process.argv[2] ?? "http://localhost:3000");

async function read(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
  return response.text();
}

try {
  const html = await read(origin);
  const stylesheets = [...html.matchAll(/<link\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => /\brel="stylesheet"/.test(tag))
    .flatMap((tag) => {
      const href = tag.match(/\bhref="([^"]+)"/)?.[1];
      return href ? [new URL(href.replaceAll("&amp;", "&"), origin)] : [];
    });
  if (!stylesheets.length) throw new Error("No stylesheets found in the page.");
  const css = (await Promise.all(stylesheets.map(read))).join("\n");
  const missing = [
    ".activity-filters",
    ".usage-grid",
    ".settings-form",
    ".dashboard-shell",
    ".sidebar-link",
    ".page-heading",
    ".select-control",
    ".account-input",
    ".overview-grid",
    ".overview-checklist",
  ].filter((selector) => !css.includes(selector));
  if (missing.length) throw new Error(`Missing styles: ${missing.join(", ")}`);
  console.log(
    `Dashboard styles present in ${stylesheets.length} served stylesheet(s).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Style check failed.");
  process.exitCode = 1;
}

export {};
