import { NextRequest } from "next/server";
import { assess } from "@/lib/assess";
import { scoreAssessment } from "@/lib/score";
import { Business } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Assess a single URL on demand (used by the "Add website" row action). */
export async function POST(req: NextRequest) {
  let body: { url?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = (body.url || "").trim();
  if (!url) {
    return Response.json({ error: "Missing url" }, { status: 400 });
  }

  const stub: Business = {
    id: "",
    name: body.name || "",
    website: url,
    sources: [],
  };

  const assessment = await assess(stub, false);
  const score = scoreAssessment(assessment);
  return Response.json({ assessment, score });
}
