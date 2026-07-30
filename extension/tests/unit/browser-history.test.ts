import { describe, it, expect } from "vitest";
import { searchBrowserHistory } from "../../src/core/browser-history.js";

function install(opts: {
  granted: boolean;
  results?: Array<Record<string, unknown>>;
  historyPresent?: boolean;
}) {
  let lastQuery: Record<string, unknown> | undefined;
  (globalThis as any).chrome = {
    permissions: { contains: async () => opts.granted },
    ...(opts.historyPresent === false
      ? {}
      : {
          history: {
            search: async (q: Record<string, unknown>) => {
              lastQuery = q;
              return opts.results ?? [];
            },
          },
        }),
  };
  return () => lastQuery;
}

describe("searchBrowserHistory", () => {
  it("returns [] without the history permission", async () => {
    install({ granted: false, results: [{ url: "https://a.com" }] });
    expect(await searchBrowserHistory("a")).toEqual([]);
  });

  it("returns [] when chrome.history is unavailable", async () => {
    install({ granted: true, historyPresent: false });
    expect(await searchBrowserHistory("a")).toEqual([]);
  });

  it("maps results to url/title/lastVisitTime/visitCount", async () => {
    install({
      granted: true,
      results: [
        {
          url: "https://github.com/",
          title: "GitHub",
          lastVisitTime: 1000,
          visitCount: 42,
          typedCount: 7,
        },
        { url: "https://gitlab.com/ci" },
      ],
    });
    expect(await searchBrowserHistory("git")).toEqual([
      { url: "https://github.com/", title: "GitHub", lastVisitTime: 1000, visitCount: 42 },
      { url: "https://gitlab.com/ci", title: "", lastVisitTime: 0, visitCount: 0 },
    ]);
  });

  it("drops entries without a url", async () => {
    install({ granted: true, results: [{ title: "no url" }, { url: "https://a.com" }] });
    expect(await searchBrowserHistory("a")).toHaveLength(1);
  });

  it("passes the query text and caps results", async () => {
    const getQuery = install({ granted: true, results: [] });
    await searchBrowserHistory("kittens");
    const q = getQuery()!;
    expect(q.text).toBe("kittens");
    expect(q.maxResults).toBe(10);
    expect(typeof q.startTime).toBe("number");
  });

  it("returns [] when history.search rejects", async () => {
    (globalThis as any).chrome = {
      permissions: { contains: async () => true },
      history: {
        search: async () => {
          throw new Error("boom");
        },
      },
    };
    expect(await searchBrowserHistory("a")).toEqual([]);
  });
});
