import { z } from "npm:zod@4.6.7";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Largest accepted request body. The biggest legitimate request is a chat of 24 turns of up to 4,000
 * characters each (about 100 KB in English, up to ~400 KB in scripts that need 3-4 bytes per character).
 */
export const MAX_BODY_BYTES = 512 * 1024;

/**
 * Reads a JSON body without ever holding more than MAX_BODY_BYTES in memory. An empty body is `{}`
 * (e.g. delete-account); a body that is not valid JSON is a 400, and an oversized one a 413.
 */
export async function readJsonBody(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("Content-Length"));
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "Request is too large.");
  if (!req.body) return {};

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "Invalid request. The body must be JSON.");
  }
}

/** Wraps a POST handler with CORS, JSON parsing, and uniform error responses. */
export function createHandler(handler: (req: Request, body: unknown) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const body = await readJsonBody(req);
      return json(await handler(req, body));
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      // Request bodies are validated with Zod (`Input.parse`); a failure is the caller's error.
      if (error instanceof z.ZodError) {
        const issue = error.issues[0];
        const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
        return json({ error: `Invalid request. ${field}${issue?.message ?? ""}`.trim() }, 400);
      }
      console.error(error);
      return json({ error: "Unexpected server error" }, 500);
    }
  };
}

export function serve(handler: (req: Request, body: unknown) => Promise<unknown>) {
  Deno.serve(createHandler(handler));
}
