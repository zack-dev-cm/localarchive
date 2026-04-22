import { saveArticle } from "./storage.js";

export async function captureArticleFromTab(tab, options = {}) {
  const chromeApi = options.chromeApi || globalThis.chrome;
  if (!chromeApi || !chromeApi.scripting) {
    throw new Error("Chrome scripting API is unavailable.");
  }
  if (!tab || !tab.id) {
    throw new Error("No active tab.");
  }

  await chromeApi.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/extract-page.js"],
  });
  const [result] = await chromeApi.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__localArchiveExtract && window.__localArchiveExtract(),
  });
  if (!result || !result.result) {
    throw new Error("Could not extract page.");
  }
  return applySelectedText(result.result, options.selectionText);
}

export async function saveCapturedTab(tab, options = {}) {
  let article;
  try {
    article = await captureArticleFromTab(tab, options);
  } catch (error) {
    if (!options.allowFallback) {
      throw error;
    }
    article = fallbackArticleFromContext(options.contextInfo || {}, tab);
  }
  return saveArticle(article);
}

export function fallbackArticleFromContext(info = {}, tab = {}, now = new Date()) {
  const url = info.pageUrl || tab.url || "";
  const selection = cleanText(info.selectionText);
  return {
    title: tab.title || url || "Untitled",
    url,
    domain: safeDomain(url),
    excerpt: selection,
    author: "",
    imageUrl: "",
    selectedText: selection,
    contentText: "",
    wordCount: selection ? selection.split(/\s+/).filter(Boolean).length : 0,
    readingMinutes: 1,
    capturedAt: now.toISOString(),
    source: selection ? "selection" : "context",
  };
}

export function applySelectedText(article, selectionText) {
  const selection = cleanText(selectionText);
  if (!selection) {
    return article;
  }
  return {
    ...article,
    selectedText: selection,
    excerpt: selection,
    source: "selection",
  };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
