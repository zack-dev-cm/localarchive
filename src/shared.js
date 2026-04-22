export function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function slugify(value) {
  const slug = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "localarchive";
}

export function articleFileBase(article) {
  const date = String(article.capturedAt || new Date().toISOString()).slice(0, 10);
  return `${date}-${slugify(article.title || article.domain || "article")}`;
}

export function canonicalizeUrl(value) {
  const raw = normalizeWhitespace(value);
  if (!raw) {
    return "";
  }
  try {
    const url = new URL(raw);
    url.hash = "";
    const removeParams = [
      "fbclid",
      "gclid",
      "igshid",
      "mc_cid",
      "mc_eid",
      "mkt_tok",
      "ref",
      "spm",
      "utm_campaign",
      "utm_content",
      "utm_medium",
      "utm_source",
      "utm_term",
    ];
    for (const param of removeParams) {
      url.searchParams.delete(param);
    }
    const sortedParams = [...url.searchParams.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    );
    url.search = "";
    for (const [key, paramValue] of sortedParams) {
      url.searchParams.append(key, paramValue);
    }
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.href;
  } catch {
    return raw;
  }
}

export function articleToMarkdown(article) {
  const parts = [
    `# ${article.title || "Untitled"}`,
    "",
    `Source: ${article.url || ""}`,
    `Captured: ${article.capturedAt || ""}`,
  ];
  if (article.author) {
    parts.push(`Author: ${article.author}`);
  }
  if (article.excerpt) {
    parts.push("", `> ${normalizeWhitespace(article.excerpt)}`);
  }
  if (article.selectedText) {
    parts.push("", "## Selected text", "", article.selectedText);
  }
  if (article.selectedText && article.contentText) {
    parts.push("", "## Page text");
  }
  parts.push("", article.contentText || "");
  return parts.join("\n").trimEnd() + "\n";
}

export function articleToHtmlDocument(article) {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(article.title || "Untitled")}</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<style>body{max-width:760px;margin:40px auto;padding:0 20px;font:17px/1.7 system-ui,sans-serif;color:#172033}a{color:#0f766e}pre{white-space:pre-wrap;font:inherit}</style>",
    "</head>",
    "<body>",
    `<h1>${escapeHtml(article.title || "Untitled")}</h1>`,
    `<p><a href="${escapeHtml(article.url || "")}">${escapeHtml(article.url || "")}</a></p>`,
    `<p>Captured: ${escapeHtml(article.capturedAt || "")}</p>`,
    article.excerpt ? `<blockquote>${escapeHtml(article.excerpt)}</blockquote>` : "",
    article.selectedText ? "<h2>Selected text</h2>" : "",
    article.selectedText ? `<pre>${escapeHtml(article.selectedText)}</pre>` : "",
    article.selectedText && article.contentText ? "<h2>Page text</h2>" : "",
    `<pre>${escapeHtml(article.contentText || "")}</pre>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }
  return rows;
}

export function parsePocketCsv(text, now = new Date()) {
  const rows = parseCsv(text);
  if (!rows.length) {
    return [];
  }
  const headers = rows[0].map((header) => normalizeWhitespace(header).toLowerCase());
  const titleIndex = findHeader(headers, ["title", "given_title", "resolved_title"]);
  const urlIndex = findHeader(headers, ["url", "given_url", "resolved_url"]);
  const timeIndex = findHeader(headers, ["time_added", "added", "created_at"]);
  const tagsIndex = findHeader(headers, ["tags", "tag"]);

  if (urlIndex < 0) {
    throw new Error("Pocket CSV import needs a url column.");
  }

  return rows.slice(1).map((row) => {
    const url = normalizeWhitespace(row[urlIndex]);
    const title = normalizeWhitespace(row[titleIndex]) || url;
    const capturedAt = pocketTimestampToIso(row[timeIndex], now);
    return {
      title,
      url,
      domain: safeDomain(url),
      excerpt: "",
      author: "",
      imageUrl: "",
      contentText: "",
      wordCount: 0,
      readingMinutes: 1,
      capturedAt,
      source: "pocket",
      tags: parseTags(row[tagsIndex]),
    };
  }).filter((article) => article.url);
}

export function normalizeArticle(article) {
  const capturedAt = article.capturedAt || new Date().toISOString();
  const url = normalizeWhitespace(article.url);
  const contentText = String(article.contentText || "");
  const selectedText = String(article.selectedText || "");
  const wordCount = Math.max(0, Number(article.wordCount || countWords(contentText || selectedText)) || 0);
  const readingMinutes = Math.max(
    1,
    Number(article.readingMinutes || Math.ceil(wordCount / 225) || 1) || 1,
  );
  const canonicalUrl = canonicalizeUrl(url);
  return {
    id: article.id || makeArticleId(canonicalUrl || url, capturedAt),
    title: normalizeWhitespace(article.title) || url || "Untitled",
    url,
    canonicalUrl,
    domain: normalizeWhitespace(article.domain) || safeDomain(canonicalUrl || url),
    excerpt: normalizeWhitespace(article.excerpt),
    author: normalizeWhitespace(article.author),
    imageUrl: normalizeWhitespace(article.imageUrl),
    selectedText,
    contentText,
    wordCount,
    readingMinutes,
    capturedAt,
    source: article.source || "capture",
    tags: Array.isArray(article.tags) ? article.tags.map(normalizeWhitespace).filter(Boolean) : [],
    archived: Boolean(article.archived),
    updatedAt: new Date().toISOString(),
  };
}

export function mergeArticle(existing, incoming) {
  const current = normalizeArticle(existing);
  const next = normalizeArticle({
    ...incoming,
    id: current.id,
    capturedAt: current.capturedAt || incoming.capturedAt,
  });
  const contentText = preferLonger(next.contentText, current.contentText);
  const selectedText = preferLonger(next.selectedText, current.selectedText);
  const wordCount = Math.max(current.wordCount || 0, next.wordCount || countWords(contentText));
  return {
    ...current,
    title: preferUsefulTitle(current.title, next.title, current.url),
    url: current.url || next.url,
    canonicalUrl: current.canonicalUrl || next.canonicalUrl,
    domain: current.domain || next.domain,
    excerpt: preferLonger(next.excerpt, current.excerpt),
    author: next.author || current.author,
    imageUrl: next.imageUrl || current.imageUrl,
    selectedText,
    contentText,
    wordCount,
    readingMinutes: Math.max(1, Number(next.readingMinutes || current.readingMinutes || Math.ceil(wordCount / 225)) || 1),
    source: current.source === "pocket" && next.source !== "pocket" ? next.source : current.source,
    tags: uniqueStrings([...(current.tags || []), ...(next.tags || [])]),
    archived: current.archived && next.archived,
    updatedAt: new Date().toISOString(),
  };
}

export function dedupeArticles(articles) {
  const byKey = new Map();
  for (const article of articles) {
    const normalized = normalizeArticle(article);
    const key = normalized.canonicalUrl || normalized.id;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeArticle(existing, normalized) : normalized);
  }
  return [...byKey.values()].sort((left, right) =>
    String(right.capturedAt).localeCompare(String(left.capturedAt))
  );
}

export function archiveNeedsMigration(articles) {
  const seenKeys = new Set();
  for (const article of articles) {
    const normalized = normalizeArticle(article);
    const key = normalized.canonicalUrl || normalized.id;
    if (key && seenKeys.has(key)) {
      return true;
    }
    if (key) {
      seenKeys.add(key);
    }
    if (article.canonicalUrl !== normalized.canonicalUrl) {
      return true;
    }
    if (!article.domain && normalized.domain) {
      return true;
    }
    if (!Number.isFinite(Number(article.wordCount)) && normalized.wordCount > 0) {
      return true;
    }
    if (!Number.isFinite(Number(article.readingMinutes)) && normalized.readingMinutes > 0) {
      return true;
    }
  }
  return false;
}

function findHeader(headers, names) {
  return names.reduce((found, name) => {
    if (found >= 0) {
      return found;
    }
    return headers.indexOf(name);
  }, -1);
}

function pocketTimestampToIso(value, now) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) {
    return now.toISOString();
  }
  if (/^\d+$/.test(trimmed)) {
    const timestamp = Number(trimmed);
    const milliseconds = timestamp > 9999999999 ? timestamp : timestamp * 1000;
    return new Date(milliseconds).toISOString();
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return now.toISOString();
}

function parseTags(value) {
  return normalizeWhitespace(value)
    .split(/[;|,]/)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function safeDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function makeArticleId(url, capturedAt) {
  const source = url ? canonicalizeUrl(url) : `${capturedAt}|${Math.random().toString(36).slice(2)}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return `article-${Math.abs(hash).toString(36)}`;
}

function countWords(value) {
  return normalizeWhitespace(value).split(/\s+/).filter(Boolean).length;
}

function preferLonger(left, right) {
  return String(left || "").length >= String(right || "").length ? String(left || "") : String(right || "");
}

function preferUsefulTitle(currentTitle, nextTitle, url) {
  if (!currentTitle || currentTitle === url) {
    return nextTitle || currentTitle || "Untitled";
  }
  if (nextTitle && nextTitle !== url && nextTitle.length > currentTitle.length + 12) {
    return nextTitle;
  }
  return currentTitle;
}

function uniqueStrings(values) {
  return [...new Set(values.map(normalizeWhitespace).filter(Boolean))];
}
