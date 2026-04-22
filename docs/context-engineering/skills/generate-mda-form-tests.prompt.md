# Skill: Generate MDA Form Tests

**Type:** Skill (imperative prompt)
**Input:** Solution manifest (from `analyze-solution-structure.prompt.md`) + target entity name
**Output:** A complete `<entity>-form.test.ts` Playwright test file

---

## Instructions for the AI Agent

You are generating a Playwright test file for a Model-Driven App form. The test file
must use only the `power-platform-playwright-toolkit` — never call `page.locator()`
or `page.fill()` directly on Dataverse content.

**Before starting:** Read these instruction files:
- `docs/context-engineering/instructions/00-unpacked-solution-overview.md`
- `docs/context-engineering/instructions/01-mda-form-testing.md`

---

## Inputs

Replace all placeholders with actual values before sending this prompt:

```
MANIFEST: <paste the full JSON manifest from analyze-solution-structure here>
TARGET_ENTITY: <entity logical name, e.g. nwind_order>
APP_NAME: <the display name of the Model-Driven App, e.g. "Northwind Orders">
OUTPUT_FILE: packages/e2e-tests/tests/<subdirectory>/<entity>-form.test.ts
```

---

## Steps

Work through the manifest for `TARGET_ENTITY` and generate the test file by following
each step in order.

### Step 1 — Extract Entity Metadata from Manifest

From `manifest.entities[]` where `logicalName === TARGET_ENTITY`, collect:
- `displayName` → used as the test suite description
- `primaryNameAttribute` → the text field used in smoke tests
- `forms[]` (main forms only — `type === "main"`)
  - For the first (or only) main form, extract: tabs, sections, fields, events

### Step 2 — Categorise Fields

Group the form's `fields[]` by control type using the classid → type map from
instruction 01, Section 5:

| Group | Criteria |
|---|---|
| `textFields` | `controlType === "string"` and `disabled === false` |
| `numberFields` | `controlType` in `["integer", "decimal", "money", "float"]` and `disabled === false` |
| `optionSetFields` | `controlType === "optionset"` and `disabled === false` |
| `twoOptionFields` | `controlType === "boolean"` and `disabled === false` |
| `lookupFields` | `controlType === "lookup"` and `disabled === false` |
| `dateFields` | `controlType === "datetime"` and `disabled === false` |
| `requiredFields` | `requiredLevel === "required"` (across all types) |
| `readOnlyFields` | `disabled === true` |

Pick **one representative field** from each non-empty group for focused tests.
Use all fields from `requiredFields` and `readOnlyFields` groups.

### Step 3 — Generate the File Header

```typescript
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Form Tests — <EntityDisplayName>
 *
 * Auto-generated tests for the <EntityDisplayName> main form.
 * Generated from solution manifest by generate-mda-form-tests skill.
 *
 * Prerequisites:
 *   - MODEL_DRIVEN_APP_URL set in .env
 *   - npm run auth:mda:headful completed
 */

import { test, expect } from '@playwright/test';
import {
  AppProvider,
  AppType,
  AppLaunchMode,
  ModelDrivenAppPage,
  getFormContext,
  getEntityAttribute,
  setEntityAttribute,
  getAllEntityAttributes,
  saveForm,
  isFormDirty,
  isFormValid,
  executeInFormContext,
  generateUniqueOrderNumber,
} from 'power-platform-playwright-toolkit';

const MODEL_DRIVEN_APP_URL = process.env.MODEL_DRIVEN_APP_URL;
const ENTITY_NAME = '<TARGET_ENTITY>';
const APP_NAME = '<APP_NAME>';

if (!MODEL_DRIVEN_APP_URL) {
  throw new Error('MODEL_DRIVEN_APP_URL environment variable is required.');
}
```

### Step 4 — Generate `test.describe.serial` and `beforeEach`

Use the editable-record scan pattern from instruction 01, Section 6.1 **exactly as
written** — do not simplify or shorten it:

```typescript
test.describe.serial('<EntityDisplayName> Form Tests', () => {
  let appProvider: AppProvider;
  let modelDrivenApp: ModelDrivenAppPage;

  test.beforeEach(async ({ page, context }) => {
    appProvider = new AppProvider(page, context);
    await appProvider.launch({
      app: APP_NAME,
      type: AppType.ModelDriven,
      mode: AppLaunchMode.Play,
      skipMakerPortal: true,
      directUrl: MODEL_DRIVEN_APP_URL!,
    });
    modelDrivenApp = appProvider.getModelDrivenAppPage();
    await modelDrivenApp.navigateToGridView(ENTITY_NAME);
    await page.waitForTimeout(3000);

    let found = false;
    for (let row = 0; row < 5; row++) {
      await modelDrivenApp.grid.openRecord({ rowNumber: row });
      await page.waitForURL(/pagetype=entityrecord/, { timeout: 15_000 });
      await page.waitForTimeout(2_000);

      const isWritable = await page.evaluate(() => {
        const entity = (window as any).Xrm?.Page?.data?.entity;
        if (!entity) return false;
        let count = 0;
        try { entity.attributes.forEach(() => { count++; }); } catch { /* ignore */ }
        if (count === 0) return false;
        try { return entity.isValid() === true; } catch { return false; }
      });

      if (isWritable) { found = true; break; }
      await modelDrivenApp.navigateToGridView(ENTITY_NAME);
      await page.waitForTimeout(2_000);
    }
    if (!found) {
      throw new Error(
        'No writable record found in first 5 rows. ' +
        'Ensure there are active records with no validation errors in the environment.'
      );
    }
  });
```

### Step 5 — Emit the `getFormContext` Smoke Test

Always the first test:

```typescript
  test('should return correct form context', async ({ page }) => {
    const ctx = await getFormContext(page);
    expect(ctx.entityName).toBe(ENTITY_NAME);
    expect(ctx.entityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(ctx.attributeNames.length).toBeGreaterThan(0);
    console.log('Attributes on form:', ctx.attributeNames);
  });
```

### Step 6 — Emit the Dirty-State Test

```typescript
  test('should track dirty state through save cycle', async ({ page }) => {
    expect(await isFormDirty(page)).toBe(false);
    await setEntityAttribute(page, '<primaryNameAttribute>', generateUniqueOrderNumber());
    await page.waitForTimeout(500);
    expect(await isFormDirty(page)).toBe(true);
    expect(await isFormValid(page)).toBe(true);
    await saveForm(page);
    await page.waitForFunction(
      () => (window as any).Xrm?.Page?.data?.entity?.getIsDirty() === false,
      undefined,
      { timeout: 30_000 }
    );
    expect(await isFormDirty(page)).toBe(false);
  });
```

### Step 7 — Emit Field-Type Tests

For each non-empty field group from Step 2, emit one test using the patterns in
instruction 01 Sections 2.1–2.8.

**Text field example:**
```typescript
  test('should read and write text field: <fieldLogicalName>', async ({ page }) => {
    const original = await getEntityAttribute(page, '<fieldLogicalName>');
    const testValue = 'TEST-' + Date.now();
    await setEntityAttribute(page, '<fieldLogicalName>', testValue);
    await page.waitForTimeout(500);
    expect(await isFormDirty(page)).toBe(true);
    await saveForm(page);
    await page.waitForFunction(
      () => (window as any).Xrm?.Page?.data?.entity?.getIsDirty() === false,
      undefined,
      { timeout: 30_000 }
    );
    expect(await getEntityAttribute(page, '<fieldLogicalName>')).toBe(testValue);
    // Restore original value
    await setEntityAttribute(page, '<fieldLogicalName>', original);
    await saveForm(page);
    await page.waitForFunction(
      () => (window as any).Xrm?.Page?.data?.entity?.getIsDirty() === false,
      undefined,
      { timeout: 30_000 }
    );
  });
```

Apply the correct pattern for each field type. Substitute the actual `fieldLogicalName`
from the manifest.

### Step 8 — Emit Required Field Tests

For each field in `requiredFields`:

```typescript
  test('should report required level for <fieldLogicalName>', async ({ page }) => {
    const reqLevel = await modelDrivenApp.form.getFieldRequiredLevel('<fieldLogicalName>');
    expect(reqLevel).toBe('required');
  });
```

### Step 9 — Emit Read-Only Field Tests (if `readOnlyFields` non-empty)

```typescript
  test('should report control type for read-only field: <fieldLogicalName>', async ({ page }) => {
    const type = await modelDrivenApp.form.getFieldControlType('<fieldLogicalName>');
    expect(type).toBeTruthy();
    console.log('Control type for <fieldLogicalName>:', type);
  });
```

### Step 10 — Emit Tab Navigation Test (if multiple tabs exist)

Only emit if `manifest.entities[TARGET_ENTITY].forms[0].tabs.length > 1`:

```typescript
  test('should navigate to tab: <tabName>', async ({ page }) => {
    await modelDrivenApp.form.navigateToTab({ tab: '<tabName>' });
    // Assert a field visible only on that tab
    const val = await getEntityAttribute(page, '<fieldOnThatTab>');
    expect(val).toBeDefined();
  });
```

### Step 11 — Emit getAllEntityAttributes Inventory Test

```typescript
  test('should expose all form attributes', async ({ page }) => {
    const attrs = await getAllEntityAttributes(page);
    const keys = Object.keys(attrs);
    expect(keys.length).toBeGreaterThan(0);
    console.log(`Form exposes ${keys.length} attributes:`, keys);
  });
```

### Step 12 — Close the Describe Block

```typescript
}); // end test.describe.serial
```

---

## Output Rules

- The output must be a **single TypeScript file** with no prose, comments about
  generation, or markdown fences — only the `.ts` source.
- Every `page.waitForFunction` call must pass `undefined` as the second argument and
  `{ timeout: N }` as the **third** argument.
- Every grid row count must use `[role="row"][row-index]`.
- Do not use `page.locator()` or `page.fill()` to interact with Dataverse form fields.
- Import only the toolkit symbols listed in Step 3 — remove any that are unused.
- Use `test.describe.serial` (not `test.describe`).
