"use client";

import { useMemo, useState } from "react";
import { Lead } from "@/lib/types";
import { LeadRow } from "./LeadRow";

type SortKey = "score" | "name";

export function ResultsTable({ leads }: { leads: Lead[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...leads];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else cmp = a.score - b.score;
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [leads, sortKey, asc]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(key === "name");
    }
  };

  return (
    <table>
      <thead>
        <tr>
          <th onClick={() => toggle("score")}>Score{indicator("score")}</th>
          <th onClick={() => toggle("name")}>Business{indicator("name")}</th>
          <th>Address</th>
          <th>Phone</th>
          <th>Website</th>
          <th>Red flags</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((lead) => (
          <LeadRow key={lead.id} lead={lead} />
        ))}
      </tbody>
    </table>
  );

  function indicator(key: SortKey) {
    if (key !== sortKey) return "";
    return asc ? " ▲" : " ▼";
  }
}
