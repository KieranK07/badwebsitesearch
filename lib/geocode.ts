import { GeoPoint } from "./types";
import { fetchWithTimeout } from "./http";

/**
 * Resolve an address string to a lat/lng.
 * Uses Google Geocoding when GOOGLE_MAPS_API_KEY is set, otherwise falls back to
 * the free OSM Nominatim geocoder so the app works with zero config.
 */
export async function geocode(address: string): Promise<GeoPoint> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    const point = await geocodeGoogle(address, key);
    if (point) return point;
  }
  const point = await geocodeNominatim(address);
  if (!point) {
    throw new Error(`Could not geocode address: "${address}"`);
  }
  return point;
}

async function geocodeGoogle(
  address: string,
  key: string
): Promise<GeoPoint | null> {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(address) +
    "&key=" +
    key;
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch {
    // fall through to Nominatim
  }
  return null;
}

async function geocodeNominatim(address: string): Promise<GeoPoint | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(address);
  try {
    const res = await fetchWithTimeout(url, { timeoutMs: 8000 });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (hit && hit.lat && hit.lon) {
      return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
    }
  } catch {
    // ignore
  }
  return null;
}
