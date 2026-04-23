#!/usr/bin/env node

import { createServer } from "node:http";
import { createWriteStream, existsSync, readdirSync } from "node:fs";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import net from "node:net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const distDir = join(repoRoot, "dist");
const e2eRoot = join(distDir, "e2e");
const stagedExtensionDir = join(e2eRoot, "extension");
const downloadDir = join(e2eRoot, "downloads");
const reportPath = join(distDir, "e2e-report.json");
const reportMarkdownPath = join(distDir, "e2e-report.md");
const chromePath = process.env.CHROME_PATH || findChromePath();

const assertions = [];
const artifacts = [];

async function main() {
  await prepareE2eDirs();
  await stageExtension();

  const server = await startFixtureServer();
  const port = await getFreePort();
  const userDataDir = join(e2eRoot, `chrome-profile-${Date.now()}`);
  let chrome;
  let cdp;

  try {
    chrome = launchChrome({ port, userDataDir });
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, 25000);
    cdp = new CdpConnection(version.webSocketDebuggerUrl);
    await cdp.open();

    const extensionId = await waitForExtensionId(cdp);
    assert(Boolean(extensionId), "loaded unpacked extension and found MV3 service worker");

    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadDir,
    });

    const fixtureUrl = `${server.origin}/article`;
    const page = await createPage(cdp, fixtureUrl);
    await waitForPageLoad(cdp, page.sessionId);
    await waitForText(cdp, page.sessionId, "LocalArchive E2E Fixture", 10000);
    assert(true, "opened reviewer-style readable article fixture");

    const firstPopup = await openActionPopup(cdp, page.sessionId, extensionId);
    await clickSelector(cdp, firstPopup.sessionId, "#captureButton");
    await waitForText(cdp, firstPopup.sessionId, "Saved 127.0.0.1", 15000);
    assert(true, "captured active page through the extension action popup");
    await cdp.send("Target.closeTarget", { targetId: firstPopup.targetId });

    await selectFixtureQuote(cdp, page.sessionId);
    const selectionPopup = await openActionPopup(cdp, page.sessionId, extensionId);
    await clickSelector(cdp, selectionPopup.sessionId, "#captureButton");
    await waitForText(cdp, selectionPopup.sessionId, "Saved 127.0.0.1", 15000);
    assert(true, "captured selected text through the extension action popup");
    await cdp.send("Target.closeTarget", { targetId: selectionPopup.targetId });

    const library = await createPage(cdp, `chrome-extension://${extensionId}/src/library.html`);
    await waitForPageLoad(cdp, library.sessionId);
    await waitForText(cdp, library.sessionId, "LocalArchive E2E Fixture", 10000);
    await waitForText(cdp, library.sessionId, "selection-e2e-unique", 10000);
    assert(true, "library shows captured page and merged selected passage");

    await typeIntoSelector(cdp, library.sessionId, "#searchInput", "selection-e2e-unique");
    await waitForText(cdp, library.sessionId, "1/1 matched", 10000);
    assert(true, "library search matches captured selection content");

    await clickSelector(cdp, library.sessionId, "#exportMarkdownButton");
    const markdownPath = await waitForDownload(/.+/, 15000);
    const markdown = await readFile(markdownPath, "utf8");
    assert(markdown.includes("LocalArchive E2E Fixture"), "Markdown export contains article title");
    assert(markdown.includes("selection-e2e-unique"), "Markdown export contains selected text");
    artifacts.push(markdownPath);

    const csvPath = join(e2eRoot, "pocket-import.csv");
    await writeFile(
      csvPath,
      [
        "title,url,time_added,tags",
        `Duplicate Fixture,${fixtureUrl}?utm_source=news,1710000000,pocket;duplicate`,
        "Pocket Only,https://example.com/pocket-only,1710000000,pocket",
        "",
      ].join("\n"),
    );
    await setFileInput(cdp, library.sessionId, "#csvInput", csvPath);
    await waitForText(cdp, library.sessionId, "Imported or merged 2", 10000);
    await clearInput(cdp, library.sessionId, "#searchInput");
    await waitForText(cdp, library.sessionId, "2 saved", 10000);
    await waitForText(cdp, library.sessionId, "Pocket Only", 10000);
    assert(true, "Pocket CSV import works and canonical duplicate is merged");

    await writeReport({
      ok: true,
      extensionId,
      fixtureUrl,
      stagedExtensionDir,
      assertions,
      artifacts,
    });
  } catch (error) {
    await writeReport({
      ok: false,
      error: error.stack || String(error),
      assertions,
      artifacts,
    });
    throw error;
  } finally {
    if (cdp) {
      cdp.close();
    }
    if (chrome) {
      chrome.kill("SIGTERM");
      await delay(1000);
      if (!chrome.killed) {
        chrome.kill("SIGKILL");
      }
    }
    await server.close();
  }
}

async function prepareE2eDirs() {
  await rm(e2eRoot, { recursive: true, force: true });
  await mkdir(stagedExtensionDir, { recursive: true });
  await mkdir(downloadDir, { recursive: true });
}

async function stageExtension() {
  await cp(join(repoRoot, "src"), join(stagedExtensionDir, "src"), { recursive: true });
  await cp(join(repoRoot, "assets"), join(stagedExtensionDir, "assets"), { recursive: true });
  const manifest = JSON.parse(await readFile(join(repoRoot, "manifest.json"), "utf8"));
  manifest.commands = {
    _execute_action: {
      suggested_key: {
        default: "Alt+Shift+L",
        mac: "Alt+Shift+L",
      },
      description: "Open LocalArchive",
    },
  };
  await writeFile(join(stagedExtensionDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function launchChrome({ port, userDataDir }) {
  const args = [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    `--disable-extensions-except=${stagedExtensionDir}`,
    `--load-extension=${stagedExtensionDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-features=Translate,MediaRouter",
    "--disable-popup-blocking",
    "--enable-logging=stderr",
    "about:blank",
  ];
  const child = spawn(chromePath, args, { stdio: ["ignore", "pipe", "pipe"] });
  const logPath = join(e2eRoot, "chrome.log");
  const log = createWriteStream(logPath);
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  artifacts.push(logPath);
  return child;
}

async function startFixtureServer() {
  const server = createServer((request, response) => {
    if (request.url === "/article") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>LocalArchive E2E Fixture</title>
    <meta name="description" content="Fixture used by the LocalArchive real-browser E2E suite.">
  </head>
  <body>
    <article>
      <h1>LocalArchive E2E Fixture</h1>
      <p>This article gives the extension enough readable content to extract and save.</p>
      <p id="quote">selection-e2e-unique proves that selected text capture survives the full popup flow.</p>
      <p>Additional article body text keeps word count and excerpt rendering realistic for reviewer testing.</p>
    </article>
  </body>
</html>`);
      return;
    }
    response.writeHead(404).end("not found");
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
  };
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function waitForExtensionId(cdp) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const targets = await cdp.send("Target.getTargets");
    const target = targets.targetInfos.find((info) =>
      info.type === "service_worker" && info.url.includes("/src/background.js")
    );
    const match = target && target.url.match(/^chrome-extension:\/\/([^/]+)\//);
    if (match) {
      return match[1];
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for LocalArchive service worker target.");
}

async function createPage(cdp, url) {
  const created = await cdp.send("Target.createTarget", { url: "about:blank" });
  const targetId = created.targetId;
  const attached = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Target.activateTarget", { targetId });
  await cdp.send("Page.navigate", { url }, sessionId, 3000).catch(() => {});
  await waitForLocation(cdp, sessionId, url, 15000);
  return { targetId, sessionId };
}

async function waitForPageLoad(cdp, sessionId) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const loaded = await evaluate(cdp, sessionId, "() => document.readyState === 'complete' || document.readyState === 'interactive'");
    if (loaded) {
      return;
    }
    await delay(200);
  }
  throw new Error("Timed out waiting for page load.");
}

async function waitForLocation(cdp, sessionId, url, timeout) {
  const expected = new URL(url);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const current = await evaluate(cdp, sessionId, "() => location.href").catch(() => "");
    if (current) {
      const actual = new URL(current);
      if (actual.origin === expected.origin && actual.pathname === expected.pathname) {
        return;
      }
    }
    await delay(200);
  }
  throw new Error(`Timed out navigating to ${url}`);
}

async function openActionPopup(cdp, pageSessionId, extensionId) {
  await cdp.send("Runtime.evaluate", { expression: "window.focus()" }, pageSessionId);
  const popupUrl = `chrome-extension://${extensionId}/src/popup.html`;
  await cdp.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "L",
    code: "KeyL",
    windowsVirtualKeyCode: 76,
    nativeVirtualKeyCode: 76,
    modifiers: 9,
  }, pageSessionId).catch(() => {});
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "L",
    code: "KeyL",
    windowsVirtualKeyCode: 76,
    nativeVirtualKeyCode: 76,
    modifiers: 9,
  }, pageSessionId).catch(() => {});

  let target = await waitForTarget(cdp, (info) => info.url === popupUrl, 3000).catch(() => null);
  if (!target) {
    await openPopupFromServiceWorker(cdp, extensionId);
    target = await waitForTarget(cdp, (info) => info.url === popupUrl, 7000);
  }
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Page.enable", {}, sessionId).catch(() => {});
  return { targetId: target.targetId, sessionId };
}

async function openPopupFromServiceWorker(cdp, extensionId) {
  const targets = await cdp.send("Target.getTargets");
  const worker = targets.targetInfos.find((info) =>
    info.type === "service_worker"
    && info.url === `chrome-extension://${extensionId}/src/background.js`
  );
  if (!worker) {
    throw new Error("LocalArchive service worker disappeared before popup open.");
  }
  const attached = await cdp.send("Target.attachToTarget", { targetId: worker.targetId, flatten: true });
  try {
    await cdp.send("Runtime.enable", {}, attached.sessionId);
    const result = await evaluate(cdp, attached.sessionId, `async () => {
      if (!chrome.action?.openPopup) {
        return "chrome.action.openPopup is unavailable";
      }
      await chrome.action.openPopup();
      return "opened";
    }`);
    if (result !== "opened") {
      throw new Error(String(result));
    }
  } finally {
    await cdp.send("Target.detachFromTarget", { sessionId: attached.sessionId }).catch(() => {});
  }
}

async function waitForTarget(cdp, predicate, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const targets = await cdp.send("Target.getTargets");
    const target = targets.targetInfos.find(predicate);
    if (target) {
      return target;
    }
    await delay(200);
  }
  throw new Error("Timed out waiting for target.");
}

async function clickSelector(cdp, sessionId, selector) {
  const rect = await evaluate(cdp, sessionId, `(selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }`, selector);
  if (!rect) {
    throw new Error(`Missing selector: ${selector}`);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rect.x,
    y: rect.y,
    button: "none",
  }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  }, sessionId);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: rect.x,
    y: rect.y,
    button: "left",
    clickCount: 1,
  }, sessionId);
}

async function typeIntoSelector(cdp, sessionId, selector, text) {
  await clickSelector(cdp, sessionId, selector);
  await cdp.send("Input.insertText", { text }, sessionId);
}

async function clearInput(cdp, sessionId, selector) {
  await evaluate(cdp, sessionId, `(selector) => {
    const el = document.querySelector(selector);
    el.value = "";
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
  }`, selector);
}

async function selectFixtureQuote(cdp, sessionId) {
  await evaluate(cdp, sessionId, `() => {
    const node = document.querySelector("#quote");
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return selection.toString();
  }`);
}

async function setFileInput(cdp, sessionId, selector, filePath) {
  const documentNode = await cdp.send("DOM.getDocument", { depth: 1 }, sessionId);
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: documentNode.root.nodeId,
    selector,
  }, sessionId);
  if (!nodeId) {
    throw new Error(`Missing file input: ${selector}`);
  }
  await cdp.send("DOM.setFileInputFiles", { nodeId, files: [filePath] }, sessionId);
}

async function waitForText(cdp, sessionId, text, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const bodyText = await evaluate(cdp, sessionId, "() => document.body.innerText");
    if (String(bodyText || "").includes(text)) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}

async function waitForDownload(pattern, timeout) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const entries = await import("node:fs/promises").then((fs) => fs.readdir(downloadDir));
    for (const entry of entries) {
      if (pattern.test(entry) && !entry.endsWith(".crdownload")) {
        const filePath = join(downloadDir, entry);
        const fileStat = await stat(filePath);
        if (fileStat.size > 0) {
          return filePath;
        }
      }
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for download matching ${pattern}`);
}

async function evaluate(cdp, sessionId, functionSource, argument) {
  const expression = argument === undefined
    ? `(${functionSource})()`
    : `(${functionSource})(${JSON.stringify(argument)})`;
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return response.result.value;
}

async function waitForJson(url, timeout) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || "no response"}`);
}

function assert(condition, message) {
  assertions.push({ ok: Boolean(condition), message });
  if (!condition) {
    throw new Error(message);
  }
}

function findChromePath() {
  const candidates = [
    ...findPlaywrightChromes(),
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Could not find Chrome. Set CHROME_PATH to a Chrome for Testing or Chromium executable.");
  }
  return found;
}

function findPlaywrightChromes() {
  const cacheDir = join(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cacheDir)) {
    return [];
  }
  return readdirSync(cacheDir)
    .filter((name) => name.startsWith("chromium-"))
    .sort()
    .reverse()
    .flatMap((name) => [
      join(cacheDir, name, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
      join(cacheDir, name, "chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
    ]);
}

async function writeReport(report) {
  await mkdir(distDir, { recursive: true });
  const fullReport = {
    generatedAt: new Date().toISOString(),
    chromePath,
    ...report,
  };
  await writeFile(reportPath, `${JSON.stringify(fullReport, null, 2)}\n`);
  const lines = [
    "# LocalArchive E2E Report",
    "",
    `Generated: ${fullReport.generatedAt}`,
    `Status: ${fullReport.ok ? "PASS" : "FAIL"}`,
    fullReport.extensionId ? `Extension ID: ${fullReport.extensionId}` : "",
    "",
    "## Assertions",
    "",
    ...assertions.map((item) => `- ${item.ok ? "PASS" : "FAIL"}: ${item.message}`),
    "",
    "## Artifacts",
    "",
    ...artifacts.map((item) => `- ${item}`),
    "",
  ].filter(Boolean);
  if (fullReport.error) {
    lines.push("## Error", "", "```text", fullReport.error, "```", "");
  }
  await writeFile(reportMarkdownPath, `${lines.join("\n")}\n`);
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolvePromise, rejectPromise) => {
      this.ws.addEventListener("open", resolvePromise, { once: true });
      this.ws.addEventListener("error", rejectPromise, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${message.error.data || ""}`));
      } else {
        pending.resolve(message.result || {});
      }
    });
  }

  send(method, params = {}, sessionId = null, timeout = 15000) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`CDP command timed out: ${method}`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolvePromise(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectPromise(error);
        },
      });
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
