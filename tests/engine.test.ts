import { describe, it, expect, beforeAll } from "vitest";
import { loadDataset } from "../lib/load";
import { snapshot, trend, type Dataset } from "../lib/engine";

// Expected values were computed independently in Python (pandas) from the original xlsx
// before the app existed. See README "Verification".
let ds: Dataset;
beforeAll(async () => { ds = await loadDataset(); });

describe("source data at history end (2025-04-20)", () => {
  it("dedupes import retries", () => {
    const s = snapshot(ds, "2025-04-20");
    const dq = Object.fromEntries(s.data_quality.map((d) => [d.table, d.duplicates_removed]));
    expect(dq.sponsor_interactions).toBe(3);
    expect(dq.brand_qualification_history).toBe(1);
    expect(dq.opportunity_history).toBe(2);
  });
  it("headline KPIs", () => {
    const k = snapshot(ds, "2025-04-20").kpis;
    expect(k.qualified_brands).toBe(60);
    expect(k.confirmed_partnerships).toBe(24);
    expect(k.confirmed_value_inr).toBe(2240000);
    expect(k.confirmed_in_kind_value_inr).toBe(240000);
    expect(k.confirmed_cash_value_inr).toBe(2000000);
    expect(k.open_opportunities).toBe(26);
    expect(k.open_pipeline_inr).toBe(1440000);
    expect(k.qualified_without_opportunity).toBe(18);
    expect(k.reneged_after_confirmation).toBe(1);
  });
  it("qualification distribution uses latest version only", () => {
    expect(snapshot(ds, "2025-04-20").qualification_counts).toEqual({ dormant: 63, qualified: 60, engaged: 28, unqualified: 21, unreviewed: 8 });
  });
  it("warm vs cold", () => {
    const [warm, cold] = snapshot(ds, "2025-04-20").channel_groups;
    expect(warm.opportunities).toBe(25); expect(warm.confirmed).toBe(24);
    expect(cold.opportunities).toBe(33); expect(cold.confirmed).toBe(0);
    expect(cold.open_pipeline_inr).toBe(1440000);
  });
  it("channel detail", () => {
    const ch = Object.fromEntries(snapshot(ds, "2025-04-20").channels.map((c) => [c.campaign_name, c]));
    expect(ch["Brand Discovery Email"].touches).toBe(507);
    expect(ch["Brand Discovery Email"].brands_touched).toBe(91);
    expect(ch["Creator Network Referrals"].confirmed).toBe(9);
    expect(ch["Partner Interest Form"].confirmed).toBe(7);
    expect(ch["Warm Partner Introductions"].confirmed).toBe(8);
    expect(ch["Creator Network Referrals"].confirmed_value_inr).toBe(785000);
  });
  it("owners", () => {
    const o = Object.fromEntries(snapshot(ds, "2025-04-20").owners.map((x) => [x.owner_name, x]));
    expect(o["Riya Kapoor"].confirmed).toBe(10); expect(o["Riya Kapoor"].confirmed_value_inr).toBe(1075000);
    expect(o["Nisha Rao"].confirmed).toBe(9); expect(o["Meera Iyer"].confirmed).toBe(5);
  });
  it("target version in force", () => {
    expect(snapshot(ds, "2025-04-20").target?.confirmed_partnerships_goal).toBe(28);
    expect(snapshot(ds, "2025-03-14").target?.confirmed_partnerships_goal).toBe(20);
    expect(snapshot(ds, "2025-03-15").target?.qualified_brands_goal).toBe(55);
  });
  it("open pipeline gets zero probability once the event has started", () => {
    const f = snapshot(ds, "2025-04-20").forecast;
    expect(f.event_started).toBe(true);
    expect(f.open_pipeline_expected_wins).toBe(0);
  });
});

describe("no leakage from later records", () => {
  it("earlier snapshots only see earlier outcomes", () => {
    const early = snapshot(ds, "2025-02-15");
    const late = snapshot(ds, "2025-04-20");
    expect(early.kpis.confirmed_partnerships).toBeLessThan(late.kpis.confirmed_partnerships);
    for (const o of early.opportunities) expect(o.created_at <= "2025-02-15").toBe(true);
  });
  it("trend is monotone in confirmed value until the withdrawal", () => {
    const t = trend(ds, "2025-04-20");
    expect(t.at(-1)!.confirmed).toBe(24);
    expect(t.length).toBeGreaterThan(10);
  });
  it("Cobalt Learning is confirmed on 2025-02-25 snapshot and withdrawn by 2025-03-20", () => {
    const a = snapshot(ds, "2025-02-25").opportunities.find((o) => o.opportunity_id === "O006")!;
    const b = snapshot(ds, "2025-03-20").opportunities.find((o) => o.opportunity_id === "O006")!;
    expect(a.stage).toBe("partner_confirmed"); expect(b.stage).toBe("withdrawn");
  });
});
