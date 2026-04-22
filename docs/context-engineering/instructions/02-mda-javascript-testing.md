# 02 — MDA JavaScript Testing

**Audience:** AI agents generating Playwright tests for Model-Driven App JavaScript
web resources (event handlers).

**Prerequisite context:** Read `00-unpacked-solution-overview.md` and
`01-mda-form-testing.md` first.

This file is **declarative context** — it teaches you how to infer test scenarios
from JavaScript web resource source code and FormXml event registrations.

---

## 1. How JavaScript Web Resources Are Registered on a Form

Event handler bindings live inside the `<events>` element of a FormXml file:

```xml
<form>
  ...
  <events>
    <!-- FORM-LEVEL events -->
    <event name="onload" application="false" active="true">
      <Handlers>
        <Handler
          functionName="MyNS.onLoad"
          libraryName="new_scripts_mylib"
          handlerUniqueId="{GUID}"
          enabled="true"
          passExecutionContext="true"
          parameters="" />
      </Handlers>
    </event>

    <event name="onsave" application="false" active="true">
      <Handlers>
        <Handler functionName="MyNS.onSave" libraryName="new_scripts_mylib" ... />
      </Handlers>
    </event>

    <!-- ATTRIBUTE-LEVEL events — note the 'attribute' attribute -->
    <event name="onchange" attribute="nwind_orderstatusid" application="false" active="true">
      <Handlers>
        <Handler functionName="MyNS.onStatusChange" libraryName="new_scripts_mylib" ... />
      </Handlers>
    </event>

    <event name="onchange" attribute="nwind_customerid" application="false" active="true">
      <Handlers>
        <Handler functionName="MyNS.onCustomerChange" libraryName="new_scripts_mylib" ... />
      </Handlers>
    </event>
  </events>
</form>
```

### Key attributes on `<event>`

| Attribute | Meaning |
|---|---|
| `name` | Event type: `onload`, `onsave`, `onchange` |
| `attribute` | (onchange only) The logical name of the attribute that triggers this handler |
| `active` | `"true"` means the handler is enabled — only generate tests for active handlers |

### Key attributes on `<Handler>`

| Attribute | Meaning |
|---|---|
| `functionName` | Fully qualified JS function name, e.g. `MyNS.onLoad` |
| `libraryName` | Web resource unique name, e.g. `new_scripts_mylib` |
| `enabled` | `"true"` means the handler is active |
| `passExecutionContext` | `"true"` means the handler receives `executionContext` as first arg |

---

## 2. Finding the Source File for a Handler

1. Take `libraryName` from the `<Handler>`, e.g. `new_scripts_mylib`.
2. Search `WebResources/` recursively for a file matching that name:
   - `WebResources/new_scripts_mylib.js`
   - `WebResources/scripts/new_scripts_mylib.js`
   - `WebResources/new/scripts/mylib.js` (pac CLI may use slash → directory separator)
3. Read the source file to understand what the handler does.

---

## 3. Reading the JS Source — What to Look For

Scan the handler function for these patterns:

### 3.1 formContext Access

```javascript
// Handler receives executionContext — extract formContext first
function onLoad(executionContext) {
  const formContext = executionContext.getFormContext();
  // ...
}
```

### 3.2 Field Read / Write

```javascript
// Reading
const val = formContext.getAttribute('nwind_orderstatusid').getValue();

// Writing
formContext.getAttribute('nwind_ordernumber').setValue('ORD-001');
formContext.getAttribute('nwind_ordernumber').fireOnChange();
```

→ **Test concern:** after triggering the event, assert the field value matches expectations.

### 3.3 Visibility and Required Level Changes

```javascript
formContext.getControl('nwind_deliveryaddress').setVisible(false);
formContext.getAttribute('nwind_deliveryaddress').setRequiredLevel('none');
```

→ **Test concern:** after triggering, assert visibility/required level via
`executeInFormContext` or `form.getFieldRequiredLevel`.

### 3.4 Form Notifications

```javascript
formContext.ui.setFormNotification('Please fill in all required fields', 'WARNING', 'missing-fields');
formContext.ui.clearFormNotification('missing-fields');
```

→ **Test concern:** after triggering, check for notification presence via
`executeInFormContext`. Wrap in try/catch — notification container may not be
initialised in some form states.

### 3.5 Xrm.WebApi Calls

```javascript
Xrm.WebApi.retrieveMultipleRecords('account', '?$filter=accountid eq ' + accountId)
  .then(result => { /* set fields based on result */ });
```

→ **Test concern:** set up the triggering field, wait for async side-effects, then
assert the downstream fields. Use `page.waitForTimeout(2000)` as a minimum wait after
triggering an async handler. Prefer `page.waitForFunction` polling over fixed timeouts.

### 3.6 Navigation and Dialogs

```javascript
Xrm.Navigation.openUrl('https://...');
Xrm.Navigation.openAlertDialog({ text: 'Invalid entry' });
```

→ **Test concern:** these are harder to test deterministically. If the handler opens
a dialog, use `page.waitForSelector('[role="dialog"]')` after triggering. Log a warning
in the generated test if the behaviour is non-deterministic.

---

## 4. Test Strategy by Event Type

### 4.1 `onload` Handler

The handler fires when the form page loads. To test it:

1. Open the form (done in `beforeEach`).
2. Wait for the form to fully load (`mda.form.waitForLoad()`).
3. Assert the **initial state** the handler is expected to produce:
   - Field visibility
   - Required level overrides
   - Default field values set by the handler
   - Form notifications

```typescript
test('onload: should set default order status', async ({ page }) => {
  // Form was opened in beforeEach — assert the handler's expected outcome
  const status = await getEntityAttribute(page, 'nwind_orderstatusid');
  // Handler sets status to 'New' (code 1) on load for new records
  expect(status).toBe(1);
});

test('onload: should hide delivery address for non-shipping orders', async ({ page }) => {
  const isVisible = await executeInFormContext(page, (Xrm) =>
    Xrm.Page.getControl('nwind_deliveryaddress')?.getVisible() ?? true
  );
  expect(isVisible).toBe(false);
});
```

### 4.2 `onchange` Handler

The handler fires when a specific attribute value changes. `setEntityAttribute` calls
`fireOnChange()` internally, so it correctly triggers the handler.

```typescript
test('onchange(nwind_orderstatusid): should hide payment fields when status is Cancelled', async ({ page }) => {
  // Trigger the change event
  await setEntityAttribute(page, 'nwind_orderstatusid', 100000005); // Cancelled

  // Give async handlers a moment to settle
  await page.waitForTimeout(1000);

  // Assert the expected side-effect
  const isVisible = await executeInFormContext(page, (Xrm) =>
    Xrm.Page.getControl('nwind_paymentmethod')?.getVisible() ?? true
  );
  expect(isVisible).toBe(false);
});
```

**Important:** Always revert the changed field after the test (or use a fresh record)
to avoid contaminating subsequent tests.

### 4.3 `onsave` Handler

The handler fires when the user saves the form. Trigger it with `saveForm(page)`.

```typescript
test('onsave: should prevent save when order amount is negative', async ({ page }) => {
  await setEntityAttribute(page, 'nwind_orderamount', -100);

  // Attempt to save — the onsave handler should prevent it and show a notification
  await saveForm(page);
  await page.waitForTimeout(1500);

  // The form should still be dirty (save was blocked)
  expect(await isFormDirty(page)).toBe(true);

  // Verify the notification
  try {
    const hasNotification = await executeInFormContext(page, (Xrm) => {
      // Check for notifications (implementation varies by D365 version)
      return !!Xrm.Page.ui.getFormNotifications?.()?.length;
    });
    expect(hasNotification).toBe(true);
  } catch {
    console.log('⚠️ Could not verify form notification (container not ready)');
  }
});
```

---

## 5. Using `executeInFormContext` for Side-Effect Observation

`executeInFormContext` is the primary tool for verifying outcomes of JS handlers because
it runs code in the same Xrm context as the handler:

```typescript
// Check field visibility
const isVisible = await executeInFormContext(page, (Xrm) =>
  Xrm.Page.getControl('fieldLogicalName')?.getVisible()
);

// Check required level
const reqLevel = await executeInFormContext(page, (Xrm) =>
  Xrm.Page.getAttribute('fieldLogicalName')?.getRequiredLevel()
);

// Check if field is disabled
const isDisabled = await executeInFormContext(page, (Xrm) =>
  Xrm.Page.getControl('fieldLogicalName')?.getDisabled()
);

// Get a field value set by the handler
const value = await executeInFormContext(page, (Xrm) =>
  Xrm.Page.getAttribute('fieldLogicalName')?.getValue()
);
```

---

## 6. Anti-Patterns — DO NOT DO THESE

### 6.1 Do NOT Re-Implement Business Logic in the Test

```typescript
// ❌ WRONG — duplicating the handler logic in the test
test('should calculate discount', async ({ page }) => {
  const amount = await getEntityAttribute(page, 'nwind_orderamount');
  const expectedDiscount = amount > 1000 ? amount * 0.1 : 0;  // ← duplicated logic
  expect(await getEntityAttribute(page, 'nwind_discount')).toBe(expectedDiscount);
});

// ✅ CORRECT — test observable outcome with a specific, known input
test('should apply 10% discount for orders over £1000', async ({ page }) => {
  await setEntityAttribute(page, 'nwind_orderamount', 1500);
  await page.waitForTimeout(500); // wait for onchange handler
  expect(await getEntityAttribute(page, 'nwind_discount')).toBeCloseTo(150, 2);
});
```

### 6.2 Do NOT Use `page.waitForFunction` to Poll for Handler Effects Inside a Loop

Use `page.evaluate` polling instead (see `CLAUDE.md` "Known Flakiness Patterns"):

```typescript
// ❌ WRONG — Xrm Collection API doesn't work reliably in waitForFunction polling
await page.waitForFunction(
  () => (window as any).Xrm?.Page?.getAttribute('myfield')?.getValue() === 'expected',
  undefined,
  { timeout: 10_000 }
);

// ✅ CORRECT — poll with page.evaluate + waitForTimeout
const deadline = Date.now() + 10_000;
while (Date.now() < deadline) {
  const val = await page.evaluate(
    () => (window as any).Xrm?.Page?.getAttribute('myfield')?.getValue()
  );
  if (val === 'expected') break;
  await page.waitForTimeout(500);
}
```

### 6.3 Do NOT Assume Handler Fires Synchronously

Always add a short wait (`page.waitForTimeout(500)` minimum) between triggering an event
and asserting its side-effects, especially when the handler uses `setTimeout` or
`Xrm.WebApi` async calls.

---

## 7. Mapping libraryName Back to FormXml Event Bindings

To find all forms that use a given web resource:

1. Search all `FormXml/**/*.xml` files for `libraryName="<webresource_unique_name>"`.
2. For each matching file, extract all `<event>` elements that reference that library.
3. Use this to understand which entity and which form the web resource targets.

This is the reverse mapping: JS file → entity → form → events.

---

## 8. Test File Template Scaffold

```typescript
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * JavaScript Event Handler Tests — <WebResourceName>
 *
 * Tests the observable outcomes of the <WebResourceName> event handlers
 * registered on the <EntityDisplayName> main form.
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
  saveForm,
  isFormDirty,
  executeInFormContext,
} from 'power-platform-playwright-toolkit';

const MODEL_DRIVEN_APP_URL = process.env.MODEL_DRIVEN_APP_URL;
const ENTITY_NAME = '<entity_logical_name>';

if (!MODEL_DRIVEN_APP_URL) {
  throw new Error('MODEL_DRIVEN_APP_URL environment variable is required.');
}

test.describe.serial('<WebResourceName> Event Handler Tests', () => {
  let appProvider: AppProvider;
  let modelDrivenApp: ModelDrivenAppPage;

  test.beforeEach(async ({ page, context }) => {
    appProvider = new AppProvider(page, context);
    await appProvider.launch({
      app: '<App Name>',
      type: AppType.ModelDriven,
      mode: AppLaunchMode.Play,
      skipMakerPortal: true,
      directUrl: MODEL_DRIVEN_APP_URL,
    });
    modelDrivenApp = appProvider.getModelDrivenAppPage();

    // Find editable record (see instruction 01 Section 6.1)
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

  // ---- onload tests ----
  test('onload: <describe expected initial state>', async ({ page }) => {
    // Assert initial state set by the onload handler
  });

  // ---- onchange tests (one per attribute event) ----
  test('onchange(<attribute>): <describe expected side-effect>', async ({ page }) => {
    await setEntityAttribute(page, '<triggering_attribute>', <trigger_value>);
    await page.waitForTimeout(1000);
    // Assert side-effect
  });

  // ---- onsave tests ----
  test('onsave: <describe expected behaviour on save>', async ({ page }) => {
    // Set up conditions
    await saveForm(page);
    await page.waitForTimeout(1500);
    // Assert post-save state
  });
});
```
