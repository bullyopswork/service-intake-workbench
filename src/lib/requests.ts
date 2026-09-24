import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { pool, transaction } from "@/lib/db";
import { ApiFailure } from "@/lib/http";
import { guardPublicIntake, guardWorkspaceCreation } from "@/lib/quota";
import type { RequestCategory, RequestEvent, RequestSource, RequestStatus, RequestSummary, ServiceRequest } from "@/lib/types";

export const intakeSchema = z.object({
  name: z.string().trim().min(2, "Enter a name of at least 2 characters.").max(70),
  email: z.email("Enter a valid email address.").max(160).refine(
    (value) => /@(?:[^@]+\.)?(?:example\.com|example\.org|example\.net)$/i.test(value) ||
      /@[^@]+\.(?:test|example|invalid)$/i.test(value),
    "Use a fictional demo email, such as alex@example.com.",
  ),
  category: z.enum(["maintenance", "installation", "billing", "other"]),
  subject: z.string().trim().min(5, "Enter a subject of at least 5 characters.").max(100),
  description: z.string().trim().min(20, "Enter a description of at least 20 characters.").max(1000),
}).strict();

export const partnerSchema = intakeSchema.extend({
  externalId: z.string().trim().min(3).max(100),
}).strict();

export const actionSchema = z.object({
  action: z.enum(["assign", "start", "resolve", "reopen"]),
  assignee: z.string().trim().min(2).max(70).optional(),
  note: z.string().trim().max(300).optional(),
}).strict();

export type IntakeInput = z.infer<typeof intakeSchema>;
export type PartnerInput = z.infer<typeof partnerSchema>;
export type ActionInput = z.infer<typeof actionSchema>;

type DbRow = Record<string, unknown>;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function summary(row: DbRow): RequestSummary {
  return {
    id: String(row.id),
    reference: String(row.reference),
    name: String(row.name),
    email: String(row.email),
    category: row.category as RequestCategory,
    subject: String(row.subject),
    description: String(row.description),
    status: row.status as RequestStatus,
    source: row.source as RequestSource,
    assignee: row.assignee === null ? null : String(row.assignee),
    duplicateOf: row.duplicate_of === null ? null : String(row.duplicate_of),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function event(row: DbRow): RequestEvent {
  return {
    id: String(row.id),
    action: String(row.action),
    actor: String(row.actor),
    note: row.note === null ? null : String(row.note),
    fromStatus: row.from_status as RequestStatus | null,
    toStatus: row.to_status as RequestStatus | null,
    createdAt: iso(row.created_at),
  };
}

async function appendEvent(
  client: PoolClient,
  workspaceId: string,
  requestId: string,
  action: string,
  actor: string,
  note: string | null,
  fromStatus: RequestStatus | null,
  toStatus: RequestStatus | null,
): Promise<void> {
  await client.query(
    `INSERT INTO request_events
      (id, workspace_id, request_id, action, actor, note, from_status, to_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), workspaceId, requestId, action, actor, note, fromStatus, toStatus],
  );
}

async function createRequestInTransaction(
  client: PoolClient,
  workspaceId: string,
  input: IntakeInput,
  source: RequestSource,
  actor: string,
): Promise<{ requestId: string; reference: string; duplicateOf: string | null }> {
  const workspace = await client.query(
    "SELECT id FROM demo_workspaces WHERE id = $1 AND expires_at > now() FOR UPDATE",
    [workspaceId],
  );
  if (!workspace.rowCount) throw new ApiFailure(404, "workspace_not_found", "The demo workspace is unavailable.");
  const volume = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM service_requests WHERE workspace_id = $1",
    [workspaceId],
  );
  if (Number(volume.rows[0].count) >= 30) {
    throw new ApiFailure(429, "workspace_limit", "This demo workspace is full. Reset it to continue.");
  }
  const normalizedEmail = input.email.trim().toLowerCase();
  const possible = await client.query<{ id: string }>(
    `SELECT id FROM service_requests
     WHERE workspace_id = $1 AND normalized_email = $2 AND category = $3
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, normalizedEmail, input.category],
  );
  const id = randomUUID();
  const reference = `SI-${id.slice(0, 8).toUpperCase()}`;
  const duplicateOf = possible.rows[0]?.id ?? null;
  await client.query(
    `INSERT INTO service_requests
      (id, workspace_id, reference, name, email, normalized_email, category, subject,
       description, status, source, assignee, duplicate_of)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,NULL,$11)`,
    [id, workspaceId, reference, input.name, input.email.trim(), normalizedEmail,
      input.category, input.subject, input.description, source, duplicateOf],
  );
  await appendEvent(client, workspaceId, id, "received", actor,
    duplicateOf ? "Possible duplicate flagged for human review." : null, null, "new");
  return { requestId: id, reference, duplicateOf };
}

export async function createPublicRequest(request: NextRequest, workspaceId: string, input: IntakeInput) {
  return transaction(async (client) => {
    await guardPublicIntake(client, request);
    return createRequestInTransaction(client, workspaceId, input, "web", "Public form");
  });
}

export async function createPublicRequestForNewWorkspace(request: NextRequest, input: IntakeInput) {
  return transaction(async (client) => {
    await guardWorkspaceCreation(client, request);
    await guardPublicIntake(client, request);
    const workspaceId = randomUUID();
    await client.query(
      "INSERT INTO demo_workspaces (id, expires_at) VALUES ($1, now() + interval '24 hours')",
      [workspaceId],
    );
    const created = await createRequestInTransaction(client, workspaceId, input, "web", "Public form");
    return { workspaceId, ...created };
  });
}

export async function listRequests(workspaceId: string): Promise<RequestSummary[]> {
  const result = await pool().query(
    `SELECT id, reference, name, email, category, subject, description, status, source,
            assignee, duplicate_of, created_at, updated_at
     FROM service_requests WHERE workspace_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100`,
    [workspaceId],
  );
  return result.rows.map(summary);
}

export async function getRequest(workspaceId: string, id: string): Promise<ServiceRequest> {
  const item = await pool().query(
    `SELECT id, reference, name, email, category, subject, description, status, source,
            assignee, duplicate_of, created_at, updated_at
     FROM service_requests WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, id],
  );
  if (!item.rowCount) throw new ApiFailure(404, "not_found", "This request was not found in your demo workspace.");
  const history = await pool().query(
    `SELECT id, action, actor, note, from_status, to_status, created_at
     FROM request_events WHERE workspace_id = $1 AND request_id = $2 ORDER BY created_at, id`,
    [workspaceId, id],
  );
  return { ...summary(item.rows[0]), events: history.rows.map(event) };
}

export async function updateRequest(workspaceId: string, id: string, input: ActionInput): Promise<ServiceRequest> {
  await transaction(async (client) => {
    const result = await client.query<{ status: RequestStatus; assignee: string | null }>(
      "SELECT status, assignee FROM service_requests WHERE workspace_id = $1 AND id = $2 FOR UPDATE",
      [workspaceId, id],
    );
    if (!result.rowCount) throw new ApiFailure(404, "not_found", "This request was not found in your demo workspace.");
    const current = result.rows[0];
    let next: RequestStatus;
    let assignee = current.assignee;
    if (input.action === "assign") {
      if (current.status !== "new" && current.status !== "triage") throw new ApiFailure(409, "invalid_transition", "Only new or triage requests can be assigned.");
      if (!input.assignee) throw new ApiFailure(400, "assignee_required", "Choose a demo assignee.");
      assignee = input.assignee;
      next = "triage";
    } else if (input.action === "start") {
      if (current.status !== "triage" || !current.assignee) throw new ApiFailure(409, "invalid_transition", "Assign the request before starting work.");
      next = "in_progress";
    } else if (input.action === "resolve") {
      if (current.status !== "in_progress") throw new ApiFailure(409, "invalid_transition", "Start work before resolving the request.");
      next = "resolved";
    } else {
      if (current.status !== "resolved") throw new ApiFailure(409, "invalid_transition", "Only resolved requests can be reopened.");
      next = "triage";
    }
    await client.query(
      "UPDATE service_requests SET status = $3, assignee = $4, updated_at = now() WHERE workspace_id = $1 AND id = $2",
      [workspaceId, id, next, assignee],
    );
    await appendEvent(client, workspaceId, id, input.action, "Demo dispatcher",
      input.note || null, current.status, next);
  });
  return getRequest(workspaceId, id);
}

export async function ingestPartner(
  workspaceId: string,
  idempotencyKey: string,
  input: PartnerInput,
): Promise<{ requestId: string; reference: string; replayed: boolean }> {
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return transaction(async (client) => {
    // The transaction-level advisory lock serializes even truly concurrent replays.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${workspaceId}:partner:${idempotencyKey}`,
    ]);
    const prior = await client.query<{ request_id: string; payload_sha256: string; reference: string }>(
      `SELECT i.request_id, i.payload_sha256, r.reference
       FROM idempotency_receipts i JOIN service_requests r ON r.id = i.request_id
       WHERE i.workspace_id = $1 AND i.source = 'partner' AND i.idempotency_key = $2`,
      [workspaceId, idempotencyKey],
    );
    if (prior.rowCount) {
      if (prior.rows[0].payload_sha256 !== fingerprint) {
        throw new ApiFailure(409, "idempotency_conflict", "That replay key was already used for different content.");
      }
      return { requestId: prior.rows[0].request_id, reference: prior.rows[0].reference, replayed: true };
    }
    const created = await createRequestInTransaction(client, workspaceId, input, "partner", "Partner webhook");
    await client.query(
      `INSERT INTO idempotency_receipts
        (workspace_id, source, idempotency_key, payload_sha256, request_id)
       VALUES ($1,'partner',$2,$3,$4)`,
      [workspaceId, idempotencyKey, fingerprint, created.requestId],
    );
    return { requestId: created.requestId, reference: created.reference, replayed: false };
  });
}

const seededExamples: IntakeInput[] = [
  { name: "Maya Ortiz", email: "maya@example.test", category: "maintenance", subject: "Lobby door closer", description: "The fictional lobby door closes too quickly and needs a review." },
  { name: "Theo Kim", email: "theo@example.test", category: "installation", subject: "Demo equipment setup", description: "Please schedule a fictional equipment installation for the sample office." },
  { name: "Maya Ortiz", email: "maya@example.test", category: "maintenance", subject: "Lobby door follow-up", description: "Following up on the fictional lobby door; it still closes too quickly." },
];

export async function seedWorkspace(workspaceId: string): Promise<void> {
  await transaction(async (client) => {
    await client.query("SELECT id FROM demo_workspaces WHERE id = $1 FOR UPDATE", [workspaceId]);
    const existing = await client.query(
      "SELECT 1 FROM service_requests WHERE workspace_id = $1 AND source = 'seed' LIMIT 1",
      [workspaceId],
    );
    if (existing.rowCount) return;
    for (const item of seededExamples) {
      await createRequestInTransaction(client, workspaceId, item, "seed", "Fictional example");
    }
  });
}

export async function resetWorkspace(workspaceId: string): Promise<void> {
  await transaction(async (client) => {
    await client.query("SELECT id FROM demo_workspaces WHERE id = $1 FOR UPDATE", [workspaceId]);
    await client.query("DELETE FROM service_requests WHERE workspace_id = $1", [workspaceId]);
    // Deleting requests cascades only this workspace's events and replay receipts.
  });
  await seedWorkspace(workspaceId);
}
