import { NextRequest } from "next/server";
import { runSearch } from "@/lib/pipeline";
import { SearchParams, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams newline-delimited JSON (NDJSON) StreamEvents as the pipeline runs, so
 * the client table can populate progressively instead of waiting for the batch.
 */
export async function POST(req: NextRequest) {
  let body: Partial<SearchParams>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const address = (body.address || "").trim();
  if (!address) {
    return new Response("Missing 'address'", { status: 400 });
  }

  const params: SearchParams = {
    address,
    radius: clampRadius(body.radius),
    categories: body.categories,
    lighthouse: !!body.lighthouse,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        await runSearch(params, emit);
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : "Search failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

function clampRadius(r: unknown): number {
  const n = typeof r === "number" ? r : parseInt(String(r ?? ""), 10);
  if (!Number.isFinite(n)) return 1500;
  return Math.max(100, Math.min(50000, n));
}
