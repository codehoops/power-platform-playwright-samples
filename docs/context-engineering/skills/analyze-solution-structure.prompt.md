# Skill: Analyze Solution Structure

**Type:** Skill (imperative prompt)
**Input:** Path to an unpacked Power Platform solution folder
**Output:** A structured JSON manifest describing entities, forms, fields, events, business rules, and JavaScript web resources

---

## Instructions for the AI Agent

You are analyzing an unpacked Power Platform solution to produce a manifest that will
be consumed by the other context-engineering skills. Follow every step precisely and
output only valid JSON at the end.

**Before starting:** Read
`docs/context-engineering/instructions/00-unpacked-solution-overview.md`
to understand the file layout.

---

## Inputs

Replace the placeholder with the actual value before sending this prompt:

```
SOLUTION_FOLDER: <absolute or repo-relative path to the unpacked solution folder>
```

---

## Steps

### Step 1 — Discover Entities

1. List all subdirectories of `<SOLUTION_FOLDER>/Entities/`.
2. For each subdirectory, read `Entity.xml` and extract:
   - `LogicalName` (the subdirectory name, confirmed from `<Name>` element text content)
   - `DisplayName` (from `<LocalizedName>` or `<DisplayName>` in Entity.xml)
   - `PrimaryIdAttribute` (from EntityInfo)
   - `PrimaryNameAttribute` (from EntityInfo)

### Step 2 — Discover Forms per Entity

For each entity found in Step 1:

1. List files in `Entities/<EntityLogicalName>/FormXml/main/`.
2. For each FormXml file, extract:
   - Form name (from `<form name="...">` or the filename without extension)
   - Form type: `"main"` (all files in this folder are main forms)
   - List of `<tab>` elements: `{ name, displayLabel }` where `name` is from `<tab name="...">` and `displayLabel` is from the nested `<label description="...">`.
   - For each tab, list `<section>` elements: `{ name, displayLabel }`
   - List of `<control>` elements across all tabs/sections: `{ fieldLogicalName: <control id="">, classid, disabled, requiredLevel }`
     - For `requiredLevel`: check `<cell requiredcomponent="...">` first; if absent, look up `Attributes/<fieldname>.xml` and read `<RequiredLevel>`.
   - List of `<event>` elements: `{ eventName, attributeName (if onchange), handlers: [{ functionName, libraryName, enabled }] }`
     - Only include events where `active="true"` on the event element AND `enabled="true"` on the handler.

3. Also check `FormXml/quickcreate/` if it exists and add those forms with type `"quickcreate"`.

### Step 3 — Discover Attributes per Entity

For each entity, list files in `Entities/<EntityLogicalName>/Attributes/` and extract:
- `logicalName` (filename without `.xml`)
- `type` (from `<Type>` element: string, integer, decimal, money, datetime, boolean, lookup, picklist, etc.)
- `requiredLevel` (from `<RequiredLevel>`: none, required, recommended)

This produces a flat attribute catalogue to supplement form data.

### Step 4 — Discover Business Rules

1. List all files in `<SOLUTION_FOLDER>/Workflows/`.
2. For each file, read the first 30 lines and check for `Category="2"`.
3. For files with `Category="2"`, extract:
   - `name` (from `Name="..."` attribute on `<Workflow>`)
   - `entityName` (from `EntityName="..."` attribute)
   - `scope` (from `Scope="..."`: `"Form"` or `"Entity"`)
   - `triggerOnCreate` (boolean, from `TriggerOnCreate="1"`)
   - `triggerOnUpdate` (boolean, from `TriggerOnUpdate="1"`)
   - `conditions`: array of `{ lhsType, lhsAttribute, operator, rhsType, rhsValue }` from `<LHS>`, `<Operator>`, `<RHS>` elements
   - `actions`: array of `{ type, targetAttribute, value }` from each `<Action>` element

### Step 5 — Discover JavaScript Web Resources

1. List all `.js` files under `<SOLUTION_FOLDER>/WebResources/` (recursively).
2. For each `.js` file, record:
   - `fileName` (relative path from `WebResources/`)
   - `uniqueName` (the part of the path matching a `libraryName` in any FormXml `<Handler>`)
3. Cross-reference with Step 2 event data: for each handler `libraryName`, find the
   matching `.js` file and record which entity + form + event type uses it.
4. For each `.js` file that is referenced by at least one form event, record:
   - `referencedBy`: array of `{ entityName, formName, eventName, attributeName, functionName }`

### Step 6 — Produce the Manifest

Output **only** the following JSON structure (no prose, no markdown fences, no trailing
text):

```json
{
  "solutionFolder": "<SOLUTION_FOLDER>",
  "generatedAt": "<ISO timestamp>",
  "entities": [
    {
      "logicalName": "nwind_order",
      "displayName": "Order",
      "primaryIdAttribute": "nwind_orderid",
      "primaryNameAttribute": "nwind_ordernumber",
      "attributes": [
        {
          "logicalName": "nwind_ordernumber",
          "type": "string",
          "requiredLevel": "required"
        }
      ],
      "forms": [
        {
          "name": "Information",
          "type": "main",
          "tabs": [
            {
              "name": "GENERAL_TAB",
              "displayLabel": "General",
              "sections": [
                { "name": "GENERAL_SECTION", "displayLabel": "Order Details" }
              ]
            }
          ],
          "fields": [
            {
              "fieldLogicalName": "nwind_ordernumber",
              "classid": "{4273EDBD-AC1D-40d3-9FB2-095C621B552D}",
              "controlType": "string",
              "disabled": false,
              "requiredLevel": "required"
            }
          ],
          "events": [
            {
              "eventName": "onload",
              "attributeName": null,
              "handlers": [
                {
                  "functionName": "MyNS.onLoad",
                  "libraryName": "new_scripts_mylib",
                  "enabled": true
                }
              ]
            },
            {
              "eventName": "onchange",
              "attributeName": "nwind_orderstatusid",
              "handlers": [
                {
                  "functionName": "MyNS.onStatusChange",
                  "libraryName": "new_scripts_mylib",
                  "enabled": true
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "businessRules": [
    {
      "name": "Set Default Status on New Order",
      "entityName": "nwind_order",
      "scope": "Form",
      "triggerOnCreate": true,
      "triggerOnUpdate": false,
      "conditions": [
        {
          "lhsType": "Field",
          "lhsAttribute": "statuscode",
          "operator": "Equal",
          "rhsType": "Value",
          "rhsValue": "1"
        }
      ],
      "actions": [
        {
          "type": "SetFieldValue",
          "targetAttribute": "nwind_orderstatusid",
          "value": "100000001"
        },
        {
          "type": "SetVisibility",
          "targetAttribute": "nwind_deliveryaddress",
          "value": "false"
        }
      ]
    }
  ],
  "webResources": [
    {
      "fileName": "scripts/new_scripts_mylib.js",
      "uniqueName": "new_scripts_mylib",
      "referencedBy": [
        {
          "entityName": "nwind_order",
          "formName": "Information",
          "eventName": "onload",
          "attributeName": null,
          "functionName": "MyNS.onLoad"
        },
        {
          "entityName": "nwind_order",
          "formName": "Information",
          "eventName": "onchange",
          "attributeName": "nwind_orderstatusid",
          "functionName": "MyNS.onStatusChange"
        }
      ]
    }
  ]
}
```

---

## Output Validation Checklist

Before outputting the manifest, verify:

- [ ] Every entity in `Entities/` has a corresponding entry in `entities[]`
- [ ] Every `classid` is resolved to a `controlType` string using the GUID map in instruction 01
- [ ] Every Business Rule file with `Category="2"` has an entry in `businessRules[]`
- [ ] Every `.js` file in `WebResources/` that is referenced by a form handler has an entry in `webResources[]`
- [ ] Events with `active="false"` or handlers with `enabled="false"` are **excluded**
- [ ] The JSON is valid and can be parsed by `JSON.parse()`
