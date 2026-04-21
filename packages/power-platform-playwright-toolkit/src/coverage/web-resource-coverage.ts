// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * WebResourceCoverageCollector
 *
 * Instruments customer JavaScript web resources at request time using Istanbul
 * and collects the `window.__coverage__` object after each test.
 *
 * How it works
 * ------------
 * 1. `start(page, webResources)` — installs a `page.route()` handler for every
 *    web resource URL pattern.  When D365 requests a JS file matching the
 *    pattern the handler fetches the real response, instruments the JS source
 *    with Istanbul, and serves the instrumented version back to the browser.
 *
 * 2. `collectAfterTest(page, testId, outputDir)` — calls `page.evaluate()` to
 *    read `window.__coverage__` and writes the raw data to
 *    `<outputDir>/coverage-raw/<testId>.json`.
 *
 * 3. `dispose(page)` — removes all route handlers added by `start()`.
 *
 * Usage
 * -----
 * ```typescript
 * const collector = new WebResourceCoverageCollector();
 * await collector.start(page, manifest.webResources);
 * // ... run test ...
 * await collector.collectAfterTest(page, testInfo.testId, outputDir);
 * await collector.dispose(page);
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Page, Route } from '@playwright/test';
import type { WebResourceEntry } from './types';

// istanbul-lib-instrument is a CommonJS package; load via require so the
// toolkit's CommonJS build works without any ESM interop issues.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createInstrumenter } = require('istanbul-lib-instrument') as {
  createInstrumenter: (opts?: Record<string, unknown>) => {
    instrumentSync(code: string, filename: string): string;
  };
};

export class WebResourceCoverageCollector {
  /** Pattern → handler map so we can unroute them later. */
  private readonly handlers = new Map<string, (route: Route) => Promise<void>>();

  /**
   * Set up route interception for every web resource in `webResources`.
   *
   * Must be called before the browser navigates to the MDA page so that the
   * instrumented JS is served from the very first load.
   */
  async start(page: Page, webResources: WebResourceEntry[]): Promise<void> {
    if (webResources.length === 0) {
      return;
    }

    const instrumenter = createInstrumenter({
      esModules: false,
      compact: false,
      produceSourceMap: false,
    });

    for (const entry of webResources) {
      const handler = async (route: Route): Promise<void> => {
        try {
          // Fetch the real response from the origin.
          const response = await route.fetch();
          const originalSource = await response.text();

          // Instrument with Istanbul — use the logical name as the "filename"
          // so the coverage keys match what we remap later.
          const instrumented = instrumenter.instrumentSync(originalSource, entry.logicalName);

          await route.fulfill({
            status: response.status(),
            headers: { ...response.headers(), 'content-type': 'application/javascript' },
            body: instrumented,
          });

          console.log(`[WebResourceCoverageCollector] Instrumented: ${entry.logicalName}`);
        } catch (err) {
          // Fall through to the original response on any instrumentation error.
          console.warn(
            `[WebResourceCoverageCollector] Instrumentation failed for ${entry.logicalName}: ${err}`
          );
          await route.continue();
        }
      };

      await page.route(entry.urlPattern, handler);
      this.handlers.set(entry.urlPattern, handler);
    }
  }

  /**
   * Read `window.__coverage__` from the browser page and persist it to disk.
   *
   * @param page - The Playwright page.
   * @param testId - A unique identifier for the current test (used as the
   *   filename).  Sanitised to remove characters that are invalid in file names.
   * @param outputDir - Directory where `coverage-raw/` will be created.
   */
  async collectAfterTest(page: Page, testId: string, outputDir: string): Promise<void> {
    let coverage: Record<string, unknown> = {};

    try {
      coverage =
        (await page.evaluate(() => (window as unknown as { __coverage__?: Record<string, unknown> }).__coverage__ ?? {})) ?? {};
    } catch (err) {
      console.warn(`[WebResourceCoverageCollector] Failed to read __coverage__: ${err}`);
      return;
    }

    if (Object.keys(coverage).length === 0) {
      return;
    }

    const rawDir = path.join(outputDir, 'coverage-raw');
    fs.mkdirSync(rawDir, { recursive: true });

    const safeId = testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFile = path.join(rawDir, `${safeId}.json`);
    fs.writeFileSync(outFile, JSON.stringify(coverage, null, 2), 'utf-8');

    console.log(`[WebResourceCoverageCollector] Coverage written: ${outFile}`);
  }

  /**
   * Remove all route handlers installed by `start()`.
   */
  async dispose(page: Page): Promise<void> {
    for (const [pattern, handler] of this.handlers) {
      try {
        await page.unroute(pattern, handler);
      } catch {
        // Page may already be closed — ignore.
      }
    }
    this.handlers.clear();
  }
}
