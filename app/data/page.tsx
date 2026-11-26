"use client";
import { useEffect, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Card, Badge, fmtINR } from "@/components/ui";

export default function DataPage() {
  const { data: d, act, refresh } = useData();
  const [audit, setAudit] = useState<any[]>([]);
  const [a, setA] = useState({ collection_rate_confirmed: d.assumptions.collection_rate_confirmed, stale_days: d.assumptions.stale_days });
  const [date, setDate] = useState(d.campaign_date);
  const [tv, setTv] = useState({ qualified_brands_goal: d.target?.qualified_brands_goal ?? 55, confirmed_partnerships_goal: d.target?.confirmed_partnerships_goal ?? 28, target_version: "" });
  const loadAudit = () => fetch("/api/audit", { cache: "no-store" }).then((r) => r.json()).then(setAudit);
  useEffect(() => { loadAudit(); }, [d]);
  const sim = d.payments.filter((p: any) => p.is_simulated).length, user = d.payments.length - sim;
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Data quality fixes applied" subtitle="Original rows are stored untouched; the engine removes import retries (same stable ID) at read time.">
          <table className="tbl w-full"><thead><tr><th>Table</th><th className="num">Source rows</th><th className="num">Duplicates removed</th><th className="num">Rows added in app</th></tr></thead>
            <tbody>{d.data_quality.map((q: any) => <tr key={q.table}><td>{q.table}</td><td className="num">{q.source_rows}</td><td className="num">{q.duplicates_removed}</td><td className="num">{q.app_rows}</td></tr>)}</tbody></table>
          <ul className="text-xs text-[var(--ink-2)] mt-3 list-disc pl-4 space-y-1">
            <li>History tables use the latest version at or before the snapshot date (end of day IST). States are never summed.</li>
            <li>Confirmed value ≠ cash. In-kind value is excluded from the cash target.</li>
            <li>Warm channels = introduction + web_inbound; cold = email + LinkedIn (derived from the campaign's channel field).</li>
            <li>Payments ledger: {sim} simulated rows, {user} user-entered rows. The source pack has no bank receipts.</li>
          </ul>
        </Card>
        <Card title="Assumptions and operating clock" subtitle="Assumptions feed the forecast. Changing them updates every view and the copilot's answers.">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><span className="w-56">Collection rate on outstanding confirmed cash</span><input className="input w-24" type="number" step="0.05" min="0" max="1" value={a.collection_rate_confirmed} onChange={(e) => setA({ ...a, collection_rate_confirmed: Number(e.target.value) })} /><Badge kind="sim">assumption</Badge></div>
            <div className="flex items-center gap-2"><span className="w-56">Stale after (days without stage change)</span><input className="input w-24" type="number" value={a.stale_days} onChange={(e) => setA({ ...a, stale_days: Number(e.target.value) })} /></div>
            <button className="btn btn-primary" onClick={() => act("set_assumptions", a)}>Save assumptions</button>
            <div className="border-t pt-3 flex items-center gap-2"><span className="w-56">Operating date ("today")</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /><button className="btn" onClick={() => act("set_campaign_date", { date })}>Set</button></div>
            <p className="text-xs text-[var(--ink-2)]">New records are stamped on the operating date. Source history runs {d.event.history_start} to {d.event.history_end}; event {d.event.starts} to {d.event.ends}.</p>
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Targets" subtitle="Each version takes effect at its timestamp; snapshots use the version in force.">
          <table className="tbl w-full"><thead><tr><th>Version</th><th>Effective</th><th className="num">Qualified goal</th><th className="num">Partnership goal</th><th>Origin</th></tr></thead>
            <tbody>{d.target_history.map((t: any, i: number) => <tr key={i}><td>{t.version}</td><td>{t.effective}</td><td className="num">{t.qualified_brands_goal}</td><td className="num">{t.confirmed_partnerships_goal}</td><td>{t.origin}</td></tr>)}</tbody></table>
          <div className="flex gap-2 mt-3 text-xs flex-wrap">
            <input className="input w-24" type="number" value={tv.qualified_brands_goal} onChange={(e) => setTv({ ...tv, qualified_brands_goal: Number(e.target.value) })} />
            <input className="input w-24" type="number" value={tv.confirmed_partnerships_goal} onChange={(e) => setTv({ ...tv, confirmed_partnerships_goal: Number(e.target.value) })} />
            <input className="input flex-1" placeholder="Version name" value={tv.target_version} onChange={(e) => setTv({ ...tv, target_version: e.target.value })} />
            <button className="btn" onClick={() => act("add_target_version", tv)}>Add version</button>
          </div>
        </Card>
        <Card title="Reset" subtitle="Restore the original source dataset and the simulated app layer. All app edits, tasks and chats are erased.">
          <button className="btn" onClick={async () => { if (!window.confirm("Reset all data to the original dataset?")) return; await fetch("/api/reset", { method: "POST" }); localStorage.removeItem("copilot_msgs"); await refresh(); loadAudit(); }}>Reset to original dataset</button>
          <div className="text-xs text-[var(--ink-2)] mt-3">Sponsor activations (association only, not causal):<ul className="list-disc pl-4 mt-1">{d.activations.map((x: any) => <li key={x.opportunity_id}>{x.brand_name} → {x.attendee_campaign} ({x.linked_at})</li>)}</ul></div>
        </Card>
      </div>
      <Card title="Audit log" subtitle="Every change, by a user or by the copilot after confirmation.">
        <div className="max-h-80 overflow-y-auto"><table className="tbl w-full"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Detail</th></tr></thead>
          <tbody>{audit.map((x) => <tr key={x.id}><td className="whitespace-nowrap">{new Date(x.at).toLocaleString("en-IN")}</td><td><Badge kind={x.actor === "copilot" ? "warm" : "neutral"}>{x.actor}</Badge></td><td>{x.action}</td><td>{x.entity} {x.entity_id}</td><td className="text-[11px] font-mono max-w-xl truncate" title={JSON.stringify(x.detail)}>{JSON.stringify(x.detail)}</td></tr>)}</tbody></table></div>
      </Card>
    </>
  );
}
