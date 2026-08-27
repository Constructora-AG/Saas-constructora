"use client";
import { useEffect, useState } from "react";

export type Range = { from: Date | null; to: Date | null };
export type Preset = "hoy" | "mes" | "anio" | "todo" | "custom";

const PRESETS: [Preset, string][] = [
  ["hoy", "Hoy"],
  ["mes", "Este mes"],
  ["anio", "Este año"],
  ["todo", "Todo"],
];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export function rangeFor(preset: Preset, from?: string, to?: string): Range {
  const now = new Date();
  switch (preset) {
    case "hoy": return { from: startOfDay(now), to: endOfDay(now) };
    // Mes/año COMPLETOS (no solo hasta hoy): "debe recaudar este mes" = todo el mes.
    case "mes": return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    case "anio": return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(new Date(now.getFullYear(), 11, 31)) };
    case "todo": return { from: null, to: null };
    case "custom": return {
      from: from ? startOfDay(new Date(from + "T00:00:00")) : null,
      to: to ? endOfDay(new Date(to + "T00:00:00")) : null,
    };
  }
}

export function inRange(iso: string | null, r: Range): boolean {
  if (!iso) return r.from === null && r.to === null ? true : false;
  const t = new Date(iso).getTime();
  if (r.from && t < r.from.getTime()) return false;
  if (r.to && t > r.to.getTime()) return false;
  return true;
}

export function DateRange({ defaultPreset = "anio", onChange }: { defaultPreset?: Preset; onChange: (r: Range, preset: Preset) => void }) {
  const [preset, setPreset] = useState<Preset>(defaultPreset);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    onChange(rangeFor(preset, from, to), preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, from, to]);

  return (
    <div className="daterange">
      <div className="segmented">
        {PRESETS.map(([p, label]) => (
          <button key={p} className={`seg${preset === p ? " active" : ""}`} onClick={() => setPreset(p)}>{label}</button>
        ))}
      </div>
      <div className={`daterange-custom${preset === "custom" ? " active" : ""}`}>
        <input type="date" className="input" value={from} max={to || undefined}
          onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} />
        <span className="daterange-sep">→</span>
        <input type="date" className="input" value={to} min={from || undefined}
          onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} />
      </div>
    </div>
  );
}
