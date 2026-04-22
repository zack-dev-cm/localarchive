import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveNeedsMigration,
  articleFileBase,
  articleToHtmlDocument,
  articleToMarkdown,
  canonicalizeUrl,
  dedupeArticles,
  escapeHtml,
  mergeArticle,
  normalizeArticle,
  parseCsv,
  parsePocketCsv,
  slugify,
} from "../src/shared.js";

test("parseCsv handles quoted commas and escaped quotes", () => {
  const rows = parseCsv('title,url,tags\n"Hello, world",https://example.com,"a,b"\n"He said ""go""",https://x.test,\n');

  assert.deepEqual(rows, [
    ["title", "url", "tags"],
    ["Hello, world", "https://example.com", "a,b"],
    ['He said "go"', "https://x.test", ""],
  ]);
});

test("parsePocketCsv maps common Pocket export columns", () => {
  const now = new Date("2026-04-22T00:00:00Z");
  const items = parsePocketCsv(
    "title,url,time_added,tags\nSaved Page,https://www.example.com/a,1710000000,research;chrome\n",
    now,
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Saved Page");
  assert.equal(items[0].url, "https://www.example.com/a");
  assert.equal(items[0].domain, "example.com");
  assert.equal(items[0].capturedAt, "2024-03-09T16:00:00.000Z");
  assert.deepEqual(items[0].tags, ["research", "chrome"]);
});

test("canonicalizeUrl removes noisy tracking data without losing useful params", () => {
  assert.equal(
    canonicalizeUrl("https://www.example.com/path/?b=2&utm_source=news&a=1#section"),
    "https://www.example.com/path?a=1&b=2",
  );
});

test("normalizeArticle uses deterministic ids for the same canonical URL", () => {
  const first = normalizeArticle({
    title: "One",
    url: "https://example.com/post?utm_source=x#top",
    capturedAt: "2026-04-22T00:00:00.000Z",
  });
  const second = normalizeArticle({
    title: "Two",
    url: "https://example.com/post",
    capturedAt: "2026-04-23T00:00:00.000Z",
  });

  assert.equal(first.id, second.id);
  assert.equal(first.canonicalUrl, "https://example.com/post");
});

test("mergeArticle preserves rich capture content over thin imported links", () => {
  const captured = normalizeArticle({
    title: "Captured Title",
    url: "https://example.com/post",
    capturedAt: "2026-04-20T00:00:00.000Z",
    contentText: "A useful captured article body with enough words to keep.",
    tags: ["research"],
  });
  const imported = normalizeArticle({
    title: "Imported Title",
    url: "https://example.com/post?utm_medium=email",
    capturedAt: "2026-04-22T00:00:00.000Z",
    source: "pocket",
    tags: ["pocket"],
  });

  const merged = mergeArticle(captured, imported);

  assert.equal(merged.id, captured.id);
  assert.equal(merged.title, "Captured Title");
  assert.equal(merged.contentText, captured.contentText);
  assert.deepEqual(merged.tags, ["research", "pocket"]);
});

test("normalizeArticle stores selected text and counts it when page text is absent", () => {
  const article = normalizeArticle({
    title: "Quoted Source",
    url: "https://example.com/source",
    selectedText: "Important selected evidence",
    contentText: "",
  });

  assert.equal(article.selectedText, "Important selected evidence");
  assert.equal(article.wordCount, 3);
});

test("mergeArticle preserves longer selected text", () => {
  const existing = normalizeArticle({
    title: "Source",
    url: "https://example.com/source",
    selectedText: "short quote",
  });
  const incoming = normalizeArticle({
    title: "Source",
    url: "https://example.com/source?utm_source=email",
    selectedText: "longer selected quote with more evidence",
  });

  const merged = mergeArticle(existing, incoming);

  assert.equal(merged.selectedText, "longer selected quote with more evidence");
});

test("dedupeArticles collapses repeated canonical URLs", () => {
  const items = dedupeArticles([
    {
      title: "First",
      url: "https://example.com/post?utm_source=feed",
      capturedAt: "2026-04-20T00:00:00.000Z",
    },
    {
      title: "Second",
      url: "https://example.com/post#comments",
      capturedAt: "2026-04-21T00:00:00.000Z",
      contentText: "Later richer body",
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].contentText, "Later richer body");
});

test("archiveNeedsMigration detects legacy rows without canonical URLs", () => {
  assert.equal(
    archiveNeedsMigration([
      {
        id: "legacy-1",
        title: "Legacy",
        url: "https://example.com/post?utm_source=old",
        capturedAt: "2026-04-20T00:00:00.000Z",
      },
    ]),
    true,
  );
});

test("archiveNeedsMigration detects canonical duplicates", () => {
  assert.equal(
    archiveNeedsMigration([
      normalizeArticle({
        id: "one",
        title: "One",
        url: "https://example.com/post?utm_source=feed",
        capturedAt: "2026-04-20T00:00:00.000Z",
      }),
      normalizeArticle({
        id: "two",
        title: "Two",
        url: "https://example.com/post#comments",
        capturedAt: "2026-04-21T00:00:00.000Z",
      }),
    ]),
    true,
  );
});

test("archiveNeedsMigration accepts normalized unique rows", () => {
  assert.equal(
    archiveNeedsMigration([
      normalizeArticle({
        title: "One",
        url: "https://example.com/one",
        capturedAt: "2026-04-20T00:00:00.000Z",
      }),
      normalizeArticle({
        title: "Two",
        url: "https://example.com/two",
        capturedAt: "2026-04-21T00:00:00.000Z",
      }),
    ]),
    false,
  );
});

test("parsePocketCsv rejects files without a url column", () => {
  assert.throws(
    () => parsePocketCsv("title,notes\nNo URL,nope\n"),
    /url column/,
  );
});

test("article exports escape HTML and keep source metadata", () => {
  const article = normalizeArticle({
    id: "a1",
    title: 'Research <Plan>',
    url: "https://example.com/research",
    capturedAt: "2026-04-22T00:00:00.000Z",
    excerpt: "Useful source",
    contentText: "Body with <script>alert(1)</script>",
  });

  const markdown = articleToMarkdown(article);
  const html = articleToHtmlDocument(article);

  assert.match(markdown, /# Research <Plan>/);
  assert.match(markdown, /Source: https:\/\/example.com\/research/);
  assert.match(html, /Research &lt;Plan&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("article exports include selected text section", () => {
  const article = normalizeArticle({
    id: "a1",
    title: "Selected Evidence",
    url: "https://example.com/research",
    capturedAt: "2026-04-22T00:00:00.000Z",
    selectedText: "Specific quoted passage",
    contentText: "Full page body",
  });

  const markdown = articleToMarkdown(article);
  const html = articleToHtmlDocument(article);

  assert.match(markdown, /## Selected text/);
  assert.match(markdown, /Specific quoted passage/);
  assert.match(markdown, /## Page text/);
  assert.match(html, /<h2>Selected text<\/h2>/);
  assert.match(html, /Specific quoted passage/);
});

test("slug and file base are stable for readable filenames", () => {
  assert.equal(slugify("Hello, Chrome Extension!"), "hello-chrome-extension");
  assert.equal(
    articleFileBase({
      title: "Hello, Chrome Extension!",
      capturedAt: "2026-04-22T12:00:00.000Z",
    }),
    "2026-04-22-hello-chrome-extension",
  );
});

test("escapeHtml covers critical characters", () => {
  assert.equal(escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});
