import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest keeps MVP permissions narrow", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(
    [...manifest.permissions].sort(),
    ["activeTab", "contextMenus", "downloads", "scripting", "sidePanel", "storage"].sort(),
  );
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.action.default_popup, "src/popup.html");
  assert.equal(manifest.side_panel.default_path, "src/library.html");
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.equal(manifest.background.type, "module");
});
