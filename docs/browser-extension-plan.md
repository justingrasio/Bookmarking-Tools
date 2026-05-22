# Browser Extension Plan

Last updated: 2026-05-22

Goal: create a browser extension that makes it easy to save web images into Bookmarking Tools together with the image URL and source page URL.

## Product Idea

The future extension should help users capture images from the web with better context than normal copy-paste.

Possible user actions:

- Right-click an image and choose "Save to Bookmarking Tools".
- Choose a category before saving.
- Save the image URL, source page URL, page title, and maybe selected text.
- Open the web app after saving.
- Copy both image and source URL when useful.

## Important Browser Reality

The idea "when user copies image, extension also copies the URL" may not be fully reliable.

Browser extensions usually cannot safely intercept every normal copy action across all websites and rewrite the clipboard to include both image data and URL. Clipboard access is permission-sensitive, browser-dependent, and often requires a user gesture.

The more reliable MVP is:

- Use a right-click context menu on images.
- Capture the clicked image URL from the page.
- Capture the current tab URL as the source page.
- Send that data to the web app or extension storage.

This gives users the result they want without depending on fragile clipboard interception.

## Extension MVP

Minimum useful version:

- Chrome Manifest V3 extension.
- Context menu item for images.
- Save image URL.
- Save page URL.
- Save page title.
- Let user choose a category.
- Send saved item to the Bookmarking Tools web app.

Data to capture:

- `imageUrl`: the direct image source.
- `pageUrl`: the webpage where the image was found.
- `pageTitle`: the tab title.
- `capturedAt`: timestamp.
- `categoryId`: chosen user category.
- `notes`: optional later.

## Extension Architecture

Likely pieces:

- `manifest.json`: permissions and extension metadata.
- Service worker: context menu registration and capture handling.
- Content script: page-level extraction when needed.
- Popup UI: quick category picker and recent saves.
- Options page: login, default category, sync settings.
- Web app API: receives captured image metadata.

Likely permissions:

- `contextMenus`.
- `activeTab`.
- `storage`.
- Host permissions only for the web app API.

Avoid broad host permissions at first. Asking for access to every website can reduce user trust.

## Integration With The Web App

The extension needs one of these integration paths:

### Local-Only Bridge

Open the web app with URL parameters containing the captured image URL and page URL.

Example:

```text
https://app.example.com/capture?imageUrl=...&pageUrl=...
```

Pros:

- Simpler.
- Does not require full backend immediately.

Cons:

- Awkward for large data.
- Still depends on local browser storage.
- Not good for cross-device sync.

### Authenticated API

Extension sends captures to the backend API for the logged-in user.

Pros:

- Best long-term product architecture.
- Works across devices.
- Supports subscription limits.

Cons:

- Requires auth, backend, storage, and security decisions first.

Recommendation:

Build the extension after account and sync MVP, unless the first extension is intentionally local-only and experimental.

## Category Picker Experience

When user right-clicks an image:

- Default action saves to the last-used category.
- Submenu or popup lets the user choose another category.
- If no categories exist, create "Inbox" automatically.
- Show a small success notification.

Later:

- Let users create a category from the popup.
- Add quick tags.
- Add keyboard shortcuts.

## Paywall Relationship

The extension can be part of the subscription value, but it should not block early validation.

Possible rules:

- Free trial includes extension capture.
- Paid plan includes cloud sync and unlimited extension saves.
- Free plan allows limited local-only extension captures.

Be careful: if the extension is the main product value, hiding it completely behind a paywall too early may make testing harder.

## Technical Risks

- Some image URLs expire or require cookies.
- Some websites use canvas, lazy-loading, blobs, or protected media.
- Hotlinked image URLs may not load later.
- Saving full image blobs requires fetch permissions and can hit CORS or auth limits.
- Clipboard image writing is not consistent enough to be the first MVP.

## Better Capture Strategy

Prefer capturing multiple source fields:

- Direct image URL.
- Source page URL.
- Source page title.
- Referrer/domain.
- Optional screenshot or cached image copy if allowed.

This gives users a way back to the source even when the direct image URL becomes useless later.
