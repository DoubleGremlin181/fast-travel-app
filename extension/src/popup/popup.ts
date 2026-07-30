import { applyAppearance, getAppearance, subscribe as subscribeAppearance } from "../ui/appearance.js";

const openSettingsBtn = document.getElementById("open-settings");

function openSettings(): void {
  const url = chrome.runtime.getURL("options/options.html");
  if (chrome.tabs?.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank");
  }
  window.close();
}

openSettingsBtn?.addEventListener("click", openSettings);

async function init(): Promise<void> {
  // Version comes from the manifest so it can never drift from the release —
  // this was a hardcoded string once and showed a stale 2.0.0.
  const versionEl = document.querySelector(".popup-version");
  if (versionEl) versionEl.textContent = chrome.runtime.getManifest().version;
  applyAppearance(await getAppearance());
  subscribeAppearance(applyAppearance);
}

void init();
