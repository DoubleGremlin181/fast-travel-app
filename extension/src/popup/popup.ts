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
  applyAppearance(await getAppearance());
  subscribeAppearance(applyAppearance);
}

void init();
