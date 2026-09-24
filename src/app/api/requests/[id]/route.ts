import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireDispatcher, requireUuid } from "@/lib/auth";
import { failureResponse, jsonBody, requireSameOrigin } from "@/lib/http";
import { actionSchema, getRequest, updateRequest } from "@/lib/requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const workspaceId = await requireDispatcher(request);
    const id = requireUuid((await context.params).id);
    return NextResponse.json({ request: await getRequest(workspaceId, id) });
  } catch (error) {
    return failureResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    requireSameOrigin(request);
    const workspaceId = await requireDispatcher(request);
    const id = requireUuid((await context.params).id);
    const action = actionSchema.parse(await jsonBody(request));
    return NextResponse.json({ request: await updateRequest(workspaceId, id, action) });
  } catch (error) {
    return failureResponse(error);
  }
}
