"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useData } from "./DataProvider";
import { Badge } from "./ui";

type Msg = { role: "user" | "assistant" | "system"; content: string; tools?: { name: string; args: any }[]; actions?: any[] };
const SUGGEST = [
  "Are we on track for the confirmed-partnership target? What's the gap and the fastest way to close it?",
  "Which channels should we scale and which should we stop? Show the evidence.",
  "How much cash have we actually collected?",
  "Which owner is underperforming?",
  "What is stale in the pipeline and what should we do with it?",
  "Create tasks to rescue the qualified brands that have no opportunity.",
];

function ActionCard({ a, onDone }: { a: any; onDone: (status: string, msg: string) => void }) {
  const [payload, setPayload] = useState<any>(a.payload);
  const [state, setState] = useState<string>(a.status);
  const [err, setErr] = useState<string | null>(null);
  const go = async (decision: "confirm" | "reject") => {
    setErr(null);
    const r = await fetch("/api/chat/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: a.id, decision, payload }) });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); return; }
    setState(j.status);
    onDone(j.status, decision === "confirm" ? `Confirmed: ${a.summary}` : `Rejected: ${a.summary}`);
  };
  return (
    <div className="border rounded-lg p-3 bg-amber-50/50 border-amber-200 text-xs mt-2">
      <div className="flex items-center gap-2 mb-1"><Badge kind="warn">Proposed action</Badge><code className="text-[11px]">{a.action_type}</code></div>
      <div className="font-medium text-[13px]">{a.summary}</div>
      {a.rationale && <div className="text-[var(--ink-2)] mt-1">Why: {a.rationale}</div>}
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 mt-2 items-center">
        {Object.entries(payload ?? {}).map(([k, v]) => (
          <div key={k} className="contents">
            <label className="text-[var(--ink-2)]">{k}</label>
            <input className="input !py-0.5 text-xs" disabled={state !== "pending"} value={String(v ?? "")} onChange={(e) => setPayload({ ...payload, [k]: typeof v === "number" ? Number(e.target.value) : e.target.value })} />
          </div>
        ))}
      </div>
      {err && <div className="text-red-700 mt-1">{err}</div>}
      {state === "pending" ? (
        <div className="flex gap-2 mt-2"><button className="btn btn-primary !py-1" onClick={() => go("confirm")}>Confirm</button><button className="btn !py-1" onClick={() => go("reject")}>Reject</button></div>
      ) : <div className="mt-2"><Badge kind={state === "confirmed" ? "good" : "neutral"}>{state}</Badge></div>}
    </div>
  );
}

export default function Copilot() {
  const { registerAsk, refresh } = useData();
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cid, setCid] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id = localStorage.getItem("copilot_cid");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("copilot_cid", id); }
    setCid(id);
    try { setMsgs(JSON.parse(localStorage.getItem("copilot_msgs") ?? "[]")); } catch {}
  }, []);
  useEffect(() => { localStorage.setItem("copilot_msgs", JSON.stringify(msgs.slice(-40))); end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next); setInput(""); setBusy(true); setOpen(true);
    try {
      const history = next.map((m) => ({ role: m.role === "system" ? "user" : m.role, content: m.role === "system" ? `[app event] ${m.content}` : m.content }));
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: cid, messages: history }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setMsgs((m) => [...m, { role: "assistant", content: j.reply, tools: j.tools_used, actions: j.pending_actions }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setBusy(false); }
  };
  useEffect(() => { registerAsk(send); });

  const newChat = () => { const id = crypto.randomUUID(); localStorage.setItem("copilot_cid", id); setCid(id); setMsgs([]); };

  if (!open) return <button onClick={() => setOpen(true)} className="fixed right-4 bottom-4 z-40 btn btn-primary shadow-lg">Ask the Growth Analyst</button>;
  return (
    <aside className="w-[420px] shrink-0 border-l bg-white h-screen sticky top-0 flex flex-col">
      <div className="px-4 py-3 border-b flex items-center gap-2">
        <div className="flex-1">
          <div className="font-semibold text-sm">AI Growth Analyst</div>
          <div className="text-[11px] text-[var(--ink-2)]">Answers from live app data · proposes actions, you confirm</div>
        </div>
        <button className="btn !py-1 text-xs" onClick={newChat}>New chat</button>
        <button className="btn !py-1 text-xs" onClick={() => setOpen(false)}>Hide</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!msgs.length && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--ink-2)]">Try one of these, or ask your own. Every number comes from a tool call on the current data.</p>
            {SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="block w-full text-left text-xs border rounded-lg px-3 py-2 hover:bg-gray-50">{s}</button>)}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "system" ? <div className="text-[11px] text-center text-[var(--ink-2)]">{m.content}</div> : (
              <div className={`rounded-xl px-3 py-2 text-[13px] max-w-[95%] ${m.role === "user" ? "bg-gray-900 text-white" : "bg-gray-50 border"}`}>
                {m.role === "assistant" ? <div className="prose-chat"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div> : m.content}
                {m.tools && m.tools.length > 0 && (
                  <details className="mt-1 text-[11px] text-[var(--ink-2)]"><summary className="cursor-pointer">Data used: {[...new Set(m.tools.map((t) => t.name))].join(", ")}</summary>
                    <pre className="whitespace-pre-wrap text-[10px] mt-1">{m.tools.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join("\n")}</pre></details>
                )}
                {m.actions?.map((a) => <ActionCard key={a.id} a={a} onDone={(st, text) => { setMsgs((x) => [...x, { role: "system", content: text }]); if (st === "confirmed") refresh(); }} />)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="text-xs text-[var(--ink-2)]">Analysing the data…</div>}
        <div ref={end} />
      </div>
      <form className="p-3 border-t flex gap-2" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea className="input flex-1 resize-none h-16" placeholder="Ask about performance, diagnose a problem, or ask for an action…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="btn btn-primary self-end" disabled={busy}>Send</button>
      </form>
    </aside>
  );
}
