import { saveCapturedTab } from "./capture.js";

const captureButton = document.querySelector("#captureButton");
const libraryButton = document.querySelector("#libraryButton");
const statusNode = document.querySelector("#status");

captureButton.addEventListener("click", captureActivePage);
libraryButton.addEventListener("click", openLibrary);

async function captureActivePage() {
  setStatus("Capturing");
  captureButton.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const article = await saveCapturedTab(tab);
    setStatus(`Saved ${article.domain || "page"}`);
  } catch (error) {
    setStatus(error.message || "Capture failed");
  } finally {
    captureButton.disabled = false;
  }
}

async function openLibrary() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (chrome.sidePanel && chrome.sidePanel.open) {
      await chrome.sidePanel.open({ windowId: currentWindow.id });
    } else {
      await chrome.tabs.create({ url: chrome.runtime.getURL("src/library.html") });
    }
  } catch {
    await chrome.tabs.create({ url: chrome.runtime.getURL("src/library.html") });
  }
}

function setStatus(message) {
  statusNode.textContent = message;
}
