import { Business, SourceName } from "./types";

/**
 * Normalize a website URL to a comparison key: lowercase host without protocol,
 * leading "www.", path, query, or trailing slash. Returns null if unusable.
 */
export function normalizeDomain(url: string | undefined): string | null {
  if (!url) return null;
  let s = url.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split(/[/?#]/)[0]; // drop path/query/hash
  s = s.replace(/\/+$/, "");
  return s || null;
}

/** Distance in meters between two coordinates (haversine). */
function haversine(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Generic business-type suffixes that can safely be ignored when comparing names.
const NOISE_WORDS = new Set([
  "the","a","an","and","of","in","at","by","for","on","with",
  "co","company","corp","corporation","inc","llc","ltd","group",
  "bank","cafe","coffee","restaurant","bar","pub","grill","kitchen",
  "shop","store","market","pharmacy","clinic","salon","spa","studio",
  "hotel","motel","inn","suites","lodge","place","center","centre",
]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Words in a normalized name, excluding common noise suffixes. */
function nameWords(name: string): Set<string> {
  return new Set(normalizeName(name).split(/\s+/).filter((w) => !NOISE_WORDS.has(w)));
}

/**
 * True when two names are close enough to be the same business.
 * "Chase" matches "Chase Bank"; "Starbucks Coffee" matches "Starbucks".
 * Requires the shorter name's significant words to be a subset of the longer's,
 * or at least 60% word-overlap (Jaccard) for longer names.
 */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;

  const wa = nameWords(a);
  const wb = nameWords(b);
  if (wa.size === 0 || wb.size === 0) return na === nb;

  // Subset check: shorter set of significant words is fully contained in the longer.
  const [smaller, larger] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if ([...smaller].every((w) => larger.has(w))) return true;

  // Jaccard similarity >= 0.6 for cases with multiple differing words.
  const intersection = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union > 0 && intersection / union >= 0.6;
}

function mergeSources(a: SourceName[], b: SourceName[]): SourceName[] {
  return Array.from(new Set([...a, ...b]));
}

/** Combine two records, preferring whichever has more populated fields. */
function merge(a: Business, b: Business): Business {
  const pick = <T>(x: T | undefined, y: T | undefined): T | undefined =>
    x !== undefined && x !== null && x !== ("" as unknown as T) ? x : y;
  return {
    id: a.id,
    name: a.name.length >= b.name.length ? a.name : b.name,
    website: pick(a.website, b.website),
    phone: pick(a.phone, b.phone),
    address: pick(a.address, b.address),
    lat: pick(a.lat, b.lat),
    lng: pick(a.lng, b.lng),
    category: pick(a.category, b.category),
    rating: pick(a.rating, b.rating),
    sources: mergeSources(a.sources, b.sources),
  };
}

/**
 * Merge businesses from all sources, deduplicating:
 *   1. Primary: by normalized website domain (the "no duplicate websites" rule).
 *   2. Fallback (no website): by normalized name within 150m proximity.
 */
export function dedupe(all: Business[]): Business[] {
  const byDomain = new Map<string, Business>();
  const noSite: Business[] = [];

  for (const biz of all) {
    const domain = normalizeDomain(biz.website);
    if (domain) {
      const existing = byDomain.get(domain);
      byDomain.set(domain, existing ? merge(existing, biz) : biz);
    } else {
      noSite.push(biz);
    }
  }

  // Cross-enrich: for each no-website business, check if a websited business
  // (already in byDomain) is nearby with a matching name. If so, adopt its
  // website rather than treating this as a separate no-website entry.
  // This is how "Chase" (OSM, no website) absorbs the website from "Chase Bank"
  // (Google, has website) even though neither started with a domain key.
  const stillNoSite: Business[] = [];
  for (const biz of noSite) {
    const websitedMatch = [...byDomain.values()].find((w) => {
      if (!namesMatch(w.name, biz.name)) return false;
      if (w.lat == null || w.lng == null || biz.lat == null || biz.lng == null) {
        return true;
      }
      return haversine(w.lat, w.lng, biz.lat, biz.lng) <= 150;
    });
    if (websitedMatch) {
      const domain = normalizeDomain(websitedMatch.website)!;
      byDomain.set(domain, merge(websitedMatch, biz));
    } else {
      stillNoSite.push(biz);
    }
  }

  // Dedupe the remaining website-less businesses by fuzzy name + proximity.
  const merged: Business[] = [];
  for (const biz of stillNoSite) {
    const match = merged.find((m) => {
      if (!namesMatch(m.name, biz.name)) return false;
      if (
        m.lat == null ||
        m.lng == null ||
        biz.lat == null ||
        biz.lng == null
      ) {
        return true; // same name, missing coords -> treat as same
      }
      return haversine(m.lat, m.lng, biz.lat, biz.lng) <= 150;
    });
    if (match) {
      const idx = merged.indexOf(match);
      merged[idx] = merge(match, biz);
    } else {
      merged.push(biz);
    }
  }

  const result = [...byDomain.values(), ...merged];
  // Assign stable ids.
  for (const b of result) {
    b.id = normalizeDomain(b.website) || `name:${normalizeName(b.name)}:${b.lat ?? ""},${b.lng ?? ""}`;
  }
  return result;
}
