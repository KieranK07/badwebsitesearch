import { Business, GeoPoint, SourceResult } from "../types";
import { fetchWithTimeout, normalizeWebsite, sleep } from "../http";

// Public Overpass endpoint. The main instance can rate-limit (429) or time out
// (504) under load, so a failed request is retried once. The kumi.systems and
// private.coffee mirrors used to be listed here too, but both hang without
// answering, which added 30 s each to every failed search.
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

// Client-side timeout per attempt. Matches the server-side [timeout:20] in the
// query plus a little slack for transfer.
const REQUEST_TIMEOUT_MS = 22000;

// OSM top-level keys that denote a business/POI worth prospecting.
const BUSINESS_KEYS = ["shop", "office", "craft", "tourism"];

// amenity values that are real businesses (excludes benches, parking, etc.).
const BUSINESS_AMENITIES = [
  "restaurant",
  "cafe",
  "bar",
  "pub",
  "fast_food",
  "pharmacy",
  "bank",
  "dentist",
  "doctors",
  "clinic",
  "veterinary",
  "fuel",
  "car_rental",
  "car_wash",
  "driving_school",
  "marketplace",
];

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Query Overpass for named businesses within `radius` meters of `center`.
 * Free, no API key. Retries once; reports an error if both attempts fail.
 */
export async function searchOsm(
  center: GeoPoint,
  radius: number
): Promise<SourceResult> {
  const query = buildQuery(center, radius);
  let lastStatus = "";

  for (let i = 0; i < ENDPOINTS.length; i++) {
    const endpoint = ENDPOINTS[i];
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        timeoutMs: REQUEST_TIMEOUT_MS,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) {
        lastStatus = `HTTP ${res.status}`;
        console.warn(`Overpass error (${endpoint}):`, res.status);
        if (i < ENDPOINTS.length - 1) await sleep(1000);
        continue;
      }
      const data = await res.json();
      const elements: OverpassElement[] = data?.elements ?? [];
      const out: Business[] = [];
      for (const el of elements) {
        const b = toBusiness(el);
        if (b) out.push(b);
      }
      return { businesses: out };
    } catch (err) {
      lastStatus =
        err instanceof Error && err.name === "AbortError"
          ? `timed out after ${REQUEST_TIMEOUT_MS / 1000} s`
          : err instanceof Error
            ? err.message
            : "request failed";
      console.warn(`Overpass request failed (${endpoint}):`, err);
      if (i < ENDPOINTS.length - 1) await sleep(1000);
    }
  }

  return {
    businesses: [],
    error: `OpenStreetMap (Overpass) unavailable: ${lastStatus}`,
  };
}

function buildQuery(center: GeoPoint, radius: number): string {
  const around = `(around:${radius},${center.lat},${center.lng})`;
  const blocks = [
    ...BUSINESS_KEYS.map((k) => `nwr["name"]["${k}"]${around};`),
    `nwr["name"]["amenity"~"^(${BUSINESS_AMENITIES.join("|")})$"]${around};`,
  ].join("\n  ");
  return `[out:json][timeout:20];\n(\n  ${blocks}\n);\nout tags center;`;
}

function toBusiness(el: OverpassElement): Business | null {
  const tags = el.tags || {};
  const name = tags["name"]?.trim();
  if (!name) return null;

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;

  return {
    id: "",
    name,
    website: normalizeWebsite(tags["website"] || tags["contact:website"]),
    phone: tags["phone"] || tags["contact:phone"] || undefined,
    address: buildAddress(tags),
    lat,
    lng,
    category: deriveCategory(tags),
    sources: ["osm"],
  };
}

function buildAddress(tags: Record<string, string>): string | undefined {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function deriveCategory(tags: Record<string, string>): string | undefined {
  for (const k of BUSINESS_KEYS) {
    if (tags[k]) return prettify(`${k}: ${tags[k]}`);
  }
  if (tags["amenity"]) return prettify(tags["amenity"]);
  return undefined;
}

function prettify(s: string): string {
  return s.replace(/_/g, " ");
}
