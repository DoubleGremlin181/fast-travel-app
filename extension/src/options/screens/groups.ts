import type { Group } from "../../core/types.js";
import { resolveGroupTint } from "../../ui/group-colors.js";
import { showSnackbar } from "../../ui/snackbar.js";
import { el, emptyState, screenHeader } from "../dom.js";
import { navigate } from "../router.js";
import { getConfig, setConfig } from "../data.js";

export async function renderGroups(main: HTMLElement): Promise<void> {
  main.appendChild(
    screenHeader(
      "Groups",
      "Commands live in groups. Drag to reorder; click a row to edit name and color.",
    ),
  );

  const config = await getConfig();
  if (!config) {
    main.appendChild(emptyState("Config not loaded yet"));
    return;
  }

  // Toolbar
  const toolbar = el("div", { class: "commands-toolbar" });
  toolbar.appendChild(el("div", { style: "flex:1;" }));
  const addBtn = el("button", { class: "primary" }, "+ New group");
  addBtn.addEventListener("click", () => navigate("#/groups/new"));
  toolbar.appendChild(addBtn);
  main.appendChild(toolbar);

  if (config.groups.length === 0) {
    main.appendChild(emptyState("No groups yet", "Click + New group to create one."));
    return;
  }

  const card = el("section", { class: "card" });
  card.appendChild(el("div", { class: "card-header" }, `${config.groups.length} top-level groups`));
  const list = el("div", { class: "card-body reorder-list" });

  let dragId: string | null = null;

  for (const group of config.groups) {
    const row = renderGroupRow(group);
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
      dragId = group.id;
      row.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", group.id);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      row.draggable = false;
      dragId = null;
      persistOrder(list);
    });
    row.addEventListener("dragover", (e) => {
      if (!dragId || dragId === group.id) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      const dragging = list.querySelector<HTMLElement>(".reorder-row.dragging");
      if (!dragging) return;
      list.insertBefore(dragging, after ? row.nextSibling : row);
    });
    list.appendChild(row);
  }
  card.appendChild(list);
  main.appendChild(card);
}

async function persistOrder(list: HTMLElement): Promise<void> {
  const ids = Array.from(list.querySelectorAll<HTMLElement>(".reorder-row"))
    .map((r) => r.dataset.id ?? "")
    .filter(Boolean);
  const cfg = await getConfig();
  if (!cfg) return;
  const ordered = ids.map((id: string) => cfg.groups.find((g) => g.id === id)).filter(Boolean) as typeof cfg.groups;
  await setConfig({ ...cfg, groups: ordered });
  showSnackbar({ message: "Order saved" });
}

function renderGroupRow(group: Group): HTMLElement {
  const tint = resolveGroupTint(group.color);
  const row = el("div", { class: "reorder-row", "data-id": group.id });

  const handle = el("div", { class: "reorder-handle", "aria-hidden": "true" });
  handle.textContent = "⋮⋮";
  row.appendChild(handle);

  const swatch = el("div", {
    class: "group-row-swatch",
    style: `background:${tint.fill}; border: 1px solid ${tint.fg}40;`,
  });
  row.appendChild(swatch);

  const main = el("div", { class: "cmd-row-main" });
  main.appendChild(el("div", { class: "cmd-row-name" }, group.name));
  const cmdCount = group.commands?.length ?? 0;
  const parts: string[] = [group.id];
  if (cmdCount > 0) parts.push(`${cmdCount} command${cmdCount === 1 ? "" : "s"}`);
  main.appendChild(el("div", { class: "cmd-row-url" }, parts.join(" · ")));
  row.appendChild(main);

  const openEdit = (): void => navigate(`#/groups/${encodeURIComponent(group.id)}`);
  main.addEventListener("click", openEdit);

  return row;
}
