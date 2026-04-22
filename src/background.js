import { saveCapturedTab } from "./capture.js";

const MENU_SAVE_PAGE = "localarchive-save-page";
const MENU_SAVE_SELECTION = "localarchive-save-selection";

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);
chrome.contextMenus.onClicked.addListener((info, tab) => {
  saveFromContextMenu(info, tab).catch(() => {
    setBadge(tab, "ERR");
  });
});

async function setupContextMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_SAVE_PAGE,
    title: "Save page to LocalArchive",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: MENU_SAVE_SELECTION,
    title: "Save selected text to LocalArchive",
    contexts: ["selection"],
  });
}

async function saveFromContextMenu(info, tab) {
  await saveCapturedTab(tab, {
    allowFallback: true,
    contextInfo: info,
    selectionText: info.menuItemId === MENU_SAVE_SELECTION ? info.selectionText : "",
  });
  await setBadge(tab, "OK");
  setTimeout(() => {
    setBadge(tab, "").catch(() => {});
  }, 1800);
}

async function setBadge(tab, text) {
  if (!tab || !tab.id) {
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: "#0f766e", tabId: tab.id });
  await chrome.action.setBadgeText({ text, tabId: tab.id });
}
