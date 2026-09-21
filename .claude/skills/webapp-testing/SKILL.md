---
name: webapp-testing
description: Use when verifying or debugging the running hub web app in a real browser with Playwright — UI flows, forms, PWA install behavior, responsive checks, screenshots (including frontend-design self-critique), and console/network debugging. Adapted from github/awesome-copilot webapp-testing.
---

# Web App Testing (Playwright)

Test and debug the running hub application in a real browser. Curated from [github/awesome-copilot](https://github.com/awesome-copilot) `webapp-testing` (MIT) for hub's stack.

## When to use
- Verifying a screen's happy path end-to-end (login → module → mutation → visible result)
- Debugging UI behavior: console errors, network failures, broken renders
- Capturing screenshots for `frontend-design` self-critique passes
- Responsive/PWA checks: 390px mobile viewport, service-worker/manifest presence
- Smoke suite that gates deploys (`apps/web` Playwright specs per development-plan §6)

## Prerequisites
- Stack running: `pnpm dev` → web :3000, api :4000 (+ dev Postgres via compose)
- Seeded SUPER_ADMIN from `.env.example` credentials for auth flows
- Playwright installed (`pnpm --filter web exec playwright install firefox` once)
- `playwright.config.ts` `use.browserName` (or the `projects` entry) set to `firefox` — this repo's browser checks target Firefox, not the Playwright chromium default

## Rules
1. **Verify the app is up first** — hit `/api/v1/health`; never debug against a dead server.
2. **Role/accessibility selectors** (`getByRole`, labels) over CSS classes/testids — matches our shadcn a11y floor and survives styling changes.
3. **Explicit waits** on role/text/url — no blind timeouts.
4. **Screenshot on every failure** into `test-results/` before rethrowing; attach to session report.
5. **Close contexts/browsers** — leaked workers break subsequent runs.
6. **Auth helper lives in test utilities** (`apps/web/e2e/helpers/auth.ts`), never production code.
7. **Incremental**: one interaction at a time when debugging; full flow only after steps verified.

## Hub patterns

```typescript
// login helper shape
await page.goto('/login');
await page.getByLabel('Email').fill(admin.email);
await page.getByLabel('Password').fill(admin.password);
await page.getByRole('button', { name: 'Log in' }).click();
await page.waitForURL('**/dashboard');
```

```typescript
// money assertion — rendered ৳ format from shared helpers
await expect(page.getByTestId('project-received')).toHaveText('৳100,000');
```

```typescript
// milestone dropdown filter (Resources tab)
await page.getByRole('combobox', { name: 'Milestone' }).selectOption({ label: 'M2 — Design' });
await expect(page.getByRole('list', { name: 'Files' })).toContainText('wireframes-v2.pdf');
```

## Failure debugging loop
1. Screenshot + `page.on('console')` + `page.on('response')` capture
2. Check api logs for the matching request
3. Fix root cause in code (TDD skill applies — failing test first)
4. Re-run the single spec, then the full smoke suite

## Limits
- No native-mobile testing (PWA on Android Chrome is our target)
- Complex auth edge cases belong in API e2e (Supertest), not browser specs
- Don't add new E2E deps beyond Playwright without a DEC entry
