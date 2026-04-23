# LocalArchive Chrome Web Store Publication Log

## 2026-04-23

- Chrome Web Store item `glcecbjpdknkmlpcbnbpikjjclboeglo` was published as
  public version `0.1.0`.
- Published item:
  `https://chromewebstore.google.com/detail/glcecbjpdknkmlpcbnbpikjjclboeglo`
- The public listing outcome confirmed the baseline product is acceptable for
  Chrome Web Store distribution.

## Follow-up Submission

Version `0.1.1` was submitted after publication to tighten the public review
surface and remove the unused `storage` permission. The submitted package uses
only `activeTab`, `contextMenus`, `downloads`, `scripting`, and `sidePanel`.

The follow-up submission also moves all reviewer-facing URLs to Cloudflare
Pages:

- Official URL: `https://localarchive.pages.dev/`
- Homepage URL: `https://localarchive.pages.dev/`
- Support URL: `https://localarchive.pages.dev/support/`
- Privacy Policy URL: `https://localarchive.pages.dev/privacy/`
- Reviewer guide: `https://localarchive.pages.dev/review/`

## Durable Lesson

Treat Chrome Web Store publication as two separate gates:

1. Product runtime gate: permissions, package contents, E2E behavior, and
   privacy claims must match the extension code.
2. Public review surface gate: Official URL, homepage, support, privacy policy,
   reviewer guide, dashboard disclosures, and listing copy must be live,
   owned, and consistent before submission.

Do not replace a pending review for cosmetic cleanup. Submit a new package only
for acceptance blockers such as wrong package, broken public URL, policy
contradiction, or reviewer-repro failure.
