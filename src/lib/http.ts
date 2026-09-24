import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function requireSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http"
    ? `${forwardedProtocol}:`
    : new URL(request.url).protocol;
  let matches = false;
  try {
    const parsed = new URL(origin || "");
    matches = !!host && parsed.host === host && parsed.protocol === protocol;
  } catch { /* A missing or malformed Origin is rejected. */ }
  if (!matches) {
    throw new ApiFailure(403, "origin_rejected", "This action must come from the workbench site.");
  }
}

export async function jsonBody(request: NextRequest): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiFailure(415, "json_required", "Send a JSON request body.");
  }
  const raw = await limitedRawBody(request);
  try { return JSON.parse(raw) as unknown; }
  catch { throw new ApiFailure(400, "invalid_json", "The JSON request could not be read."); }
}

export async function limitedRawBody(request: NextRequest, maxBytes = 16_384): Promise<string> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes) throw new ApiFailure(413, "too_large", "The request is too large.");
  if (!request.body) throw new ApiFailure(400, "empty_body", "A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ApiFailure(413, "too_large", "The request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new ApiFailure(400, "invalid_utf8", "The request body must be UTF-8 text.");
  }
}

export function failureResponse(error: unknown): NextResponse {
  if (error instanceof ApiFailure) {
    return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: error.issues[0]?.message || "Check the submitted fields." } },
      { status: 400 },
    );
  }
  console.error("Workbench request failed", error instanceof Error ? error.message : "unknown error");
  return NextResponse.json(
    { error: { code: "server_error", message: "The workbench could not complete that action." } },
    { status: 500 },
  );
}
