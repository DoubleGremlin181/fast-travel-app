import type { Command, DeviceType, NormalizeStep, Pattern, Route } from "../../core/types.js";
import { showSnackbar } from "../../ui/snackbar.js";
import { el, screenHeader } from "../dom.js";
import { navigate } from "../router.js";
import {
  flattenGroups,
  getConfig,
  setConfig,
  validateCommand,
  findCommandById,
} from "../data.js";
import { withCommandUpsertedInGroup, withCommandDeleted } from "../../core/config-mutations.js";

const DEVICE_CHOICES: DeviceType[] = ["Windows", "MacOS", "Linux", "Android", "iOS", "Unknown"];
const NORMALIZE_CHOICES: NormalizeStep[] = [
  "trim",
  "collapseSpaces",
  "stripSpaces",
  "lower",
  "upper",
  "snake",
  "camel",
];

export async function renderCommandEditor(main: HTMLElement, id: string | null): Promise<void> {
  const isNew = id === null;
  const config = await getConfig();
  if (!config) return;

  let existing: Command | null = null;
  let existingGroupId = "";
  if (!isNew && id) {
    const found = findCommandById(config, id);
    if (!found) {
      navigate("#/commands");
      return;
    }
    existing = structuredClone(found.cmd);
    existingGroupId = found.group.id;
  }

  // Working draft
  const draft: Command = existing ?? {
    id: "",
    name: "",
    triggers: [],
    type: "standard",
    routes: [{ devices: "*", defaultUrl: "" }],
  };
  let groupId = existingGroupId || (flattenGroups(config).find((g) => !g.groups)?.id ?? "");

  main.appendChild(
    screenHeader(
      isNew ? "New command" : `Edit "${draft.name || draft.id}"`,
      undefined,
      { label: "Back to commands", hash: "#/commands" },
    ),
  );

  const form = el("div");

  // Triggers card
  form.appendChild(
    wrapCard(
      "Triggers",
      el(
        "div",
        null,
        formRow(
          "Triggers (comma-separated)",
          textField({
            placeholder: "e.g. yt, youtube",
            value: draft.triggers.join(", "),
            onInput: (v) => {
              draft.triggers = v
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t.length > 0);
            },
          }),
          "At least one trigger is required.",
        ),
      ),
    ),
  );

  // Details card
  form.appendChild(
    wrapCard(
      "Details",
      el(
        "div",
        null,
        formRow(
          "ID",
          textField({
            placeholder: "unique-id",
            value: draft.id,
            disabled: !isNew,
            onInput: (v) => { draft.id = v.trim(); },
          }),
          "Stable identifier. Cannot be changed once created.",
        ),
        formRow(
          "Name",
          textField({
            placeholder: "Display name",
            value: draft.name,
            onInput: (v) => { draft.name = v; },
          }),
        ),
        formRow(
          "Type",
          selectField({
            options: [
              { value: "standard", label: "Standard (has args or no args)" },
              { value: "prefix", label: "Prefix (e.g. $AAPL → stock page)" },
              { value: "redirect", label: "Redirect (no args, hard match only)" },
            ],
            value: draft.type,
            onChange: (v) => {
              draft.type = v as Command["type"];
            },
          }),
        ),
      ),
    ),
  );

  // Group card
  form.appendChild(
    wrapCard(
      "Group",
      el(
        "div",
        null,
        formRow(
          "Group",
          selectField({
            options: flattenGroups(config).map((g) => ({ value: g.id, label: g.name })),
            value: groupId,
            onChange: (v) => { groupId = v; },
          }),
          "Commands appear in this group on the new tab page.",
        ),
      ),
    ),
  );

  // Icons card
  form.appendChild(
    wrapCard(
      "Icons",
      el(
        "div",
        null,
        formRow(
          "Icon URL",
          textField({
            placeholder: "https://…/favicon.png",
            value: draft.iconUrl ?? "",
            onInput: (v) => {
              draft.iconUrl = v.trim() || undefined;
            },
          }),
          "Leave empty to auto-generate a colored monogram.",
        ),
        formRow(
          "Per-device icons (optional)",
          iconOverridesField(draft),
          "Override the icon above on specific devices (e.g. different favicon on mobile).",
        ),
      ),
    ),
  );

  // Suggestions API & normalize
  form.appendChild(
    wrapCard(
      "Advanced",
      el(
        "div",
        null,
        formRow(
          "Suggestions API URL (optional)",
          textField({
            placeholder: "https://example.com/suggest?q={query}",
            value: draft.suggestionsApi ?? "",
            onInput: (v) => {
              draft.suggestionsApi = v.trim() || undefined;
            },
          }),
          "Must include {query}. Falls back to the config default when empty.",
        ),
        formRow(
          "Normalize steps",
          normalizeField(draft),
          "Applied to arguments before URL substitution.",
        ),
      ),
    ),
  );

  // Routes
  const routesBody = el("div", { id: "routes-body" });
  const rerenderRoutes = (): void => {
    routesBody.replaceChildren();
    draft.routes.forEach((route, idx) => {
      routesBody.appendChild(routeCard(route, idx, () => {
        draft.routes.splice(idx, 1);
        if (draft.routes.length === 0) draft.routes.push({ devices: "*", defaultUrl: "" });
        rerenderRoutes();
      }));
    });
    const addRouteBtn = el("button", { class: "ghost" }, "+ Add route");
    addRouteBtn.addEventListener("click", () => {
      draft.routes.push({ devices: "*", defaultUrl: "" });
      rerenderRoutes();
    });
    routesBody.appendChild(addRouteBtn);
  };
  rerenderRoutes();
  form.appendChild(wrapCard("Routes", routesBody));

  // Status + actions
  const status = el("div", { class: "status" });
  const actions = el("div", { class: "btn-row right" });
  const saveBtn = el("button", { class: "primary" }, "Save command");
  actions.appendChild(saveBtn);

  if (!isNew) {
    const deleteBtn = el("button", { class: "danger" }, "Delete");
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Delete command "${draft.name || draft.id}"?`)) return;
      const cfg = await getConfig();
      if (!cfg) return;
      await setConfig(withCommandDeleted(cfg, draft.id));
      showSnackbar({ message: "Command deleted" });
      navigate("#/commands");
    });
    actions.insertBefore(deleteBtn, saveBtn);
  }

  saveBtn.addEventListener("click", async () => {
    // Normalize & validate draft
    const cleaned: Command = {
      ...draft,
      id: draft.id.trim(),
      name: draft.name.trim(),
      triggers: draft.triggers.map((t) => t.toLowerCase()).filter((t) => t.length > 0),
      routes: draft.routes.map(cleanRoute).filter((r) => r.defaultUrl.length > 0),
      iconOverrides: draft.iconOverrides
        ?.map((ov) => ({ devices: [...ov.devices], iconUrl: ov.iconUrl.trim() }))
        .filter((ov) => ov.devices.length > 0 && ov.iconUrl.length > 0),
    };
    if (cleaned.iconOverrides && cleaned.iconOverrides.length === 0) {
      cleaned.iconOverrides = undefined;
    }

    const errors: string[] = [];
    if (!cleaned.id) errors.push("ID is required.");
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(cleaned.id)) {
      errors.push("ID must start alphanumeric and contain only a-z, 0-9, -, _.");
    }
    if (!cleaned.name) errors.push("Name is required.");
    if (cleaned.triggers.length === 0) errors.push("At least one trigger is required.");
    if (cleaned.routes.length === 0) errors.push("At least one route with a defaultUrl is required.");
    errors.push(...validateCommand(cleaned));

    if (errors.length > 0) {
      status.className = "status error";
      status.textContent = errors[0];
      return;
    }

    const cfg = await getConfig();
    if (!cfg) return;
    await setConfig(withCommandUpsertedInGroup(cfg, groupId, cleaned));
    showSnackbar({ message: isNew ? "Command added" : "Command saved" });
    navigate("#/commands");
  });

  form.appendChild(el("div", null, status, actions));
  main.appendChild(form);
}

function wrapCard(title: string, body: Node): HTMLElement {
  return el(
    "section",
    { class: "card" },
    el("div", { class: "card-header" }, title),
    el("div", { class: "card-body" }, body),
  );
}

function formRow(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const row = el("div", { class: "form-row" });
  const lbl = el("label", null, label);
  row.appendChild(lbl);
  row.appendChild(control);
  if (hint) row.appendChild(el("div", { class: "form-hint" }, hint));
  return row;
}

function textField(opts: {
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  onInput: (v: string) => void;
}): HTMLInputElement {
  const input = el("input", {
    type: "text",
    placeholder: opts.placeholder ?? "",
    value: opts.value ?? "",
    disabled: opts.disabled === true ? "disabled" : null,
  }) as HTMLInputElement;
  input.addEventListener("input", () => opts.onInput(input.value));
  return input;
}

function selectField(opts: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}): HTMLSelectElement {
  const select = el("select") as HTMLSelectElement;
  for (const o of opts.options) {
    const opt = el("option", { value: o.value }, o.label) as HTMLOptionElement;
    if (o.value === opts.value) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener("change", () => opts.onChange(select.value));
  return select;
}

function normalizeField(draft: Command): HTMLElement {
  const container = el("div", { class: "tag-list", style: "margin-bottom:0;" });
  for (const step of NORMALIZE_CHOICES) {
    const active = draft.normalize?.includes(step) ?? false;
    const tag = el("button", { class: active ? "tag primary" : "tag", style: "padding:4px 10px;" }, step);
    tag.addEventListener("click", () => {
      draft.normalize = draft.normalize ?? [];
      const idx = draft.normalize.indexOf(step);
      if (idx >= 0) {
        draft.normalize.splice(idx, 1);
        if (draft.normalize.length === 0) draft.normalize = undefined;
      } else {
        draft.normalize.push(step);
      }
      tag.className = (draft.normalize?.includes(step) ?? false) ? "tag primary" : "tag";
    });
    container.appendChild(tag);
  }
  return container;
}

function iconOverridesField(draft: Command): HTMLElement {
  const container = el("div");
  const list = el("div");

  const render = (): void => {
    list.replaceChildren();
    const overrides = draft.iconOverrides ?? [];

    overrides.forEach((ov, rowIdx) => {
      // Devices used in OTHER rows — disable those chips in this row
      const usedElsewhere = new Set<DeviceType>();
      overrides.forEach((other, otherIdx) => {
        if (otherIdx === rowIdx) return;
        for (const d of other.devices) usedElsewhere.add(d);
      });

      const chipList = el("div", { class: "tag-list" });
      for (const dev of DEVICE_CHOICES) {
        const active = ov.devices.includes(dev);
        const disabled = !active && usedElsewhere.has(dev);
        const classes = disabled
          ? "tag disabled"
          : active
            ? "tag primary"
            : "tag";
        const chip = el(
          "button",
          { class: classes, disabled: disabled ? "disabled" : null },
          dev,
        );
        if (!disabled) {
          chip.addEventListener("click", () => {
            const i = ov.devices.indexOf(dev);
            if (i >= 0) ov.devices.splice(i, 1);
            else ov.devices.push(dev);
            render();
          });
        }
        chipList.appendChild(chip);
      }

      const urlInput = el("input", {
        type: "text",
        class: "icon-override-url",
        placeholder: "https://…/favicon.png",
        value: ov.iconUrl,
      }) as HTMLInputElement;

      const preview = el("img", {
        class: "icon-override-preview",
        src: ov.iconUrl || "",
        alt: "",
      }) as HTMLImageElement;

      urlInput.addEventListener("input", () => {
        ov.iconUrl = urlInput.value;
        preview.src = urlInput.value;
      });

      const removeBtn = el("button", { class: "btn danger" }, "Remove");
      removeBtn.addEventListener("click", () => {
        overrides.splice(rowIdx, 1);
        if (overrides.length === 0) draft.iconOverrides = undefined;
        else draft.iconOverrides = overrides;
        render();
      });

      const row = el(
        "div",
        { class: "icon-override-row" },
        chipList,
        urlInput,
        preview,
        removeBtn,
      );
      list.appendChild(row);
    });
  };

  const addBtn = el("button", { class: "btn icon-override-add" }, "+ Add per-device icon");
  addBtn.addEventListener("click", () => {
    draft.iconOverrides = draft.iconOverrides ?? [];
    draft.iconOverrides.push({ devices: [], iconUrl: "" });
    render();
  });

  render();
  container.appendChild(list);
  container.appendChild(addBtn);
  return container;
}

function routeCard(route: Route, idx: number, onRemove: () => void): HTMLElement {
  const devicesValue =
    route.devices === "*" ? "*" : route.devices.join(",");
  const body = el("div");

  body.appendChild(
    formRow(
      "Devices",
      textField({
        placeholder: "* or Windows,MacOS,Linux",
        value: devicesValue,
        onInput: (v) => {
          if (v.trim() === "*") route.devices = "*";
          else {
            const devs = v
              .split(",")
              .map((d) => d.trim())
              .filter((d): d is DeviceType => DEVICE_CHOICES.includes(d as DeviceType));
            route.devices = devs;
          }
        },
      }),
      "Use * for any device, or comma-separated: Windows, MacOS, Linux, Android, iOS, Unknown.",
    ),
  );

  body.appendChild(
    formRow(
      "Default URL",
      textField({
        placeholder: "https://…",
        value: route.defaultUrl,
        onInput: (v) => { route.defaultUrl = v.trim(); },
      }),
      "Where to go when the trigger is used alone (no args).",
    ),
  );

  body.appendChild(
    formRow(
      "Search URL",
      textField({
        placeholder: "https://…/search?q={query}",
        value: route.searchUrl ?? "",
        onInput: (v) => {
          route.searchUrl = v.trim() || undefined;
        },
      }),
      "Must include {query}. Used when args are provided and no pattern matches.",
    ),
  );

  body.appendChild(patternsField(route));

  body.appendChild(
    formRow(
      "Browsers (optional)",
      textField({
        placeholder: "chrome, firefox, safari",
        value: (route.browsers ?? []).join(", "),
        onInput: (v) => {
          const b = v.split(",").map((s) => s.trim()).filter(Boolean);
          route.browsers = b.length > 0 ? b : undefined;
        },
      }),
      "Comma-separated browser IDs. Leave empty to apply to all browsers.",
    ),
  );

  const header = el(
    "div",
    { class: "card-header", style: "display:flex;justify-content:space-between;align-items:center;" },
    `Route ${idx + 1}`,
  );
  const removeBtn = el("button", { class: "ghost" }, "Remove");
  removeBtn.addEventListener("click", onRemove);
  header.appendChild(removeBtn);

  return el(
    "section",
    { class: "card" },
    header,
    el("div", { class: "card-body" }, body),
  );
}

function patternsField(route: Route): HTMLElement {
  const container = el("div", { class: "form-row" });
  container.appendChild(el("label", null, "Patterns"));

  const listEl = el("div");
  const render = (): void => {
    listEl.replaceChildren();
    const patterns = route.patterns ?? [];
    patterns.forEach((pat, idx) => {
      const row = el(
        "div",
        { class: "inline-form", style: "margin-bottom:6px;" },
        textField({
          placeholder: "match (e.g. {id:11})",
          value: pat.match,
          onInput: (v) => { pat.match = v.trim(); },
        }),
        textField({
          placeholder: "url (use {name})",
          value: pat.url,
          onInput: (v) => { pat.url = v.trim(); },
        }),
      );
      const remove = el("button", { class: "ghost" }, "×");
      remove.addEventListener("click", () => {
        patterns.splice(idx, 1);
        if (patterns.length === 0) route.patterns = undefined;
        else route.patterns = patterns;
        render();
      });
      row.appendChild(remove);
      listEl.appendChild(row);
    });

    const addBtn = el("button", { class: "ghost" }, "+ Add pattern");
    addBtn.addEventListener("click", () => {
      route.patterns = route.patterns ?? [];
      route.patterns.push({ match: "", url: "" } as Pattern);
      render();
    });
    listEl.appendChild(addBtn);
  };
  render();
  container.appendChild(listEl);
  container.appendChild(
    el("div", { class: "form-hint" }, "Regex-like matchers. {name} captures any run; {name:3-11} limits length."),
  );
  return container;
}

function cleanRoute(r: Route): Route {
  const out: Route = {
    devices: r.devices,
    defaultUrl: r.defaultUrl.trim(),
  };
  if (r.searchUrl) out.searchUrl = r.searchUrl.trim();
  if (r.patterns && r.patterns.length > 0) {
    out.patterns = r.patterns.filter((p) => p.match && p.url);
    if (out.patterns.length === 0) delete out.patterns;
  }
  if (r.browsers && r.browsers.length > 0) out.browsers = [...r.browsers];
  return out;
}
