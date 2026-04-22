# 01 — MDA Form Testing

**Audience:** AI agents generating Playwright tests for Model-Driven App forms.

**Prerequisite context:** Read `00-unpacked-solution-overview.md` first.

This file is **declarative context** — it teaches you how to map every FormXml element
to a Playwright test concern using the `power-platform-playwright-toolkit`.

---

## 1. Toolkit API Quick Reference

All MDA form interactions go through these toolkit functions and components. Never call
`page.locator()` or `page.fill()` directly on Dataverse form content.

### 1.1 FormContext Functions (standalone, import from toolkit)

```typescript
import {
  getFormContext,       // returns FormContextData: entityName, entityId, isDirty, isValid, attributeNames
  getEntityAttribute,  // getEntityAttribute(page, 'logicalName') → any
  setEntityAttribute,  // setEntityAttribute(page, 'logicalName', value) → void
  getAllEntityAttributes, // returns Record<string, any> of all bound attributes
  saveForm,            // saveForm(page) or saveForm(page, { saveMode: 'saveandclose' })
  isFormDirty,         // boolean
  isFormValid,         // boolean
  executeInFormContext, // executeInFormContext(page, (Xrm) => { ... })
} from 'power-platform-playwright-toolkit';
```

### 1.2 ModelDrivenAppPage Components

```typescript
const mda = appProvider.getModelDrivenAppPage();

// Grid
await mda.grid.navigateToGridView(entityLogicalName);
await mda.grid.waitForGridLoad();
const count = await mda.grid.getRowCount();           // counts [role="row"][row-index] only
await mda.grid.openRecord({ rowNumber: 0 });
await mda.grid.getCellValue(rowIndex, 'col-id');

// Form (via FormComponent)
await mda.form.waitForLoad();
await mda.form.getAttribute('logicalName');           // thin wrapper over getEntityAttribute
await mda.form.setAttribute('logicalName', value);   // thin wrapper over setEntityAttribute
await mda.form.save();
await mda.form.isDirty();
await mda.form.isValid();
await mda.form.getFormType();                         // 1=Create, 2=Update, 3=ReadOnly
await mda.form.navigateToTab({ tab: 'TAB_NAME' });
await mda.form.navigateToSection({ section: 'SECTION_NAME' });
await mda.form.getFieldRequiredLevel('logicalName');  // 'none' | 'required' | 'recommended'
await mda.form.getFieldControlType('logicalName');    // e.g. 'string', 'optionset', etc.
await mda.form.setFieldVisibility('logicalName', true/false);
await mda.form.setFieldDisabled('logicalName', true/false);
await mda.form.execute((Xrm) => { /* arbitrary Xrm code */ });

// Navigation
await mda.navigateToGridView(entityLogicalName);
await mda.navigateToFormView(entityLogicalName);      // opens new-record form
```

---

## 2. Mapping FormXml Elements to Test Concerns

### 2.1 Text Fields (`classid` = MultiLine / Text GUIDs)

**FormXml indicator:**
```xml
<control id="nwind_ordernumber" classid="{4273EDBD-AC1D-40d3-9FB2-095C621B552D}" />
```

**Tests to generate:**
- Read current value: `await getEntityAttribute(page, 'nwind_ordernumber')`
- Write a new value: `await setEntityAttribute(page, 'nwind_ordernumber', 'TEST-001')`
- Verify form is dirty after write: `expect(await isFormDirty(page)).toBe(true)`
- Save and verify: `await saveForm(page)` + `expect(await isFormDirty(page)).toBe(false)`
- Verify saved value: `expect(await getEntityAttribute(page, 'nwind_ordernumber')).toBe('TEST-001')`

### 2.2 OptionSet / Choice Fields (`classid` = OptionSet GUID)

**FormXml indicator:**
```xml
<control id="nwind_orderstatusid" classid="{ADA2203E-B4CD-49be-9DDF-234D3A657EC8}" />
```

**Tests to generate:**
- Set by numeric value (the integer code, not the label):
  `await setEntityAttribute(page, 'nwind_orderstatusid', 100000001)`
- Read back: `expect(await getEntityAttribute(page, 'nwind_orderstatusid')).toBe(100000001)`
- The option set integer values are in `Attributes/<fieldname>.xml` under `<OptionSetOptions>`.

### 2.3 Two-Option (Boolean) Fields (`classid` = TwoOptions GUID)

```typescript
await setEntityAttribute(page, 'nwind_isurgent', true);
expect(await getEntityAttribute(page, 'nwind_isurgent')).toBe(true);
```

### 2.4 Lookup Fields (`classid` = Lookup GUID)

```typescript
await setEntityAttribute(page, 'customerid', [{
  id: '<guid>',
  name: 'Customer Name',
  entityType: 'account',
}]);
// Read back — returns array
const val = await getEntityAttribute(page, 'customerid');
expect(Array.isArray(val)).toBe(true);
expect(val[0].id).toBeTruthy();
```

> **Note:** In tests that require a real lookup GUID, use `Xrm.WebApi.retrieveMultipleRecords`
> inside `executeInFormContext` to fetch an existing record ID rather than hardcoding one.

### 2.5 Date / DateTime Fields (`classid` = DateTime GUID)

```typescript
const testDate = new Date('2025-06-15T09:00:00');
await setEntityAttribute(page, 'nwind_orderdate', testDate);
const readBack = await getEntityAttribute(page, 'nwind_orderdate');
// D365 returns ISO string or Date — normalise before assertion
expect(new Date(readBack).toISOString().startsWith('2025-06-15')).toBe(true);
```

### 2.6 Number / Currency Fields

```typescript
await setEntityAttribute(page, 'nwind_orderamount', 1500.50);
expect(await getEntityAttribute(page, 'nwind_orderamount')).toBeCloseTo(1500.50, 2);
```

### 2.7 Required Fields

For each field where `requiredness="required"` in FormXml or `<RequiredLevel>required</RequiredLevel>`
in Attribute XML:

```typescript
// Verify the toolkit reports it as required
expect(await mda.form.getFieldRequiredLevel('nwind_ordernumber')).toBe('required');

// Attempt to save without the required field → form should be invalid
await setEntityAttribute(page, 'nwind_ordernumber', null);
await saveForm(page);
expect(await isFormValid(page)).toBe(false);
```

### 2.8 Read-Only / Disabled Fields

**FormXml indicator:** `<control ... disabled="true" />`

```typescript
// The control type is still accessible even for read-only fields
const type = await mda.form.getFieldControlType('nwind_readonly_field');
expect(type).toBeTruthy();

// setEntityAttribute will throw for read-only fields — wrap in try/catch if expected
try {
  await setEntityAttribute(page, 'nwind_readonly_field', 'new value');
  throw new Error('Expected setEntityAttribute to throw for a read-only field');
} catch (err: any) {
  expect(err.message).toMatch(/Attribute.*not found|read-only/i);
}
```

---

## 3. Form-Level Tests

### 3.1 getFormContext Smoke Test

Always include this as the first test in any form test suite:

```typescript
test('should return correct form context', async ({ page }) => {
  const ctx = await getFormContext(page);
  expect(ctx.entityName).toBe(ENTITY_NAME);
  expect(ctx.entityId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
  expect(ctx.attributeNames.length).toBeGreaterThan(0);
  expect(ctx.isValid).toBe(true);
});
```

### 3.2 Save / Dirty-State Test

```typescript
test('should track dirty state through save cycle', async ({ page }) => {
  expect(await isFormDirty(page)).toBe(false);        // clean at start

  await setEntityAttribute(page, WRITABLE_TEXT_FIELD, 'dirty-value');
  await page.waitForTimeout(500);
  expect(await isFormDirty(page)).toBe(true);

  await saveForm(page);
  await page.waitForTimeout(2000);
  expect(await isFormDirty(page)).toBe(false);        // clean after save
});
```

---

## 4. Tab and Section Navigation

If the FormXml contains multiple `<tab>` elements, generate a navigation test:

```typescript
test('should navigate to tab by name', async ({ page }) => {
  // Use the 'name' attribute from <tab name="..."> NOT the display label
  await mda.form.navigateToTab({ tab: 'DETAILS_TAB' });
  // Verify a field visible only on that tab is accessible
  const val = await getEntityAttribute(page, 'nwind_deliveryaddress');
  expect(val).toBeDefined();
});
```

---

## 5. getAllEntityAttributes Inventory Test

Useful to verify how many fields are bound on the form:

```typescript
test('should expose all form attributes', async ({ page }) => {
  const attrs = await getAllEntityAttributes(page);
  const keys = Object.keys(attrs);
  console.log('Bound attributes:', keys);
  expect(keys.length).toBeGreaterThan(0);
});
```

---

## 6. Known Flakiness Patterns — MUST FOLLOW

These patterns are documented in detail in `CLAUDE.md`. Always apply them.

### 6.1 Find an Editable Record in beforeEach

D365 inactive/closed records have no Xrm attribute bindings. The `beforeEach` block
**must** scan up to 5 rows to find a writable record:

```typescript
test.beforeEach(async ({ page, context }) => {
  appProvider = new AppProvider(page, context);
  await appProvider.launch({
    app: APP_NAME,
    type: AppType.ModelDriven,
    mode: AppLaunchMode.Play,
    skipMakerPortal: true,
    directUrl: process.env.MODEL_DRIVEN_APP_URL!,
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
  if (!found) throw new Error('No writable record found in first 5 rows');
});
```

### 6.2 `page.waitForFunction` Options Must Be in the Third Argument

```typescript
// ✅ CORRECT
await page.waitForFunction(() => { ... }, undefined, { timeout: 30_000 });

// ❌ WRONG — { timeout } is silently treated as the page-function argument
await page.waitForFunction(() => { ... }, { timeout: 30_000 });
```

### 6.3 Grid Row Count — Use `[row-index]` Attribute

```typescript
// ✅ CORRECT — only data rows have row-index
const count = await page.locator('[role="row"][row-index]').count();

// ❌ WRONG — header rows also have role="row"; count - 1 gives -1 on empty grid
const count = await page.locator('[role="row"]').count() - 1;
```

### 6.4 Navigate After Save with waitForURL Not waitForTimeout

```typescript
await saveForm(page);
// ✅ CORRECT — wait for Xrm to confirm save
await page.waitForFunction(
  () => (window as any).Xrm?.Page?.data?.entity?.getIsDirty() === false,
  undefined,
  { timeout: 30_000 }
);

// ❌ WRONG — arbitrary timer, fails under load
await page.waitForTimeout(5000);
```

---

## 7. Test File Template Scaffold

Use this structure for every generated form test file:

```typescript
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

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
} from 'power-platform-playwright-toolkit';

const MODEL_DRIVEN_APP_URL = process.env.MODEL_DRIVEN_APP_URL;
const ENTITY_NAME = '<entity_logical_name>';

if (!MODEL_DRIVEN_APP_URL) {
  throw new Error('MODEL_DRIVEN_APP_URL environment variable is required.');
}

test.describe.serial('<Entity Display Name> Form Tests', () => {
  let appProvider: AppProvider;
  let modelDrivenApp: ModelDrivenAppPage;

  test.beforeEach(async ({ page, context }) => {
    // ... editable-record scan (see Section 6.1 above) ...
  });

  test('should return correct form context', async ({ page }) => {
    // Section 3.1
  });

  test('should track dirty state through save cycle', async ({ page }) => {
    // Section 3.2
  });

  // ... field-type tests (Sections 2.1–2.8) ...

  // ... tab navigation tests (Section 4) if tabs present ...
});
```

---

## 8. Xrm.WebApi Cleanup Pattern

For tests that create records, always delete via `Xrm.WebApi` at the end:

```typescript
test.afterEach(async ({ page }) => {
  try {
    await page.evaluate(() => {
      const entity = (window as any).Xrm?.Page?.data?.entity;
      if (!entity) return;
      const name = entity.getEntityName();
      const id = entity.getId().replace(/^\{|\}$/g, '');
      return (window as any).Xrm.WebApi.deleteRecord(name, id);
    });
  } catch {
    // Record may already be deleted or never created — ignore
  }
});
```
