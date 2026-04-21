// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * SolutionParser
 *
 * Scans an unpacked Power Platform solution directory (produced by
 * `pac solution unpack`) and returns a {@link MdaSolutionManifest} describing:
 *
 *  - All JavaScript web resources found under `WebResources/**\/*.js`
 *  - All main-form XML files found under `Entities\/*\/FormXml/main\/*.xml`
 *
 * The parser is deliberately dependency-light: it uses only Node built-ins
 * (`fs`, `path`) plus `@xmldom/xmldom` for XML parsing.
 *
 * Usage
 * -----
 * ```typescript
 * const manifest = SolutionParser.parse('/path/to/solution/unpacked');
 * // manifest.webResources  — WebResourceEntry[]
 * // manifest.forms         — MdaFormManifest[]
 * ```
 *
 * If the path does not exist or `SOLUTION_UNPACKED_PATH` is not set the method
 * logs a warning and returns an empty manifest so tests continue normally.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DOMParser, Element as XmlDomElement } from '@xmldom/xmldom';
import type {
  MdaSolutionManifest,
  WebResourceEntry,
  MdaFormManifest,
  FormTabEntry,
  FormSectionEntry,
  FormFieldEntry,
  HandlerEntry,
} from './types';

export class SolutionParser {
  /**
   * Parse the unpacked solution at `solutionPath` and return its manifest.
   *
   * @param solutionPath - Absolute or relative path to the root of the
   *   unpacked solution directory (the folder that contains `WebResources/`
   *   and `Entities/`).
   * @returns A {@link MdaSolutionManifest}. Returns an empty manifest (no
   *   error thrown) when the directory is missing or `solutionPath` is falsy.
   */
  static parse(solutionPath: string | undefined | null): MdaSolutionManifest {
    if (!solutionPath) {
      console.warn('[SolutionParser] SOLUTION_UNPACKED_PATH is not set — coverage disabled.');
      return { webResources: [], forms: [] };
    }

    const absPath = path.resolve(solutionPath);

    if (!fs.existsSync(absPath)) {
      console.warn(
        `[SolutionParser] Solution path does not exist: ${absPath} — coverage disabled.`
      );
      return { webResources: [], forms: [] };
    }

    const webResources = this.scanWebResources(absPath);
    const forms = this.scanFormXmls(absPath);

    console.log(
      `[SolutionParser] Parsed solution: ${webResources.length} web resource(s), ${forms.length} main form(s).`
    );

    return { webResources, forms };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Web resource scanning
  // ──────────────────────────────────────────────────────────────────────────

  private static scanWebResources(solutionRoot: string): WebResourceEntry[] {
    const wrRoot = path.join(solutionRoot, 'WebResources');
    if (!fs.existsSync(wrRoot)) {
      return [];
    }

    const jsFiles = this.globSync(wrRoot, '.js');
    return jsFiles.map((filePath) => {
      // Derive logical name: relative path from WebResources/ with forward slashes
      const logicalName = path.relative(wrRoot, filePath).replace(/\\/g, '/');

      // Build a URL glob pattern that Playwright's page.route() can match.
      // D365 serves web resources at URLs like:
      //   https://orgXXX.crm.dynamics.com/WebResources/pub_%2Fjs%2Forder.handlers.js
      // We encode '/' → '%2F' (D365 encodes slashes in the WR logical name).
      const encodedName = logicalName.replace(/\//g, '%2F');
      const urlPattern = `**/WebResources/${encodedName}`;

      return { logicalName, filePath, urlPattern };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FormXml/main scanning
  // ──────────────────────────────────────────────────────────────────────────

  private static scanFormXmls(solutionRoot: string): MdaFormManifest[] {
    const entitiesRoot = path.join(solutionRoot, 'Entities');
    if (!fs.existsSync(entitiesRoot)) {
      return [];
    }

    const manifests: MdaFormManifest[] = [];

    // Each subdirectory directly under Entities/ is an entity folder.
    const entityFolders = fs
      .readdirSync(entitiesRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const entityFolder of entityFolders) {
      const mainFormDir = path.join(entitiesRoot, entityFolder, 'FormXml', 'main');
      if (!fs.existsSync(mainFormDir)) {
        continue;
      }

      const xmlFiles = fs
        .readdirSync(mainFormDir)
        .filter((f) => f.toLowerCase().endsWith('.xml'))
        .map((f) => path.join(mainFormDir, f));

      for (const xmlFile of xmlFiles) {
        try {
          const manifest = this.parseFormXml(entityFolder, xmlFile);
          if (manifest) {
            manifests.push(manifest);
          }
        } catch (err) {
          console.warn(`[SolutionParser] Failed to parse ${xmlFile}: ${err}`);
        }
      }
    }

    return manifests;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FormXml parsing
  // ──────────────────────────────────────────────────────────────────────────

  private static parseFormXml(entityLogicalName: string, xmlFilePath: string): MdaFormManifest | null {
    const xml = fs.readFileSync(xmlFilePath, 'utf-8');
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Root element is <form> in unpacked solution XML.
    const formEl = doc.documentElement as XmlDomElement;
    if (!formEl || formEl.nodeName !== 'form') {
      return null;
    }

    const formId = formEl.getAttribute('id') ?? '';
    const formName = formEl.getAttribute('name') ?? path.basename(xmlFilePath, '.xml');

    const tabs = this.parseTabs(formEl);
    const registeredHandlers = this.parseHandlers(formEl);

    return { entityLogicalName, formName, formId, tabs, registeredHandlers };
  }

  /** Parse all <tab> elements from the form. */
  private static parseTabs(formEl: XmlDomElement): FormTabEntry[] {
    const tabs: FormTabEntry[] = [];
    const tabEls = formEl.getElementsByTagName('tab');

    for (let i = 0; i < tabEls.length; i++) {
      const tabEl = tabEls.item(i) as XmlDomElement;
      const tabName = tabEl.getAttribute('name') ?? `tab_${i}`;
      const tabLabel = this.getLabel(tabEl) ?? tabName;

      const sections = this.parseSections(tabEl);
      tabs.push({ name: tabName, label: tabLabel, sections });
    }

    return tabs;
  }

  /** Parse all <section> elements within a tab. */
  private static parseSections(tabEl: XmlDomElement): FormSectionEntry[] {
    const sections: FormSectionEntry[] = [];
    const sectionEls = tabEl.getElementsByTagName('section');

    for (let i = 0; i < sectionEls.length; i++) {
      const secEl = sectionEls.item(i) as XmlDomElement;
      const secName = secEl.getAttribute('name') ?? `section_${i}`;
      const secLabel = this.getLabel(secEl) ?? secName;

      const fields = this.parseFields(secEl);
      sections.push({ name: secName, label: secLabel, fields });
    }

    return sections;
  }

  /** Parse all <control> elements within a section. */
  private static parseFields(sectionEl: XmlDomElement): FormFieldEntry[] {
    const fields: FormFieldEntry[] = [];
    const controlEls = sectionEl.getElementsByTagName('control');

    for (let i = 0; i < controlEls.length; i++) {
      const ctrlEl = controlEls.item(i) as XmlDomElement;
      const controlId = ctrlEl.getAttribute('id') ?? '';
      const attributeLogicalName = ctrlEl.getAttribute('datafieldname') ?? controlId;
      const dataType = ctrlEl.getAttribute('classid') ?? '';

      // required-level comes from a child <RequiredLevel> element or an
      // attribute on the parent <cell> element.
      const parentCell = ctrlEl.parentNode as XmlDomElement | null;
      const required =
        parentCell?.getAttribute('required') === '1' ||
        this.getChildText(ctrlEl, 'RequiredLevel') === 'Required';

      if (attributeLogicalName) {
        fields.push({ attributeLogicalName, controlId, dataType, required });
      }
    }

    return fields;
  }

  /** Parse all event handler registrations from <events> / <event> / <Handlers> / <Handler>. */
  private static parseHandlers(formEl: XmlDomElement): HandlerEntry[] {
    const handlers: HandlerEntry[] = [];

    const handlerEls = formEl.getElementsByTagName('Handler');
    for (let i = 0; i < handlerEls.length; i++) {
      const h = handlerEls.item(i) as XmlDomElement;

      const functionName = h.getAttribute('functionName') ?? '';
      const webResourceName = h.getAttribute('libraryName') ?? '';

      if (!functionName || !webResourceName) {
        continue;
      }

      // Walk up to find the parent <event> to determine eventName and
      // optionally the attribute it's registered on.
      let eventEl: XmlDomElement | null = h.parentNode as XmlDomElement | null;
      while (eventEl && eventEl.nodeName !== 'event') {
        eventEl = eventEl.parentNode as XmlDomElement | null;
      }

      const eventName = (eventEl?.getAttribute('name') ?? 'onload').toLowerCase();
      // For field-level events the <event> element has an "attribute" attribute.
      const attributeName = eventEl?.getAttribute('attribute') ?? undefined;

      handlers.push({ eventName, attributeName: attributeName || undefined, functionName, webResourceName });
    }

    return handlers;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // XML helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** Best-effort label extraction from first <label> child. */
  private static getLabel(el: XmlDomElement): string | null {
    const labels = el.getElementsByTagName('label');
    if (labels.length > 0) {
      return (labels.item(0) as XmlDomElement).getAttribute('description') ?? null;
    }
    return null;
  }

  /** Get the text content of the first child with a given tag name. */
  private static getChildText(el: XmlDomElement, tagName: string): string | null {
    const child = el.getElementsByTagName(tagName).item(0);
    return (child as XmlDomElement | null)?.textContent?.trim() ?? null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // File system helpers
  // ──────────────────────────────────────────────────────────────────────────

  /** Recursively collect all files with `ext` under `dir`. */
  private static globSync(dir: string, ext: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.globSync(fullPath, ext));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(ext)) {
        results.push(fullPath);
      }
    }
    return results;
  }
}
