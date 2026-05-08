import type { Command, FastTravelConfig, Group } from "../../core/types.js";
import { resolveIconUrl } from "../../core/icon.js";
import { detectDevice } from "../../core/device.js";
import { renderFavicon } from "../../ui/favicon.js";
import { resolveGroupTint } from "../../ui/group-colors.js";
import { showSnackbar } from "../../ui/snackbar.js";
import { el, screenHeader, emptyState } from "../dom.js";
import { navigate } from "../router.js";
import { getConfig, setConfig, findCommandById } from "../data.js";

const device = detectDevice();

export async function renderCommands(main: HTMLElement): Promise<void> {
  main.appendChild(screenHeader("Commands", "Browse every command. Click one to edit."));

  const config = await getConfig();
  if (!config) {
    main.appendChild(emptyState("Config not loaded yet", "Try reloading this page."));
    return;
  }

  // Search bar + add button
  const searchRow = el("div", { class: "commands-toolbar" });

  const searchContainer = el("div", { class: "list-search" });
  const searchIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  searchIcon.setAttribute("class", "list-search-icon");
  searchIcon.setAttribute("width", "16");
  searchIcon.setAttribute("height", "16");
  searchIcon.setAttribute("viewBox", "0 0 24 24");
  searchIcon.setAttribute("fill", "none");
  searchIcon.setAttribute("stroke", "currentColor");
  searchIcon.setAttribute("stroke-width", "2");
  searchIcon.setAttribute("stroke-linecap", "round");
  searchIcon.setAttribute("stroke-linejoin", "round");
  searchIcon.innerHTML = '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>';
  searchContainer.appendChild(searchIcon);
  const searchInput = el("input", {
    type: "text",
    placeholder: "Search commands…",
    id: "cmd-search",
  }) as HTMLInputElement;
  searchContainer.appendChild(searchInput);
  searchRow.appendChild(searchContainer);

  const addBtn = el("button", { class: "primary" }, "+ Add command");
  addBtn.addEventListener("click", () => navigate("#/commands/new"));
  searchRow.appendChild(addBtn);

  main.appendChild(searchRow);

  const listContainer = el("div", { id: "cmd-list" });
  main.appendChild(listContainer);

  const render = (filter: string): void => {
    listContainer.replaceChildren();
    const f = filter.trim().toLowerCase();
    let rendered = 0;
    for (const group of config.groups) rendered += renderGroup(listContainer, group, f);
    if (rendered === 0) {
      listContainer.appendChild(emptyState(
        f ? `No commands match "${filter}"` : "No commands yet",
        f ? "" : "Click + Add command to create one.",
      ));
    }
  };

  searchInput.addEventListener("input", () => render(searchInput.value));
  render("");
}

function renderGroup(
  parent: HTMLElement,
  group: Group,
  filter: string,
  parentColor?: string,
): number {
  const color = parentColor ?? group.color;
  const matches: Command[] = [];
  if (group.commands) {
    for (const cmd of group.commands) {
      if (!filter || matchesFilter(cmd, filter)) matches.push(cmd);
    }
  }

  if (matches.length > 0) {
    parent.appendChild(el("div", { class: "commands-group-title" }, group.name));
    // Reorder only enabled when not filtering (otherwise indices are confusing).
    const canReorder = !filter;
    const container = el("div", { class: "reorder-list commands-reorder", "data-group-id": group.id });
    let dragId: string | null = null;
    for (const cmd of matches) {
      const row = renderCommandRow(cmd, color);
      if (canReorder) {
        const handle = row.querySelector<HTMLElement>(".reorder-handle");
        handle?.addEventListener("mousedown", () => {
          row.draggable = true;
        });
        handle?.addEventListener("mouseup", () => {
          row.draggable = false;
        });
        row.addEventListener("dragstart", (e) => {
          if (!row.draggable) {
            e.preventDefault();
            return;
          }
          dragId = cmd.id;
          row.classList.add("dragging");
          e.dataTransfer?.setData("text/plain", cmd.id);
        });
        row.addEventListener("dragend", () => {
          row.classList.remove("dragging");
          row.draggable = false;
          dragId = null;
          void persistCommandOrder(group.id, container);
        });
        row.addEventListener("dragover", (e) => {
          if (!dragId || dragId === cmd.id) return;
          e.preventDefault();
          const rect = row.getBoundingClientRect();
          const after = e.clientY > rect.top + rect.height / 2;
          const dragging = container.querySelector<HTMLElement>(".reorder-row.dragging");
          if (!dragging) return;
          container.insertBefore(dragging, after ? row.nextSibling : row);
        });
      }
      container.appendChild(row);
    }
    parent.appendChild(container);
  }

  let count = matches.length;
  if (group.groups) {
    for (const g of group.groups) count += renderGroup(parent, g, filter, color);
  }
  return count;
}

async function persistCommandOrder(groupId: string, container: HTMLElement): Promise<void> {
  const ids = Array.from(container.querySelectorAll<HTMLElement>(".reorder-row"))
    .map((r) => r.dataset.id ?? "")
    .filter(Boolean);
  const cfg = await getConfig();
  if (!cfg) return;
  const updated = { ...cfg, groups: reorderCommandsInGroups(cfg.groups, groupId, ids) };
  await setConfig(updated);
  showSnackbar({ message: "Order saved" });
}

function reorderCommandsInGroups(groups: Group[], groupId: string, ids: string[]): Group[] {
  return groups.map((g) => {
    if (g.id === groupId && g.commands) {
      const ordered = ids.map((id) => g.commands!.find((c) => c.id === id)).filter(Boolean) as typeof g.commands;
      const rest = g.commands.filter((c) => !ids.includes(c.id));
      return { ...g, commands: [...ordered, ...rest] };
    }
    return { ...g, groups: g.groups ? reorderCommandsInGroups(g.groups, groupId, ids) : g.groups };
  });
}

function matchesFilter(cmd: Command, filter: string): boolean {
  if (cmd.name.toLowerCase().includes(filter)) return true;
  if (cmd.id.toLowerCase().includes(filter)) return true;
  return cmd.triggers.some((t) => t.toLowerCase().includes(filter));
}

function renderCommandRow(cmd: Command, groupColor?: string): HTMLElement {
  const tint = resolveGroupTint(groupColor);
  const row = el("div", {
    class: "reorder-row cmd-row",
    role: "button",
    tabindex: "0",
    "data-id": cmd.id,
  });

  const handle = el("div", { class: "reorder-handle", "aria-hidden": "true" });
  handle.textContent = "⋮⋮";
  row.appendChild(handle);

  const favicon = el("div", { class: "cmd-row-favicon" });
  renderFavicon(favicon, { iconUrl: resolveIconUrl(cmd, device), trigger: cmd.triggers[0], groupColor, size: 24 });
  row.appendChild(favicon);

  const trigger = el("span", { class: "cmd-row-trigger" }, cmd.triggers[0]);
  trigger.style.background = tint.fill;
  trigger.style.color = tint.fg;
  row.appendChild(trigger);

  const main = el("div", { class: "cmd-row-main" });
  main.appendChild(el("div", { class: "cmd-row-name" }, cmd.name));
  const url = cmd.routes?.[0]?.searchUrl ?? cmd.routes?.[0]?.defaultUrl ?? "";
  if (url) main.appendChild(el("div", { class: "cmd-row-url" }, url));
  row.appendChild(main);

  const open = (): void => navigate(`#/commands/${encodeURIComponent(cmd.id)}`);
  main.addEventListener("click", open);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  return row;
}

// Re-export for convenience
export { findCommandById };

// Optional: flat-render helper for unit tests (not used here but handy elsewhere)
export function flattenVisibleCommands(cfg: FastTravelConfig): Command[] {
  const out: Command[] = [];
  function walk(groups: Group[]): void {
    for (const g of groups) {
      if (g.commands) out.push(...g.commands);
      if (g.groups) walk(g.groups);
    }
  }
  walk(cfg.groups);
  return out;
}
