# Friend Testing Plan

Last updated: 2026-05-22

Goal: let a small group of friends try Bookmarking Tools before building subscription, onboarding, or extension features.

## What We Are Testing

The current prototype should answer these questions:

- Do people understand what the app is for without a long explanation?
- Can they paste or add images successfully?
- Do they notice and value saving the source URL with the image?
- Are categories, pinning, sorting, and source URL actions easy enough?
- What kind of images do they naturally want to save?
- What breaks across browsers, operating systems, and devices?
- Would they use this again after the first test session?

## Recommended Sharing Options

### Option 1: Cloudflare Tunnel or ngrok

Best for fast private testing without deploying.

Run the app locally:

```bash
npm run dev -- --host 0.0.0.0
```

Then expose the local dev server with a temporary HTTPS tunnel. This is useful because clipboard APIs behave better in secure contexts.

Good when:

- You want feedback today.
- You do not need accounts or shared data.
- You are okay keeping your computer on while friends test.

Watch out:

- The tunnel is temporary.
- The app runs from your machine.
- Every tester's saved images remain in their own browser storage.

### Option 2: GitHub Pages

Best for a more stable test link.

This is the recommended first sharing path for this project because the repository already has a GitHub Pages workflow at `.github/workflows/deploy.yml`, and the Vite build is configured for `/Bookmarking-Tools/`.

Good when:

- You want friends to test at any time.
- You want fewer local networking problems.
- You are ready to share a public prototype link.

Watch out:

- It still will not sync data between devices.
- It still has no user accounts.
- Storage remains browser-local until a backend is added.

Expected project URL after GitHub Pages is enabled:

```text
https://justingrasio.github.io/Bookmarking-Tools/
```

Friend-test note to share with the link:

```text
This test version stores saved images only in your current browser. Please use the same browser and device during the test so your saved images are still there when you come back.
```

### Option 3: Same Wi-Fi Device Testing

Best for quick in-person testing.

Run:

```bash
npm run dev -- --host 0.0.0.0
```

Then open the local network URL from another device on the same Wi-Fi.

Watch out:

- Clipboard permissions may behave differently over plain HTTP.
- This is not ideal for remote friends.

## Test Script For Friends

Ask each tester to try this flow:

1. Open the app.
2. Create at least two categories.
3. Paste or add five images from places they normally browse.
4. Add or confirm the source URL for each image.
5. Move or link one image into another category.
6. Pin one image and one category.
7. Reopen the app and check whether everything is still there.
8. Tell you where they felt confused, worried, or delighted.

## Feedback Questions

Use these questions after they test:

- What did you think this app was for in the first 10 seconds?
- What was the easiest part?
- What was the most confusing part?
- Did saving the source URL feel useful?
- Did anything feel risky, fragile, or unclear?
- What would make this worth opening again next week?
- Would you expect this to be a website, browser extension, desktop app, or all of them?
- If this became paid later, what would need to be true before you trusted it?

## Bugs To Watch For

Track these closely during friend testing:

- Image paste does not work in some browsers.
- Source URL is missing or wrong after paste.
- Images disappear after refresh or browser restart.
- Large image collections make the app slow.
- Category sorting or image sorting feels unpredictable.
- Mobile layout or touch behavior breaks.
- Users do not understand where data is stored.

## Success Criteria

Friend testing is successful when:

- At least 5 people can complete the core save-organize-revisit workflow.
- At least 3 people say the source URL behavior solves a real annoyance.
- The same bugs or confusions appear more than once, giving clear priorities.
- At least 1 or 2 people ask to keep using it after the test.

## Immediate Product Decisions After Testing

After the first test round, decide:

- Is this mainly for designers, researchers, shoppers, creators, students, or general bookmarking?
- Is the most valuable object the image, the source URL, or the collection/category?
- Should the next feature be import/export, cloud sync, browser extension, or better capture UX?
- Is the product personal-only, collaborative, or team-oriented?
