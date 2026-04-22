# LocalArchive Privacy Policy

Effective date: 2026-04-22

LocalArchive is a local-first Chrome extension for saving pages and selected
text into the browser profile.

## Data Processed

LocalArchive may store the following data when the user explicitly captures a
page, imports a backup, or imports a Pocket CSV file:

- page title
- page URL and domain
- selected text, when selected by the user
- extracted readable page text
- article metadata such as author, excerpt, capture time, tags, and word count

## Storage

Data is stored locally in the user's Chrome profile using IndexedDB. Exported
Markdown, HTML, and JSON files are created only when the user clicks an export
button.

## Network Use

The MVP does not send captured pages, selected text, imports, exports, search
queries, or archive metadata to a server. It has no analytics endpoint and no
advertising endpoint.

## Permissions

LocalArchive uses `activeTab` and context-menu activation so page access is
initiated by the user. It does not request browsing history, cookies, extension
management, or broad host permissions.

## Deletion

Users can delete saved items from the LocalArchive library. Users can also
remove all extension data through Chrome's extension storage controls by
removing the extension or clearing site/extension data for the profile.

## Contact

Use the GitHub issue tracker for support and privacy questions after the public
repository is created.
