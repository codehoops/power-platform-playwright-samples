# Context Engineering — Power Platform Playwright Samples

This directory contains **Context Engineering** files for AI agents (GitHub Copilot,
Claude, and others) that generate or review Playwright tests for unpacked Power Platform
solutions.

---

## What Is Context Engineering?

Context Engineering is the practice of providing AI agents with the exact information they
need — no more, no less — so that generated code is accurate, idiomatic, and safe to run.

Two categories of files live here:

| Category | Location | Purpose |
|---|---|---|
| **Instruction files** | `instructions/` | Declarative facts: XML schema, toolkit API, known patterns, anti-patterns. Shape every agent response for a given topic. |
| **Skill files** | `skills/` | Imperative step-by-step prompts. Each skill is a self-contained task the agent executes against your files to produce a concrete output. |

---

## Directory Structure

```
docs/context-engineering/
├── README.md                                       ← this file
│
├── instructions/
│   ├── 00-unpacked-solution-overview.md            ← unpacked file tree, XML namespaces
│   ├── 01-mda-form-testing.md                      ← FormXml → Playwright test mapping
│   ├── 02-mda-javascript-testing.md                ← JS web resources → event tests
│   └── 03-mda-business-rules-testing.md            ← Business Rule XML → condition/action tests
│
└── skills/
    ├── analyze-solution-structure.prompt.md        ← parse solution folder, emit JSON manifest
    ├── generate-mda-form-tests.prompt.md           ← manifest → <entity>-form.test.ts
    ├── generate-javascript-tests.prompt.md         ← manifest → <webresource>-events.test.ts
    └── generate-business-rule-tests.prompt.md      ← manifest → <entity>-business-rules.test.ts
```

---

## Prerequisites

Before invoking any skill:

1. **Toolkit built** — run `rush install && rush build` from the repo root.
2. **Auth configured** — run `npm run auth:mda:headful` inside `packages/e2e-tests/`.
3. **`.env` populated** — copy `.env.example` to `.env` and fill in `MODEL_DRIVEN_APP_URL`,
   `MS_AUTH_EMAIL`, etc.
4. **Solution unpacked** — run `pac solution unpack --zipFile MySolution.zip --folder ./unpacked`
   to produce the source tree the skills read.
5. **Entity name known** — the Dataverse logical name (e.g. `nwind_order`, `account`) of
   the table whose tests you are generating.

---

## How to Use a Skill

### In GitHub Copilot Chat

1. Open Copilot Chat in VS Code.
2. Paste the full content of the relevant skill file as your message, or use
   `#file:docs/context-engineering/skills/<skill>.prompt.md` to reference it.
3. Replace the `<PLACEHOLDER>` values in the skill prompt with your actual paths and
   entity names.
4. Send. Copilot will follow the steps in the skill and produce the requested output.

### In Claude / other AI assistants

1. Open a new conversation.
2. Paste the relevant **instruction file(s)** first to give the agent background context.
3. Then paste the **skill file** as your task prompt.
4. Replace placeholders with your real values and send.

### Recommended Workflow

```
1. analyze-solution-structure   →  produces manifest.json
2a. generate-mda-form-tests     →  uses manifest, produces <entity>-form.test.ts
2b. generate-javascript-tests   →  uses manifest, produces <webresource>-events.test.ts
2c. generate-business-rule-tests→  uses manifest, produces <entity>-business-rules.test.ts
```

Always run `analyze-solution-structure` first. The other three skills consume its output
instead of re-parsing raw XML, which keeps prompts short and deterministic.

---

## Relationship Between Instruction and Skill Files

```
Instruction files  →  "Here is how MDA forms work and how the toolkit maps to them"
Skill files        →  "Given that knowledge, do THIS specific task with THESE files"
```

Instruction files are **never** invoked directly; they are context that the agent absorbs
before executing a skill. When using Copilot Chat you can reference them with
`#file:docs/context-engineering/instructions/<file>.md`. When using Claude, paste them
before the skill prompt.

---

## Toolkit Quick Reference

All generated tests must use the `power-platform-playwright-toolkit` package. Key imports:

```typescript
import {
  AppProvider,
  AppType,
  AppLaunchMode,
  ModelDrivenAppPage,
  getFormContext,
  getEntityAttribute,
  setEntityAttribute,
  getAllEntityAttributes,
  saveForm,
  isFormDirty,
  isFormValid,
  executeInFormContext,
  generateUniqueOrderNumber,
} from 'power-platform-playwright-toolkit';
```

Never call `page.locator()` directly on Dataverse form content — all Xrm-layer
interactions must go through `executeInFormContext`, `getEntityAttribute`, or
`setEntityAttribute`.

---

## Contributing

- Keep instruction files **declarative** (facts only, no imperative steps).
- Keep skill files **imperative** (numbered steps, clear inputs and outputs).
- When you discover a new flakiness pattern, add it to the relevant instruction file
  **and** reference it in the corresponding generate skill.
- Follow the existing file naming convention: `NN-topic.md` for instructions,
  `verb-noun.prompt.md` for skills.
