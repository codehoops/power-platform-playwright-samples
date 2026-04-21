// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * FormCoverageTracker
 *
 * Tracks which MDA form elements (fields, tabs, sections, event handlers) are
 * exercised during a test run.  This is *structural* coverage — the "lines"
 * are form XML elements, not JavaScript statements.
 *
 * Two-phase approach
 * ------------------
 * **Phase 1 — injection (before navigation)**
 * `injectInitScript(page)` registers a `page.addInitScript()` snippet that
 * intercepts D365's Xrm form APIs *before* any page scripts run.  The snippet
 * monkey-patches `Xrm.Page.data.entity.addOnLoad`, `addOnSave`, and attribute
 * `addOnChange` so that when handlers fire their names are recorded in
 * `window.__mdaCoverage__`.
 *
 * **Phase 2 — collection (after test)**
 * `collectAfterTest(page, testId, outputDir)` reads `window.__mdaCoverage__`
 * and writes a {@link FormCoverageSnapshot} JSON file to
 * `<outputDir>/form-coverage-raw/<testId>.json`.
 *
 * Usage
 * -----
 * ```typescript
 * const tracker = new FormCoverageTracker();
 * await tracker.injectInitScript(page);
 * // ... navigate and run test ...
 * await tracker.collectAfterTest(page, testInfo.testId, outputDir);
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Page } from '@playwright/test';
import type { FormCoverageSnapshot } from './types';

/** Script injected via `page.addInitScript()` into every page context. */
const INIT_SCRIPT = `
(function () {
  'use strict';

  // Namespace where we accumulate coverage data.
  window.__mdaCoverage__ = {
    readAttributes: [],
    writtenAttributes: [],
    firedHandlers: [],
  };

  // Helper: record a value if not already present.
  function record(arr, value) {
    if (!arr.includes(value)) arr.push(value);
  }

  // We must wait for Xrm to be defined before we can patch it.
  // D365 defines window.Xrm lazily, so poll until it is available.
  var MAX_POLLS = 300; // 30 seconds at 100 ms intervals
  var polls = 0;

  var pollId = setInterval(function () {
    polls++;
    if (polls > MAX_POLLS) {
      clearInterval(pollId);
      return;
    }

    var Xrm = window.Xrm;
    if (!Xrm || !Xrm.Page || !Xrm.Page.data) return;

    clearInterval(pollId);
    patchXrm(Xrm);
  }, 100);

  function patchXrm(Xrm) {
    var page = Xrm.Page;

    // ── Attribute read / write tracking ─────────────────────────────────────
    try {
      page.data.entity.attributes.forEach(function (attr) {
        var attrName = attr.getName();

        var origGetValue = attr.getValue.bind(attr);
        attr.getValue = function () {
          record(window.__mdaCoverage__.readAttributes, attrName);
          return origGetValue();
        };

        var origSetValue = attr.setValue.bind(attr);
        attr.setValue = function (val) {
          record(window.__mdaCoverage__.writtenAttributes, attrName);
          return origSetValue(val);
        };
      });
    } catch (e) {
      // Attributes may not be available on read-only forms — ignore.
    }

    // ── Handler fire tracking (form-level: onload / onsave) ──────────────────
    try {
      var origAddOnLoad = page.data.entity.addOnLoad.bind(page.data.entity);
      page.data.entity.addOnLoad = function (fn) {
        var wrapped = function (ctx) {
          record(window.__mdaCoverage__.firedHandlers, 'onload:' + (fn.name || 'anonymous'));
          return fn(ctx);
        };
        return origAddOnLoad(wrapped);
      };
    } catch (e) { /* ignore */ }

    try {
      var origAddOnSave = page.data.entity.addOnSave.bind(page.data.entity);
      page.data.entity.addOnSave = function (fn) {
        var wrapped = function (ctx) {
          record(window.__mdaCoverage__.firedHandlers, 'onsave:' + (fn.name || 'anonymous'));
          return fn(ctx);
        };
        return origAddOnSave(wrapped);
      };
    } catch (e) { /* ignore */ }

    // ── Handler fire tracking (attribute-level: onchange) ───────────────────
    try {
      page.data.entity.attributes.forEach(function (attr) {
        var attrName = attr.getName();
        var origAddOnChange = attr.addOnChange.bind(attr);
        attr.addOnChange = function (fn) {
          var wrapped = function (ctx) {
            record(
              window.__mdaCoverage__.firedHandlers,
              'onchange:' + attrName + ':' + (fn.name || 'anonymous')
            );
            return fn(ctx);
          };
          return origAddOnChange(wrapped);
        };
      });
    } catch (e) { /* ignore */ }
  }
})();
`;

export class FormCoverageTracker {
  /**
   * Inject the Xrm monkey-patch init script into the page.
   *
   * Must be called *before* `page.goto()` so the script runs before D365's
   * own scripts initialise the Xrm API.
   */
  async injectInitScript(page: Page): Promise<void> {
    await page.addInitScript(INIT_SCRIPT);
  }

  /**
   * Collect form coverage data from `window.__mdaCoverage__` and write it to
   * `<outputDir>/form-coverage-raw/<testId>.json`.
   *
   * @param page - The Playwright page.
   * @param testId - Unique test identifier.
   * @param outputDir - Root coverage output directory.
   */
  async collectAfterTest(page: Page, testId: string, outputDir: string): Promise<void> {
    let raw: { readAttributes: string[]; writtenAttributes: string[]; firedHandlers: string[] } = {
      readAttributes: [],
      writtenAttributes: [],
      firedHandlers: [],
    };

    try {
      raw = await page.evaluate(() => {
        const cov = (window as unknown as {
          __mdaCoverage__?: { readAttributes: string[]; writtenAttributes: string[]; firedHandlers: string[] };
        }).__mdaCoverage__;
        return cov ?? { readAttributes: [], writtenAttributes: [], firedHandlers: [] };
      });
    } catch (err) {
      console.warn(`[FormCoverageTracker] Failed to read __mdaCoverage__: ${err}`);
      return;
    }

    const snapshot: FormCoverageSnapshot = {
      testId,
      readAttributes: raw.readAttributes,
      writtenAttributes: raw.writtenAttributes,
      firedHandlers: raw.firedHandlers,
      collectedAt: new Date().toISOString(),
    };

    const rawDir = path.join(outputDir, 'form-coverage-raw');
    fs.mkdirSync(rawDir, { recursive: true });

    const safeId = testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFile = path.join(rawDir, `${safeId}.json`);
    fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2), 'utf-8');

    console.log(`[FormCoverageTracker] Form coverage written: ${outFile}`);
  }
}
