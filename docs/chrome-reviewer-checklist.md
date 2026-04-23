# Chrome Reviewer Checklist

Run before submitting a new LocalArchive package:

```bash
npm run verify
```

Manual review expectations:

- `docs/cws/listing.json` is the source of truth for Official URL, Homepage URL,
  Support URL, Privacy Policy URL, permission justifications, privacy-practice
  disclosures, and reviewer notes.
- Official, homepage, support, privacy, and reviewer-instruction URLs are public
  HTTPS Cloudflare Pages URLs, not GitHub source-viewer URLs.
- The privacy policy includes the Chrome Web Store User Data Policy Limited Use
  statement and matches the dashboard privacy-practices answers.
- The ZIP contains only `manifest.json`, `assets/`, and `src/`.
- No host permissions are declared.
- `activeTab` and `scripting` are only used after user action.
- `contextMenus` only adds page and selection save commands.
- `downloads` is only used for user-triggered Markdown, HTML, and JSON exports.
- `sidePanel` is only used for the local archive library.
- `storage`, `history`, `tabs`, `management`, and `cookies` are not requested.
- Archive data remains in IndexedDB unless the user exports a file.
- No analytics, ads, remote JavaScript, remote WebAssembly, or `eval` are used.
- Reviewer instructions cover capture, selected-text capture, search, export,
  Pocket CSV import, and duplicate URL merge.
