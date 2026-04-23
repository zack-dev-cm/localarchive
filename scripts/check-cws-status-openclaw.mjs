#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const profile = process.env.OPENCLAW_BROWSER_PROFILE || "openclaw-cws-publisher";
const wsUrl = process.env.OPENCLAW_WS_URL || "ws://127.0.0.1:18789";
const token = process.env.OPENCLAW_TOKEN || "";
const publisherId = requiredEnv("CWS_PUBLISHER_ID");
const extensionId = requiredEnv("CWS_EXTENSION_ID");
const cwsUrl = `https://chrome.google.com/webstore/devconsole/${publisherId}/${extensionId}/edit/status`;
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const statusPath = join(repoRoot, "dist", "cws-status.json");

function run(args, options = {}) {
  const base = ["browser", "--url", wsUrl, "--browser-profile", profile, "--timeout", "60000"];
  if (token) {
    base.push("--token", token);
  }
  const result = spawnSync("openclaw", [...base, ...args], {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `openclaw exited ${result.status}`);
  }
  return result.stdout;
}

try {
  run(["start", "--json", "--timeout", "45000"]);
  run(["open", cwsUrl, "--json", "--timeout", "45000"]);
  run(["wait", "--load", "domcontentloaded", "--timeout-ms", "45000", "--json"]);
  const output = run([
    "evaluate",
    "--fn",
    "() => ({ url: location.href, title: document.title, text: document.body.innerText })",
  ]);
  const page = JSON.parse(output);
  const status = page.text.match(/Status:\s*([^\n]+)/)?.[1]?.trim()
    || page.text.match(/\n(Draft|Pending review|Published[^\n]*|Rejected[^\n]*)\n/)?.[1]
    || "unknown";
  const report = {
    ok: true,
    checkedAt: new Date().toISOString(),
    url: page.url,
    title: page.title,
    status,
  };
  await mkdir(dirname(statusPath), { recursive: true });
  await writeFile(statusPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
