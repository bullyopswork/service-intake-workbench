# Service Intake Workbench — public portfolio build

Status: published synthetic portfolio demo. New codebase; no source, history, or data copied from a private or client project.

## Purpose

A small service team receives requests from a public form and a partner webhook. The demo proves a complete intake → PostgreSQL record → staff review → assignment/status transition → immutable activity trail, including idempotent webhook replay and a possible-duplicate flag. Nothing sends a real message or calls a real customer system.

## Public reviewer journey

1. On `/`, submit a fictional request with name, email, category, subject, and description. Show validation and a reference on success.
2. Choose **Open demo workspace**. This explicitly grants a *demo-only* dispatcher role for the current synthetic workspace; it is not real identity authentication.
3. On `/workspace`, find the request in an inbox with status/source filters, open its detail, assign it, start work, and resolve it. Each change produces an activity event.
4. Replay a fictional partner webhook twice; the second call returns the same record with `replayed: true`. Show the record and event history. A likely duplicate is flagged for review, not silently merged.
5. Reset only the current visitor's synthetic workspace.

## API contract for UI and server work

All JSON errors are `{ "error": { "code": string, "message": string } }`. Normal request content is fictional and session-isolated.

- `POST /api/intake` body `{ name, email, category, subject, description }` → `{ requestId, reference, duplicateOf }`.
- `POST /api/demo/enter` → `{ ok: true, workspaceId }`; creates/retains current workspace, seeds fictional examples, and sets a signed HttpOnly demo-role cookie.
- `GET /api/requests` → `{ requests: RequestSummary[] }` (demo dispatcher role required). Each summary includes `id`, `reference`, `name`, `email`, `category`, `subject`, `description`, `status`, `source`, `assignee`, `duplicateOf`, `createdAt`, `updatedAt`.
- `GET /api/requests/:id` → `{ request: ServiceRequest }`, with an `events` array (`id`, `action`, `actor`, `note`, `createdAt`, `fromStatus`, `toStatus`).
- `PATCH /api/requests/:id` body `{ action: "assign" | "start" | "resolve" | "reopen", assignee?, note? }` → `{ request: ServiceRequest }`. Server validates transitions and writes an event in the same transaction.
- `POST /api/demo/replay` → `{ requestId, reference, replayed }`; sends a fixed fictional partner event through the same idempotent ingestion service, with a deterministic key, scoped to the current workspace.
- `POST /api/demo/reset` → `{ ok: true }`; resets only current workspace to seeded fictional examples.
- `POST /api/partner/webhook` accepts `{ externalId, name, email, category, subject, description }`, `Idempotency-Key` (equal to `externalId`), `X-Workbench-Workspace-Id`, `X-Workbench-Timestamp` (Unix seconds, ±5 minutes), and `X-Workbench-Signature: sha256=<hex>` HMAC over `workspaceId + "." + timestamp + "." + idempotencyKey + "." + rawBody`. Requires the server-side `PARTNER_WEBHOOK_SECRET`; returns `{ requestId, reference, replayed }` and never exposes the secret. The reviewer-facing **Replay fictional partner event** button calls `/api/demo/replay` and never receives this secret.

## Data and behavior

- PostgreSQL is the real source of truth. Tables: demo workspaces, requests, request events, and idempotency receipts; migrations are source-controlled SQL.
- A signed short-lived HttpOnly cookie selects a synthetic workspace and demo role. State-changing browser routes enforce a same-origin check; staff routes also enforce the demo dispatcher role. The demo entry is intentionally public, so README must not claim production authentication.
- Duplicate detection is advisory, based on normalized email and category in the same workspace. Do not merge or suppress a request merely because a possible duplicate exists.
- Invalid inputs get structured 4xx responses. Replay with the same idempotency key returns the same request even under concurrent calls.
- Demo reset, role entry, and all mutation paths use explicit server checks. No external messages or live AI/model calls in this phase.
- Environment: `DATABASE_URL`, `DEMO_SESSION_SECRET`, `PARTNER_WEBHOOK_SECRET`. Keep values outside Git.
