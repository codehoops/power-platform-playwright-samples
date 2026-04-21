# Power Platform Test Builder UI

A web application for recording, managing, and running Playwright tests against Power Platform apps.

## Prerequisites

- Node.js 20+
- Microsoft Edge browser
- A Microsoft 365 / Power Platform tenant

## Setup

1. Install dependencies:
   ```bash
   npm install
   cd client && npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env and fill in your Azure App Client ID and Tenant ID
   ```

3. Start the development servers:
   ```bash
   # Terminal 1 — backend
   npm run dev:server

   # Terminal 2 — frontend
   npm run dev:client
   ```

4. Open http://localhost:5173 in your browser.

## Usage

1. **Sign In** — Use the "New Test Plan" wizard to sign in with your Microsoft account via device code flow.
2. **Select Environment** — Choose your Power Platform environment.
3. **Select App** — Pick the Canvas or Model-Driven app to test.
4. **Record** — Interact with the live app in the browser; actions are captured automatically.
5. **Run Tests** — Execute recorded test cases and view results.
