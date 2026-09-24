import type { NextRequest } from "next/server";
import { ApiFailure } from "@/lib/http";
import { existingWorkspace, readSession } from "@/lib/session";

export async function requireDispatcher(request: NextRequest): Promise<string> {
  const session = readSession(request);
  const workspaceId = await existingWorkspace(session);
  if (!workspaceId) throw new ApiFailure(401, "demo_session_required", "Open a demo workspace to continue.");
  if (session?.role !== "dispatcher") {
    throw new ApiFailure(403, "demo_role_required", "Open the demo staff workspace first.");
  }
  return workspaceId;
}

export function requireUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new ApiFailure(400, "invalid_id", "The request ID is invalid.");
  }
  return value;
}
