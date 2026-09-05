# badwebsitesearch

Type an address and a radius, get back the businesses near it ranked by how bad
their website is. Built to find web-design leads without buying a list.

## Why it exists

Cold outreach for web design work is mostly a data problem. You do not want
"every restaurant in a postcode", you want the handful whose site is a parked
domain, or a Facebook page, or something last touched in 2011 — because those
are the only conversations worth having. Doing that by hand means opening
several hundred tabs.

So this does the tab-opening. It pulls every business in a radius from two
directories, fetches each site once, and applies the same checks you would apply
by eye, then sorts by them.

## How it works

```
address ─► geocode ─┬─► Google Places (New)  ─┐
                    └─► OSM / Overpass       ─┴─► dedupe ─► assess ─► score ─► NDJSON ─► table / CSV
```

**Geocode.** Google Geocoding when a key is set, otherwise OSM Nominatim.

**Discover, from two sources in parallel.** Google Places (New) Nearby Search
gives reliable real website URLs but caps at 20 results per query. Overpass
gives unlimited coverage for free but its website tags are patchy. Running both
and merging covers each one's gap. Overpass has three public mirrors tried in
order, because the main instance rate-limits and times out under load. A source
that fails emits a warning into the stream rather than silently returning
nothing — an empty page should never be mistakable for "no businesses here".

**Dedupe.** Primary key is the normalized website domain (protocol, `www.`,
path and query stripped). Businesses with no website fall back to fuzzy name
matching within 150 m: significant words of the shorter name must be a subset of
the longer, or Jaccard overlap ≥ 0.6, after dropping generic words like "inc",
"cafe", "group". There is also a cross-enrich pass — an OSM record for "Chase"
with no website adopts the URL from the Google record for "Chase Bank" 40 m
away, instead of being reported as a business with no site at all. Getting that
wrong is the most expensive error here, because "no website" is the single
highest-scoring signal.

**Assess.** One fetch per site, 9 s timeout, browser-like headers. Then:

- parked-domain markers, only-a-social-page, unreachable
- no HTTPS, no `viewport` meta, missing `<title>` or meta description
- copyright year well behind the current one
- dated tech signatures (FrontPage, old jQuery, table-based layout with no
  flex/grid hints)
- optionally, real Lighthouse numbers from the free PageSpeed Insights API

The one that took a second pass: 401/403/405/429 are treated as **inconclusive**,
not as a dead site. Cloudflare and Akamai front-ends return 403 to anything that
does not look like a browser, and scoring those as dead put the best-defended
sites at the top of the list, which is exactly backwards.

**Score.** Weighted flags into 0–100, higher meaning better prospect. No website
at all short-circuits to 100. Lighthouse, when enabled, contributes a scaled
nudge rather than dominating.

**Stream.** `POST /api/search` returns newline-delimited JSON, one event per
lead, at a concurrency of 12. The table fills in as results land instead of
sitting empty for a minute; the export button turns whatever has arrived into
CSV.

## Run it

```bash
npm install
cp .env.example .env.local     # optional — both keys are optional
npm run dev
# http://localhost:3000
```

It works with zero configuration on OpenStreetMap alone. Add
`GOOGLE_MAPS_API_KEY` for the Places source and better website coverage.

| Variable | Required | Purpose |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | No | Google Places (New) as a second source, and Google geocoding. Needs Places API (New) + Geocoding API enabled on the key. |
| `PAGESPEED_API_KEY` | No | Raises the PageSpeed/Lighthouse quota. The toggle works without it, more slowly. |

The Google source sends a strict field mask to stay inside the cheapest
applicable Places SKU, and caching is short-lived on purpose to stay within
Google's terms.

## Status

Works end to end; I have run it against real areas and got usable lists out of
it. Limitations worth knowing:

- **No tests.** `npm run build` and `tsc --noEmit` pass, and that is the whole
  of the automated checking.
- **The score is a heuristic ranking, not a verdict.** It sorts prospects by how
  likely they are to be worth a conversation. It does not establish that any
  particular site is bad, and every flag is shown as a badge so you can
  disagree with it. Treat a high score as "look at this one", nothing more.
- Google Nearby Search returns at most 20 results per query, so in dense areas
  most of the volume comes from Overpass.
- Assessment reads the server-rendered HTML only. A site that renders entirely
  in JavaScript will look emptier than it is, and can score too high.
- Single-user local tool. There is no auth, no persistence, and no rate limiting
  beyond the timeouts and the concurrency cap.
- Be sensible about what you do with the output. Every row is a real small
  business, and the polite version of this is a useful offer, not a public
  list of who has the worst website in town.

## License

MIT. See [LICENSE](LICENSE).
