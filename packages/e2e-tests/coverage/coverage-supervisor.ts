// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * CoverageSupervisor
 *
 * Per-worker coordinator that manages both coverage layers for MDA tests:
 *  - JS Web Resource coverage via {@link WebResourceCoverageCollector}
 *  - MDA Form structure coverage via {@link FormCoverageTracker}
 *
 * Lifecycle
 * ---------
 * ```
 * beforeAll  → supervisor.start(page, manifest)
 * afterEach  → supervisor.collectAfterTest(page, testId)
 * afterAll   → supervisor.dispose(page)
 * ```
 *
 * The `start()` method injects the Istanbul route interceptors and the Xrm
 * monkey-patch init script **before** any navigation happens.  Callers must
 * therefore invoke `start()` before calling `page.goto()`.
 */

import * as path from 'path';
import type { Page } from '@playwright/test';
import {
  WebResourceCoverageCollector,
  FormCoverageTracker,
  type MdaSolutionManifest,
} from 'power-platform-playwright-toolkit';

export class CoverageSupervisor {
  private readonly wrCollector = new WebResourceCoverageCollector();
  private readonly formTracker = new FormCoverageTracker();
  private outputDir: string;
  private manifest: MdaSolutionManifest | null = null;

  constructor(outputDir: string) {
    this.outputDir = path.resolve(outputDir);
  }

  /**
   * Set up route interception and init script injection.
   *
   * Must be called once per worker **before** the page navigates to the MDA.
   */
  async start(page: Page, manifest: MdaSolutionManifest): Promise<void> {
    this.manifest = manifest;

    // Inject the Xrm monkey-patch script into every new page context.
    // addInitScript() attaches the script to the page so it runs on every
    // navigation (page.goto, reload, etc.).
    await this.formTracker.injectInitScript(page);

    // Install route handlers for all known web resources.
    await this.wrCollector.start(page, manifest.webResources);

    console.log(
      `[CoverageSupervisor] Started coverage for ` +
        `${manifest.webResources.length} web resource(s) and ` +
        `${manifest.forms.length} form(s).`
    );
  }

  /**
   * Collect both coverage layers from the browser and persist them to disk.
   *
   * Should be called in `afterEach` so each test gets its own raw snapshot.
   */
  async collectAfterTest(page: Page, testId: string): Promise<void> {
    if (!this.manifest) return;

    await Promise.all([
      this.wrCollector.collectAfterTest(page, testId, this.outputDir),
      this.formTracker.collectAfterTest(page, testId, this.outputDir),
    ]);
  }

  /**
   * Remove all route handlers added during `start()`.
   *
   * Should be called in `afterAll` to avoid leaking Playwright route hooks.
   */
  async dispose(page: Page): Promise<void> {
    await this.wrCollector.dispose(page);
    console.log('[CoverageSupervisor] Disposed coverage route handlers.');
  }
}
