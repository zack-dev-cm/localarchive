import test from "node:test";
import assert from "node:assert/strict";

import {
  applySelectedText,
  captureArticleFromTab,
  fallbackArticleFromContext,
} from "../src/capture.js";

test("fallbackArticleFromContext builds a selected-text article", () => {
  const article = fallbackArticleFromContext(
    {
      pageUrl: "https://www.example.com/post",
      selectionText: "  selected   evidence  ",
    },
    {
      title: "Example Post",
      url: "https://www.example.com/fallback",
    },
    new Date("2026-04-22T00:00:00Z"),
  );

  assert.equal(article.title, "Example Post");
  assert.equal(article.url, "https://www.example.com/post");
  assert.equal(article.domain, "example.com");
  assert.equal(article.selectedText, "selected evidence");
  assert.equal(article.wordCount, 2);
  assert.equal(article.source, "selection");
  assert.equal(article.capturedAt, "2026-04-22T00:00:00.000Z");
});

test("applySelectedText leaves articles alone when there is no selection", () => {
  const article = {
    title: "Page",
    excerpt: "Original excerpt",
    source: "capture",
  };

  assert.equal(applySelectedText(article, ""), article);
});

test("applySelectedText promotes explicit selection metadata", () => {
  const article = applySelectedText(
    {
      title: "Page",
      excerpt: "Original excerpt",
      source: "capture",
    },
    "  selected   quote  ",
  );

  assert.equal(article.selectedText, "selected quote");
  assert.equal(article.excerpt, "selected quote");
  assert.equal(article.source, "selection");
});

test("captureArticleFromTab injects extractor and applies context selection", async () => {
  const calls = [];
  const chromeApi = {
    scripting: {
      async executeScript(payload) {
        calls.push(payload);
        if (payload.files) {
          return [];
        }
        return [
          {
            result: {
              title: "Extracted",
              url: "https://example.com/post",
              excerpt: "Page excerpt",
              source: "capture",
            },
          },
        ];
      },
    },
  };

  const article = await captureArticleFromTab(
    { id: 42 },
    { chromeApi, selectionText: "Selected text" },
  );

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].target, { tabId: 42 });
  assert.deepEqual(calls[0].files, ["src/extract-page.js"]);
  assert.equal(typeof calls[1].func, "function");
  assert.equal(article.selectedText, "Selected text");
  assert.equal(article.source, "selection");
});

test("captureArticleFromTab rejects missing tabs", async () => {
  await assert.rejects(
    () => captureArticleFromTab(null, { chromeApi: { scripting: {} } }),
    /No active tab/,
  );
});
