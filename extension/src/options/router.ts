/** Tiny hash-based router. Each screen registers a render function keyed by a
 * regex; the first match wins. Unknown routes fall back to the home route. */

export interface Route {
  pattern: RegExp;
  render: (main: HTMLElement, match: RegExpMatchArray) => void | Promise<void>;
}

let routes: Route[] = [];
let main: HTMLElement;
let defaultHash = "#/appearance";

export function defineRoutes(r: Route[]): void {
  routes = r;
}

export function init(mainEl: HTMLElement, home: string): void {
  main = mainEl;
  defaultHash = home;
  window.addEventListener("hashchange", () => void handle());
  void handle();
}

export function navigate(hash: string): void {
  if (location.hash === hash) {
    void handle();
  } else {
    location.hash = hash;
  }
}

async function handle(): Promise<void> {
  const hash = location.hash || defaultHash;
  updateSidebarActive(hash);
  for (const route of routes) {
    const match = hash.match(route.pattern);
    if (match) {
      main.replaceChildren();
      try {
        await route.render(main, match);
      } catch (err) {
        console.error("[fast-travel] screen render failed:", err);
        main.textContent = "Something went wrong rendering this screen.";
      }
      return;
    }
  }
  // Unknown — redirect to default
  location.hash = defaultHash;
}

function updateSidebarActive(hash: string): void {
  const topLevel = "#/" + (hash.split("/")[1] ?? "");
  document.querySelectorAll<HTMLElement>(".sidebar-link").forEach((el) => {
    const r = el.getAttribute("data-route") ?? "";
    el.classList.toggle("active", r === topLevel || r === hash);
  });
}
