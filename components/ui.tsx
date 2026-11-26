"use client";
import React from "react";

export function fmtINR(n: number | null | undefined, compact = true): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "–";
  const v = Number(n);
  if (compact) {
    if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
    if (Math.abs(v) >= 1e5) { const t = (v / 1e5).toFixed(2); return `₹${t.includes(".") ? t.replace(/0+$/, "").replace(/\.$/, "") : t}L`; }
    if (Math.abs(v) >= 1e3) return `₹${(v / 1e3).toFixed(0)}K`;
  }
  return "₹" + v.toLocaleString("en-IN");
}
export const pct = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(d)}%`);

export function Card({ title, subtitle, right, children, className = "" }: { title?: React.ReactNode; subtitle?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-[var(--ink-2)] mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, tag }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "warning" | "critical"; tag?: string }) {
  const icon = tone === "good" ? "✓" : tone === "warning" ? "!" : tone === "critical" ? "✕" : null;
  const color = tone ? `var(--${tone === "warning" ? "serious" : tone})` : undefined;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--ink-2)]">{label}{tag && <Badge kind="sim">{tag}</Badge>}</div>
      <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs mt-1 text-[var(--ink-2)] flex items-center gap-1">{icon && <span style={{ color }} className="font-bold">{icon}</span>}{sub}</div>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  sim: "bg-violet-50 text-violet-700 border-violet-200", warm: "bg-blue-50 text-blue-700 border-blue-200", cold: "bg-orange-50 text-orange-700 border-orange-200",
  good: "bg-green-50 text-green-700 border-green-200", warn: "bg-amber-50 text-amber-800 border-amber-200", bad: "bg-red-50 text-red-700 border-red-200", neutral: "bg-gray-50 text-gray-700 border-gray-200",
};
export function Badge({ kind = "neutral", children }: { kind?: keyof typeof BADGE | string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${BADGE[kind] ?? BADGE.neutral}`}>{children}</span>;
}
export function StageBadge({ stage }: { stage: string }) {
  const k = stage === "partner_confirmed" ? "good" : stage === "lost" || stage === "withdrawn" ? "bad" : stage === "negotiating" || stage === "proposal_sent" ? "warm" : "neutral";
  return <Badge kind={k}>{stage.replace("_", " ")}</Badge>;
}
export function DecisionBadge({ d }: { d: string }) {
  const m: Record<string, [string, string]> = { scale: ["good", "▲ scale"], change: ["warn", "◆ change"], stop: ["bad", "■ stop"], rejected: ["neutral", "✕ rejected"], "no data yet": ["neutral", "… no data yet"] };
  const [k, t] = m[d] ?? ["neutral", d];
  return <Badge kind={k}>{t}</Badge>;
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-[var(--ink-2)] py-6 text-center">{children}</div>;
}
