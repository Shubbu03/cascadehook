// Notifies IndexNow (Bing, Yandex, Seznam, Naver, ...) about changed pages.
// Run after a deploy, once the new content is live:
//   bun run seo:indexnow            pages whose lastmod is within the last 7 days
//   bun run seo:indexnow --days 30
//   bun run seo:indexnow --all
//   bun run seo:indexnow https://cascadehook.com/docs/quickstart ...
import { readdirSync } from "node:fs";
import { join } from "node:path";

const host = "cascadehook.com";
const origin = `https://${host}`;
const sitemaps = [`${origin}/sitemap.xml`, `${origin}/docs/sitemap.xml`];

// The key is public by design; the file's presence at the site root proves ownership.
const publicDir = join(import.meta.dir, "../apps/web/public");
const keyFile = readdirSync(publicDir).find((name) => /^[0-9a-f]{32}\.txt$/.test(name));
if (!keyFile) throw new Error(`no IndexNow key file in ${publicDir}`);
const key = keyFile.slice(0, -4);

const args = process.argv.slice(2);
const all = args.includes("--all");
const daysIndex = args.indexOf("--days");
const days = daysIndex >= 0 ? Number(args[daysIndex + 1]) : 7;
if (!Number.isFinite(days) || days <= 0) throw new Error("--days needs a positive number");
const explicit = args.filter((arg) => arg.startsWith("https://"));

async function sitemapURLs() {
  const cutoff = Date.now() - days * 86_400_000;
  const urls: string[] = [];
  for (const sitemap of sitemaps) {
    const response = await fetch(sitemap);
    if (!response.ok) throw new Error(`${sitemap}: HTTP ${response.status}`);
    for (const [, block] of (await response.text()).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
      const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      if (!loc) continue;
      // Pages without a lastmod are only sent with --all, since nothing says they changed.
      if (all || (lastmod && Date.parse(lastmod) >= cutoff)) urls.push(loc);
    }
  }
  return urls;
}

const urlList = explicit.length > 0 ? explicit : await sitemapURLs();
const foreign = urlList.filter((url) => new URL(url).host !== host);
if (foreign.length > 0) throw new Error(`not on ${host}: ${foreign.join(", ")}`);
if (urlList.length === 0) {
  console.log(all ? "Sitemaps list no URLs." : `No pages changed in the last ${days} days. Use --all to send everything.`);
  process.exit(0);
}

const keyLocation = `${origin}/${key}.txt`;
const live = await fetch(keyLocation);
if (!live.ok || (await live.text()).trim() !== key) {
  throw new Error(`${keyLocation} is not live with the key yet; deploy the web app first`);
}

// One request reaches every participating engine. 10,000 URLs per request is the protocol limit.
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation, urlList }),
});
// 200 and 202 both mean accepted; 202 means the key is still being validated.
if (response.status !== 200 && response.status !== 202) {
  throw new Error(`IndexNow rejected the submission: HTTP ${response.status} ${await response.text()}`);
}
console.log(`Submitted ${urlList.length} URL(s) to IndexNow (HTTP ${response.status}):`);
for (const url of urlList) console.log("  " + url);
