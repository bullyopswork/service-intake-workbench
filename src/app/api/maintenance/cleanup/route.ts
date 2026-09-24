import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const expected = Buffer.from(secret || "");
  const provided = Buffer.from(supplied);
  if (!secret || secret.length < 32 || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Maintenance authorization required." } }, { status: 401 });
  }
  try {
    const removed = await pool().query("DELETE FROM demo_workspaces WHERE expires_at <= now()");
    await pool().query("DELETE FROM usage_counters WHERE bucket < current_date - 2");
    return NextResponse.json({ ok: true, expiredWorkspacesRemoved: removed.rowCount ?? 0 });
  } catch {
    return NextResponse.json({ error: { code: "cleanup_failed", message: "Maintenance did not complete." } }, { status: 500 });
  }
}
