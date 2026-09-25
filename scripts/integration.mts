import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { Pool } from "pg";

const base = process.env.TEST_BASE_URL || "http://localhost:3006";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) {
  throw new Error("Integration tests only target a local server");
}

type Json = Record<string, unknown>;
let checks = 0;

async function call(
  path: string,
  method: string,
  body?: Json,
  cookie?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; data: Json; cookie?: string }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: base,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await response.json()) as Json;
  const setCookie = response.headers.get("set-cookie");
  return { status: response.status, data, cookie: setCookie?.split(";")[0] };
}

const sample = {
  name: "Alex Example",
  email: "alex@example.com",
  category: "maintenance",
  subject: "Fictional door closer",
  description: "The fictional lobby door closes too quickly in this demonstration.",
};

const invalid = await call("/api/intake", "POST", { ...sample, description: "short" });
assert.equal(invalid.status, 400);
assert.equal((invalid.data.error as Json).code, "invalid_input");
checks++;

const nonDemoEmail = await call("/api/intake", "POST", { ...sample, email: "alex@demo.localhost" });
assert.equal(nonDemoEmail.status, 400);
const oversized = await call("/api/intake", "POST", { ...sample, description: "x".repeat(20_000) });
assert.equal(oversized.status, 413);
const foreignOrigin = await call("/api/intake", "POST", sample, undefined, { origin: "https://outside.invalid" });
assert.equal(foreignOrigin.status, 403);
checks++;

const unauthenticated = await call("/api/requests", "GET");
assert.equal(unauthenticated.status, 401);
checks++;

const first = await call("/api/intake", "POST", sample);
assert.equal(first.status, 201);
assert.ok(first.cookie);
assert.equal(first.data.duplicateOf, null);
const firstId = first.data.requestId as string;
checks++;

const publicStaff = await call("/api/requests", "GET", undefined, first.cookie);
assert.equal(publicStaff.status, 403);
checks++;

const second = await call("/api/intake", "POST", { ...sample, subject: "Second fictional door closer" }, first.cookie);
assert.equal(second.status, 201);
assert.equal(second.data.duplicateOf, firstId);
checks++;

const entered = await call("/api/demo/enter", "POST", undefined, first.cookie);
assert.equal(entered.status, 200);
assert.ok(entered.cookie);
assert.ok(entered.data.workspaceId);
const staffCookie = entered.cookie;
checks++;

const inbox = await call("/api/requests", "GET", undefined, staffCookie);
assert.equal(inbox.status, 200);
const requests = inbox.data.requests as Json[];
assert.ok(requests.length >= 5);
assert.ok(requests.some((item) => item.id === firstId));
checks++;

const other = await call("/api/demo/enter", "POST");
assert.equal(other.status, 200);
const isolated = await call(`/api/requests/${firstId}`, "GET", undefined, other.cookie);
assert.equal(isolated.status, 404);
checks++;

const badStart = await call(`/api/requests/${firstId}`, "PATCH", { action: "start" }, staffCookie);
assert.equal(badStart.status, 409);
checks++;

for (const [action, extra, expected] of [
  ["assign", { assignee: "Demo dispatcher" }, "triage"],
  ["start", {}, "in_progress"],
  ["resolve", { note: "Synthetic work complete." }, "resolved"],
] as const) {
  const changed = await call(`/api/requests/${firstId}`, "PATCH", { action, ...extra }, staffCookie);
  assert.equal(changed.status, 200);
  assert.equal((changed.data.request as Json).status, expected);
  checks++;
}
const detail = await call(`/api/requests/${firstId}`, "GET", undefined, staffCookie);
assert.equal(((detail.data.request as Json).events as Json[]).length, 4);
checks++;

const [replayOne, replayTwo] = await Promise.all([
  call("/api/demo/replay", "POST", undefined, staffCookie),
  call("/api/demo/replay", "POST", undefined, staffCookie),
]);
assert.deepEqual([replayOne.status, replayTwo.status].sort(), [200, 201]);
assert.equal(replayOne.data.requestId, replayTwo.data.requestId);
assert.notEqual(replayOne.data.replayed, replayTwo.data.replayed);
checks++;

const raw = JSON.stringify({ ...sample, externalId: "partner-event-001" });
const secret = process.env.PARTNER_WEBHOOK_SECRET;
assert.ok(secret);
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = `sha256=${createHmac("sha256", secret).update(`${entered.data.workspaceId}.${timestamp}.partner-event-001.${raw}`).digest("hex")}`;
const webhook = async (signatureHeader: string, key = "partner-event-001", time = timestamp) => {
  const response = await fetch(`${base}/api/partner/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": key,
      "x-workbench-workspace-id": String(entered.data.workspaceId),
      "x-workbench-timestamp": time,
      "x-workbench-signature": signatureHeader,
    },
    body: raw,
  });
  return { status: response.status, data: (await response.json()) as Json };
};
assert.equal((await webhook("sha256=" + "0".repeat(64))).status, 401);
assert.equal((await webhook(signature, "partner-event-002")).status, 401);
assert.equal((await webhook(signature, "partner-event-001", "1000000000")).status, 401);
const signed = await webhook(signature);
assert.equal(signed.status, 201);
const signedAgain = await webhook(signature);
assert.equal(signedAgain.status, 200);
assert.equal(signed.data.requestId, signedAgain.data.requestId);
const newKeySignature = `sha256=${createHmac("sha256", secret).update(`${entered.data.workspaceId}.${timestamp}.partner-event-002.${raw}`).digest("hex")}`;
assert.equal((await webhook(newKeySignature, "partner-event-002")).status, 400);
checks++;

const reset = await call("/api/demo/reset", "POST", undefined, staffCookie);
assert.equal(reset.status, 200);
const afterReset = await call(`/api/requests/${firstId}`, "GET", undefined, staffCookie);
assert.equal(afterReset.status, 404);
checks++;

const burst = await Promise.all(Array.from({ length: 31 }, (_, index) =>
  call("/api/intake", "POST", { ...sample, subject: `Synthetic concurrency check ${index + 1}` }, staffCookie)));
assert.equal(burst.filter((item) => item.status === 201).length, 27);
assert.equal(burst.filter((item) => item.status === 429).length, 4);
const cappedInbox = await call("/api/requests", "GET", undefined, staffCookie);
assert.equal((cappedInbox.data.requests as Json[]).length, 30);
checks++;

const noCleanupAuth = await fetch(`${base}/api/maintenance/cleanup`);
assert.equal(noCleanupAuth.status, 401);
checks++;

// The destructive cleanup proof is opt-in and only runs against a dedicated local DB.
// CI sets this flag with its temporary Postgres service; normal test runs never delete rows.
if (process.env.RUN_LOCAL_CLEANUP_TEST === "1") {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString);
  const database = new URL(connectionString);
  if (!["localhost", "127.0.0.1"].includes(database.hostname) ||
      !["service_intake", "workbench_test"].includes(database.pathname.slice(1))) {
    throw new Error("Cleanup proof requires a dedicated local test database");
  }
  const db = new Pool({ connectionString, max: 1 });
  try {
    await db.query("UPDATE demo_workspaces SET expires_at = now() - interval '1 minute' WHERE id = $1", [entered.data.workspaceId]);
    const cronSecret = process.env.CRON_SECRET;
    assert.ok(cronSecret);
    const cleanup = await fetch(`${base}/api/maintenance/cleanup`, {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    assert.equal(cleanup.status, 200);
    const gone = await db.query("SELECT id FROM demo_workspaces WHERE id = $1", [entered.data.workspaceId]);
    assert.equal(gone.rowCount, 0);
    const childGone = await db.query("SELECT id FROM service_requests WHERE workspace_id = $1", [entered.data.workspaceId]);
    assert.equal(childGone.rowCount, 0);
    checks++;
  } finally {
    await db.end();
  }
}

process.stdout.write(`${checks} local API/database journey checks passed.\n`);
