"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useData } from "./DataProvider";
import Copilot from "./Copilot";
import { Badge } from "./ui";

const NAV = [
  ["/", "Overview"], ["/channels", "Channels"], ["/pipeline", "Pipeline"], ["/execution", "Execution"], ["/data", "Data & Assumptions"],
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { data, asOf, setAsOf, loading, error, toast } = useData();
  return (
    <div className="min-h-screen flex">
      <div className="flex-1 min-w-0">
        <header className="bg-white border-b sticky top-0 z-20">
          <div className="px-5 py-3 flex flex-wrap items-center gap-4">
            <div>
              <div className="font-semibold text-[15px]">Sponsor Growth Center</div>
              <div className="text-[11px] text-[var(--ink-2)]">CampusFest · Bengaluru · sponsorship cash command center</div>
            </div>
            <nav className="flex gap-1 flex-wrap">
              {NAV.map(([h, l]) => (
                <Link key={h} href={h} className={`px-3 py-1.5 rounded-lg text-sm ${path === h ? "bg-gray-900 text-white" : "hover:bg-gray-100"}`}>{l}</Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <span className="text-[var(--ink-2)]">Snapshot as of</span>
              <input type="date" className="input" value={asOf ?? data?.campaign_date ?? ""} min={data?.event?.history_start} onChange={(e) => setAsOf(e.target.value || null)} />
              {asOf && asOf !== data?.campaign_date && <button className="btn" onClick={() => setAsOf(null)}>Back to today</button>}
              {asOf && asOf !== data?.campaign_date ? <Badge kind="warn">Time-travel view</Badge> : <Badge kind="good">Operating date</Badge>}
            </div>
          </div>
        </header>
        <main className="p-5 space-y-4">
          {error && (
            <div className="card p-4 text-sm">
              <div className="text-red-700">Could not load data: {error}</div>
              {/relation|does not exist/i.test(error) && (
                <div className="mt-3">
                  <p className="text-[var(--ink-2)] mb-2">The database is empty. Load the original sponsor dataset and the simulated app layer:</p>
                  <button className="btn btn-primary" onClick={async () => { await fetch("/api/reset", { method: "POST" }); location.reload(); }}>Initialize database</button>
                </div>
              )}
            </div>
          )}
          {!data && loading && <div className="text-sm text-[var(--ink-2)]">Loading…</div>}
          {data && children}
        </main>
      </div>
      <Copilot />
      {toast && <div className="fixed bottom-5 left-5 z-50 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg">{toast}</div>}
    </div>
  );
}
