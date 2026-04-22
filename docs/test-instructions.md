# LocalArchive Reviewer Test Instructions

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the unpacked LocalArchive extension directory or upload the packaged
   ZIP through the Chrome Web Store review flow.

## Smoke Test

1. Open any readable article or documentation page.
2. Click the LocalArchive toolbar button.
3. Click `Capture`.
4. Open the LocalArchive library from the popup.
5. Confirm the page appears in the library and can be searched.
6. Select a passage on a page, right-click it, and choose `Save selected text to
   LocalArchive`.
7. Confirm the saved item shows the selected passage in the detail view.
8. Export the selected item as Markdown or HTML.
9. Import a small Pocket-style CSV containing `title,url,time_added,tags`.
10. Confirm duplicate URLs are merged instead of duplicated.

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
- `storage`

The extension intentionally does not request `history`, `tabs`, `management`,
`cookies`, or broad host permissions.
