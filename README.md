# LocalArchive

LocalArchive is a local-first Chrome extension for saving readable pages, importing Pocket CSV exports, searching a private archive, and exporting user-owned Markdown, HTML, or JSON files.

## MVP Scope

- one-click capture of the active page
- selected-text capture when text is highlighted before saving
- right-click context menu actions for saving pages and selected text
- local IndexedDB storage
- searchable archive library
- Pocket CSV import
- additive JSON backup import/export
- Markdown and HTML export for selected articles

Captures and imports are merged by canonical URL. LocalArchive strips common
tracking parameters for duplicate detection, preserves richer captured article
text over thin imported links, and keeps the archive local to the browser
profile.

## Load Unpacked

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the `localarchive` project directory.

## Verification

```bash
node --test
node scripts/validate-extension.mjs
npm run check:cws-readiness
npm run test:e2e
```

The E2E runner launches a temporary Chrome profile with the extension loaded
unpacked and exercises reviewer-style capture, selected-text capture, library
search, Markdown export, and Pocket CSV import. See
[`docs/e2e-testing.md`](docs/e2e-testing.md).

## Privacy

The MVP stores article data in the browser profile through IndexedDB. It does not send captured pages, imports, exports, or search queries to a server.

The extension uses `activeTab` and context-menu activation instead of broad host
permissions. Page access is requested only after the user clicks the extension
button or a LocalArchive context-menu item.

## Public Review Surface

Chrome Web Store listing URLs, privacy disclosures, permission justifications,
and reviewer notes are tracked in [`docs/cws/listing.json`](docs/cws/listing.json).
The public homepage, privacy policy, support page, and reviewer guide are served
from Cloudflare Pages using the static source in [`site/`](site/).
