import type { Group } from "../../core/types.js";
import {
  withGroupAdded,
  withGroupUpdated,
  withGroupDeleted,
} from "../../core/config-mutations.js";
import { showSnackbar } from "../../ui/snackbar.js";
import { el, screenHeader } from "../dom.js";
import { navigate } from "../router.js";
import {
  findGroupById,
  getConfig,
  setConfig,
} from "../data.js";

const COLOR_PRESETS = [
  "#4285F4", "#DB4437", "#0F9D58", "#F4B400",
  "#AA47BC", "#0097A7", "#FF6D00", "#EC407A",
  "#5E35B1", "#00ACC1",
];

export async function renderGroupEditor(main: HTMLElement, id: string | null): Promise<void> {
  const isNew = id === null;
  const config = await getConfig();
  if (!config) return;

  let existing: Group | null = null;
  if (!isNew && id) {
    existing = findGroupById(config, id);
    if (!existing) {
      navigate("#/groups");
      return;
    }
  }

  const draft = {
    id: existing?.id ?? "",
    name: existing?.name ?? "",
    color: existing?.color ?? COLOR_PRESETS[0],
  };

  main.appendChild(
    screenHeader(
      isNew ? "New group" : `Edit "${draft.name || draft.id}"`,
      undefined,
      { label: "Back to groups", hash: "#/groups" },
    ),
  );

  const form = el("div");

  const idCard = el("section", { class: "card" });
  idCard.appendChild(el("div", { class: "card-header" }, "Identity"));
  const idBody = el("div", { class: "card-body" });

  const idInput = el("input", {
    type: "text",
    placeholder: "my-group",
    value: draft.id,
    disabled: isNew ? null : "disabled",
  }) as HTMLInputElement;
  idInput.addEventListener("input", () => { draft.id = idInput.value.trim(); });

  const nameInput = el("input", {
    type: "text",
    placeholder: "Display name",
    value: draft.name,
  }) as HTMLInputElement;
  nameInput.addEventListener("input", () => { draft.name = nameInput.value; });

  idBody.appendChild(formRow("ID", idInput, "Stable identifier. Cannot be changed once created."));
  idBody.appendChild(formRow("Name", nameInput));
  idCard.appendChild(idBody);
  form.appendChild(idCard);

  // Color swatches
  const colorCard = el("section", { class: "card" });
  colorCard.appendChild(el("div", { class: "card-header" }, "Color"));
  const colorBody = el("div", { class: "card-body" });
  const swatchGroup = el("div", { class: "color-swatch-group" });
  for (const hex of COLOR_PRESETS) {
    const swatch = el("button", {
      type: "button",
      class: hex.toLowerCase() === draft.color.toLowerCase() ? "color-swatch selected" : "color-swatch",
      style: `background:${hex};`,
      title: hex,
      "data-color": hex,
      "aria-label": `Color ${hex}`,
    });
    swatch.addEventListener("click", () => {
      draft.color = hex;
      swatchGroup.querySelectorAll<HTMLElement>(".color-swatch").forEach((s) => {
        s.classList.toggle("selected", s.getAttribute("data-color")?.toLowerCase() === hex.toLowerCase());
      });
      customInput.value = hex;
    });
    swatchGroup.appendChild(swatch);
  }
  colorBody.appendChild(swatchGroup);

  const customInput = el("input", {
    type: "text",
    value: draft.color,
    placeholder: "#RRGGBB",
  }) as HTMLInputElement;
  customInput.style.maxWidth = "160px";
  customInput.style.marginTop = "12px";
  customInput.addEventListener("input", () => {
    const v = customInput.value.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
      draft.color = v;
      swatchGroup.querySelectorAll<HTMLElement>(".color-swatch").forEach((s) => {
        s.classList.toggle("selected", s.getAttribute("data-color")?.toLowerCase() === v.toLowerCase());
      });
    }
  });
  colorBody.appendChild(customInput);

  colorCard.appendChild(colorBody);
  form.appendChild(colorCard);

  // Actions
  const status = el("div", { class: "status" });
  const actions = el("div", { class: "btn-row right" });
  const saveBtn = el("button", { class: "primary" }, isNew ? "Create group" : "Save changes");
  actions.appendChild(saveBtn);

  if (!isNew) {
    const deleteBtn = el("button", { class: "danger" }, "Delete");
    deleteBtn.addEventListener("click", async () => {
      if (!existing) return;
      const cmdCount = existing.commands?.length ?? 0;
      const msg = cmdCount > 0
        ? `Delete group "${existing.name}" and all ${cmdCount} ${cmdCount === 1 ? "command" : "commands"} in it?`
        : `Delete group "${existing.name}"?`;
      if (!confirm(msg)) return;
      const cfg = await getConfig();
      if (!cfg) return;
      await setConfig(withGroupDeleted(cfg, existing.id));
      showSnackbar({ message: "Group deleted" });
      navigate("#/groups");
    });
    actions.insertBefore(deleteBtn, saveBtn);
  }

  saveBtn.addEventListener("click", async () => {
    const cleaned = {
      id: draft.id.trim(),
      name: draft.name.trim(),
      color: draft.color,
    };
    if (!cleaned.id) {
      status.className = "status error";
      status.textContent = "ID is required.";
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-_]*[a-z0-9])?$/.test(cleaned.id)) {
      status.className = "status error";
      status.textContent = "ID must be kebab-case (a-z, 0-9, -, _).";
      return;
    }
    if (!cleaned.name) {
      status.className = "status error";
      status.textContent = "Name is required.";
      return;
    }
    const cfg = await getConfig();
    if (!cfg) return;
    if (isNew) {
      await setConfig(withGroupAdded(cfg, { id: cleaned.id, name: cleaned.name, color: cleaned.color, commands: [], groups: [] }));
    } else {
      await setConfig(withGroupUpdated(cfg, cleaned.id, cleaned.name, cleaned.color));
    }
    showSnackbar({ message: isNew ? "Group created" : "Group saved" });
    navigate("#/groups");
  });

  form.appendChild(el("div", null, status, actions));
  main.appendChild(form);
}

function formRow(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const row = el("div", { class: "form-row" });
  row.appendChild(el("label", null, label));
  row.appendChild(control);
  if (hint) row.appendChild(el("div", { class: "form-hint" }, hint));
  return row;
}
