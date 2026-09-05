import { LighthouseScores } from "./types";
import { fetchWithTimeout } from "./http";

const ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * Fetch Lighthouse scores via the free PageSpeed Insights API.
 * Works without a key (lower quota); PAGESPEED_API_KEY raises the limit.
 * Returns null on any failure so assessment degrades gracefully.
 */
export async function fetchLighthouse(
  url: string
): Promise<LighthouseScores | null> {
  const key = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({ url, strategy: "mobile" });
  for (const cat of ["performance", "seo", "accessibility", "best-practices"]) {
    params.append("category", cat);
  }
  if (key) params.set("key", key);

  try {
    const res = await fetchWithTimeout(`${ENDPOINT}?${params.toString()}`, {
      timeoutMs: 30000,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const cats = data?.lighthouseResult?.categories;
    if (!cats) return null;
    return {
      performance: toPct(cats.performance?.score),
      seo: toPct(cats.seo?.score),
      accessibility: toPct(cats.accessibility?.score),
      bestPractices: toPct(cats["best-practices"]?.score),
    };
  } catch {
    return null;
  }
}

function toPct(score: unknown): number | undefined {
  return typeof score === "number" ? Math.round(score * 100) : undefined;
}
