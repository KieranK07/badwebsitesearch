/** Shared HTTP helpers: a clear User-Agent and timeout-bounded fetch. */

export const USER_AGENT =
  "BadWebsiteSearch/0.1 (local lead-gen tool; +https://github.com/local/badwebsitesearch)";

export interface FetchOptions extends RequestInit {
  timeoutMs?: number;
}

/** fetch() with an AbortController timeout so a hung site can't stall the pipeline. */
export async function fetchWithTimeout(
  url: string,
  opts: FetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 8000, ...init } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Simple sleep used to rate-limit polite APIs like Nominatim. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
