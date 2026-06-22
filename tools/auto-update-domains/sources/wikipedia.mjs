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

// Reduce a string to its alphanumeric core for brand comparison, e.g.
// "Anna's Archive" -> "annasarchive", "sci-hub.st" -> "scihubst".
function normalizeToken(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Public suffixes with two labels that we care about; enough for the
// brand-stable services this tool tracks. Everything else uses the label
// immediately before the final dot.
const TWO_PART_TLDS = new Set([
  "co.uk", "org.uk", "com.au", "co.jp", "co.in", "com.br",
]);

// The registrable "brand" label of a host, e.g. "annas-archive.gl" ->
// "annas-archive", "www.sci-hub.st" -> "sci-hub", "foo.co.uk" -> "foo".
function brandLabel(host) {
  const parts = host.replace(/^www\./, "").split(".");
  if (parts.length <= 1) return parts[0] || "";
  const lastTwo = parts.slice(-2).join(".");
  const sldIndex = TWO_PART_TLDS.has(lastTwo) ? parts.length - 3 : parts.length - 2;
  return parts[Math.max(sldIndex, 0)] || "";
}

// A candidate is accepted only if one of the service brand tokens appears in
// its hostname — same brand on a different TLD (the common mirror pattern) or
// a platform-hosted subdomain carrying the brand. Wikipedia article extlinks
// are mostly references and news coverage, so the first link is frequently an
// article *about* the service rather than a mirror; matching on the brand and
// otherwise returning null avoids auto-merging an unrelated domain.
function hostMatchesService(host, tokens) {
  const full = normalizeToken(host);
  return tokens.some((t) => t.length >= 4 && full.includes(t));
}

function pickAlternativeHost(links, downDomain, tokens) {
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
      if (hostMatchesService(host, tokens)) return host;
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
  const tokens = [
    ...new Set(
      [normalizeToken(brandLabel(downDomain)), normalizeToken(title)].filter(
        (t) => t.length >= 4,
      ),
    ),
  ];
  return pickAlternativeHost(links, downDomain, tokens);
}
