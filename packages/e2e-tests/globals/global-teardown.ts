// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from 'path';
import { CoverageReporter } from 'power-platform-playwright-toolkit';

async function globalTeardown() {
  console.log('===============================================');
  console.log('✅ Teardown Playwright Test Environment');
  console.log('===============================================');

  // ── Coverage report generation (optional, MDA only) ─────────────────────
  // The Playwright custom reporter also calls generateReports() in onEnd,
  // but global teardown provides a safety net when running without the
  // reporter (e.g. in worker-only mode).
  if (process.env.COVERAGE_ENABLED === 'true' && process.env.SOLUTION_UNPACKED_PATH) {
    const outputDir = path.resolve(process.env.COVERAGE_OUTPUT_DIR ?? './coverage-report');
    const manifestPath = path.join(outputDir, 'coverage-manifest.json');

    try {
      await CoverageReporter.generateReports({ manifestPath, outputDir });
    } catch (err) {
      console.warn(`[Coverage] Report generation failed: ${err}`);
    }
  }
}

export default globalTeardown;
