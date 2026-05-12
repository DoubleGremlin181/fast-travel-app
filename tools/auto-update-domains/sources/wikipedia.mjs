// Wikipedia source: looks up external links on a Wikipedia article and picks
// the first plausible alternative hostname for a downed domain.
//
// Returns a hostname string, or null if no candidate could be derived.

const BASE_DELAY_MS = 250;
const MAX_RETRIES = 3;
const USER_AGENT = "FastTravel-AutoUpdateDomains/1.0 (https://kavi.sh)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchExtLinks(title, fetchImpl) {
  const apiUrl =
    `https://en.wikipedia.org/w/api.php` +
    `?action=query&titles=${encodeURIComponent(title)}` +
    `&prop=extlinks&ellimit=50&format=json`;

  await sleep(BASE_DELAY_MS);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetchImpl(apiUrl, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.status === 429 || res.status === 503) {
        const headerWait =
          Number(res.headers.get("retry-after")) ||
          Number(res.headers.get("x-backoff")) || 0;
        const backoff = Math.max(headerWait * 1000, 1000 * 2 ** attempt);
        console.error(`  [wikipedia] ${res.status} on "${title}" — backing off ${backoff}ms`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) return [];
      const data = await res.json();
      const pages = data?.query?.pages;
      if (!pages) return [];

      const links = [];
      for (const page of Object.values(pages)) {
        if (page.extlinks) {
          for (const link of page.extlinks) {
            const url = link["*"] || link.url;
            if (url) links.push(url);
          }
        }
      }
      return links;
    } catch {
      await sleep(1000 * 2 ** attempt);
    }
  }
  return [];
}

const SKIP_HOSTS = new Set([
  "web.archive.org",
  "archive.org",
  "www.wikidata.org",
  "d-nb.info",
  "id.loc.gov",
  "viaf.org",
  "www.worldcat.org",
]);

function pickAlternativeHost(links, downDomain) {
  const seen = new Set();
  for (const raw of links) {
    try {
      const u = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      const host = u.hostname.toLowerCase();
      if (host === downDomain.toLowerCase()) continue;
      if (SKIP_HOSTS.has(host)) continue;
      if (seen.has(host)) continue;
      seen.add(host);
      return host;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function resolve({ downDomain, autoUpdate, commandName, fetchImpl = fetch }) {
  const title = autoUpdate.wikipediaTitle || commandName;
  if (!title) return null;
  console.error(`  [wikipedia] Looking up "${title}" ...`);
  const links = await fetchExtLinks(title, fetchImpl);
  return pickAlternativeHost(links, downDomain);
}
