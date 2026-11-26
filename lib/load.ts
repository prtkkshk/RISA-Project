import { q } from "./db";
import type { Dataset } from "./engine";

export async function loadDataset(): Promise<Dataset> {
  const [event, targets, brands, contacts, campaigns, interactions, qualHistory, opportunities, oppHistory,
    activations, payments, initiatives, kpiReadings, tasks, settings] = await Promise.all([
    q("select * from event"),
    q("select * from targets order by _row"),
    q("select * from brands order by _row"),
    q("select * from sponsor_contacts order by _row"),
    q("select * from sponsor_campaigns order by _row"),
    q("select * from sponsor_interactions order by _row"),
    q("select * from brand_qualification_history order by _row"),
    q("select * from partner_opportunities order by _row"),
    q("select * from opportunity_history order by _row"),
    q("select * from sponsor_activations order by _row"),
    q("select * from payments order by id"),
    q("select * from initiatives order by coalesce(rank, 99), id"),
    q("select * from kpi_readings order by reading_date, id"),
    q("select * from tasks order by id"),
    q("select key, value from app_settings"),
  ]);
  const s: Record<string, any> = {};
  for (const r of settings as any[]) s[r.key] = r.value;
  return {
    event: event[0], targets, brands, contacts, campaigns, interactions, qualHistory, opportunities, oppHistory,
    activations, payments, initiatives, kpiReadings, tasks,
    settings: {
      campaign_date: s.campaign_date ?? "2025-04-20",
      assumptions: { collection_rate_confirmed: 0.8, stale_days: 14, payment_terms_days: 21, ...(s.assumptions ?? {}) },
    },
  } as Dataset;
}
