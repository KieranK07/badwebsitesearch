export type SourceName = "google" | "osm";

export interface Business {
  /** Stable id for the UI (derived from website domain or name+coords). */
  id: string;
  name: string;
  website?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  rating?: number;
  sources: SourceName[];
}

export interface LighthouseScores {
  performance?: number;
  seo?: number;
  accessibility?: number;
  bestPractices?: number;
}

export interface Assessment {
  hasWebsite: boolean;
  /**
   * True when "no website" rests on OSM data alone (no Google key to confirm).
   * Scored below a confirmed no-website result.
   */
  unverified?: boolean;
  reachable?: boolean;
  finalUrl?: string;
  httpStatus?: number;
  https?: boolean;
  mobileFriendly?: boolean;
  onlySocial?: boolean;
  outdated?: boolean;
  datedTech?: boolean;
  weakSeo?: boolean;
  parked?: boolean;
  /** True when we were blocked (e.g. 403) and couldn't judge the site. */
  inconclusive?: boolean;
  lighthouse?: LighthouseScores;
  /** Human-readable findings shown as badges in the UI. */
  reasons: string[];
}

export interface Lead extends Business {
  assessment: Assessment;
  /** 0–100, higher = better prospect (worse website). */
  score: number;
}

export interface SearchParams {
  address: string;
  radius: number; // meters
  categories?: string[];
  lighthouse?: boolean;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Result from a discovery source, with an optional human-readable error. */
export interface SourceResult {
  businesses: Business[];
  error?: string;
}

/** Newline-delimited JSON events streamed from /api/search. */
export type StreamEvent =
  | { type: "status"; message: string }
  /** Persistent notice, e.g. a failed source or a missing API key. */
  | { type: "warning"; message: string }
  | { type: "geocode"; point: GeoPoint }
  | { type: "discovered"; count: number }
  | { type: "lead"; lead: Lead }
  /** `sourceFailed` is set when an empty result is due to a source error. */
  | { type: "done"; total: number; sourceFailed?: boolean }
  | { type: "error"; message: string };
