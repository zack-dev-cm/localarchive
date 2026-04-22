(function () {
  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function absoluteUrl(value) {
    if (!value) {
      return "";
    }
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  }

  function metaContent(selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const content = node && node.getAttribute("content");
      if (content && cleanText(content)) {
        return cleanText(content);
      }
    }
    return "";
  }

  function scoreCandidate(node) {
    const text = cleanText(node.innerText || node.textContent || "");
    if (text.length < 240) {
      return 0;
    }
    const paragraphs = node.querySelectorAll("p").length;
    const headings = node.querySelectorAll("h1,h2,h3").length;
    const links = node.querySelectorAll("a").length;
    const media = node.querySelectorAll("img,figure,video").length;
    const linkPenalty = Math.min(links * 12, text.length * 0.45);
    return text.length + paragraphs * 160 + headings * 80 + media * 20 - linkPenalty;
  }

  function bestReadableNode() {
    const selectors = [
      "article",
      "main",
      "[role='main']",
      ".post",
      ".entry-content",
      ".article-content",
      ".content",
      "#content"
    ];
    const candidates = [];
    for (const selector of selectors) {
      candidates.push(...document.querySelectorAll(selector));
    }
    if (!candidates.length) {
      candidates.push(document.body);
    }
    let best = document.body;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best || document.body;
  }

  function extractTitle() {
    return (
      metaContent([
        "meta[property='og:title']",
        "meta[name='twitter:title']",
        "meta[name='parsely-title']"
      ]) ||
      cleanText(document.querySelector("h1") && document.querySelector("h1").innerText) ||
      cleanText(document.title) ||
      location.href
    );
  }

  function selectedText() {
    try {
      return cleanText(window.getSelection && window.getSelection().toString());
    } catch {
      return "";
    }
  }

  window.__localArchiveExtract = function extractPage() {
    const url = location.href;
    const readableNode = bestReadableNode();
    const contentText = cleanText(readableNode.innerText || readableNode.textContent || "");
    const selection = selectedText();
    const excerpt =
      selection ||
      metaContent([
        "meta[name='description']",
        "meta[property='og:description']",
        "meta[name='twitter:description']"
      ]) || contentText.slice(0, 240);
    const author = metaContent([
      "meta[name='author']",
      "meta[property='article:author']",
      "meta[name='parsely-author']"
    ]);
    const imageUrl = absoluteUrl(
      metaContent([
        "meta[property='og:image']",
        "meta[name='twitter:image']"
      ])
    );
    const words = contentText ? contentText.split(/\s+/).filter(Boolean).length : 0;

    return {
      title: extractTitle(),
      url,
      domain: location.hostname.replace(/^www\./, ""),
      excerpt,
      author,
      imageUrl,
      selectedText: selection,
      contentText,
      wordCount: words,
      readingMinutes: Math.max(1, Math.ceil(words / 225)),
      capturedAt: new Date().toISOString(),
      source: selection ? "selection" : "capture"
    };
  };
})();
