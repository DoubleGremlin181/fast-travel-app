import { el, screenHeader, emptyState } from "../dom.js";
import { clearHistory, getConfig, getHistory } from "../data.js";
import { showSnackbar } from "../../ui/snackbar.js";
import { findCommandById } from "../data.js";

export async function renderHistory(main: HTMLElement): Promise<void> {
  main.appendChild(
    screenHeader(
      "History",
      "The last 50 searches you made. Stored locally on this device.",
    ),
  );

  const container = el("section", { class: "card" });
  const header = el(
    "div",
    {
      class: "card-header",
      style: "display:flex;justify-content:space-between;align-items:center;",
    },
    "Recent searches",
  );
  const clearBtn = el("button", { class: "danger" }, "Clear all");
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Clear all history?")) return;
    await clearHistory();
    showSnackbar({ message: "History cleared" });
    refresh();
  });
  header.appendChild(clearBtn);
  container.appendChild(header);

  const body = el("div", { class: "card-body" });
  container.appendChild(body);
  main.appendChild(container);

  const config = await getConfig();

  async function refresh(): Promise<void> {
    const history = await getHistory();
    body.replaceChildren();
    if (history.length === 0) {
      body.appendChild(emptyState("No searches yet", "Your history will appear here."));
      return;
    }
    for (const entry of history) {
      const row = el("div", { class: "history-item" });
      row.appendChild(el("span", { class: "history-query" }, entry.query));

      if (config && entry.commandId) {
        const found = findCommandById(config, entry.commandId);
        if (found) {
          row.appendChild(el("span", { class: "history-cmd" }, found.cmd.name));
        }
      }
      row.appendChild(el("span", { class: "history-time" }, formatTimestamp(entry.timestamp)));
      body.appendChild(row);
    }
  }

  await refresh();
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
