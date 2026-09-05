import { Lead } from "@/lib/types";
import { ScoreBadge } from "./ScoreBadge";

export function LeadRow({ lead }: { lead: Lead }) {
  return (
    <tr>
      <td>
        <ScoreBadge score={lead.score} />
      </td>
      <td>
        <strong>{lead.name}</strong>
        {lead.category && <div className="muted">{lead.category}</div>}
      </td>
      <td>{lead.address || <span className="muted">—</span>}</td>
      <td>{lead.phone || <span className="muted">—</span>}</td>
      <td>
        {lead.website ? (
          <a href={lead.website} target="_blank" rel="noreferrer">
            {displayUrl(lead.website)}
          </a>
        ) : (
          <span className="muted">none</span>
        )}
      </td>
      <td>
        <div className="badges">
          {lead.assessment.reasons.map((r) => (
            <span className="badge" key={r}>
              {r}
            </span>
          ))}
          {lead.assessment.lighthouse?.performance != null && (
            <span className="badge">
              Perf {lead.assessment.lighthouse.performance}
            </span>
          )}
        </div>
      </td>
      <td>
        <span className="source-tag">
          {lead.sources.length > 1 ? "both" : lead.sources[0]}
        </span>
      </td>
    </tr>
  );
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
