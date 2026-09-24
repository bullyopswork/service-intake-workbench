import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireDispatcher } from "@/lib/auth";
import { failureResponse } from "@/lib/http";
import { listRequests } from "@/lib/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ requests: await listRequests(await requireDispatcher(request)) });
  } catch (error) {
    return failureResponse(error);
  }
}
