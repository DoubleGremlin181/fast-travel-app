import { el, screenHeader, card } from "../dom.js";
import { showSnackbar } from "../../ui/snackbar.js";
import {
  getSuggestionsPrefs,
  setSuggestionsPrefs,
  type SuggestionsPrefs,
} from "../../core/suggestions-prefs.js";
import {
  hasHistoryPermission,
  requestHistoryPermission,
} from "../../core/permissions.js";

export interface BrowserHistoryToggleDeps {
  request: () => Promise<boolean>;
  setPrefs: (p: Partial<SuggestionsPrefs>) => Promise<void>;
}

/**
 * Decide the browser-history toggle's final state. Enabling requests the
 * optional "history" permission FIRST and only persists the pref when
 * granted; a denial leaves prefs untouched so the toggle reverts. Disabling
 * just clears the pref (the permission stays granted so re-enabling doesn't
 * re-prompt). Pure so unit tests cover grant/deny/off with a mocked seam.
 */
export async function applyBrowserHistoryToggle(
  desired: boolean,
  deps: BrowserHistoryToggleDeps,
): Promise<boolean> {
  if (!desired) {
    await deps.setPrefs({ includeBrowserHistory: false });
    return false;
  }
  const granted = await deps.request();
  if (!granted) return false;
  await deps.setPrefs({ includeBrowserHistory: true });
  return true;
}

function toggleRow(opts: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checkbox: HTMLInputElement) => void;
}): HTMLElement {
  const checkbox = el("input", {
    type: "checkbox",
    class: "toggle-input",
  }) as HTMLInputElement;
  checkbox.checked = opts.checked;
  checkbox.addEventListener("change", () => opts.onChange(checkbox));

  return el(
    "div",
    { class: "setting-toggle-row" },
    el(
      "div",
      { class: "setting-toggle-text" },
      el("div", { class: "setting-toggle-title" }, opts.title),
      el("div", { class: "setting-toggle-desc" }, opts.description),
    ),
    el("label", { class: "toggle-switch" }, checkbox, el("span", { class: "toggle-track" })),
  );
}

export async function renderSuggestionsScreen(main: HTMLElement): Promise<void> {
  main.appendChild(
    screenHeader(
      "Suggestions",
      "Choose which sources blend into the new-tab suggestion dropdown.",
    ),
  );

  const [prefs, permissionGranted] = await Promise.all([
    getSuggestionsPrefs(),
    hasHistoryPermission(),
  ]);

  // Repair a stale pref (e.g. permission revoked in the browser's own UI):
  // without this, a later out-of-band re-grant would silently reactivate
  // browser-history blending with no action taken in Fast Travel.
  if (prefs.includeBrowserHistory && !permissionGranted) {
    prefs.includeBrowserHistory = false;
    void setSuggestionsPrefs({ includeBrowserHistory: false });
  }

  const body = el("div", { class: "suggestions-settings" });

  body.appendChild(
    toggleRow({
      title: "Fast Travel history",
      description:
        "Show your matching past searches alongside engine suggestions while you type.",
      checked: prefs.blendFtHistory,
      onChange: (checkbox) => {
        const next = checkbox.checked;
        setSuggestionsPrefs({ blendFtHistory: next }).catch((err: unknown) => {
          checkbox.checked = !next;
          showSnackbar({ message: `Failed to save: ${(err as Error).message}` });
        });
      },
    }),
  );

  body.appendChild(
    toggleRow({
      title: "Browser history",
      description:
        "Also match your full browser history. Asks the browser for the optional “history” permission the first time.",
      checked: prefs.includeBrowserHistory && permissionGranted,
      onChange: (checkbox) => {
        const desired = checkbox.checked;
        // The permission request MUST be the first async call in the gesture
        // handler — no awaits before it — or the browser rejects it.
        applyBrowserHistoryToggle(desired, {
          request: requestHistoryPermission,
          setPrefs: setSuggestionsPrefs,
        })
          .then((finalState) => {
            checkbox.checked = finalState;
            if (desired && !finalState) {
              showSnackbar({
                message: "Permission declined — browser history stays off",
              });
            }
          })
          .catch((err: unknown) => {
            checkbox.checked = false;
            showSnackbar({ message: `Failed to save: ${(err as Error).message}` });
          });
      },
    }),
  );

  body.appendChild(
    el(
      "p",
      { class: "suggestions-privacy-note" },
      "All matching happens on this device. Your history is never sent to the suggestions API or anywhere else.",
    ),
  );

  main.appendChild(card("Suggestion sources", body));
}
