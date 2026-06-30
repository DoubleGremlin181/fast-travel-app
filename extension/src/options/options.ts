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
import { renderLocalSearch } from "./screens/local-search.js";

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
  { pattern: /^#\/local-search$/, render: (main) => renderLocalSearch(main) },
  { pattern: /^#\/about$/, render: (main) => renderAbout(main) },
]);

const mainEl = document.getElementById("main");
if (mainEl) init(mainEl, "#/appearance");
