import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { failureResponse, requireSameOrigin } from "@/lib/http";
import { seedWorkspace } from "@/lib/requests";
import { createWorkspace, existingWorkspace, makeSession, readSession, setSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const workspaceId = (await existingWorkspace(readSession(request))) ?? (await createWorkspace(request));
    await seedWorkspace(workspaceId);
    const response = NextResponse.json({ ok: true, workspaceId });
    setSession(response, makeSession(workspaceId, "dispatcher"), request);
    return response;
  } catch (error) {
    return failureResponse(error);
  }
}
