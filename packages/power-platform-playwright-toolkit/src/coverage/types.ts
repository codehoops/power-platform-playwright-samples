// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Shared types for MDA code coverage collection.
 *
 * Two coverage layers are supported:
 *  1. JS Web Resource coverage — line/branch/function via Istanbul instrumentation.
 *  2. MDA Form structure coverage — field read/write and handler-fire percentages
 *     derived from the unpacked solution's FormXml/main/*.xml files.
 */

// ---------------------------------------------------------------------------
// Web Resource types
// ---------------------------------------------------------------------------

/** A single JavaScript web resource found under WebResources/ in the unpacked solution. */
export interface WebResourceEntry {
  /** Logical name as it appears in D365, e.g. "pub_/js/order.handlers.js" */
  logicalName: string;
  /** Absolute path to the .js file on disk. */
  filePath: string;
  /**
   * Glob pattern used by `page.route()` to intercept this resource.
   * Example: "**\/WebResources/pub_%2F*"
   */
  urlPattern: string;
}

// ---------------------------------------------------------------------------
// Form structure types
// ---------------------------------------------------------------------------

/** A field (control) declared in a main form XML. */
export interface FormFieldEntry {
  /** Attribute logical name, e.g. "nwind_ordernumber". */
  attributeLogicalName: string;
  /** The control id value from XML. */
  controlId: string;
  /** Data type string from the XML attribute (may be empty if not present). */
  dataType: string;
  /** Whether the field has required-level="required" in the XML. */
  required: boolean;
}

/** A section within a form tab. */
export interface FormSectionEntry {
  /** Section name attribute. */
  name: string;
  /** Section label (from labelid or showlabel context — best-effort). */
  label: string;
  /** Fields contained in this section. */
  fields: FormFieldEntry[];
}

/** A tab on a main form. */
export interface FormTabEntry {
  /** Tab name attribute. */
  name: string;
  /** Tab label (best-effort). */
  label: string;
  /** Sections within this tab. */
  sections: FormSectionEntry[];
}

/** A JavaScript event handler registration found in the form XML. */
export interface HandlerEntry {
  /** Event name: "onload" | "onsave" | "onchange". */
  eventName: string;
  /** For "onchange" events, the attribute logical name the handler is attached to. */
  attributeName?: string;
  /** Fully-qualified function name, e.g. "OrderHandlers.onLoad". */
  functionName: string;
  /** Logical name of the web resource that contains this function. */
  webResourceName: string;
}

/** Parsed metadata for a single main form XML file. */
export interface MdaFormManifest {
  /** Entity logical name derived from the folder structure, e.g. "nwind_order". */
  entityLogicalName: string;
  /** Form name attribute value, e.g. "Information". */
  formName: string;
  /** Form GUID from the XML id attribute. */
  formId: string;
  /** All tabs defined on this form. */
  tabs: FormTabEntry[];
  /** All JS event handler registrations on this form. */
  registeredHandlers: HandlerEntry[];
}

/** Complete inventory parsed from the unpacked solution directory. */
export interface MdaSolutionManifest {
  /** All JS web resources found. */
  webResources: WebResourceEntry[];
  /** One entry per main form XML found in any Entity's FormXml/main/ folder. */
  forms: MdaFormManifest[];
}

// ---------------------------------------------------------------------------
// Runtime coverage data types (collected from browser per test)
// ---------------------------------------------------------------------------

/** Data written to `form-coverage-raw/<testId>.json` after each test. */
export interface FormCoverageSnapshot {
  /** Test ID (sanitised testInfo.testId). */
  testId: string;
  /** Attributes whose getValue() was called during the test. */
  readAttributes: string[];
  /** Attributes that were set (setValue / dirty) during the test. */
  writtenAttributes: string[];
  /**
   * Handler function names that actually fired during the test.
   * Format: "<eventName>:<functionName>" e.g. "onload:OrderHandlers.onLoad"
   */
  firedHandlers: string[];
  /** ISO timestamp of collection. */
  collectedAt: string;
}

/** Aggregated form coverage for a single form across all tests. */
export interface FormCoverageSummary {
  entityLogicalName: string;
  formName: string;
  totalFields: number;
  readFields: number;
  writtenFields: number;
  totalHandlers: number;
  firedHandlers: number;
}

/** Summary entry for a single web resource. */
export interface WebResourceCoverageSummary {
  logicalName: string;
  statements: { covered: number; total: number; pct: number };
  branches: { covered: number; total: number; pct: number };
  functions: { covered: number; total: number; pct: number };
  lines: { covered: number; total: number; pct: number };
}

/** Top-level combined coverage summary written to coverage-summary.json. */
export interface CoverageSummaryReport {
  generatedAt: string;
  webResources: WebResourceCoverageSummary[];
  forms: FormCoverageSummary[];
}
