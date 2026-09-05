import { Lead } from "./types";

const HEADERS = [
  "score",
  "name",
  "category",
  "address",
  "phone",
  "website",
  "sources",
  "reasons",
  "lighthouse_performance",
];

function escape(value: string): string {
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/** Serialize ranked leads to CSV text matching the on-screen columns. */
export function leadsToCsv(leads: Lead[]): string {
  const rows = leads.map((l) =>
    [
      String(l.score),
      l.name,
      l.category ?? "",
      l.address ?? "",
      l.phone ?? "",
      l.website ?? "",
      l.sources.join("+"),
      l.assessment.reasons.join("; "),
      l.assessment.lighthouse?.performance != null
        ? String(l.assessment.lighthouse.performance)
        : "",
    ]
      .map(escape)
      .join(",")
  );
  return [HEADERS.join(","), ...rows].join("\n");
}
