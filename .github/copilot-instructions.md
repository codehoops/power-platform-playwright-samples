# GitHub Copilot Instructions — Power Platform Playwright Samples

This file gives GitHub Copilot context about the repository so that suggestions,
completions, and chat answers are accurate for this codebase.

---

## What This Repository Is

A **Rush monorepo** with two packages:

- `packages/power-platform-playwright-toolkit/` — Core TypeScript library, published to npm as `power-platform-playwright-toolkit`. Contains the Page Object Model, authentication helpers, locators, waiters, and utilities.
- `packages/e2e-tests/` — Sample Playwright tests targeting Canvas Apps, Model-Driven Apps, and Gen UX in a real Power Platform environment.

---

## Architecture Conventions

### Entry point for all tests

Always use `AppProvider` to launch apps and obtain page objects:

```typescript
import { AppProvider, AppType, AppLaunchMode } from 'power-platform-playwright-toolkit';

const appProvider = new AppProvider(page, context);
await appProvider.launch({
  app: 'My App',
  type: AppType.Canvas, // or ModelDriven, PowerApps
  mode: AppLaunchMode.Play,
  directUrl: process.env.CANVAS_APP_URL,
  skipMakerPortal: true,
});

const canvasApp = appProvider.getCanvasAppPage();
const mdaApp = appProvider.getModelDrivenAppPage();
const genUx = appProvider.getGenUxPage();
```

### Storage state (auth)

- Canvas / Gen UX / Maker Portal: `getStorageStatePath(email)` → `.playwright-ms-auth/state-<email>.json`
- Model-Driven App (CRM domain): `.playwright-ms-auth/state-mda-<email>.json`
- Auth state is valid for **24 hours** (file modification time), configurable via `MS_AUTH_STORAGE_STATE_EXPIRATION`.

### Environment variables

All config comes from `packages/e2e-tests/.env` (gitignored). Use `.env.example` as the template. Key variables:

```
POWER_APPS_ENVIRONMENT_ID   — environment GUID (find in Maker Portal URL)
CANVAS_APP_ID               — Canvas App ID (Maker Portal → app → Details)
CANVAS_APP_TENANT_ID        — Azure AD tenant ID
MODEL_DRIVEN_APP_URL        — full MDA URL including ?appid=
MS_AUTH_EMAIL               — test user email
MS_AUTH_CREDENTIAL_TYPE     — password | certificate
MS_AUTH_STORAGE_STATE_EXPIRATION — hours (default: 24)
```

### Playwright projects (playwright.config.ts)

| Project name       | Test directory            | Storage state            |
| ------------------ | ------------------------- | ------------------------ |
| `canvas-app`       | `tests/northwind/canvas/` | `state-<email>.json`     |
| `model-driven-app` | `tests/northwind/mda/`    | `state-mda-<email>.json` |
| `gen-ux`           | `tests/gen-ux/`           | `state-<email>.json`     |
| `default`          | `tests/` (all)            | `state-<email>.json`     |

---

## Coding Patterns to Follow

### Canvas App tests — always scope to the iframe

```typescript
const canvasFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
await canvasFrame
  .locator('[data-control-name="Gallery1"]')
  .first()
  .waitFor({ state: 'visible', timeout: 60000 });
```

### Model-Driven App tests — use toolkit components

```typescript
const mda = appProvider.getModelDrivenAppPage();
await mda.grid.navigateToGridView();
await mda.grid.openRow(0);
const value = await mda.form.getEntityAttribute('name');
await mda.form.setEntityAttribute('description', 'Updated');
await mda.form.saveForm();
```

### Auth validation

`validateAuthState()` in `utils/validate-auth-state.ts` is called in `playwright.config.ts`
before tests run. It checks file age (24h) and, for MDA, that CRM cookies exist.
Do not bypass this — if auth is stale, re-run the auth scripts.

### Custom Page Objects

Extend toolkit page objects for app-specific methods. See:

- `packages/e2e-tests/pages/northwind/NorthwindCanvasAppPage.ts`
- `packages/e2e-tests/pages/northwind/NorthwindModelDrivenAppPage.ts`

---

## Build & Test Commands

```bash
# Monorepo (from repo root)
rush install              # install dependencies
rush build                # build all packages

# Tests (from packages/e2e-tests/)
npm run auth:headful                        # authenticate Canvas / Maker Portal
npm run auth:mda:headful                    # authenticate MDA / CRM domain
npx playwright test --project=canvas-app
npx playwright test --project=model-driven-app
npx playwright test --project=gen-ux
npx playwright test --ui                    # interactive UI mode
```

---

## What NOT to Suggest

- Do not suggest `npm install` at the repo root — this is a Rush monorepo; use `rush install`.
- Do not suggest using `page.locator()` directly on canvas app content — it must be scoped via `page.frameLocator('iframe[name="fullscreen-app-host"]')`.
- Do not suggest checking MSAL access token expiry (1h) to validate auth state — the project uses **file modification time (24h)** instead.
- Do not suggest hardcoding environment IDs, app IDs, or URLs — all values must come from `.env` / environment variables.
- Do not suggest committing `.env` — it is gitignored and contains credentials.
- Do not suggest `rush build --to e2e-tests` — the e2e-tests package has `build: tsc --noEmit` only; build the toolkit with `rush build --to power-platform-playwright-toolkit`.

---

## Context Engineering — Generating Tests from Unpacked Solutions

When a user asks you to generate Playwright tests from an unpacked Power Platform
solution, use the files in `docs/context-engineering/`.

### What's in `docs/context-engineering/`

| Path | Purpose |
|---|---|
| `instructions/00-unpacked-solution-overview.md` | Unpacked solution file tree, XML schema, namespace notes |
| `instructions/01-mda-form-testing.md` | FormXml → toolkit API mapping for form tests |
| `instructions/02-mda-javascript-testing.md` | JS web resource event handlers → test strategy |
| `instructions/03-mda-business-rules-testing.md` | Business Rule XML → condition/action tests |
| `skills/analyze-solution-structure.prompt.md` | Step-by-step: parse solution folder → JSON manifest |
| `skills/generate-mda-form-tests.prompt.md` | Step-by-step: manifest → `<entity>-form.test.ts` |
| `skills/generate-javascript-tests.prompt.md` | Step-by-step: manifest → `<webresource>-events.test.ts` |
| `skills/generate-business-rule-tests.prompt.md` | Step-by-step: manifest → `<entity>-business-rules.test.ts` |

### When to Use Each File

- **User asks about unpacked solution layout or XML schema** → reference
  `instructions/00-unpacked-solution-overview.md`
- **User asks how to test an MDA form** → reference
  `instructions/01-mda-form-testing.md`
- **User asks how to test a JS event handler** → reference
  `instructions/02-mda-javascript-testing.md`
- **User asks how to test a Business Rule** → reference
  `instructions/03-mda-business-rules-testing.md`
- **User wants to generate a test file from an unpacked solution** → run
  `skills/analyze-solution-structure.prompt.md` first, then the appropriate
  `skills/generate-*.prompt.md`

### Mandatory Rules When Generating Code from These Skills

1. **Never use `page.locator()` or `page.fill()` directly on Dataverse form fields** —
   all Xrm interactions go through `executeInFormContext`, `getEntityAttribute`, or
   `setEntityAttribute`.
2. **Always pass `undefined` as the second arg and `{ timeout }` as the third arg to
   `page.waitForFunction`** — the wrong arg order silently ignores the timeout.
3. **Always use `[role="row"][row-index]` for grid row counts** — plain
   `[role="row"]` includes header rows and gives -1 on empty grids.
4. **Always use the 5-row editable-record scan in `beforeEach`** — inactive records
   have no Xrm attribute bindings and tests will silently fail without this guard.
5. **Always use `test.describe.serial`** — MDA tests share browser state and must run
   sequentially.

---

## Customer Setup Checklist

When helping a customer set up this project for their environment:

1. `rush install` + `rush build` from repo root
2. `npx playwright install msedge --with-deps` inside `packages/e2e-tests/`
3. Copy `.env.example` to `.env` inside `packages/e2e-tests/`
4. Fill in: `POWER_APPS_ENVIRONMENT_ID`, `CANVAS_APP_ID`, `CANVAS_APP_TENANT_ID`, `MODEL_DRIVEN_APP_URL`, `MS_AUTH_EMAIL`, and credentials
5. Install Northwind Traders solution: https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/northwind-install
6. `npm run auth:headful` — authenticate Canvas / Maker Portal
7. `npm run auth:mda:headful` — authenticate MDA
8. `npx playwright test --project=canvas-app` — verify canvas tests pass
9. `npx playwright test --project=model-driven-app` — verify MDA tests pass
10. Update `.azure-pipelines/e2e-tests.yml` pipeline variables to match the new environment
