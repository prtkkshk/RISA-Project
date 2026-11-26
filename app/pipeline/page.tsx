"use client";
import { useMemo, useState } from "react";
import { useData } from "@/components/DataProvider";
import { Card, fmtINR, Badge, StageBadge, Empty } from "@/components/ui";

const STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed", "lost", "withdrawn"];

function OppRow({ o, onSave }: { o: any; onSave: (p: any) => Promise<any> }) {
  const [edit, setEdit] = useState(false);
  const [stage, setStage] = useState(o.stage);
  const [val, setVal] = useState(o.proposed_value_inr);
  const [owner, setOwner] = useState(o.owner_name ?? "");
  return (
    <tr className={o.stale ? "bg-red-50/40" : ""}>
      <td><div className="font-medium">{o.brand_name}</div><div className="text-[11px] text-[var(--ink-2)]">{o.opportunity_id} · {o.industry}</div></td>
      <td><Badge kind={o.warm ? "warm" : "cold"}>{o.originating_campaign}</Badge></td>
      <td>{edit ? <input className="input w-28" value={owner} onChange={(e) => setOwner(e.target.value)} /> : o.owner_name}</td>
      <td>{edit ? <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select> : <StageBadge stage={o.stage} />}</td>
      <td className="num">{edit ? <input className="input w-24 text-right" type="number" value={val} onChange={(e) => setVal(Number(e.target.value))} /> : fmtINR(o.proposed_value_inr, false)}</td>
      <td className="num">{o.confirmed_value_inr ? fmtINR(o.confirmed_value_inr, false) : "–"}</td>
      <td>{o.support_type}</td>
      <td className="num">{o.days_since_change}d {o.stale && <Badge kind="bad">stale</Badge>}</td>
      <td className="num">{o.stage === "partner_confirmed" && o.support_type === "cash" ? <span>{fmtINR(o.collected_inr)} <span className="text-[var(--ink-2)]">/ {fmtINR(o.confirmed_value_inr)}</span></span> : "–"}</td>
      <td className="whitespace-nowrap">{edit ? <><button className="btn btn-primary !py-0.5 mr-1" onClick={async () => { await onSave({ opportunity_id: o.opportunity_id, stage, proposed_value_inr: val, owner_name: owner }); setEdit(false); }}>Save</button><button className="btn !py-0.5" onClick={() => setEdit(false)}>Cancel</button></> : <button className="btn !py-0.5" onClick={() => setEdit(true)}>Edit</button>}</td>
    </tr>
  );
}

export default function Pipeline() {
  const { data: d, act, ask } = useData();
  const [f, setF] = useState({ stage: "", group: "", owner: "", stale: false, open: false, text: "" });
  const rows = useMemo(() => d.opportunities.filter((o: any) =>
    (!f.stage || o.stage === f.stage) && (!f.group || (f.group === "warm") === o.warm) && (!f.owner || o.owner_name === f.owner) && (!f.stale || o.stale) && (!f.open || o.open) && (!f.text || o.brand_name.toLowerCase().includes(f.text.toLowerCase()))
  ).sort((a: any, b: any) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || b.proposed_value_inr - a.proposed_value_inr), [d, f]);
  const owners = [...new Set(d.opportunities.map((o: any) => o.owner_name))].filter(Boolean) as string[];
  const [nw, setNw] = useState({ brand_id: "", sponsor_campaign_id: "SC02", support_type: "cash", proposed_value_inr: 90000, owner_name: "" });
  const [pay, setPay] = useState({ opportunity_id: "", kind: "receipt", amount_inr: 0, note: "" });
  const [int, setInt] = useState({ brand_id: "", sponsor_campaign_id: "SC02", event_type: "meeting_held", outcome: "" });

  return (
    <>
      <Card title={`Opportunities (${rows.length})`} subtitle={`Edits append a new stage version dated ${d.campaign_date} (operating date). Stale = open with no stage change for ${d.assumptions.stale_days}+ days.`} right={<button className="btn text-xs" onClick={() => ask("Review the open pipeline: which deals can still close before the event, which should be re-routed through a warm intro, and which should be closed?")}>Ask analyst to triage</button>}>
        <div className="flex flex-wrap gap-2 mb-3 text-xs items-center">
          <input className="input" placeholder="Search brand" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
          <select className="input" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">All stages</option>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
          <select className="input" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })}><option value="">Warm + cold</option><option value="warm">Warm</option><option value="cold">Cold</option></select>
          <select className="input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })}><option value="">All owners</option>{owners.map((o) => <option key={o}>{o}</option>)}</select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.open} onChange={(e) => setF({ ...f, open: e.target.checked })} />Open only</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.stale} onChange={(e) => setF({ ...f, stale: e.target.checked })} />Stale only</label>
          <span className="ml-auto text-[var(--ink-2)]">Proposed total {fmtINR(rows.reduce((s: number, o: any) => s + o.proposed_value_inr, 0))} · confirmed {fmtINR(rows.reduce((s: number, o: any) => s + o.confirmed_value_inr, 0))}</span>
        </div>
        <div className="overflow-x-auto max-h-[560px]">
          <table className="tbl w-full">
            <thead className="sticky top-0 bg-white"><tr><th>Brand</th><th>Source</th><th>Owner</th><th>Stage</th><th className="num">Proposed ₹</th><th className="num">Confirmed ₹</th><th>Type</th><th className="num">Since change</th><th className="num">Collected (sim)</th><th></th></tr></thead>
            <tbody>{rows.map((o: any) => <OppRow key={o.opportunity_id + o.stage + o.proposed_value_inr + o.owner_name} o={o} onSave={(p) => act("update_opportunity", p)} />)}</tbody>
          </table>
          {!rows.length && <Empty>No opportunities match these filters.</Empty>}
        </div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title={`Leakage: qualified, no deal (${d.leakage.length})`} subtitle="Brands whose latest status is qualified but have no opportunity.">
          <div className="max-h-72 overflow-y-auto">
            <table className="tbl w-full"><tbody>{d.leakage.map((l: any) => (
              <tr key={l.brand_id}><td><div className="font-medium">{l.brand_name}</div><div className="text-[11px] text-[var(--ink-2)]">{l.industry} · via {l.source_campaign} · since {l.qualified_since}</div></td>
                <td><button className="btn !py-0.5 text-xs" onClick={() => setNw({ ...nw, brand_id: l.brand_id, owner_name: l.owner_name ?? "" })}>Open deal</button></td></tr>))}</tbody></table>
            {!d.leakage.length && <Empty>No leakage. Every qualified brand has a deal.</Empty>}
          </div>
        </Card>
        <Card title="Create opportunity">
          <div className="space-y-2 text-xs">
            <select className="input w-full" value={nw.brand_id} onChange={(e) => setNw({ ...nw, brand_id: e.target.value })}><option value="">Select brand…</option>{d.brands.map((b: any) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name} ({b.industry})</option>)}</select>
            <select className="input w-full" value={nw.sponsor_campaign_id} onChange={(e) => setNw({ ...nw, sponsor_campaign_id: e.target.value })}>{d.campaigns.map((c: any) => <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>{c.campaign_name}</option>)}</select>
            <div className="flex gap-2"><select className="input" value={nw.support_type} onChange={(e) => setNw({ ...nw, support_type: e.target.value })}><option>cash</option><option>in_kind</option></select>
              <input className="input flex-1" type="number" value={nw.proposed_value_inr} onChange={(e) => setNw({ ...nw, proposed_value_inr: Number(e.target.value) })} /></div>
            <input className="input w-full" placeholder="Owner" value={nw.owner_name} onChange={(e) => setNw({ ...nw, owner_name: e.target.value })} />
            <button className="btn btn-primary w-full" disabled={!nw.brand_id} onClick={() => act("create_opportunity", nw)}>Create</button>
          </div>
        </Card>
        <Card title="Log activity or payment">
          <div className="space-y-2 text-xs">
            <div className="font-medium">Interaction</div>
            <select className="input w-full" value={int.brand_id} onChange={(e) => setInt({ ...int, brand_id: e.target.value })}><option value="">Select brand…</option>{d.brands.map((b: any) => <option key={b.brand_id} value={b.brand_id}>{b.brand_name}</option>)}</select>
            <div className="flex gap-2"><select className="input flex-1" value={int.sponsor_campaign_id} onChange={(e) => setInt({ ...int, sponsor_campaign_id: e.target.value })}>{d.campaigns.map((c: any) => <option key={c.sponsor_campaign_id} value={c.sponsor_campaign_id}>{c.campaign_name}</option>)}</select>
              <select className="input" value={int.event_type} onChange={(e) => setInt({ ...int, event_type: e.target.value })}>{["outreach_sent", "replied", "meeting_booked", "meeting_held", "introduction_received", "opt_out"].map((x) => <option key={x}>{x}</option>)}</select></div>
            <button className="btn w-full" disabled={!int.brand_id} onClick={() => act("log_interaction", int)}>Log interaction</button>
            <div className="font-medium pt-2">Invoice / receipt</div>
            <select className="input w-full" value={pay.opportunity_id} onChange={(e) => setPay({ ...pay, opportunity_id: e.target.value })}><option value="">Select confirmed deal…</option>{d.opportunities.filter((o: any) => o.stage === "partner_confirmed").map((o: any) => <option key={o.opportunity_id} value={o.opportunity_id}>{o.brand_name} · outstanding {fmtINR(o.outstanding_inr)}</option>)}</select>
            <div className="flex gap-2"><select className="input" value={pay.kind} onChange={(e) => setPay({ ...pay, kind: e.target.value })}><option>receipt</option><option>invoice</option></select>
              <input className="input flex-1" type="number" placeholder="Amount ₹" value={pay.amount_inr || ""} onChange={(e) => setPay({ ...pay, amount_inr: Number(e.target.value) })} /></div>
            <button className="btn w-full" disabled={!pay.opportunity_id || !pay.amount_inr} onClick={() => act("record_payment", pay)}>Record (marked as user-entered)</button>
          </div>
        </Card>
      </div>
    </>
  );
}
