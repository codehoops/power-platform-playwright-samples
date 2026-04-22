# 00 — Unpacked Solution Overview

**Audience:** AI agents generating or reviewing tests for Power Platform solutions.

This file is **declarative context** — read it before executing any skill in
`docs/context-engineering/skills/`. It teaches you the layout of an unpacked solution
so you can parse it correctly.

---

## 1. Unpacking a Solution

```bash
# Unpack a managed or unmanaged solution zip into a source folder
pac solution unpack --zipFile MySolution.zip --folder ./unpacked --packageType Both
```

The `--folder` argument is the root of the unpacked tree. All paths in the skills are
relative to this root.

---

## 2. Top-Level Directory Tree

```
unpacked/
├── solution.xml                   # Solution metadata (version, publisher, etc.)
├── customizations.xml             # Legacy root — may contain some entity metadata
│
├── Entities/                      # One subfolder per Dataverse table
│   └── <EntityLogicalName>/
│       ├── Entity.xml             # Table metadata (display name, plural name, etc.)
│       ├── Attributes/            # One XML file per column
│       │   └── <AttributeLogicalName>.xml
│       ├── FormXml/               # Form layouts
│       │   ├── main/              # Main forms (the ones users see when opening a record)
│       │   │   └── <FormName>.xml
│       │   └── quickcreate/       # Quick-create forms
│       │       └── <FormName>.xml
│       ├── Views/                 # Saved views (Public, System)
│       │   └── <ViewName>.xml
│       ├── Charts/
│       └── Relationships/
│
├── WebResources/                  # All web resources
│   ├── scripts/                   # JavaScript files
│   │   └── <name>.js
│   ├── css/
│   └── images/
│
├── Workflows/                     # Power Automate flows AND Business Rules
│   └── <WorkflowName>.xml         # Business Rules have Category="2"
│
├── Roles/                         # Security roles
├── ConnectionReferences/
└── EnvironmentVariableDefinitions/
```

> **Note:** The exact subfolder capitalisation may vary slightly between pac CLI versions.
> Always use case-insensitive glob matching when searching for files.

---

## 3. Entity Subfolder in Detail

```
Entities/nwind_order/
├── Entity.xml                     # LogicalName, DisplayName, PrimaryIdAttribute, etc.
│
├── Attributes/
│   ├── nwind_ordernumber.xml      # String attribute — LogicalName, RequiredLevel, etc.
│   ├── nwind_orderamount.xml      # Currency attribute
│   ├── nwind_orderstatusid.xml    # Lookup or OptionSet attribute
│   └── statuscode.xml             # System Status attribute
│
├── FormXml/
│   └── main/
│       └── Information.xml        # The main form layout
│
└── Views/
    └── All Orders.xml
```

### 3.1 Entity.xml — Key Fields

```xml
<Entity>
  <Name LocalizedName="Order" OriginalName="Order">nwind_order</Name>
  <EntityInfo>
    <entity Name="nwind_order">
      <PrimaryNameAttribute>nwind_ordernumber</PrimaryNameAttribute>
      <PrimaryIdAttribute>nwind_orderid</PrimaryIdAttribute>
      ...
    </entity>
  </EntityInfo>
</Entity>
```

- `<Name>` text content → **logical name** (use in toolkit calls)
- `<PrimaryNameAttribute>` → the attribute that appears as the record title

### 3.2 Attribute XML — Key Fields

```xml
<attribute PhysicalName="nwind_ordernumber">
  <Type>string</Type>
  <Name>nwind_ordernumber</Name>
  <LogicalName>nwind_ordernumber</LogicalName>
  <RequiredLevel>none</RequiredLevel>   <!-- none | required | recommended -->
  <MaxLength>100</MaxLength>
</attribute>
```

---

## 4. FormXml Structure

A main form XML is the most important input for test generation. Its nesting structure is:

```
<form>
  <tabs>
    <tab name="TAB_ID" locklevel="0" expanded="true">
      <labels><label description="Tab Display Label" /></labels>
      <columns>
        <column width="100%">
          <sections>
            <section name="SECTION_ID" locklevel="0">
              <labels><label description="Section Display Label" /></labels>
              <rows>
                <row>
                  <cell id="CELL_GUID" showlabel="true" locklevel="0">
                    <labels><label description="Field Label" /></labels>
                    <control id="FIELD_LOGICAL_NAME" classid="{CONTROL_CLASS_GUID}"
                             uniqueid="{UNIQUE_GUID}" disabled="false" />
                  </cell>
                </row>
              </rows>
            </section>
          </sections>
        </column>
      </columns>
    </tab>
  </tabs>

  <events>
    <event name="onload" application="false" active="true">
      <Handlers>
        <Handler functionName="MyNamespace.onLoad"
                 libraryName="webresource_scripts_mylib"
                 handlerUniqueId="{GUID}"
                 enabled="true" passExecutionContext="true" />
      </Handlers>
    </event>
    <event name="onchange" attribute="nwind_orderstatusid" ...>
      <Handlers>
        <Handler functionName="MyNamespace.onStatusChange" ... />
      </Handlers>
    </event>
    <event name="onsave" ...>
      <Handlers>
        <Handler functionName="MyNamespace.onSave" ... />
      </Handlers>
    </event>
  </events>
</form>
```

### 4.1 Extracting Field Information from `<control>`

| `<control>` attribute | Meaning |
|---|---|
| `id` | **Field logical name** — use directly in `getEntityAttribute` / `setEntityAttribute` |
| `classid` | Control type GUID (see Section 5) |
| `disabled` | `"true"` → field is read-only on this form |
| `uniqueid` | Internal GUID — ignore for testing purposes |

### 4.2 Extracting Required Level

Required level for a field on a specific form is set in two places:
1. `Attributes/<fieldname>.xml` — the **table-level** default
2. `<cell>` element in FormXml may override it: `<cell ... requiredcomponent="required">`

Always check the FormXml cell first; fall back to the attribute file.

### 4.3 Tab and Section Names

Use the `name` attribute on `<tab>` and `<section>` when calling toolkit methods:

```typescript
// name attribute from FormXml, NOT the display label
await form.navigateToTab({ tab: 'TAB_ID' });
await form.navigateToSection({ section: 'SECTION_ID' });
```

The display label is in the nested `<labels><label description="...">` element and is
used only for human-readable test names.

---

## 5. Control Type GUID → Toolkit Type Map

The `classid` attribute on `<control>` identifies the control type. Common GUIDs:

| classid GUID | Control Type | Toolkit method |
|---|---|---|
| `{4273EDBD-AC1D-40d3-9FB2-095C621B552D}` | Text / MultiLine | `setEntityAttribute(page, field, 'string')` |
| `{ADA2203E-B4CD-49be-9DDF-234D3A657EC8}` | OptionSet (Choice) | `setEntityAttribute(page, field, numericValue)` |
| `{67FAC785-CD58-4f9f-ABB3-4B7DDC6ED5ED}` | Two Option (Boolean) | `setEntityAttribute(page, field, true/false)` |
| `{F3015350-44A2-4aa0-97B5-00166532B5E9}` | DateTime | `setEntityAttribute(page, field, new Date())` |
| `{B0C6723A-8503-4fd7-BB28-C8A06AC933C2}` | Lookup | `setEntityAttribute(page, field, [{id, name, entityType}])` |
| `{533B9E00-756B-4312-95A0-DC818EA822E6}` | Currency / Decimal | `setEntityAttribute(page, field, number)` |
| `{C6D124CA-7EDA-4a60-AEA9-7FB8D318B68F}` | Whole Number | `setEntityAttribute(page, field, integer)` |
| `{5D68B988-0661-4DB2-BC3E-17598AD3BE6C}` | Notes (MultiLine) | `setEntityAttribute(page, field, 'string')` |

> **Tip:** When a classid GUID is not in this table, check the Dataverse documentation or
> fall back to treating it as a text field and verifying with `getFieldControlType()`.

---

## 6. Business Rule File Location and Structure

Business Rules are stored as Workflow XML files with `Category="2"`:

```
Workflows/
├── SetDefaultStatus_nwind_order.xml    # Category="2" → Business Rule
├── RequireFieldOnCreate.xml            # Category="2" → Business Rule
└── MyFlow.xml                          # Category="0" → Power Automate flow (skip)
```

**Quick filter:** Read the first 30 lines of a Workflow XML and check:

```xml
<Workflow ... Category="2" ...>
```

Only `Category="2"` files represent Business Rules that run on a form client-side.
`Category="0"`, `"1"`, `"3"` are flows and background processes — irrelevant for
Playwright UI tests.

---

## 7. JavaScript Web Resource Location

```
WebResources/scripts/         # JavaScript files for event handlers
WebResources/               # Top-level JS files (less common)
```

The `libraryName` in a FormXml `<Handler>` element matches the web resource's **unique
name** (not the display name). The file on disk is `WebResources/<uniquename>.js` or
`WebResources/scripts/<uniquename>.js`.

To find a handler's source file:
1. Read the `libraryName` from the FormXml `<Handler>`.
2. Search `WebResources/` recursively for a `.js` file whose name matches (strip any
   leading path separator characters from `libraryName`).

---

## 8. XML Namespace Notes

FormXml files typically have no namespace prefix — elements are in the default namespace.
Workflow (Business Rule) XML files use a `mxsf:` or unprefixed namespace depending on
the pac CLI version.

When parsing with XPath or a DOM library, always use a namespace-aware parser. If an
element is not found with a prefix, retry without the prefix.

---

## 9. Correlating FormXml Fields to Dataverse Logical Names

The `id` attribute on `<control>` **is** the Dataverse logical name. No further
transformation is needed:

```xml
<control id="nwind_ordernumber" classid="{...}" />
```

→ `getEntityAttribute(page, 'nwind_ordernumber')`

For sub-grid controls (`classid` = sub-grid GUID), the `id` is the sub-grid name, not
an attribute name. Skip sub-grid controls when generating attribute-level tests.

---

## 10. Summary Checklist Before Parsing

Before running any skill, confirm you have:

- [ ] The unpacked solution folder path (absolute or relative to repo root)
- [ ] At least one entity logical name to target
- [ ] `Entities/<entityName>/FormXml/main/` contains at least one XML file
- [ ] (For JS tests) `WebResources/scripts/` contains `.js` files
- [ ] (For BR tests) `Workflows/` contains XML files with `Category="2"`
