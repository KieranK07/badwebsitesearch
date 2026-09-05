import { Business } from "./types";
import { fetchWithTimeout } from "./http";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.websiteUri,places.nationalPhoneNumber,places.displayName";

/**
 * For each business with no website, query Google Places Text Search by name +
 * address to find its website. Mutates the business objects in place.
 * Called per-business inside the pipeline's concurrency limiter.
 *
 * Only runs when GOOGLE_MAPS_API_KEY is set; no-ops otherwise.
 */
export async function enrichMissingWebsites(businesses: Business[]): Promise<void> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return;

  for (const biz of businesses) {
    if (biz.website) continue;
    const website = await lookupWebsite(biz, key);
    if (website) biz.website = website;
  }
}

async function lookupWebsite(biz: Business, key: string): Promise<string | null> {
  // Build the most specific query we can from available data.
  const query = buildQuery(biz);
  if (!query) return null;

  try {
    const res = await fetchWithTimeout(ENDPOINT, {
      method: "POST",
      timeoutMs: 4000,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data?.places?.[0];
    if (!place) return null;

    // Sanity check: the returned name should roughly match what we searched for.
    const returnedName: string = place.displayName?.text ?? "";
    if (!namesSimilar(biz.name, returnedName)) return null;

    return place.websiteUri || null;
  } catch {
    return null;
  }
}

function buildQuery(biz: Business): string | null {
  if (!biz.name) return null;
  // Prefer a full address; fall back to just the name (less precise).
  const location = biz.address || "";
  return location ? `${biz.name}, ${location}` : biz.name;
}

/** Loose name similarity check to avoid adopting a wrong business's website. */
function namesSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  // Accept if one is a substring of the other (handles "Chase" vs "Chase Bank").
  if (na.includes(nb) || nb.includes(na)) return true;
  // Word overlap >= 50%.
  const wa = new Set(na.split(" ").filter(Boolean));
  const wb = new Set(nb.split(" ").filter(Boolean));
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 && intersection / union >= 0.5;
}
