// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * CoverageReporter
 *
 * Merges all raw coverage data collected during a test run and generates:
 *  - An **Istanbul HTML report** at `<outputDir>/web-resources/index.html`
 *    with line/branch/function coverage for each instrumented JS web resource.
 *  - An **lcov.info** file at `<outputDir>/lcov.info` for Azure DevOps /
 *    SonarQube ingestion.
 *  - A **Form coverage HTML table** at `<outputDir>/forms/index.html` showing
 *    field read %, field write %, and handler-fire % per form.
 *  - A **`coverage-summary.json`** combining both layers for dashboards / CI gates.
 *
 * Usage (called from global teardown)
 * ------------------------------------
 * ```typescript
 * await CoverageReporter.generateReports({
 *   manifestPath: '/path/to/coverage-report/coverage-manifest.json',
 *   outputDir:    '/path/to/coverage-report',
 * });
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  MdaSolutionManifest,
  MdaFormManifest,
  FormCoverageSnapshot,
  FormCoverageSummary,
  WebResourceCoverageSummary,
  CoverageSummaryReport,
} from './types';

// istanbul-lib-* are CommonJS packages; require() avoids ESM interop issues.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const libCoverage = require('istanbul-lib-coverage') as {
  createCoverageMap: (data?: Record<string, unknown>) => CoverageMap;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const libReport = require('istanbul-lib-report') as {
  createContext: (opts: Record<string, unknown>) => ReportContext;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reports = require('istanbul-reports') as {
  create: (name: string, opts?: Record<string, unknown>) => Report;
};

interface CoverageMap {
  merge(other: Record<string, unknown>): void;
  toJSON(): Record<string, unknown>;
  files(): string[];
  fileCoverageFor(file: string): FileCoverage;
}

interface FileCoverage {
  toSummary(): CoverageSummaryData;
}

interface CoverageSummaryData {
  statements: { covered: number; total: number; pct: number };
  branches: { covered: number; total: number; pct: number };
  functions: { covered: number; total: number; pct: number };
  lines: { covered: number; total: number; pct: number };
}

interface ReportContext {}

interface Report {
  execute(ctx: ReportContext): void;
}

export interface GenerateReportsOptions {
  /** Path to the `coverage-manifest.json` written during global setup. */
  manifestPath: string;
  /** Root output directory (e.g. `./coverage-report`). */
  outputDir: string;
}

export class CoverageReporter {
  /**
   * Main entry point — merge raw files and generate all reports.
   */
  static async generateReports(options: GenerateReportsOptions): Promise<void> {
    const { manifestPath, outputDir } = options;

    if (!fs.existsSync(manifestPath)) {
      console.warn(`[CoverageReporter] Manifest not found at ${manifestPath} — skipping reports.`);
      return;
    }

    const manifest: MdaSolutionManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const wrSummaries = this.generateWebResourceReports(manifest, outputDir);
    const formSummaries = this.generateFormReport(manifest, outputDir);
    this.writeCoverageSummary(wrSummaries, formSummaries, outputDir);
    this.printSummaryToConsole(wrSummaries, formSummaries);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // JS Web Resource reports
  // ──────────────────────────────────────────────────────────────────────────

  private static generateWebResourceReports(
    manifest: MdaSolutionManifest,
    outputDir: string
  ): WebResourceCoverageSummary[] {
    const rawDir = path.join(outputDir, 'coverage-raw');
    if (!fs.existsSync(rawDir) || manifest.webResources.length === 0) {
      return [];
    }

    // Build a map: logicalName → filePath for remapping coverage keys.
    const wrMap = new Map<string, string>();
    for (const wr of manifest.webResources) {
      wrMap.set(wr.logicalName, wr.filePath);
    }

    // Merge all raw Istanbul JSON files.
    const mergedMap = libCoverage.createCoverageMap();

    const rawFiles = fs
      .readdirSync(rawDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(rawDir, f));

    for (const rawFile of rawFiles) {
      try {
        const raw = JSON.parse(fs.readFileSync(rawFile, 'utf-8')) as Record<string, unknown>;
        // Remap keys from logical name → actual file path.
        const remapped: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
          const realPath = wrMap.get(key) ?? key;
          remapped[realPath] = value;
        }
        mergedMap.merge(remapped);
      } catch (err) {
        console.warn(`[CoverageReporter] Failed to read raw coverage file ${rawFile}: ${err}`);
      }
    }

    // Generate Istanbul HTML + LCOV reports.
    const wrOutputDir = path.join(outputDir, 'web-resources');
    fs.mkdirSync(wrOutputDir, { recursive: true });

    try {
      const ctx = libReport.createContext({
        dir: wrOutputDir,
        coverageMap: mergedMap,
        watermarks: {
          statements: [50, 80],
          branches: [50, 80],
          functions: [50, 80],
          lines: [50, 80],
        },
      });

      // HTML report inside web-resources/
      reports.create('html', { skipEmpty: false }).execute(ctx);

      // lcov.info at the output root for CI tools
      const lcovCtx = libReport.createContext({
        dir: outputDir,
        coverageMap: mergedMap,
      });
      reports.create('lcovonly').execute(lcovCtx);

      console.log(`[CoverageReporter] HTML report: ${path.join(wrOutputDir, 'index.html')}`);
      console.log(`[CoverageReporter] LCOV report: ${path.join(outputDir, 'lcov.info')}`);
    } catch (err) {
      console.warn(`[CoverageReporter] Failed to generate Istanbul reports: ${err}`);
    }

    // Extract per-file summaries.
    const summaries: WebResourceCoverageSummary[] = [];
    for (const filePath of mergedMap.files()) {
      const logicalName = [...wrMap.entries()].find(([, v]) => v === filePath)?.[0] ?? filePath;
      const summary = mergedMap.fileCoverageFor(filePath).toSummary();
      summaries.push({
        logicalName,
        statements: summary.statements,
        branches: summary.branches,
        functions: summary.functions,
        lines: summary.lines,
      });
    }

    return summaries;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Form structure coverage report
  // ──────────────────────────────────────────────────────────────────────────

  private static generateFormReport(
    manifest: MdaSolutionManifest,
    outputDir: string
  ): FormCoverageSummary[] {
    const rawDir = path.join(outputDir, 'form-coverage-raw');

    // Aggregate snapshots across all test files.
    const allRead = new Set<string>();
    const allWritten = new Set<string>();
    const allFired = new Set<string>();

    if (fs.existsSync(rawDir)) {
      const rawFiles = fs
        .readdirSync(rawDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(rawDir, f));

      for (const rawFile of rawFiles) {
        try {
          const snap = JSON.parse(fs.readFileSync(rawFile, 'utf-8')) as FormCoverageSnapshot;
          snap.readAttributes.forEach((a) => allRead.add(a));
          snap.writtenAttributes.forEach((a) => allWritten.add(a));
          snap.firedHandlers.forEach((h) => allFired.add(h));
        } catch (err) {
          console.warn(`[CoverageReporter] Failed to read form snapshot ${rawFile}: ${err}`);
        }
      }
    }

    // Build per-form summaries.
    const summaries: FormCoverageSummary[] = [];
    for (const form of manifest.forms) {
      const allFields = form.tabs.flatMap((t) => t.sections.flatMap((s) => s.fields));
      const fieldNames = allFields.map((f) => f.attributeLogicalName);

      const readFields = fieldNames.filter((n) => allRead.has(n)).length;
      const writtenFields = fieldNames.filter((n) => allWritten.has(n)).length;
      const firedHandlerCount = form.registeredHandlers.filter((h) =>
        // Match against "<eventName>:<functionName>" or "onchange:<attr>:<fn>"
        allFired.has(this.handlerKey(h.eventName, h.attributeName, h.functionName))
      ).length;

      summaries.push({
        entityLogicalName: form.entityLogicalName,
        formName: form.formName,
        totalFields: fieldNames.length,
        readFields,
        writtenFields,
        totalHandlers: form.registeredHandlers.length,
        firedHandlers: firedHandlerCount,
      });
    }

    // Write HTML form coverage table.
    if (summaries.length > 0) {
      const formsDir = path.join(outputDir, 'forms');
      fs.mkdirSync(formsDir, { recursive: true });
      const html = this.buildFormHtml(summaries, manifest.forms);
      fs.writeFileSync(path.join(formsDir, 'index.html'), html, 'utf-8');
      console.log(`[CoverageReporter] Form coverage report: ${path.join(formsDir, 'index.html')}`);
    }

    return summaries;
  }

  /** Build the handler key that matches the firedHandlers set. */
  private static handlerKey(
    eventName: string,
    attributeName: string | undefined,
    functionName: string
  ): string {
    if (attributeName) {
      return `onchange:${attributeName}:${functionName}`;
    }
    return `${eventName}:${functionName}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HTML generation helpers
  // ──────────────────────────────────────────────────────────────────────────

  private static buildFormHtml(summaries: FormCoverageSummary[], forms: MdaFormManifest[]): string {
    const rows = summaries
      .map((s) => {
        const readPct = s.totalFields > 0 ? Math.round((s.readFields / s.totalFields) * 100) : 0;
        const writePct =
          s.totalFields > 0 ? Math.round((s.writtenFields / s.totalFields) * 100) : 0;
        const handlerPct =
          s.totalHandlers > 0 ? Math.round((s.firedHandlers / s.totalHandlers) * 100) : 100;

        const form = forms.find(
          (f) => f.entityLogicalName === s.entityLogicalName && f.formName === s.formName
        );

        const fieldRows = form
          ? form.tabs
              .flatMap((t) => t.sections.flatMap((sec) => sec.fields))
              .map((field) => {
                const read = summaries.find((x) => x.entityLogicalName === s.entityLogicalName)
                  ? s.readFields > 0
                  : false;
                void read;
                return `<tr><td>${field.attributeLogicalName}</td><td>${field.controlId}</td><td>${field.required ? 'Yes' : 'No'}</td></tr>`;
              })
              .join('\n')
          : '';

        return `
      <tr>
        <td><strong>${s.entityLogicalName}</strong></td>
        <td>${s.formName}</td>
        <td>${s.readFields}/${s.totalFields} <em>(${readPct}%)</em></td>
        <td>${s.writtenFields}/${s.totalFields} <em>(${writePct}%)</em></td>
        <td>${s.firedHandlers}/${s.totalHandlers} <em>(${handlerPct}%)</em></td>
      </tr>
      ${fieldRows ? `<tr><td colspan="5"><details><summary>Fields</summary><table>${fieldRows}</table></details></td></tr>` : ''}`;
      })
      .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>MDA Form Coverage Report</title>
<style>
  body { font-family: Arial, sans-serif; margin: 2rem; }
  h1 { color: #333; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; text-align: left; }
  th { background: #f0f0f0; }
  tr:nth-child(even) { background: #fafafa; }
  em { color: #555; }
</style>
</head>
<body>
<h1>MDA Form Coverage Report</h1>
<p>Generated: ${new Date().toISOString()}</p>
<table>
  <thead>
    <tr>
      <th>Entity</th>
      <th>Form</th>
      <th>Fields Read</th>
      <th>Fields Written</th>
      <th>Handlers Fired</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
</body>
</html>`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // coverage-summary.json
  // ──────────────────────────────────────────────────────────────────────────

  private static writeCoverageSummary(
    wrSummaries: WebResourceCoverageSummary[],
    formSummaries: FormCoverageSummary[],
    outputDir: string
  ): void {
    const summary: CoverageSummaryReport = {
      generatedAt: new Date().toISOString(),
      webResources: wrSummaries,
      forms: formSummaries,
    };

    const summaryPath = path.join(outputDir, 'coverage-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`[CoverageReporter] Summary: ${summaryPath}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Console summary
  // ──────────────────────────────────────────────────────────────────────────

  private static printSummaryToConsole(
    wrSummaries: WebResourceCoverageSummary[],
    formSummaries: FormCoverageSummary[]
  ): void {
    console.log('\n── JS Web Resource Coverage ─────────────────────────────');
    if (wrSummaries.length === 0) {
      console.log('  (no web resources instrumented)');
    } else {
      for (const s of wrSummaries) {
        console.log(
          `  ${s.logicalName.padEnd(40)} Stmts: ${s.statements.pct}%  Branch: ${s.branches.pct}%  Funcs: ${s.functions.pct}%`
        );
      }
    }

    console.log('\n── MDA Form Field Coverage ──────────────────────────────');
    if (formSummaries.length === 0) {
      console.log('  (no form data collected)');
    } else {
      for (const s of formSummaries) {
        const readPct =
          s.totalFields > 0 ? Math.round((s.readFields / s.totalFields) * 100) : 0;
        const writePct =
          s.totalFields > 0 ? Math.round((s.writtenFields / s.totalFields) * 100) : 0;
        const handlerPct =
          s.totalHandlers > 0 ? Math.round((s.firedHandlers / s.totalHandlers) * 100) : 100;
        console.log(
          `  ${s.entityLogicalName}/${s.formName}`.padEnd(40) +
            ` Fields read: ${s.readFields}/${s.totalFields} (${readPct}%)` +
            `  Written: ${s.writtenFields}/${s.totalFields} (${writePct}%)` +
            `  Handlers: ${s.firedHandlers}/${s.totalHandlers} (${handlerPct}%)`
        );
      }
    }
    console.log('');
  }
}
