// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Coverage fixture for Model-Driven App tests.
 *
 * When `COVERAGE_ENABLED=true` and `SOLUTION_UNPACKED_PATH` is set this
 * fixture:
 *  - Reads the parsed solution manifest from `coverage-manifest.json`
 *    (written by the Playwright reporter in `onBegin`).
 *  - Starts route interception and injects the Xrm monitoring script before
 *    each test via {@link CoverageSupervisor}.
 *  - Collects coverage data after each test and writes it to
 *    `<COVERAGE_OUTPUT_DIR>/coverage-raw/` and `form-coverage-raw/`.
 *
 * The fixture uses `auto: true` so it activates automatically for every test
 * in any spec file that imports from this module — no per-test plumbing
 * required.  When coverage is disabled (`COVERAGE_ENABLED` is not `'true'`)
 * the fixture is a no-op and tests run unchanged.
 *
 * Usage
 * -----
 * Import `test` from this module instead of `@playwright/test` in MDA spec
 * files:
 * ```typescript
 * import { test, expect } from '../../fixtures/coverage-fixture';
 * ```
 * Or mix with the existing `test-fixture.ts` by chaining `.extend()`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { test as base } from '@playwright/test';
import type { MdaSolutionManifest } from 'power-platform-playwright-toolkit';
import { CoverageSupervisor } from '../coverage/coverage-supervisor';

const COVERAGE_ENABLED = process.env.COVERAGE_ENABLED === 'true';
const SOLUTION_UNPACKED_PATH = process.env.SOLUTION_UNPACKED_PATH;
const COVERAGE_OUTPUT_DIR = path.resolve(process.env.COVERAGE_OUTPUT_DIR ?? './coverage-report');
const MANIFEST_PATH = path.join(COVERAGE_OUTPUT_DIR, 'coverage-manifest.json');

/** Additional fixture type added by this module. */
type CoverageFixtures = {
  /** Internal — auto-wired coverage lifecycle. Never accessed directly. */
  _mdaCoverage: void;
};

/**
 * Extended test with automatic MDA coverage instrumentation.
 *
 * The `_mdaCoverage` fixture is `auto: true`, meaning Playwright will run it
 * for every test without requiring explicit use in the test body.
 */
export const test = base.extend<CoverageFixtures>({
  _mdaCoverage: [
    async ({ page }, use, testInfo) => {
      if (!COVERAGE_ENABLED || !SOLUTION_UNPACKED_PATH) {
        // Coverage disabled — no-op.
        await use();
        return;
      }

      // Read the manifest written by the Playwright reporter.
      let manifest: MdaSolutionManifest = { webResources: [], forms: [] };
      if (fs.existsSync(MANIFEST_PATH)) {
        try {
          manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
        } catch (err) {
          console.warn(`[CoverageFixture] Failed to read manifest: ${err}`);
        }
      } else {
        console.warn(`[CoverageFixture] Manifest not found at ${MANIFEST_PATH}`);
      }

      const supervisor = new CoverageSupervisor(COVERAGE_OUTPUT_DIR);
      await supervisor.start(page, manifest);

      await use();

      await supervisor.collectAfterTest(page, testInfo.testId);
      await supervisor.dispose(page);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
