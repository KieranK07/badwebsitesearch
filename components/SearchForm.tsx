"use client";

import { useState } from "react";

export interface SearchFormValues {
  address: string;
  radius: number;
  lighthouse: boolean;
}

export function SearchForm({
  onSearch,
  busy,
}: {
  onSearch: (values: SearchFormValues) => void;
  busy: boolean;
}) {
  const [address, setAddress] = useState("");
  const [radius, setRadius] = useState(1500);
  const [lighthouse, setLighthouse] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim() || busy) return;
    onSearch({ address: address.trim(), radius, lighthouse });
  };

  return (
    <form className="panel" onSubmit={submit}>
      <div className="form-row">
        <div className="field grow">
          <label htmlFor="address">Address or place</label>
          <input
            id="address"
            type="text"
            placeholder="123 Main St, Springfield, IL"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="radius">Radius: {formatRadius(radius)}</label>
          <input
            id="radius"
            type="range"
            min={250}
            max={10000}
            step={250}
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value, 10))}
          />
        </div>
        <div className="field checkbox">
          <input
            id="lh"
            type="checkbox"
            checked={lighthouse}
            onChange={(e) => setLighthouse(e.target.checked)}
          />
          <label htmlFor="lh">Run Lighthouse (slower)</label>
        </div>
        <button className="primary" type="submit" disabled={busy || !address.trim()}>
          {busy ? "Searching…" : "Find leads"}
        </button>
      </div>
    </form>
  );
}

function formatRadius(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`;
}
