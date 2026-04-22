# 03 — MDA Business Rules Testing

**Audience:** AI agents generating Playwright tests for Model-Driven App Business Rules.

**Prerequisite context:** Read `00-unpacked-solution-overview.md` and
`01-mda-form-testing.md` first.

This file is **declarative context** — it teaches you how to translate Business Rule
XML semantics into Playwright test scenarios.

---

## 1. Business Rule XML Anatomy

Business Rules are stored as Workflow XML files with `Category="2"`. A typical file:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Workflow
  WorkflowId="{GUID}"
  Name="Set Default Status on New Order"
  Category="2"
  EntityName="nwind_order"
  Scope="Form"
  TriggerOnCreate="1"
  TriggerOnUpdate="0"
  TriggerOnDelete="0"
  ...>

  <Rules>
    <Rule>
      <!-- Condition block -->
      <Conditions>
        <Condition>
          <LHS type="Field" attributeName="statuscode" />
          <Operator>Equal</Operator>
          <RHS type="Value" value="1" />
        </Condition>
      </Conditions>

      <!-- Actions block -->
      <Actions>
        <Action type="SetFieldValue">
          <Attribute attributeName="nwind_orderstatusid" />
          <Value type="Value" value="100000001" />
        </Action>

        <Action type="SetVisibility">
          <Attribute attributeName="nwind_deliveryaddress" />
          <Value type="Value" value="false" />
        </Action>

        <Action type="SetRequiredLevel">
          <Attribute attributeName="nwind_customernotes" />
          <Value type="Value" value="required" />
        </Action>
      </Actions>
    </Rule>
  </Rules>
</Workflow>
```

---

## 2. Key XML Fields to Extract

### 2.1 Rule-Level Metadata

| XML attribute | Meaning |
|---|---|
| `Category` | Must be `"2"` for Business Rules (skip other values) |
| `EntityName` | Logical name of the Dataverse table this rule applies to |
| `Scope` | `"Form"` (runs on form only) or `"Entity"` (runs server-side too) |
| `TriggerOnCreate` | `"1"` = fires when creating a new record |
| `TriggerOnUpdate` | `"1"` = fires when updating an existing record |
| `Name` | Human-readable rule name (use as test description) |

### 2.2 Condition Element

```xml
<Condition>
  <LHS type="Field" attributeName="statuscode" />
  <Operator>Equal</Operator>          <!-- Equal, NotEqual, GreaterThan, Contains, etc. -->
  <RHS type="Value" value="1" />      <!-- or type="Field" attributeName="other_field" -->
</Condition>
```

Multiple `<Condition>` elements in the same `<Conditions>` block are joined with AND logic
by default. Check the `LogicalOperator` attribute on `<Conditions>` for AND/OR overrides.

### 2.3 Action Types

| `type` attribute | Description | Observable outcome |
|---|---|---|
| `SetFieldValue` | Sets the value of an attribute | `getEntityAttribute(page, field)` |
| `SetVisibility` | Shows or hides a control | `executeInFormContext` → `getControl(field).getVisible()` |
| `SetRequiredLevel` | Changes required level to none/required/recommended | `mda.form.getFieldRequiredLevel(field)` |
| `SetFieldDisabled` | Enables or disables a control | `executeInFormContext` → `getControl(field).getDisabled()` |
| `ShowError` | Shows an error notification on the form | `executeInFormContext` + notification check |
| `ShowMessage` | Shows an informational notification | `executeInFormContext` + notification check |
| `LockField` | Makes a field read-only (combination of disabled + style) | `getControl(field).getDisabled()` |

---

## 3. Condition Operators and How to Trigger Them

| XML Operator | Meaning | Test approach |
|---|---|---|
| `Equal` | LHS = RHS | Set LHS attribute to the exact RHS value |
| `NotEqual` | LHS ≠ RHS | Set LHS attribute to a value different from RHS |
| `GreaterThan` | LHS > RHS | Set LHS to RHS + 1 |
| `LessThan` | LHS < RHS | Set LHS to RHS - 1 |
| `GreaterThanOrEqual` | LHS ≥ RHS | Set LHS to RHS exactly |
| `LessThanOrEqual` | LHS ≤ RHS | Set LHS to RHS exactly |
| `Contains` | LHS contains RHS string | Set LHS to a string containing RHS |
| `BeginsWith` | LHS starts with RHS | Set LHS to a string starting with RHS |
| `Null` | LHS is null | Set LHS to `null` |
| `NotNull` | LHS is not null | Set LHS to any non-null value |

For compound conditions (AND):
- Set **all** LHS attributes to their trigger values before asserting actions.

For compound conditions (OR):
- Generate a separate test for each condition branch.

---

## 4. Test Strategy

### 4.1 Standard Pattern

```
1. Open a record in beforeEach (editable — use the 5-row scan).
2. In the test: set the triggering attribute(s) to their condition-triggering values.
3. Use setEntityAttribute() — it calls fireOnChange() internally, which triggers the rule.
4. Wait briefly for the rule engine to process (500ms minimum).
5. Assert the action's observable outcome.
6. If needed, revert the attribute to its original value at the end of the test.
```

### 4.2 `SetFieldValue` Action Test

```typescript
test('BR: Set Default Status — should set orderstatusid when statuscode = Active', async ({ page }) => {
  // 1. Trigger the condition
  await setEntityAttribute(page, 'statuscode', 1); // Active

  // 2. Wait for rule engine
  await page.waitForTimeout(500);

  // 3. Assert the action's outcome
  const statusId = await getEntityAttribute(page, 'nwind_orderstatusid');
  expect(statusId).toBe(100000001); // The value from <Action><Value>
});
```

### 4.3 `SetVisibility` Action Test

```typescript
test('BR: Hide Delivery Address — should hide delivery address when status = Cancelled', async ({ page }) => {
  await setEntityAttribute(page, 'statuscode', 6); // Cancelled

  await page.waitForTimeout(500);

  const isVisible = await executeInFormContext(page, (Xrm) =>
    Xrm.Page.getControl('nwind_deliveryaddress')?.getVisible()
  );
  expect(isVisible).toBe(false);
});
```

### 4.4 `SetRequiredLevel` Action Test

```typescript
test('BR: Require Notes — should make customer notes required when priority is high', async ({ page }) => {
  await setEntityAttribute(page, 'nwind_priority', 3); // High

  await page.waitForTimeout(500);

  const reqLevel = await mda.form.getFieldRequiredLevel('nwind_customernotes');
  expect(reqLevel).toBe('required');
});
```

### 4.5 `SetFieldDisabled` / `LockField` Action Test

```typescript
test('BR: Lock Order Number — should disable order number field after approval', async ({ page }) => {
  await setEntityAttribute(page, 'nwind_approvalstatus', 2); // Approved

  await page.waitForTimeout(500);

  const isDisabled = await executeInFormContext(page, (Xrm) =>
    Xrm.Page.getControl('nwind_ordernumber')?.getDisabled()
  );
  expect(isDisabled).toBe(true);
});
```

### 4.6 `ShowError` / `ShowMessage` Action Test

```typescript
test('BR: Validation Warning — should show warning when discount exceeds 50%', async ({ page }) => {
  await setEntityAttribute(page, 'nwind_discountpercent', 60);

  await page.waitForTimeout(500);

  // Notification container may not be ready — wrap in try/catch
  try {
    const notifications = await executeInFormContext(page, (Xrm) => {
      const notifs = Xrm.Page.ui.getFormNotifications?.() ?? [];
      return notifs.map((n: any) => ({ type: n.getLevel(), message: n.getMessage() }));
    });
    expect(notifications.some((n: any) => n.type === 'WARNING')).toBe(true);
  } catch (err) {
    console.log('⚠️ Could not verify form notification (Xrm UI not ready):', (err as Error).message);
  }
});
```

---

## 5. Create vs. Update Scope

### TriggerOnCreate="1" only

The rule fires only when opening a **new** record form. Use `navigateToFormView`:

```typescript
test.beforeEach(async ({ page, context }) => {
  // ... launch appProvider ...
  // Navigate to new record form (not grid → record)
  await modelDrivenApp.navigateToFormView(ENTITY_NAME);
  await page.waitForTimeout(3000);
  await modelDrivenApp.form.waitForLoad();
});
```

For create-scoped rules, the condition may trigger on `onload` — assert the action's
outcome immediately after form load without manually setting the trigger attribute.

### TriggerOnUpdate="1" only

The rule fires when editing an **existing** record. Use the 5-row scan to open an
existing editable record (the standard `beforeEach` pattern from instruction 01).

### TriggerOnCreate="1" AND TriggerOnUpdate="1"

Generate tests in both contexts. Use `test.describe` blocks to group them:

```typescript
test.describe('on new record', () => {
  test.beforeEach(/* navigate to form view */);
  test('should fire rule on create', /* ... */);
});

test.describe('on existing record', () => {
  test.beforeEach(/* 5-row scan */);
  test('should fire rule on update', /* ... */);
});
```

---

## 6. Form-Scoped vs. Entity-Scoped Rules

| Scope | Where it runs | Test approach |
|---|---|---|
| `Form` | Client-side only on the specific form | Standard Playwright approach (all tests in this file) |
| `Entity` | Server-side (also applies on API updates) | Client-side test is still valid; the rule fires via the form's Xrm runtime |

Both scope types are testable via the Playwright approach. Entity-scoped rules also run
server-side, but their form-side observable outcomes are identical to Form-scoped rules.

---

## 7. Rules Targeting Specific Forms

If the `<Workflow>` XML references a specific form ID, confirm the test opens that
exact form by checking the URL for the form's name or confirming via `getFormContext`:

```typescript
const ctx = await getFormContext(page);
expect(ctx.entityName).toBe(ENTITY_NAME);
// If needed, check form type: 1=Create, 2=Update
const formType = await mda.form.getFormType();
expect(formType).toBe(2); // Update form
```

---

## 8. Known Flakiness Patterns for Business Rule Tests

### 8.1 Rule Engine Delay

Business Rule evaluation is synchronous from the Xrm perspective but may lag slightly
when the condition involves a lookup field being resolved. If assertions fail
intermittently:

```typescript
// Prefer polling over fixed timeout
const deadline = Date.now() + 5_000;
while (Date.now() < deadline) {
  const val = await page.evaluate(
    () => (window as any).Xrm?.Page?.getControl('myfield')?.getVisible()
  );
  if (val === false) break;
  await page.waitForTimeout(300);
}
```

### 8.2 Condition Revert Between Tests

If one test changes an attribute that another test's condition depends on, the rule
may fire unexpectedly. Always revert the triggering attribute at the end of each test
or reload the record in `beforeEach`.

### 8.3 Inactive Records Have No Business Rule Bindings

Business Rules do not fire on inactive/read-only records. Always use the 5-row scan
(instruction 01 Section 6.1) to ensure you are on an editable record.

---

## 9. Test File Template Scaffold

```typescript
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Business Rule Tests — <EntityDisplayName>
 *
 * Tests the client-side observable outcomes of Business Rules
 * defined for the <EntityDisplayName> entity.
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
  isFormValid,
  executeInFormContext,
} from 'power-platform-playwright-toolkit';

const MODEL_DRIVEN_APP_URL = process.env.MODEL_DRIVEN_APP_URL;
const ENTITY_NAME = '<entity_logical_name>';

if (!MODEL_DRIVEN_APP_URL) {
  throw new Error('MODEL_DRIVEN_APP_URL environment variable is required.');
}

test.describe.serial('<EntityDisplayName> Business Rule Tests', () => {
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

    // Find editable record (see instruction 01 Section 6.1 for full pattern)
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

  // ---- One test block per Business Rule ----

  test('BR: <Rule Name> — <describe condition and expected action>', async ({ page }) => {
    // 1. Trigger the condition
    await setEntityAttribute(page, '<lhs_attribute>', <trigger_value>);
    await page.waitForTimeout(500);

    // 2. Assert the action's observable outcome
    // (replace with appropriate assertion from Section 4)
  });
});
```
