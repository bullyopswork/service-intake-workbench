import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { failureResponse, jsonBody, requireSameOrigin } from "@/lib/http";
import { intakeSchema, createPublicRequest, createPublicRequestForNewWorkspace } from "@/lib/requests";
import { existingWorkspace, makeSession, readSession, setSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const input = intakeSchema.parse(await jsonBody(request));
    const current = readSession(request);
    const workspaceId = await existingWorkspace(current);
    let freshWorkspaceId: string | null = null;
    let created: { requestId: string; reference: string; duplicateOf: string | null };
    if (workspaceId) {
      created = await createPublicRequest(request, workspaceId, input);
    } else {
      const fresh = await createPublicRequestForNewWorkspace(request, input);
      freshWorkspaceId = fresh.workspaceId;
      created = fresh;
    }
    const response = NextResponse.json({
      requestId: created.requestId,
      reference: created.reference,
      duplicateOf: created.duplicateOf,
    }, { status: 201 });
    if (freshWorkspaceId) setSession(response, makeSession(freshWorkspaceId, "visitor"), request);
    return response;
  } catch (error) {
    return failureResponse(error);
  }
}
