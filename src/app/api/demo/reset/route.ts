import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/auth";
import { failureResponse, requireSameOrigin } from "@/lib/http";
import { resetWorkspace } from "@/lib/requests";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    await resetWorkspace(await requireDispatcher(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failureResponse(error);
  }
}
