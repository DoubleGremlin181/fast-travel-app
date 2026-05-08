import { el, screenHeader, emptyState } from "../dom.js";
import { addToIgnoreList, getIgnoreList, removeFromIgnoreList } from "../data.js";
import {
  AUTO_IGNORE_THRESHOLD_MAX,
  AUTO_IGNORE_THRESHOLD_MIN,
  clearAllCandidates,
  getAutoIgnoreThreshold,
  loadCandidates,
  removeCandidate,
  setAutoIgnoreThreshold,
  setDoNotIgnore,
} from "../../core/auto-ignore-store.js";

type RowState = "active" | "below" | "red";

interface CandidateRow {
  trigger: string;
  count: number;
  doNotIgnore: boolean;
  state: RowState;
}

export async function renderIgnoreList(main: HTMLElement): Promise<void> {
  main.appendChild(
    screenHeader(
      "Ignore list",
      'Triggers listed here are never offered as typo suggestions. Auto-ignore tracking counts your "search anyway" dismissals and promotes triggers to the permanent list when they cross the threshold.',
    ),
  );

  // Section containers get the .expanded class when open.
  const permanentSection = el("section", {
    class: "card ignore-section expanded",
    "data-section": "permanent",
  });
  const permanentHeader = buildSectionHeader("Permanent", permanentSection);
  const permanentBody = el("div", { class: "card-body section-body" });
  permanentSection.appendChild(permanentHeader);
  permanentSection.appendChild(permanentBody);

  const autoSection = el("section", {
    class: "card ignore-section expanded",
    "data-section": "auto",
  });
  const autoHeader = buildSectionHeader("Auto-ignore tracking", autoSection);
  const autoBody = el("div", { class: "card-body section-body" });
  autoSection.appendChild(autoHeader);
  autoSection.appendChild(autoBody);

  main.appendChild(permanentSection);
  main.appendChild(autoSection);

  // --- Permanent body ---
  const newItemInput = el("input", {
    type: "text",
    placeholder: "Add a term…",
    id: "ignore-add-input",
  }) as HTMLInputElement;
  const addBtn = el("button", { class: "primary", title: "Add" }, "+");
  const addRow = el(
    "div",
    { class: "inline-form", style: "margin-bottom:12px;" },
    newItemInput,
    addBtn,
  );
  permanentBody.appendChild(addRow);
  const permanentList = el("div", { class: "ignore-list permanent-list" });
  permanentBody.appendChild(permanentList);

  // --- Auto body ---
  const currentThreshold = await getAutoIgnoreThreshold();
  const thresholdValueEl = el(
    "span",
    { class: "threshold-number" },
    String(currentThreshold),
  );
  const decBtn = el(
    "button",
    { class: "stepper-btn", title: "Decrease threshold" },
    "−",
  ) as HTMLButtonElement;
  const incBtn = el(
    "button",
    { class: "stepper-btn", title: "Increase threshold" },
    "+",
  ) as HTMLButtonElement;
  const stepper = el("div", { class: "stepper" }, decBtn, thresholdValueEl, incBtn);
  const thresholdRow = el(
    "div",
    { class: "threshold-row" },
    el(
      "div",
      { class: "threshold-text" },
      el("div", { class: "threshold-title" }, "Threshold"),
      el(
        "div",
        { class: "threshold-hint" },
        "Dismissals before auto-adding a trigger",
      ),
    ),
    stepper,
  );
  autoBody.appendChild(thresholdRow);

  const resetAllBtn = el(
    "button",
    { class: "btn danger full-width reset-all", type: "button" },
    "🗑 Reset all counts",
  ) as HTMLButtonElement;
  autoBody.appendChild(resetAllBtn);

  const autoList = el("div", { class: "ignore-list candidate-list" });
  autoBody.appendChild(autoList);

  let threshold = currentThreshold;

  function updateStepperState(): void {
    decBtn.disabled = threshold <= AUTO_IGNORE_THRESHOLD_MIN;
    incBtn.disabled = threshold >= AUTO_IGNORE_THRESHOLD_MAX;
    thresholdValueEl.textContent = String(threshold);
  }
  updateStepperState();

  async function adjustThreshold(delta: number): Promise<void> {
    const next = Math.min(
      AUTO_IGNORE_THRESHOLD_MAX,
      Math.max(AUTO_IGNORE_THRESHOLD_MIN, threshold + delta),
    );
    if (next === threshold) return;
    threshold = next;
    updateStepperState();
    await setAutoIgnoreThreshold(next);
    refresh(); // state pills (active/below) depend on threshold
  }
  decBtn.addEventListener("click", () => void adjustThreshold(-1));
  incBtn.addEventListener("click", () => void adjustThreshold(1));

  resetAllBtn.addEventListener("click", async () => {
    // Native confirm — matches "no custom modal" directive.
    if (!confirm("Reset all dismissal counts? Permanent entries are unaffected.")) return;
    await clearAllCandidates();
    refresh();
  });

  async function submitAdd(): Promise<void> {
    const v = newItemInput.value.trim();
    if (!v) return;
    await addToIgnoreList(v);
    // Manual add wins over any red flag / pending count — delete the candidate.
    await removeCandidate(v);
    newItemInput.value = "";
    refresh();
  }
  addBtn.addEventListener("click", () => void submitAdd());
  newItemInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submitAdd();
    }
  });

  async function refresh(): Promise<void> {
    const [list, candidates] = await Promise.all([getIgnoreList(), loadCandidates()]);

    // ----- Permanent list -----
    const permanentSorted = [...list].map((s) => s.toLowerCase()).sort();
    permanentList.replaceChildren();
    if (permanentSorted.length === 0) {
      permanentList.appendChild(
        emptyState(
          "No permanent entries",
          "Add one above, or confirm an auto-tracked trigger below.",
        ),
      );
    } else {
      for (const trigger of permanentSorted) {
        permanentList.appendChild(
          renderPermanentRow(trigger, async () => {
            await removeFromIgnoreList(trigger);
            refresh();
          }),
        );
      }
    }

    // ----- Candidate list -----
    const candidateEntries: CandidateRow[] = Object.entries(candidates).map(
      ([trigger, c]) => {
        const state: RowState = c.doNotIgnore
          ? "red"
          : c.count >= threshold
            ? "active"
            : "below";
        return { trigger, count: c.count, doNotIgnore: c.doNotIgnore, state };
      },
    );
    candidateEntries.sort(
      (a, b) => b.count - a.count || a.trigger.localeCompare(b.trigger),
    );
    autoList.replaceChildren();
    resetAllBtn.disabled = candidateEntries.length === 0;

    if (candidateEntries.length === 0) {
      autoList.appendChild(
        emptyState(
          "No tracked triggers yet",
          "Dismiss a typo suggestion to start tracking.",
        ),
      );
    } else {
      for (const entry of candidateEntries) {
        autoList.appendChild(
          renderCandidateRow(entry, {
            onConfirm: async () => {
              await addToIgnoreList(entry.trigger);
              await removeCandidate(entry.trigger);
              refresh();
            },
            onToggleDni: async () => {
              await setDoNotIgnore(entry.trigger, !entry.doNotIgnore);
              refresh();
            },
            onRemove: async () => {
              await removeCandidate(entry.trigger);
              refresh();
            },
          }),
        );
      }
    }
  }

  await refresh();
}

function buildSectionHeader(label: string, section: HTMLElement): HTMLElement {
  const caret = el("span", { class: "caret", "aria-hidden": "true" }, "▾");
  const header = el(
    "div",
    {
      class: "card-header section-header",
      role: "button",
      tabindex: "0",
    },
    caret,
    " ",
    label,
  );
  function toggle(): void {
    section.classList.toggle("expanded");
    caret.textContent = section.classList.contains("expanded") ? "▾" : "▸";
  }
  header.addEventListener("click", toggle);
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  return header;
}

function renderPermanentRow(trigger: string, onRemove: () => void): HTMLElement {
  const row = el("div", { class: "ignore-row permanent-row" });
  row.appendChild(el("span", { class: "ignore-trigger" }, trigger));
  const actions = el("span", { class: "ignore-actions" });
  const removeBtn = el(
    "button",
    {
      class: "icon-btn danger",
      title: "Remove",
      "aria-label": `Remove ${trigger}`,
    },
    "×",
  );
  removeBtn.addEventListener("click", onRemove);
  actions.appendChild(removeBtn);
  row.appendChild(actions);
  return row;
}

function renderCandidateRow(
  entry: CandidateRow,
  handlers: {
    onConfirm: () => void;
    onToggleDni: () => void;
    onRemove: () => void;
  },
): HTMLElement {
  const row = el("div", { class: `ignore-row candidate-row ${entry.state}` });

  if (entry.state === "red") {
    row.appendChild(
      el("span", { class: "state-icon", "aria-hidden": "true" }, "⊘"),
    );
  }
  row.appendChild(el("span", { class: "ignore-trigger" }, entry.trigger));

  // Count badge
  row.appendChild(
    el(
      "span",
      {
        class: "ignore-count",
        title: `${entry.count} dismissal${entry.count === 1 ? "" : "s"}`,
      },
      `×${entry.count}`,
    ),
  );

  // State label
  const stateLabel =
    entry.state === "active"
      ? "active"
      : entry.state === "red"
        ? "never ignored"
        : "below threshold";
  row.appendChild(el("span", { class: "state-label" }, stateLabel));

  // Hover-reveal actions
  const actions = el("span", { class: "ignore-actions" });
  const confirmBtn = el(
    "button",
    {
      class: "icon-btn primary",
      title: "Confirm as permanent",
      "aria-label": `Confirm ${entry.trigger} as permanent`,
    },
    "✓",
  );
  confirmBtn.addEventListener("click", handlers.onConfirm);
  actions.appendChild(confirmBtn);

  const dniBtn = el(
    "button",
    {
      class: `icon-btn ${entry.doNotIgnore ? "active" : ""}`.trim(),
      title: entry.doNotIgnore ? "Unflag 'Do not ignore'" : "Flag as 'Do not ignore'",
      "aria-label": entry.doNotIgnore
        ? `Unflag ${entry.trigger}`
        : `Flag ${entry.trigger} as do not ignore`,
    },
    "⊘",
  );
  dniBtn.addEventListener("click", handlers.onToggleDni);
  actions.appendChild(dniBtn);

  const removeBtn = el(
    "button",
    {
      class: "icon-btn danger",
      title: "Remove from tracking",
      "aria-label": `Remove ${entry.trigger} from tracking`,
    },
    "×",
  );
  removeBtn.addEventListener("click", handlers.onRemove);
  actions.appendChild(removeBtn);

  row.appendChild(actions);
  return row;
}
