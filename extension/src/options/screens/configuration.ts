import { el, screenHeader } from "../dom.js";
import { navigate } from "../router.js";
import { getConfig, setConfig, getConfigSourceState } from "../data.js";
import type { FastTravelConfig } from "../../core/types.js";

export async function renderConfiguration(main: HTMLElement): Promise<void> {
  main.appendChild(screenHeader("Configuration", "Commands, groups, default command, and config import/export."));

  const card = el("section", { class: "card" });

  // Commands row
  const cmdsRow = navRow("Commands");
  cmdsRow.addEventListener("click", () => navigate("#/commands"));
  card.appendChild(cmdsRow);
  card.appendChild(el("div", { class: "card-divider" }));

  // Groups row
  const groupsRow = navRow("Groups");
  groupsRow.addEventListener("click", () => navigate("#/groups"));
  card.appendChild(groupsRow);
  card.appendChild(el("div", { class: "card-divider" }));

  // Default command picker
  const config = await getConfig();
  if (config) {
    const pickerRow = defaultCommandPickerRow(config, async (trigger) => {
      const current = await getConfig();
      if (!current) return;
      await setConfig({ ...current, defaultCommand: trigger });
    });
    card.appendChild(pickerRow);
    card.appendChild(el("div", { class: "card-divider" }));

    const apiRow = defaultSuggestionsApiRow(config, async (url) => {
      const current = await getConfig();
      if (!current) return;
      await setConfig({ ...current, defaultSuggestionsApi: url || undefined });
    });
    card.appendChild(apiRow);
    card.appendChild(el("div", { class: "card-divider" }));

    const luckyRow = defaultLuckyUrlRow(config, async (url) => {
      const current = await getConfig();
      if (!current) return;
      await setConfig({ ...current, defaultLuckyUrl: url || undefined });
    });
    card.appendChild(luckyRow);
    card.appendChild(el("div", { class: "card-divider" }));
  }

  // Import / Export row — its subtitle surfaces sync state (mirrors Android):
  // when local edits have paused auto-refresh, that's called out here so it's
  // discoverable without opening the screen.
  const sourceState = await getConfigSourceState();
  const importRow = navRow(
    "Import / Export",
    sourceState.dirty ? "Local config · auto-refresh paused" : "Synced from remote",
  );
  importRow.addEventListener("click", () => navigate("#/import-export"));
  card.appendChild(importRow);

  main.appendChild(card);
}

function navRow(label: string, subtitle?: string): HTMLElement {
  const row = el("div", { class: "nav-list-item", tabindex: "0", role: "button" });
  const labelCol = el("div", { class: "nav-list-item-text" }, el("span", null, label));
  if (subtitle) labelCol.appendChild(el("span", { class: "nav-list-item-subtitle" }, subtitle));
  row.appendChild(labelCol);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "nav-chevron");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<polyline points="9 18 15 12 9 6"/>';
  row.appendChild(svg);
  return row;
}

function defaultSuggestionsApiRow(
  config: FastTravelConfig,
  onSave: (url: string) => Promise<void>,
): HTMLElement {
  const row = el("div", { class: "form-row", style: "padding:12px 16px;" });
  row.appendChild(el("label", { for: "default-api" }, "Default suggestions API"));
  const input = el("input", {
    id: "default-api",
    type: "text",
    placeholder: "https://…?q={query}",
    value: config.defaultSuggestionsApi ?? "",
  }) as HTMLInputElement;
  input.addEventListener("change", () => void onSave(input.value.trim()));
  row.appendChild(input);
  row.appendChild(el("div", { class: "form-hint" }, "Fallback when a command has no suggestions URL. Include {query}."));
  return row;
}

function defaultLuckyUrlRow(
  config: FastTravelConfig,
  onSave: (url: string) => Promise<void>,
): HTMLElement {
  const row = el("div", { class: "form-row", style: "padding:12px 16px;" });
  row.appendChild(el("label", { for: "default-lucky-url" }, "Default lucky URL (optional)"));
  const input = el("input", {
    id: "default-lucky-url",
    type: "text",
    placeholder: "https://www.google.com/search?q={query}&btnI",
    value: config.defaultLuckyUrl ?? "",
  }) as HTMLInputElement;
  input.addEventListener("change", () => void onSave(input.value.trim()));
  row.appendChild(input);
  row.appendChild(el("div", { class: "form-hint" }, "Must include {query}. Ctrl+Enter opens the first result via this URL."));
  return row;
}

function defaultCommandPickerRow(
  config: FastTravelConfig,
  onChange: (trigger: string) => Promise<void>,
): HTMLElement {
  const allTriggers: { trigger: string; name: string }[] = [];
  function walk(groups: typeof config.groups): void {
    for (const g of groups) {
      for (const cmd of g.commands ?? []) {
        for (const t of cmd.triggers) allTriggers.push({ trigger: t, name: cmd.name });
      }
      if (g.groups) walk(g.groups);
    }
  }
  walk(config.groups);

  const row = el("div", { class: "form-row", style: "padding:12px 16px;" });
  row.appendChild(el("label", { for: "default-cmd" }, "Default command"));
  const select = el("select", { id: "default-cmd" }) as HTMLSelectElement;
  for (const { trigger, name } of allTriggers) {
    const opt = el("option", { value: trigger }, `${trigger} — ${name}`) as HTMLOptionElement;
    if (trigger === config.defaultCommand) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => void onChange(select.value));
  row.appendChild(select);
  return row;
}
