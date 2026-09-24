import * as cheerio from "cheerio";
import { Assessment, Business } from "./types";
import { fetchWithTimeout, normalizeWebsite } from "./http";
import { fetchLighthouse } from "./lighthouse";

const SOCIAL_HOSTS = [
  "facebook.com",
  "m.facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "linktr.ee",
  "linktree.com",
  "tiktok.com",
  "yelp.com",
  "linkedin.com",
];

const PARKED_MARKERS = [
  "domain is for sale",
  "buy this domain",
  "parked free",
  "this domain is parked",
  "godaddy.com/domainsearch",
  "sedoparking",
  "hugedomains",
  "under construction",
  "site coming soon",
  "website coming soon",
];

const DATED_TECH_MARKERS = [
  "<embed",
  "shockwave-flash",
  "frontpage",
  'generator" content="microsoft frontpage',
  "jquery-1.",
  "jquery/1.",
  "_vti_bin", // FrontPage
];

const CURRENT_YEAR = new Date().getFullYear();

// Statuses that mean "we were blocked", not "the site is dead".
const BLOCKED_STATUSES = new Set([401, 403, 405, 429]);

// Look enough like a real browser to get past common anti-bot front-ends.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Assess a single business's web presence and produce findings + the building
 * blocks for its opportunity score.
 */
export async function assess(
  biz: Business,
  runLighthouse: boolean
): Promise<Assessment> {
  const website = normalizeWebsite(biz.website);
  if (!website) {
    // Without a Google key the only evidence is a missing OSM website tag,
    // which is common even for businesses that do have a site.
    const verified =
      biz.sources.includes("google") || !!process.env.GOOGLE_MAPS_API_KEY;
    return verified
      ? { hasWebsite: false, reasons: ["No website in our data"] }
      : {
          hasWebsite: false,
          unverified: true,
          reasons: ["No website tag in OSM (unverified)"],
        };
  }

  const a: Assessment = { hasWebsite: true, reasons: [] };

  // Only-social check works even before we fetch.
  const host = safeHost(website);
  if (host && SOCIAL_HOSTS.some((s) => host === s || host.endsWith("." + s))) {
    a.onlySocial = true;
    a.reasons.push("Only a social page");
  }

  try {
    const res = await fetchWithTimeout(website, {
      timeoutMs: 9000,
      redirect: "follow",
      // Browser-like headers so anti-bot front-ends (Cloudflare/Akamai) don't
      // reject us with a 403 that would look like a dead site.
      headers: BROWSER_HEADERS,
    });
    a.httpStatus = res.status;
    a.finalUrl = res.url;
    a.reachable = res.ok;
    a.https = res.url.startsWith("https://");

    if (BLOCKED_STATUSES.has(res.status)) {
      // Anti-bot / auth wall — we can't judge the site. Don't score it as dead.
      a.reachable = undefined;
      a.inconclusive = true;
      a.reasons.push("Couldn't verify (blocked)");
      return await finalizeLighthouse(a, biz, runLighthouse);
    }

    if (!res.ok) {
      a.reachable = false;
      a.reasons.push(`Dead site (HTTP ${res.status})`);
      return await finalizeLighthouse(a, biz, runLighthouse);
    }

    if (!a.https) a.reasons.push("No HTTPS");

    const html = await res.text();
    analyzeHtml(html, a);
  } catch (err) {
    // Unreachable is not the same as parked: DNS failures, timeouts and TLS
    // errors say nothing about the page content.
    a.reachable = false;
    a.reasons.push("Dead or unreachable site");
    return await finalizeLighthouse(a, biz, runLighthouse);
  }

  return await finalizeLighthouse(a, biz, runLighthouse);
}

function analyzeHtml(html: string, a: Assessment): void {
  const lower = html.toLowerCase();

  if (PARKED_MARKERS.some((m) => lower.includes(m))) {
    a.parked = true;
    a.reasons.push("Parked / placeholder page");
  }

  const $ = cheerio.load(html);

  // Mobile-friendliness: presence of a viewport meta tag.
  const hasViewport = $('meta[name="viewport"]').length > 0;
  a.mobileFriendly = hasViewport;
  if (!hasViewport) a.reasons.push("Not mobile-friendly");

  // Weak SEO basics: missing title or meta description.
  const title = $("title").first().text().trim();
  const desc = $('meta[name="description"]').attr("content")?.trim();
  if (!title || !desc) {
    a.weakSeo = true;
    a.reasons.push("Weak SEO basics");
  }

  // Dated tech signatures.
  if (DATED_TECH_MARKERS.some((m) => lower.includes(m))) {
    a.datedTech = true;
    a.reasons.push("Dated tech / template");
  }

  // Table-based layout heuristic: many <table> with no CSS grid/flex hints.
  const tableCount = $("table").length;
  if (tableCount >= 5 && !lower.includes("display:flex") && !lower.includes("display: flex")) {
    a.datedTech = true;
    if (!a.reasons.includes("Dated tech / template")) {
      a.reasons.push("Dated tech / template");
    }
  }

  // Outdated copyright year.
  const year = extractCopyrightYear(html);
  if (year && year < CURRENT_YEAR - 2) {
    a.outdated = true;
    a.reasons.push(`Looks outdated (© ${year})`);
  }
}

function extractCopyrightYear(html: string): number | null {
  // Look for © or "copyright" followed by a 4-digit year (optionally a range).
  const re = /(?:©|&copy;|copyright)\s*(?:\d{4}\s*[–-]\s*)?(\d{4})/gi;
  let match: RegExpExecArray | null;
  let latest: number | null = null;
  while ((match = re.exec(html)) !== null) {
    const y = parseInt(match[1], 10);
    if (y >= 1995 && y <= CURRENT_YEAR + 1) {
      if (latest === null || y > latest) latest = y;
    }
  }
  return latest;
}

async function finalizeLighthouse(
  a: Assessment,
  biz: Business,
  runLighthouse: boolean
): Promise<Assessment> {
  const website = normalizeWebsite(biz.website);
  if (runLighthouse && website && a.reachable) {
    const scores = await fetchLighthouse(website);
    if (scores) {
      a.lighthouse = scores;
      if (typeof scores.performance === "number" && scores.performance < 50) {
        a.reasons.push(`Slow (perf ${scores.performance})`);
      }
    }
  }
  return a;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
