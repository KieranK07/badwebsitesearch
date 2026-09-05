import pLimit from "p-limit";
import { Business, Lead, SearchParams, StreamEvent } from "./types";
import { geocode } from "./geocode";
import { searchGoogle } from "./sources/google";
import { searchOsm } from "./sources/osm";
import { dedupe } from "./dedup";
import { enrichMissingWebsites } from "./enrich";
import { assess } from "./assess";
import { scoreAssessment } from "./score";

// Enrichment + assessment run together per business at this concurrency.
const CONCURRENCY = 12;

/**
 * Run the full search pipeline, emitting StreamEvents as work progresses so the
 * UI can fill in the table incrementally. `emit` is awaited so backpressure on a
 * slow client doesn't get ahead of itself.
 */
export async function runSearch(
  params: SearchParams,
  emit: (e: StreamEvent) => void
): Promise<void> {
  emit({ type: "status", message: "Geocoding address…" });
  const point = await geocode(params.address);
  emit({ type: "geocode", point });

  emit({ type: "status", message: "Finding businesses (Google + OpenStreetMap)…" });
  const [googleResult, osmResult] = await Promise.all([
    searchGoogle(point, params.radius),
    searchOsm(point, params.radius),
  ]);

  // Surface source failures so an empty page isn't mistaken for "no businesses".
  for (const err of [googleResult.error, osmResult.error]) {
    if (err) emit({ type: "status", message: `⚠️ ${err}` });
  }

  const businesses: Business[] = dedupe([
    ...googleResult.businesses,
    ...osmResult.businesses,
  ]);
  emit({ type: "discovered", count: businesses.length });

  if (businesses.length === 0) {
    const allFailed = googleResult.error && osmResult.error;
    emit({
      type: "status",
      message: allFailed
        ? "Both data sources failed — try again in a moment."
        : "No businesses found in this area.",
    });
    emit({ type: "done", total: 0 });
    return;
  }

  emit({
    type: "status",
    message: `Assessing ${businesses.length} businesses…`,
  });

  const limit = pLimit(CONCURRENCY);
  let completed = 0;

  await Promise.all(
    businesses.map((biz) =>
      limit(async () => {
        // Enrich missing website inline so results stream immediately rather
        // than waiting for all enrichment to finish before any assessment starts.
        await enrichMissingWebsites([biz]);
        const assessment = await assess(biz, !!params.lighthouse);
        const lead: Lead = {
          ...biz,
          assessment,
          score: scoreAssessment(assessment),
        };
        completed += 1;
        emit({ type: "lead", lead });
      })
    )
  );

  emit({ type: "done", total: completed });
}
