import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireUuid } from "@/lib/auth";
import { pool } from "@/lib/db";
import { ApiFailure, failureResponse, limitedRawBody } from "@/lib/http";
import { ingestPartner, partnerSchema } from "@/lib/requests";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.PARTNER_WEBHOOK_SECRET;
    if (!secret || secret.length < 32) throw new Error("PARTNER_WEBHOOK_SECRET is not configured");
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      throw new ApiFailure(415, "json_required", "Send a JSON request body.");
    }
    const key = request.headers.get("idempotency-key") || "";
    if (!/^[A-Za-z0-9._:-]{8,100}$/.test(key)) {
      throw new ApiFailure(400, "invalid_replay_key", "A valid Idempotency-Key is required.");
    }
    const timestamp = request.headers.get("x-workbench-timestamp") || "";
    if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      throw new ApiFailure(401, "stale_signature", "The partner signature timestamp is invalid or expired.");
    }
    const workspaceId = requireUuid(request.headers.get("x-workbench-workspace-id") || "");
    const raw = await limitedRawBody(request);
    const supplied = request.headers.get("x-workbench-signature") || "";
    const expected = createHmac("sha256", secret).update(`${workspaceId}.${timestamp}.${key}.${raw}`).digest("hex");
    const providedHex = supplied.startsWith("sha256=") ? supplied.slice(7) : "";
    if (!/^[0-9a-f]{64}$/i.test(providedHex) ||
        !timingSafeEqual(Buffer.from(providedHex, "hex"), Buffer.from(expected, "hex"))) {
      throw new ApiFailure(401, "bad_signature", "The partner signature is invalid.");
    }
    const workspace = await pool().query(
      "SELECT id FROM demo_workspaces WHERE id = $1 AND expires_at > now()",
      [workspaceId],
    );
    if (!workspace.rowCount) throw new ApiFailure(404, "workspace_not_found", "The demo workspace is unavailable.");
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { throw new ApiFailure(400, "invalid_json", "The JSON request could not be read."); }
    const input = partnerSchema.parse(body);
    if (input.externalId !== key) {
      throw new ApiFailure(400, "event_key_mismatch", "The replay key must match the partner event ID.");
    }
    const result = await ingestPartner(workspaceId, key, input);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return failureResponse(error);
  }
}
