"use client";
import { useData } from "@/components/DataProvider";
import { Card, Stat, fmtINR, pct, Badge } from "@/components/ui";
import Alerts from "@/components/Alerts";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, LabelList, Cell } from "recharts";

export default function Overview() {
  const { data: d } = useData();
  const k = d.kpis, t = d.target, f = d.forecast;
  const funnel = d.funnel.map((s: any) => ({ ...s, label: s.step }));
  const groups = d.channel_groups.map((g: any) => ({ name: g.group.startsWith("warm") ? "Warm" : "Cold", opportunities: g.opportunities, confirmed: g.confirmed }));
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Confirmed partnerships" value={`${k.confirmed_partnerships} / ${t?.confirmed_partnerships_goal ?? "–"}`} sub={t ? `${t.version} · forecast ${f.projected_confirmed_partnerships}` : "no target"} tone={t && k.confirmed_partnerships >= t.confirmed_partnerships_goal ? "good" : "warning"} />
        <Stat label="Qualified brands" value={`${k.qualified_brands} / ${t?.qualified_brands_goal ?? "–"}`} sub="latest qualification status" tone={t && k.qualified_brands >= t.qualified_brands_goal ? "good" : "warning"} />
        <Stat label="Confirmed value" value={fmtINR(k.confirmed_value_inr)} sub={`${fmtINR(k.confirmed_cash_value_inr)} cash · ${fmtINR(k.confirmed_in_kind_value_inr)} in-kind`} />
        <Stat label="Cash collected" tag="simulated" value={fmtINR(k.collected_inr_simulated)} sub={`${pct(k.collected_share_of_confirmed_cash)} of confirmed cash · source has no receipts`} />
        <Stat label="Projected cash by event" tag="assumption" value={fmtINR(f.projected_cash_inr)} sub={`collection rate ${pct(f.collection_rate_assumption)} · channel win rates`} />
        <Stat label="Open pipeline" value={fmtINR(k.open_pipeline_inr)} sub={`${k.open_opportunities} deals · ${k.stale_open_opportunities} stale`} tone={k.stale_open_opportunities ? "critical" : undefined} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="xl:col-span-3" title="Growth funnel: brands → cash" subtitle="Each step is its own population. Brand steps count brands; deal steps count opportunities. Last two steps use the simulated payments ledger.">
          <div style={{ height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={funnel} layout="vertical" margin={{ left: 10, right: 50 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 12, fill: "#666" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: any, _n: any, p: any) => [`${v} ${p.payload.unit}`, p.payload.population]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                  {funnel.map((s: any, i: number) => <Cell key={i} fill={s.simulated ? "#9887ef" : "#257de0"} />)}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 12, fill: "#191919" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="xl:col-span-2" title="What needs attention" subtitle="Rule-based diagnosis on the current snapshot. Hand any item to the analyst.">
          <Alerts />
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Confirmed partnerships vs goal, weekly" subtitle="Each point is a separate as-of snapshot, so later outcomes never leak backwards. The goal steps up when the revised plan takes effect.">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={d.trend} margin={{ right: 95, left: -10, top: 10 }}>
                <CartesianGrid stroke="#e7e7e7" vertical={false} />
                <XAxis dataKey="week_ending" tick={{ fontSize: 11, fill: "#666" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: "#666" }} allowDecimals={false} />
                <Tooltip />
                <Line type="stepAfter" dataKey="goal_confirmed" name="Goal" stroke="#666" strokeDasharray="4 4" strokeWidth={2} dot={false} label={(p: any) => p.index === d.trend.length - 1 ? <text x={p.x + 6} y={p.y + 4} fontSize={11} fill="#666">Goal {p.value}</text> : <g />} />
                <Line type="monotone" dataKey="confirmed" name="Confirmed" stroke="#257de0" strokeWidth={2} dot={{ r: 4 }} label={(p: any) => p.index === d.trend.length - 1 ? <text x={p.x + 6} y={p.y + 14} fontSize={11} fill="#191919">Confirmed {p.value}</text> : <g />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Warm vs cold channels" subtitle="Warm = introductions + inbound form. Cold = email, LinkedIn, revival." right={<div className="flex gap-1"><Badge kind="warm">warm</Badge><Badge kind="cold">cold</Badge></div>}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={groups} margin={{ top: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#666" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="opportunities" name="Opportunities" fill="#b6d5f8" radius={[4, 4, 0, 0]} barSize={36}><LabelList dataKey="opportunities" position="top" style={{ fontSize: 12 }} /></Bar>
                <Bar dataKey="confirmed" name="Confirmed" radius={[4, 4, 0, 0]} barSize={36}>{groups.map((g: any, i: number) => <Cell key={i} fill={g.name === "Warm" ? "#257de0" : "#f47230"} />)}<LabelList dataKey="confirmed" position="top" style={{ fontSize: 12 }} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="tbl w-full mt-2">
            <thead><tr><th>Group</th><th className="num">Touches</th><th className="num">Opps</th><th className="num">Confirmed</th><th className="num">Win rate</th><th className="num">Value</th></tr></thead>
            <tbody>{d.channel_groups.map((g: any) => <tr key={g.group}><td>{g.group}</td><td className="num">{g.touches}</td><td className="num">{g.opportunities}</td><td className="num">{g.confirmed}</td><td className="num">{pct(g.win_rate_all)}</td><td className="num">{fmtINR(g.confirmed_value_inr)}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
