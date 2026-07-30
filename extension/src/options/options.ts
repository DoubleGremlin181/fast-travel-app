import { defineRoutes, init } from "./router.js";
import { renderAppearance } from "./screens/appearance.js";
import { renderConfiguration } from "./screens/configuration.js";
import { renderCommands } from "./screens/commands.js";
import { renderCommandEditor } from "./screens/command-editor.js";
import { renderGroups } from "./screens/groups.js";
import { renderIgnoreList } from "./screens/ignore-list.js";
import { renderImportExport } from "./screens/import-export.js";
import { renderHistory } from "./screens/history.js";
import { renderAbout } from "./screens/about.js";
import { renderSearchEngine } from "./screens/search-engine.js";
import { applyAppearance, getAppearance, subscribe as subscribeAppearance } from "../ui/appearance.js";

defineRoutes([
  { pattern: /^#\/appearance$/, render: (main) => renderAppearance(main) },
  { pattern: /^#\/configuration$/, render: (main) => renderConfiguration(main) },
  { pattern: /^#\/commands$/, render: (main) => renderCommands(main) },
  { pattern: /^#\/commands\/new$/, render: (main) => renderCommandEditor(main, null) },
  {
    pattern: /^#\/commands\/([^/]+)$/,
    render: (main, match) => renderCommandEditor(main, decodeURIComponent(match[1])),
  },
  { pattern: /^#\/groups$/, render: (main) => renderGroups(main) },
  { pattern: /^#\/groups\/new$/, render: (main) => import("./screens/group-editor.js").then((m) => m.renderGroupEditor(main, null)) },
  {
    pattern: /^#\/groups\/([^/]+)$/,
    render: (main, match) => import("./screens/group-editor.js").then((m) => m.renderGroupEditor(main, decodeURIComponent(match[1]))),
  },
  { pattern: /^#\/ignore-list$/, render: (main) => renderIgnoreList(main) },
  { pattern: /^#\/import-export$/, render: (main) => renderImportExport(main) },
  { pattern: /^#\/history$/, render: (main) => renderHistory(main) },
  { pattern: /^#\/search-engine$/, render: (main) => renderSearchEngine(main) },
  { pattern: /^#\/about$/, render: (main) => renderAbout(main) },
]);

const mainEl = document.getElementById("main");
if (mainEl) init(mainEl, "#/appearance");

// Version comes from the manifest so it can never drift from the release —
// this was a hardcoded string once and showed a stale 2.0.0.
const sidebarVersion = document.querySelector(".sidebar-version");
if (sidebarVersion) sidebarVersion.textContent = `v${chrome.runtime.getManifest().version}`;

// Theme the whole options surface on load (not just the #/appearance route) and
// keep it live — mirrors newtab.ts / popup.ts. Reads chrome.storage.sync (the
// source of truth) and corrects the pre-paint shim's OS fallback.
void getAppearance().then(applyAppearance);
subscribeAppearance(applyAppearance);
