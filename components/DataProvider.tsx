"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Ctx = {
  data: any | null; loading: boolean; error: string | null; asOf: string | null;
  setAsOf: (d: string | null) => void; refresh: () => Promise<void>;
  act: (type: string, payload: any) => Promise<any>;
  ask: (q: string) => void; registerAsk: (fn: (q: string) => void) => void;
  toast: string | null;
};
const C = createContext<Ctx>(null as any);
export const useData = () => useContext(C);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const askRef = useRef<((q: string) => void) | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/snapshot${asOf ? `?asOf=${asOf}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setData(j); setError(null);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [asOf]);
  useEffect(() => { refresh(); }, [refresh]);

  const act = useCallback(async (type: string, payload: any) => {
    const r = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, payload }) });
    const j = await r.json();
    if (!r.ok) { setToast(`Error: ${j.error}`); setTimeout(() => setToast(null), 4000); throw new Error(j.error); }
    setToast("Saved. Analytics updated."); setTimeout(() => setToast(null), 2500);
    await refresh();
    return j;
  }, [refresh]);

  const registerAsk = useCallback((fn: (q: string) => void) => { askRef.current = fn; }, []);
  const ask = useCallback((q: string) => askRef.current?.(q), []);

  return <C.Provider value={{ data, loading, error, asOf, setAsOf, refresh, act, ask, registerAsk, toast }}>{children}</C.Provider>;
}
