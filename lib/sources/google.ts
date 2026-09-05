import { Business, GeoPoint, SourceResult } from "../types";
import { fetchWithTimeout } from "../http";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

// Strict field mask: only the fields we use, to stay in the cheapest applicable
// SKU and avoid paying for data we discard.
const FIELD_MASK = [
  "places.displayName",
  "places.websiteUri",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.location",
  "places.primaryTypeDisplayName",
  "places.rating",
].join(",");

interface GooglePlace {
  displayName?: { text?: string };
  websiteUri?: string;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
}

const MAX_PAGES = 3; // up to 60 results (20 per page)

/**
 * Query Google Places (New) Nearby Search, paginating up to MAX_PAGES to get
 * more than the default 20 results. Returns [] when no key is configured.
 */
export async function searchGoogle(
  center: GeoPoint,
  radius: number
): Promise<SourceResult> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { businesses: [] }; // not configured — run OSM-only

  const baseBody = {
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude: center.lat, longitude: center.lng },
        radius: Math.min(radius, 50000),
      },
    },
  };

  const allPlaces: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const body: Record<string, unknown> = { ...baseBody };
    if (pageToken) body.pageToken = pageToken;

    try {
      const res = await fetchWithTimeout(ENDPOINT, {
        method: "POST",
        timeoutMs: 12000,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": FIELD_MASK + (page === 0 ? ",nextPageToken" : ""),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await safeText(res);
        console.warn("Google Places error:", res.status, detail);
        if (page === 0) {
          return { businesses: [], error: `Google Places error: HTTP ${res.status}` };
        }
        break; // already have partial results from earlier pages
      }
      const data = await res.json();
      const places: GooglePlace[] = data?.places ?? [];
      allPlaces.push(...places);
      pageToken = data?.nextPageToken;
      if (!pageToken || places.length < 20) break; // no more pages
    } catch (err) {
      console.warn("Google Places request failed:", err);
      if (page === 0) {
        return { businesses: [], error: "Google Places request failed" };
      }
      break;
    }
  }

  const businesses = allPlaces
    .map(toBusiness)
    .filter((b): b is Business => b !== null);
  return { businesses };
}

function toBusiness(p: GooglePlace): Business | null {
  const name = p.displayName?.text?.trim();
  if (!name) return null;
  return {
    id: "", // assigned during dedup
    name,
    website: p.websiteUri || undefined,
    phone: p.nationalPhoneNumber || undefined,
    address: p.formattedAddress || undefined,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    category: p.primaryTypeDisplayName?.text || undefined,
    rating: typeof p.rating === "number" ? p.rating : undefined,
    sources: ["google"],
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
