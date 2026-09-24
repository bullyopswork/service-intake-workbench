import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiFailure } from "@/lib/http";

function clientKey(request: NextRequest): string {
  // Vercel supplies the first header; local/reverse-proxy setups use the second.
  // Global quotas remain the hard cap if a proxy permits a spoofed address.
  const ip = request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown-client";
  const secret = process.env.DEMO_SESSION_SECRET;
  if (!secret) throw new Error("DEMO_SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 24);
}

export async function consumeQuota(client: PoolClient, scope: string, limit: number): Promise<void> {
  const result = await client.query(
    `INSERT INTO usage_counters (scope, bucket, count) VALUES ($1, current_date, 1)
     ON CONFLICT (scope, bucket) DO UPDATE
       SET count = usage_counters.count + 1
       WHERE usage_counters.count < $2
     RETURNING count`,
    [scope, limit],
  );
  if (!result.rowCount) {
    throw new ApiFailure(429, "demo_rate_limit", "The demo has reached its usage limit. Please try again later.");
  }
}

export async function guardWorkspaceCreation(client: PoolClient, request: NextRequest): Promise<void> {
  await consumeQuota(client, "global:new-workspace", 100);
  await consumeQuota(client, `client:${clientKey(request)}:new-workspace`, 20);
}

export async function guardPublicIntake(client: PoolClient, request: NextRequest): Promise<void> {
  await consumeQuota(client, "global:public-intake", 1000);
  await consumeQuota(client, `client:${clientKey(request)}:public-intake`, 200);
}
