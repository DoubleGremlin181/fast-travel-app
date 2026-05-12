// FMHY source: fetches a page from github.com/fmhy/edit and picks the first
// link whose text contains `matchName` (case-insensitive). FMHY lists primary
// mirrors first, so the first match is the recommended one.

const USER_AGENT = "FastTravel-AutoUpdateDomains/1.0 (https://kavi.sh)";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findLinkHost(markdown, matchName, downDomain) {
  // Match `[<text containing matchName>](<https-url>)` — text may include any
  // characters (including ** for bold) as long as it has no `]` itself.
  const re = new RegExp(
    `\\[([^\\]]*${escapeRegex(matchName)}[^\\]]*)\\]\\((https?://[^\\s)]+)\\)`,
    "i",
  );
  const m = re.exec(markdown);
  if (!m) return null;
  try {
    const host = new URL(m[2]).hostname.toLowerCase();
    if (host === downDomain.toLowerCase()) return null;
    return host;
  } catch {
    return null;
  }
}

export async function resolve({ downDomain, autoUpdate, fetchImpl = fetch }) {
  const url = `https://raw.githubusercontent.com/fmhy/edit/main/docs/${autoUpdate.fmhyPath}.md`;
  console.error(`  [fmhy] Fetching ${autoUpdate.fmhyPath}.md, matchName="${autoUpdate.matchName}" ...`);
  let res;
  try {
    res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    console.error(`  [fmhy] Network error fetching ${url}: ${err.message}`);
    return null;
  }
  if (!res.ok) {
    console.error(`  [fmhy] HTTP ${res.status} for ${url}`);
    return null;
  }
  const markdown = await res.text();
  return findLinkHost(markdown, autoUpdate.matchName, downDomain);
}
