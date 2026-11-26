"use client";
import { useState } from "react";
import { useData } from "@/components/DataProvider";
import { Card, fmtINR, Badge, DecisionBadge, Empty } from "@/components/ui";

const TS = ["todo", "in_progress", "blocked", "done"];
const IS = ["planned", "testing", "scaling", "changed", "stopped", "rejected", "done"];

function Initiative({ i }: { i: any }) {
  const { act, ask } = useData();
  const [val, setVal] = useState("");
  const [note, setNote] = useState("");
  const [spent, setSpent] = useState(i.spent_inr);
  const fmtK = (v: any) => (i.kpi_unit === "INR" ? fmtINR(Number(v)) : `${v}${i.kpi_unit === "%" ? "%" : ` ${i.kpi_unit ?? ""}`}`);
  return (
    <div className="border rounded-xl p-4 bg-white">
      <div className="flex items-start gap-2">
        <div className="text-lg font-semibold text-[var(--ink-2)] w-6">{i.rank ?? "–"}</div>
        <div className="flex-1">
          <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">{i.name}<DecisionBadge d={i.decision} />{i.is_simulated && <Badge kind="sim">simulated plan</Badge>}</div>
          <div className="text-xs text-[var(--ink-2)] mt-1">{i.concept}</div>
        </div>
        <select className="input text-xs" value={i.status} onChange={(e) => act("update_initiative", { id: i.id, status: e.target.value })}>{IS.map((s) => <option key={s}>{s}</option>)}</select>
      </div>
      {i.status !== "rejected" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
          <div><div className="text-[var(--ink-2)]">Owner</div><div>{i.owner_name}</div></div>
          <div><div className="text-[var(--ink-2)]">Expected cash</div><div>{fmtINR(i.expected_cash_inr)}</div></div>
          <div><div className="text-[var(--ink-2)]">Budget / spent</div><div className="flex items-center gap-1">{fmtINR(i.budget_inr)} / <input className="input !py-0 w-20 text-xs" type="number" value={spent} onChange={(e) => setSpent(Number(e.target.value))} onBlur={() => spent !== i.spent_inr && act("update_initiative", { id: i.id, spent_inr: spent })} /></div></div>
          <div><div className="text-[var(--ink-2)]">Window</div><div>{i.start_date} → {i.end_date}</div></div>
          <div className="col-span-2 md:col-span-4 border-t pt-2">
            <div className="flex flex-wrap gap-3 items-center"><span className="font-medium">KPI: {i.kpi_name}</span>
              <span>Scale ≥ {fmtK(i.scale_threshold)}</span><span>Stop &lt; {fmtK(i.stop_threshold)}</span>
              <span>Latest: <b>{i.latest_reading ? fmtK(i.latest_reading.value) : "none"}</b>{i.latest_reading && <span className="text-[var(--ink-2)]"> on {i.latest_reading.reading_date}{i.latest_reading.is_simulated ? " (simulated)" : ""}</span>}</span></div>
            <div className="text-[var(--ink-2)] mt-1">Rule: {i.decision_rule}</div>
            {i.readings.length > 0 && <div className="mt-1 flex gap-2 flex-wrap">{i.readings.map((r: any) => <span key={r.id} className="border rounded px-1.5" title={r.note ?? ""}>{r.reading_date.slice(5)}: {fmtK(r.value)}</span>)}</div>}
            <div className="flex gap-2 mt-2">
              <input className="input w-24 text-xs" placeholder="New value" value={val} onChange={(e) => setVal(e.target.value)} />
              <input className="input flex-1 text-xs" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn !py-0.5 text-xs" disabled={val === ""} onClick={async () => { await act("add_kpi_reading", { initiative_id: i.id, value: Number(val), note }); setVal(""); setNote(""); }}>Add reading</button>
              <button className="btn !py-0.5 text-xs" onClick={() => ask(`Initiative "${i.name}" shows decision "${i.decision}". Explain what's driving it and what we should do next, with tasks if useful.`)}>Ask analyst</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Execution() {
  const { data: d, act } = useData();
  const [t, setT] = useState({ title: "", owner_name: "", due_date: "", priority: "medium", initiative_id: "" });
  const [filter, setFilter] = useState("open");
  const tasks = d.tasks.filter((x: any) => filter === "all" || (filter === "open" ? x.status !== "done" : filter === "overdue" ? x.overdue : x.status === filter));
  const ranked = d.initiatives.filter((i: any) => i.status !== "rejected");
  const rejected = d.initiatives.filter((i: any) => i.status === "rejected");
  const budget = ranked.reduce((s: number, i: any) => s + Number(i.budget_inr), 0), spent = ranked.reduce((s: number, i: any) => s + Number(i.spent_inr), 0);
  return (
    <>
      <Card title="Growth bets" subtitle={`Ranked by expected cash per team-hour × confidence. Decision = latest KPI reading vs pre-set thresholds. Budget ${fmtINR(budget)} · spent ${fmtINR(spent)}.`}>
        <div className="space-y-3">{ranked.map((i: any) => <Initiative key={i.id} i={i} />)}</div>
        <div className="mt-4"><div className="text-xs font-semibold text-[var(--ink-2)] mb-2">Deliberately rejected</div>
          <div className="grid md:grid-cols-3 gap-2">{rejected.map((i: any) => <div key={i.id} className="border rounded-lg p-3 text-xs bg-gray-50"><div className="font-medium">{i.name}</div><div className="text-[var(--ink-2)] mt-1">{i.concept}</div></div>)}</div></div>
      </Card>
      <Card title={`Tasks (${tasks.length})`} subtitle={`Overdue is relative to the operating date ${d.campaign_date}. Copilot-created tasks are tagged.`} right={<select className="input text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}>{["open", "overdue", "all", ...TS].map((s) => <option key={s}>{s}</option>)}</select>}>
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <input className="input flex-1 min-w-60" placeholder="New task title" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
          <input className="input w-32" placeholder="Owner" value={t.owner_name} onChange={(e) => setT({ ...t, owner_name: e.target.value })} />
          <input className="input" type="date" value={t.due_date} onChange={(e) => setT({ ...t, due_date: e.target.value })} />
          <select className="input" value={t.priority} onChange={(e) => setT({ ...t, priority: e.target.value })}>{["low", "medium", "high"].map((p) => <option key={p}>{p}</option>)}</select>
          <select className="input" value={t.initiative_id} onChange={(e) => setT({ ...t, initiative_id: e.target.value })}><option value="">No initiative</option>{ranked.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <button className="btn btn-primary" disabled={!t.title} onClick={async () => { await act("create_task", { ...t, due_date: t.due_date || null, initiative_id: t.initiative_id ? Number(t.initiative_id) : null }); setT({ ...t, title: "" }); }}>Add task</button>
        </div>
        <table className="tbl w-full">
          <thead><tr><th>Task</th><th>Owner</th><th>Due</th><th>Priority</th><th>Linked</th><th>Status</th><th></th></tr></thead>
          <tbody>{tasks.map((x: any) => (
            <tr key={x.id}>
              <td><div className="font-medium">{x.title}</div>{x.description && <div className="text-[11px] text-[var(--ink-2)]">{x.description}</div>}</td>
              <td>{x.owner_name}</td><td className="whitespace-nowrap">{x.due_date ?? "–"} {x.overdue && <Badge kind="bad">overdue</Badge>}</td>
              <td>{x.priority}</td>
              <td className="text-[11px]">{[x.initiative_id && d.initiatives.find((i: any) => i.id === x.initiative_id)?.name, x.opportunity_id, x.brand_id].filter(Boolean).join(" · ")} {x.created_by === "copilot" && <Badge kind="warm">copilot</Badge>}{x.created_by === "seed" && <Badge kind="sim">seed</Badge>}</td>
              <td><select className="input text-xs" value={x.status} onChange={(e) => act("update_task", { id: x.id, status: e.target.value })}>{TS.map((s) => <option key={s}>{s}</option>)}</select></td>
              <td><button className="btn !py-0.5 text-xs" onClick={() => act("delete_task", { id: x.id })}>Delete</button></td>
            </tr>))}</tbody>
        </table>
        {!tasks.length && <Empty>No tasks in this view.</Empty>}
      </Card>
    </>
  );
}
