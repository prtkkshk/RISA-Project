"use client";
import { useData } from "./DataProvider";
import { fmtINR, Badge } from "./ui";

/** Rule-based diagnosis. Each alert has a one-click hand-off to the copilot (insight -> action). */
export function computeAlerts(d: any) {
  const out: { sev: "critical" | "warning" | "good"; title: string; detail: string; ask: string }[] = [];
  const k = d.kpis, t = d.target, f = d.forecast;
  if (t) {
    const gap = t.confirmed_partnerships_goal - k.confirmed_partnerships;
    if (gap > 0) out.push({ sev: f.projected_confirmed_partnerships < t.confirmed_partnerships_goal ? "critical" : "warning", title: `${gap} partnerships short of the ${t.version} goal`, detail: `${k.confirmed_partnerships} confirmed vs ${t.confirmed_partnerships_goal}. Forecast: ${f.projected_confirmed_partnerships}.`, ask: "We are short of the confirmed-partnership goal. Diagnose why and recommend the fastest way to close the gap." });
    else out.push({ sev: "good", title: "Confirmed-partnership goal met", detail: `${k.confirmed_partnerships} vs ${t.confirmed_partnerships_goal}`, ask: "We met the partnership goal. What's the next constraint on cash collected?" });
  }
  const cold = d.channel_groups?.[1];
  if (cold && cold.opportunities > 0 && cold.confirmed === 0) out.push({ sev: "critical", title: "Cold channels: 0 wins", detail: `${cold.touches} touches, ${cold.opportunities} opportunities, 0 confirmed. ${fmtINR(cold.open_pipeline_inr)} still open.`, ask: "Cold channels have zero wins. Should we stop them? Compare warm vs cold with evidence and recommend what to do with their open pipeline." });
  if (k.stale_open_opportunities > 0) out.push({ sev: "warning", title: `${k.stale_open_opportunities} stale open deals`, detail: `No stage change in ${d.assumptions.stale_days}+ days. Open pipeline ${fmtINR(k.open_pipeline_inr)}.`, ask: "List the stale deals and recommend which to re-route through a warm intro and which to close." });
  if (k.qualified_without_opportunity > 0) out.push({ sev: "warning", title: `${k.qualified_without_opportunity} qualified brands with no deal`, detail: "Qualified demand nobody is working.", ask: "Which qualified brands have no opportunity? Propose tasks to open deals for the best ones." });
  const unpaid = d.opportunities.filter((o: any) => o.stage === "partner_confirmed" && o.outstanding_inr > 0);
  if (unpaid.length) out.push({ sev: "warning", title: `${fmtINR(k.confirmed_cash_value_inr - k.collected_inr_simulated)} confirmed but not collected`, detail: `${unpaid.length} confirmed cash deals have an outstanding balance (simulated ledger).`, ask: "Which confirmed deals haven't paid in full? Prioritise collection follow-ups." });
  if (k.reneged_after_confirmation) out.push({ sev: "warning", title: `${k.reneged_after_confirmation} deal withdrew after confirmation`, detail: "Confirmed is not final until cash lands.", ask: "Which deal withdrew after confirmation and what does it imply for our forecast?" });
  for (const i of d.initiatives.filter((x: any) => x.decision === "stop")) out.push({ sev: "critical", title: `Stop signal: ${i.name}`, detail: `${i.kpi_name}: ${i.latest_reading?.value} vs stop threshold ${i.stop_threshold}.`, ask: `The initiative "${i.name}" hit its stop threshold. What should we do and what should the team work on instead?` });
  const overdue = d.tasks.filter((x: any) => x.overdue);
  if (overdue.length) out.push({ sev: "warning", title: `${overdue.length} overdue tasks`, detail: overdue.slice(0, 2).map((x: any) => x.title).join("; "), ask: "Which tasks are overdue and which matter most for cash?" });
  return out;
}

export default function Alerts() {
  const { data, ask } = useData();
  const a = computeAlerts(data);
  const icon = { critical: "✕", warning: "!", good: "✓" } as const;
  const color = { critical: "var(--critical)", warning: "var(--serious)", good: "var(--good)" } as const;
  return (
    <div className="space-y-2">
      {a.map((x, i) => (
        <div key={i} className="flex gap-3 items-start border rounded-lg p-3">
          <span className="font-bold w-4 text-center" style={{ color: color[x.sev] }}>{icon[x.sev]}</span>
          <div className="flex-1">
            <div className="text-sm font-medium flex items-center gap-2">{x.title}<Badge kind={x.sev === "critical" ? "bad" : x.sev === "good" ? "good" : "warn"}>{x.sev}</Badge></div>
            <div className="text-xs text-[var(--ink-2)]">{x.detail}</div>
          </div>
          <button className="btn !py-1 text-xs" onClick={() => ask(x.ask)}>Ask analyst</button>
        </div>
      ))}
    </div>
  );
}
