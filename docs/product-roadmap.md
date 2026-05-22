# Product Roadmap

Last updated: 2026-05-22

This roadmap keeps the project focused while moving from local prototype to a paid subscription product.

## Phase 0: Local Prototype

Status: current stage.

Purpose:

- Validate the image bookmarking workflow.
- Make local storage reliable enough for friend testing.
- Learn which users care most about saving image source URLs.

Core work:

- Keep image paste and source URL editing stable.
- Improve empty states and error states only where testers get stuck.
- Add export or backup if testers worry about losing data.
- Document known browser limitations.

Avoid for now:

- Subscription billing.
- Complex onboarding.
- Team features.
- Premature backend migration.

## Phase 1: Private Testable Web App

Purpose:

- Give friends a stable link.
- Collect real feedback from repeated usage.
- Decide the strongest target audience.

Core work:

- Deploy the app to a stable hosting provider.
- Add a simple feedback channel.
- Add lightweight analytics for page loads and feature usage.
- Add manual import/export so local data is not trapped.
- Write a basic privacy note explaining local-only storage.

Possible hosting:

- Vercel.
- Netlify.
- GitHub Pages.
- Cloudflare Pages.

Important note:

Because the current app stores data in IndexedDB, hosting it does not automatically create accounts or sync. Each browser keeps its own data.

## Phase 2: Account And Sync MVP

Purpose:

- Turn the tool from a local toy into a product people can trust.

Core work:

- Login and signup.
- Cloud database for categories and image metadata.
- Cloud file storage for images or image thumbnails.
- Sync between browser sessions.
- Data export and account deletion.
- Basic user settings.

Decisions to make:

- Store original image files, thumbnails only, or both.
- Store copied image blobs, source URLs, page URLs, and page titles.
- Whether anonymous local use remains available.
- Whether users can migrate local IndexedDB data into an account.

Possible stack choices:

- Supabase for auth, database, and storage.
- Firebase for auth, Firestore, and storage.
- Custom backend if product needs unusual storage or billing control.

## Phase 3: Landing Page And Onboarding

Purpose:

- Explain the product clearly and help new users reach the first saved image quickly.

Landing page sections:

- Hero: image bookmarking with source URLs.
- Use cases: design research, visual references, shopping research, moodboards, content planning.
- Product screenshots or short demo video.
- Extension preview.
- Pricing teaser or waitlist.
- Privacy and data ownership note.

Onboarding flow:

- Signup or continue locally.
- Create first category.
- Save first image.
- Confirm or edit source URL.
- Show how to reopen/copy the source URL.

Do not overbuild onboarding. The best onboarding is still the user saving their first useful image.

## Phase 4: Subscription And Paywall

Purpose:

- Charge for cloud features after the core value is proven.

Subscription model:

- 7-day free trial.
- Monthly and yearly plans.
- Free local-only mode or limited free cloud tier, if desired.

Likely paid features:

- Cloud sync.
- Larger storage limits.
- Browser extension capture.
- Full-resolution image storage.
- Search and tags.
- Backup/export history.
- Multi-device access.

Paywall moments:

- After trial ends.
- When cloud storage limit is reached.
- When enabling sync or extension account features.

Billing requirements:

- Payment provider integration.
- Trial start and end tracking.
- Subscription status checks in app.
- Grace period and failed payment handling.
- Cancel subscription flow.
- Clear pricing and refund policy.

## Phase 5: Browser Extension

Purpose:

- Make saving images from the web faster than copy-paste.

The extension should be built after the web app has accounts or at least a stable import API. Otherwise the extension has nowhere reliable to send saved images.

See [Browser extension plan](./browser-extension-plan.md) for details.

## Phase 6: Power Features

Possible later features:

- Search by source domain, title, category, date, and color.
- Tags in addition to categories.
- Duplicate detection.
- Bulk import/export.
- Collections or moodboards.
- Browser history-style source page context.
- OCR or AI-generated descriptions.
- Public share pages.
- Team libraries.

These should wait until the core loop is proven: capture image, keep source URL, organize, find again.

## Key Risks

- Clipboard behavior varies across browsers and security contexts.
- Users may not understand that local-only data can be lost.
- Image storage can become expensive if full-resolution files are synced.
- Browser extension permissions can scare users if the product asks for too much too early.
- Subscription should not arrive before there is trust, backup, and clear value.

## Product Principle

Build the paid product around trust. Users are saving references they do not want to lose, so the product must feel reliable before it asks for money.
