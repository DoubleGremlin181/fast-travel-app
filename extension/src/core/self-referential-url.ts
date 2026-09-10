/**
 * True for URLs that just re-run a Fast Travel search rather than being a real
 * destination: the extension's own omnibox sentinel host, and Fast Travel v1
 * redirect pages (the self-hosted predecessor, e.g.
 * https://fast-travel.kavi.sh/?q=gh or https://<user>.github.io/fast-travel/?q=gh).
 *
 * Surfacing these as history suggestions produces a dead round-trip through the
 * old redirector, so they are filtered out of both history sources (#84).
 *
 * Deliberately conservative: apart from the sentinel host, a URL must carry a
 * `q` query param AND look like a Fast Travel instance, so the project's own
 * pages (kavi.sh/fast-travel-app/, the GitHub repo) are never filtered.
 */
export function isFastTravelRedirectUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.hostname === "fast-travel-omnibox.invalid") return true;
  if (!u.searchParams.has("q")) return false;
  return (
    /fast-?travel/i.test(u.hostname) ||
    /(^|\/)fast-?travel(\/|$)/i.test(u.pathname)
  );
}
