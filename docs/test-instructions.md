# LocalArchive Reviewer Test Instructions

Submitted extension version: `0.1.1`

No account, login, backend, API key, or paid feature is required.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the unpacked LocalArchive extension directory when testing locally.

## Smoke Test

1. Open any readable article or documentation page, such as
   https://localarchive.pages.dev/.
2. Click the LocalArchive toolbar button.
3. Click `Capture`.
4. Open the LocalArchive library from the popup.
5. Confirm the page appears in the library and can be searched.
6. Select a passage on a page, right-click it, and choose `Save selected text to
   LocalArchive`.
7. Confirm the saved item shows the selected passage in the detail view.
8. Export the selected item as Markdown or HTML.
9. Import a Pocket-style CSV with this content:

   ```csv
   title,url,time_added,tags
   LocalArchive Duplicate,https://localarchive.pages.dev/?utm_source=test,1710000000,archive
   Pocket Only,https://example.com/pocket-only,1710000000,pocket
   ```

10. Confirm duplicate URLs are merged instead of duplicated and the import
    summary reports two imported or merged rows.

## Known Unsupported Pages

Chrome blocks extension injection on `chrome://` pages, the Chrome Web Store,
and some browser-restricted pages. Test capture on normal HTTPS article or
documentation pages.

## Expected Network Behavior

The MVP should not make backend requests during capture, import, search, or
export. All archive data remains in local IndexedDB unless the user explicitly
exports a file.

## Permissions To Review

- `activeTab`
- `contextMenus`
- `downloads`
- `scripting`
- `sidePanel`

The extension intentionally does not request `history`, `tabs`, `management`,
`cookies`, `storage`, or broad host permissions.
