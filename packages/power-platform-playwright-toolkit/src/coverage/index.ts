// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * MDA Code Coverage module
 *
 * Exports all public classes and types for the two-layer coverage system:
 *  - JS Web Resource coverage (Istanbul line/branch/function)
 *  - MDA Form structure coverage (field read/write, handler fire)
 */

export * from './types';
export { SolutionParser } from './solution-parser';
export { WebResourceCoverageCollector } from './web-resource-coverage';
export { FormCoverageTracker } from './form-coverage';
export { CoverageReporter } from './coverage-reporter';
export type { GenerateReportsOptions } from './coverage-reporter';
