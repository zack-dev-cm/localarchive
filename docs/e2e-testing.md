# LocalArchive E2E Testing

LocalArchive has a no-dependency real Chrome E2E runner:

```bash
npm run test:e2e
```

The runner:

- stages the extension into `dist/e2e/extension`
- launches a temporary Chrome profile with the staged extension loaded unpacked
- serves a local reviewer-style article fixture
- invokes the extension action popup through a temporary `_execute_action` keyboard shortcut
- captures the page
- captures selected text
- verifies the library UI and search
- exports Markdown and verifies the downloaded file
- imports a Pocket-style CSV and verifies canonical duplicate merge behavior

The source manifest is not changed for the shortcut. The shortcut exists only in
the staged E2E manifest because Chrome DevTools Protocol can automate page
targets but cannot click Chrome toolbar UI directly.

Artifacts are written under `dist/e2e/`, with reports at:

- `dist/e2e-report.json`
- `dist/e2e-report.md`

## Chrome Web Store Status Check

When an OpenClaw gateway/profile is available, check the CWS reviewer state:

```bash
OPENCLAW_WS_URL=ws://127.0.0.1:18789 \
OPENCLAW_BROWSER_PROFILE=openclaw-cws-publisher \
CWS_PUBLISHER_ID=<publisher-id> \
CWS_EXTENSION_ID=<extension-id> \
npm run check:cws
```

If a draft is already pending review, do not cancel or replace it unless the
E2E runner or the reviewer dashboard exposes a verified acceptance blocker.
