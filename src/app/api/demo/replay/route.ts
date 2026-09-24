import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/auth";
import { failureResponse, requireSameOrigin } from "@/lib/http";
import { ingestPartner } from "@/lib/requests";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const workspaceId = await requireDispatcher(request);
    const result = await ingestPartner(workspaceId, "fictional-partner-event-001", {
      externalId: "fictional-partner-event-001",
      name: "Jules Rivera",
      email: "jules@example.test",
      category: "billing",
      subject: "Sample invoice question",
      description: "This is a fictional partner request about a sample invoice discrepancy.",
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return failureResponse(error);
  }
}
