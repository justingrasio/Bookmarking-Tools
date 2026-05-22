# Bookmarking Tools Planning Notes

Last updated: 2026-05-22

This folder keeps the product direction for Bookmarking Tools separate from the current implementation work. The app is currently a local-first image bookmarking tool built with Vite, React, IndexedDB, and clipboard/image URL capture.

## Planning Files

- [Friend testing plan](./friend-testing-plan.md): how to share the current local app with friends, what to test, and what feedback to collect.
- [Product roadmap](./product-roadmap.md): staged path from local prototype to hosted subscription product.
- [Browser extension plan](./browser-extension-plan.md): future extension concept, realistic browser constraints, and MVP scope.

## Current Product Snapshot

The current app already supports several pieces that matter for the future product:

- Pasting image data into the app.
- Capturing or editing a source URL for an image.
- Saving images locally in the browser with IndexedDB.
- Organizing images by categories.
- Pinning, sorting, linking images across categories, and opening/copying source URLs.

The biggest architectural limitation is that data lives only in each user's browser. That is good for a prototype, but a paid subscription product will eventually need accounts, cloud storage, sync, billing, and backup/export behavior.

## Near-Term Direction

The next milestone is not payment or a landing page. The next milestone is proving that real users understand the core workflow:

1. Save an image.
2. Keep the image's source URL.
3. Organize it into useful categories.
4. Find it again later.
5. Trust that their saved images will not disappear unexpectedly.

Once that workflow feels valuable to friends, the project can move toward hosting, accounts, sync, and subscriptions.
