// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * MDA Coverage Playwright Reporter
 *
 * A custom Playwright {@link Reporter} that:
 *  - Parses the unpacked solution manifest in `onBegin` (only for the
 *    `model-driven-app` project).
 *  - Writes `coverage-manifest.json` so global setup and teardown can find it.
 *  - Calls {@link CoverageReporter.generateReports} in `onEnd`.
 *
 * Register in `playwright.config.ts`:
 * ```typescript
 * reporter: [
 *   ...existingReporters,
 *   ['./coverage/coverage-playwright-reporter', {
 *     solutionPath: process.env.SOLUTION_UNPACKED_PATH,
 *     outputDir:    process.env.COVERAGE_OUTPUT_DIR ?? './coverage-report',
 *   }]
 * ]
 * ```
 *
 * The reporter is a no-op when:
 *  - `COVERAGE_ENABLED` is not `'true'`
 *  - `solutionPath` is not provided
 *  - The active project is not `model-driven-app`
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';
import { SolutionParser, CoverageReporter } from 'power-platform-playwright-toolkit';

export interface CoverageReporterOptions {
  /** Path to the unpacked solution root (e.g. `../../solution/unpacked`). */
  solutionPath?: string;
  /** Output directory for coverage reports. */
  outputDir?: string;
}

class MdaCoverageReporter implements Reporter {
  private readonly solutionPath: string | undefined;
  private readonly outputDir: string;
  private manifestPath: string;
  private enabled = false;

  constructor(options: CoverageReporterOptions = {}) {
    this.solutionPath = options.solutionPath;
    this.outputDir = path.resolve(options.outputDir ?? './coverage-report');
    this.manifestPath = path.join(this.outputDir, 'coverage-manifest.json');
  }

  onBegin(config: FullConfig, suite: Suite): void {
    // Only activate when COVERAGE_ENABLED=true and solution path is provided.
    if (process.env.COVERAGE_ENABLED !== 'true' || !this.solutionPath) {
      return;
    }

    // Check that at least one project is model-driven-app.
    const hasMdaProject = config.projects.some((p) => p.name === 'model-driven-app');
    if (!hasMdaProject) {
      // If running a single project that isn't MDA, check the suite.
      const suiteName = suite.title;
      if (suiteName && suiteName !== 'model-driven-app') {
        return;
      }
    }

    this.enabled = true;

    // Parse the solution and persist manifest.
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.mkdirSync(path.join(this.outputDir, 'coverage-raw'), { recursive: true });
    fs.mkdirSync(path.join(this.outputDir, 'form-coverage-raw'), { recursive: true });

    const manifest = SolutionParser.parse(this.solutionPath);
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

    console.log(
      `[MdaCoverageReporter] Coverage enabled. ` +
        `Manifest written to ${this.manifestPath}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTestEnd(_test: TestCase, _result: TestResult): void {
    // Raw coverage files are written directly by CoverageSupervisor in
    // afterEach — nothing extra needed here.
  }

  async onEnd(): Promise<void> {
    if (!this.enabled) return;

    await CoverageReporter.generateReports({
      manifestPath: this.manifestPath,
      outputDir: this.outputDir,
    });
  }

  printsToStdio(): boolean {
    return true;
  }
}

export default MdaCoverageReporter;
