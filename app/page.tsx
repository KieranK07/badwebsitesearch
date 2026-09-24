"use client";

import { useCallback, useRef, useState } from "react";
import { Lead, StreamEvent } from "@/lib/types";
import { SearchForm, SearchFormValues } from "@/components/SearchForm";
import { ResultsTable } from "@/components/ResultsTable";
import { leadsToCsv } from "@/lib/csv";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [discovered, setDiscovered] = useState<number | null>(null);
  const leadsRef = useRef<Lead[]>([]);

  const runSearch = useCallback(async (values: SearchFormValues) => {
    setBusy(true);
    setLeads([]);
    leadsRef.current = [];
    setDiscovered(null);
    setWarnings([]);
    setStatus("Starting…");

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok || !res.body) {
        setStatus(`Request failed (${res.status})`);
        setBusy(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Read the NDJSON stream line by line, applying each event as it arrives.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line) handleEvent(JSON.parse(line) as StreamEvent);
        }
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }

    function handleEvent(e: StreamEvent) {
      switch (e.type) {
        case "status":
          setStatus(e.message);
          break;
        case "warning":
          setWarnings((w) => [...w, e.message]);
          break;
        case "discovered":
          setDiscovered(e.count);
          break;
        case "lead":
          leadsRef.current = [...leadsRef.current, e.lead];
          setLeads(leadsRef.current);
          break;
        case "done":
          // An empty result after a source failure keeps the failure message
          // from the preceding status event.
          if (e.total > 0) setStatus(`Done: ${e.total} prospects assessed.`);
          else if (!e.sourceFailed) setStatus("No businesses found in this area.");
          break;
        case "error":
          setStatus(`Error: ${e.message}`);
          break;
      }
    }
  }, []);

  const exportCsv = () => {
    const sorted = [...leadsRef.current].sort((a, b) => b.score - a.score);
    const blob = new Blob([leadsToCsv(sorted)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <h1>Bad Website Search</h1>
      <p className="subtitle">
        Find nearby businesses whose websites need work, ranked by opportunity.
      </p>

      <SearchForm onSearch={runSearch} busy={busy} />

      {warnings.map((w) => (
        <div className="warning" key={w}>
          {w}
        </div>
      ))}

      <div className="status">
        {status}
        {discovered != null && (
          <> · {discovered} businesses found · {leads.length} assessed</>
        )}
      </div>

      {leads.length > 0 && (
        <>
          <div className="results-header">
            <strong>{leads.length} prospects</strong>
            <button className="ghost" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
          <ResultsTable leads={leads} />
        </>
      )}
    </main>
  );
}
