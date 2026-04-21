// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from 'fs';
import * as path from 'path';
import { SolutionParser } from 'power-platform-playwright-toolkit';

async function globalSetup() {
  console.log('===============================================');
  console.log('🚀 Setup Playwright Test Environment');
  console.log('===============================================');

  // ── Coverage setup (optional, MDA only) ─────────────────────────────────
  if (process.env.COVERAGE_ENABLED === 'true' && process.env.SOLUTION_UNPACKED_PATH) {
    const outputDir = path.resolve(process.env.COVERAGE_OUTPUT_DIR ?? './coverage-report');
    const manifestPath = path.join(outputDir, 'coverage-manifest.json');

    // Create output directories up front so workers can write without racing.
    fs.mkdirSync(path.join(outputDir, 'coverage-raw'), { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'form-coverage-raw'), { recursive: true });

    // Parse the unpacked solution and write the manifest.
    // This is the authoritative manifest; the Playwright reporter also writes
    // it but global setup ensures it is available before any worker starts.
    const manifest = SolutionParser.parse(process.env.SOLUTION_UNPACKED_PATH);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    console.log(
      `[Coverage] Manifest written: ${manifestPath} ` +
        `(${manifest.webResources.length} web resources, ${manifest.forms.length} forms)`
    );
  }
}

export default globalSetup;
