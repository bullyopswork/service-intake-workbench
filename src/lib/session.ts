import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { pool, transaction } from "@/lib/db";
import { guardWorkspaceCreation } from "@/lib/quota";

const COOKIE_NAME = "siw_demo";
const LIFETIME_SECONDS = 60 * 60 * 24;

export type DemoRole = "visitor" | "dispatcher";
export interface DemoSession {
  workspaceId: string;
  role: DemoRole;
  expiresAt: number;
}

function signingSecret(): string {
  const secret = process.env.DEMO_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("DEMO_SESSION_SECRET must be at least 32 characters");
  return secret;
}

function signature(value: string): Buffer {
  return createHmac("sha256", signingSecret()).update(value).digest();
}

export function makeSession(workspaceId: string, role: DemoRole): DemoSession {
  return { workspaceId, role, expiresAt: Math.floor(Date.now() / 1000) + LIFETIME_SECONDS };
}

export function readSession(request: NextRequest): DemoSession | null {
  const value = request.cookies.get(COOKIE_NAME)?.value;
  if (!value) return null;
  const pieces = value.split(".");
  if (pieces.length !== 3 || pieces[0] !== "v1") return null;
  try {
    const signed = `${pieces[0]}.${pieces[1]}`;
    const provided = Buffer.from(pieces[2], "base64url");
    const expected = signature(signed);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const payload = JSON.parse(Buffer.from(pieces[1], "base64url").toString("utf8")) as DemoSession;
    if (
      typeof payload.workspaceId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(payload.workspaceId) ||
      (payload.role !== "visitor" && payload.role !== "dispatcher") ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSession(response: NextResponse, session: DemoSession, request: NextRequest): void {
  const body = `v1.${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  response.cookies.set(COOKIE_NAME, `${body}.${signature(body).toString("base64url")}`, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: LIFETIME_SECONDS,
  });
}

export async function createWorkspace(request: NextRequest): Promise<string> {
  const id = randomUUID();
  await transaction(async (client) => {
    await guardWorkspaceCreation(client, request);
    await client.query("INSERT INTO demo_workspaces (id, expires_at) VALUES ($1, now() + interval '24 hours')", [id]);
  });
  return id;
}

export async function existingWorkspace(session: DemoSession | null): Promise<string | null> {
  if (!session) return null;
  const result = await pool().query(
    "SELECT id FROM demo_workspaces WHERE id = $1 AND expires_at > now()",
    [session.workspaceId],
  );
  return result.rowCount ? session.workspaceId : null;
}
