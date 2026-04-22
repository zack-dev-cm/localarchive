import {
  articleFileBase,
  articleToHtmlDocument,
  articleToMarkdown,
  parsePocketCsv,
} from "./shared.js";
import {
  deleteArticle,
  listArticles,
  saveArticles,
} from "./storage.js";

const state = {
  articles: [],
  filtered: [],
  selectedId: null,
};

const nodes = {
  status: document.querySelector("#libraryStatus"),
  articleList: document.querySelector("#articleList"),
  searchInput: document.querySelector("#searchInput"),
  emptyState: document.querySelector("#emptyState"),
  detailPanel: document.querySelector("#detailPanel"),
  detailDomain: document.querySelector("#detailDomain"),
  detailMeta: document.querySelector("#detailMeta"),
  detailTitle: document.querySelector("#detailTitle"),
  detailUrl: document.querySelector("#detailUrl"),
  detailExcerpt: document.querySelector("#detailExcerpt"),
  detailSelection: document.querySelector("#detailSelection"),
  detailText: document.querySelector("#detailText"),
  importCsvButton: document.querySelector("#importCsvButton"),
  importJsonButton: document.querySelector("#importJsonButton"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  exportMarkdownButton: document.querySelector("#exportMarkdownButton"),
  exportHtmlButton: document.querySelector("#exportHtmlButton"),
  deleteButton: document.querySelector("#deleteButton"),
  csvInput: document.querySelector("#csvInput"),
  jsonInput: document.querySelector("#jsonInput"),
};

nodes.searchInput.addEventListener("input", applySearch);
nodes.importCsvButton.addEventListener("click", () => nodes.csvInput.click());
nodes.importJsonButton.addEventListener("click", () => nodes.jsonInput.click());
nodes.exportJsonButton.addEventListener("click", exportJson);
nodes.exportMarkdownButton.addEventListener("click", exportSelectedMarkdown);
nodes.exportHtmlButton.addEventListener("click", exportSelectedHtml);
nodes.deleteButton.addEventListener("click", deleteSelected);
nodes.csvInput.addEventListener("change", importPocketCsv);
nodes.jsonInput.addEventListener("change", importJsonBackup);

await refresh();

async function refresh(statusMessage = null) {
  state.articles = await listArticles();
  applySearchFilter();
  if (!state.filtered.some((article) => article.id === state.selectedId)) {
    state.selectedId = state.filtered[0] ? state.filtered[0].id : null;
  }
  render();
  setStatus(statusMessage || `${state.articles.length} saved`);
}

function applySearch() {
  applySearchFilter();
  if (!state.filtered.some((article) => article.id === state.selectedId)) {
    state.selectedId = state.filtered[0] ? state.filtered[0].id : null;
  }
  render();
  setStatus(
    nodes.searchInput.value.trim()
      ? `${state.filtered.length}/${state.articles.length} matched`
      : `${state.articles.length} saved`
  );
}

function applySearchFilter() {
  const query = nodes.searchInput.value.trim().toLowerCase();
  state.filtered = query
    ? state.articles.filter((article) => articleMatches(article, query))
    : state.articles;
}

function render() {
  renderList();
  renderDetail();
}

function renderList() {
  nodes.articleList.replaceChildren();
  if (!state.filtered.length) {
    const empty = document.createElement("div");
    empty.className = "list-empty";
    empty.textContent = state.articles.length ? "No matches" : "No saved articles";
    nodes.articleList.append(empty);
    return;
  }
  for (const article of state.filtered) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "article-row";
    row.setAttribute("aria-selected", String(article.id === state.selectedId));
    row.addEventListener("click", () => {
      state.selectedId = article.id;
      render();
    });

    const title = document.createElement("strong");
    title.textContent = article.title;
    const meta = document.createElement("span");
    const sourceLabel = article.selectedText ? "selection" : article.source || "capture";
    meta.textContent = `${article.domain || "local"} - ${formatDate(article.capturedAt)} - ${sourceLabel}`;
    const excerpt = document.createElement("span");
    excerpt.textContent = article.excerpt || article.url;

    row.append(title, meta, excerpt);
    nodes.articleList.append(row);
  }
}

function renderDetail() {
  const article = selectedArticle();
  nodes.emptyState.hidden = Boolean(article);
  nodes.detailPanel.hidden = !article;
  if (!article) {
    return;
  }
  nodes.detailDomain.textContent = article.domain || "local";
  nodes.detailMeta.textContent = `${article.wordCount || 0} words - ${article.readingMinutes || 1} min`;
  nodes.detailTitle.textContent = article.title;
  nodes.detailUrl.textContent = article.url;
  nodes.detailExcerpt.textContent = article.excerpt;
  nodes.detailSelection.hidden = !article.selectedText;
  nodes.detailSelection.textContent = article.selectedText || "";
  nodes.detailText.textContent = article.contentText || "Imported link";
}

async function importPocketCsv() {
  const file = nodes.csvInput.files && nodes.csvInput.files[0];
  nodes.csvInput.value = "";
  if (!file) {
    return;
  }
  try {
    const imported = parsePocketCsv(await file.text());
    const saved = await saveArticles(imported);
    await refresh(`Imported or merged ${saved.length}`);
  } catch (error) {
    setStatus(error.message || "Import failed");
  }
}

async function importJsonBackup() {
  const file = nodes.jsonInput.files && nodes.jsonInput.files[0];
  nodes.jsonInput.value = "";
  if (!file) {
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    const articles = Array.isArray(payload) ? payload : payload.articles;
    if (!Array.isArray(articles)) {
      throw new Error("JSON import needs an articles array.");
    }
    const saved = await saveArticles(articles);
    await refresh(`Imported or merged ${saved.length}`);
  } catch (error) {
    setStatus(error.message || "Import failed");
  }
}

function exportJson() {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson(`localarchive-backup-${stamp}.json`, {
    schema: "localarchive.articles.v1",
    exportedAt: new Date().toISOString(),
    count: state.articles.length,
    articles: state.articles,
  });
}

function exportSelectedMarkdown() {
  const article = selectedArticle();
  if (!article) {
    return;
  }
  downloadText(`${articleFileBase(article)}.md`, articleToMarkdown(article), "text/markdown");
}

function exportSelectedHtml() {
  const article = selectedArticle();
  if (!article) {
    return;
  }
  downloadText(`${articleFileBase(article)}.html`, articleToHtmlDocument(article), "text/html");
}

async function deleteSelected() {
  const article = selectedArticle();
  if (!article) {
    return;
  }
  await deleteArticle(article.id);
  state.selectedId = null;
  await refresh();
}

function selectedArticle() {
  return state.articles.find((article) => article.id === state.selectedId) || null;
}

function articleMatches(article, query) {
  return [
    article.title,
    article.url,
    article.domain,
    article.excerpt,
    article.selectedText,
    article.contentText,
    ...(article.tags || []),
  ].some((value) => String(value || "").toLowerCase().includes(query));
}

function downloadJson(filename, payload) {
  downloadText(filename, JSON.stringify(payload, null, 2), "application/json");
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: true }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}

function setStatus(message) {
  nodes.status.textContent = message;
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}
