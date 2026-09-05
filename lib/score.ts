import { Assessment } from "./types";

/**
 * Compute a 0–100 opportunity score: higher = better prospect (worse web presence).
 * Each red flag adds weighted points; Lighthouse (when present) nudges the score.
 */
export function scoreAssessment(a: Assessment): number {
  // No website found in either source — strongest signal.
  if (!a.hasWebsite) return 100;

  let score = 0;

  if (a.parked || a.reachable === false) score += 60; // dead/parked
  if (a.onlySocial) score += 55;
  if (a.https === false) score += 15;
  if (a.mobileFriendly === false) score += 25;
  if (a.outdated) score += 20;
  if (a.datedTech) score += 18;
  if (a.weakSeo) score += 10;

  // Lighthouse: low scores add opportunity points (scaled, capped).
  const lh = a.lighthouse;
  if (lh) {
    if (typeof lh.performance === "number") {
      score += Math.round(((100 - lh.performance) / 100) * 15);
    }
    if (typeof lh.seo === "number") {
      score += Math.round(((100 - lh.seo) / 100) * 8);
    }
    if (typeof lh.accessibility === "number") {
      score += Math.round(((100 - lh.accessibility) / 100) * 7);
    }
  }

  return Math.max(0, Math.min(100, score));
}
