import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));

assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(manifest.name === "LocalArchive", "extension name must be LocalArchive");
assert(manifest.action.default_popup === "src/popup.html", "popup path is missing");
assert(manifest.side_panel.default_path === "src/library.html", "side panel path is missing");
assert(manifest.background.service_worker === "src/background.js", "background worker is missing");
assert(manifest.background.type === "module", "background worker must be an ES module");

const permissions = new Set(manifest.permissions || []);
for (const permission of ["activeTab", "contextMenus", "downloads", "scripting", "sidePanel"]) {
  assert(permissions.has(permission), `missing ${permission} permission`);
}
assert(!permissions.has("tabs"), "avoid tabs permission in MVP");
assert(!permissions.has("history"), "avoid history permission in MVP");
assert(!permissions.has("management"), "avoid management permission in MVP");
assert(!permissions.has("storage"), "avoid storage permission when using IndexedDB directly");
assert(!manifest.host_permissions, "avoid host permissions in MVP");

await readFile(join(root, manifest.action.default_popup), "utf8");
await readFile(join(root, manifest.side_panel.default_path), "utf8");
await readFile(join(root, manifest.background.service_worker), "utf8");

console.log("LocalArchive extension manifest is valid.");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
