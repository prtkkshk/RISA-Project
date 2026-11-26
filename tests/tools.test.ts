import { describe, it, expect, beforeAll } from "vitest";
import { loadDataset } from "../lib/load";
import { TOOLS, calculate } from "../lib/copilot";
import type { Dataset } from "../lib/engine";

// Every copilot read tool runs against the live DB without errors and returns grounded numbers.
let ds: Dataset;
beforeAll(async () => { ds = await loadDataset(); });
const run = (name: string, args: any = {}) => TOOLS[name].run(args, { ds, conversationId: "test" });

describe("copilot tools", () => {
  it("overview", async () => { const r: any = await run("get_overview"); expect(r.kpis.confirmed_partnerships).toBe(24); expect(r.target.confirmed_partnerships_goal).toBe(28); });
  it("overview time travel", async () => { const r: any = await run("get_overview", { as_of: "2025-03-14" }); expect(r.target.version).toBe("Sponsor launch plan"); });
  it("channels", async () => { const r: any = await run("get_channel_performance"); expect(r.groups[1].confirmed).toBe(0); });
  it("owners", async () => { const r: any = await run("get_owner_performance"); expect(r.owners.length).toBe(3); });
  it("industries", async () => { const r: any = await run("get_industry_performance"); expect(r.find((x: any) => x.industry === "Food and beverage").confirmed).toBe(6); });
  it("list stale", async () => { const r: any = await run("list_opportunities", { stale_only: true }); expect(r.total_matching).toBe(26); expect(r.total_proposed_inr).toBe(1440000); });
  it("list by brand", async () => { const r: any = await run("list_opportunities", { brand_contains: "beardo" }); expect(r.total_matching).toBe(2); });
  it("opportunity detail", async () => { const r: any = await run("get_opportunity", { opportunity_id: "O006" }); expect(r.opportunity.stage).toBe("withdrawn"); expect(r.versions.length).toBe(6); });
  it("ambiguous brand", async () => { const r: any = await run("get_opportunity", { brand_name: "Beardo" }); expect(r.ambiguous).toBe(true); });
  it("brand", async () => { const r: any = await run("get_brand", { brand_name: "Beardo" }); expect(r.brand.brand_id).toBe("A001"); });
  it("leakage", async () => { const r: any = await run("list_leakage"); expect(r.count).toBe(18); });
  it("trend", async () => { const r: any = await run("get_trend"); expect(r.at(-1).confirmed).toBe(24); });
  it("compare", async () => { const r: any = await run("compare_snapshots", { date_a: "2025-03-01", date_b: "2025-04-01" }); expect(r.kpi_changes.confirmed_partnerships.change).toBeGreaterThan(0); });
  it("scenario", async () => { const r: any = await run("forecast_scenario", { as_of: "2025-03-20", collection_rate: 1 }); expect(r.scenario_projected_cash_inr).toBeGreaterThan(r.baseline_projected_cash_inr); });
  it("initiatives", async () => { const r: any = await run("list_initiatives"); expect(r.find((x: any) => x.rank === 5).computed_decision).toBe("stop"); });
  it("tasks", async () => { const r: any = await run("list_tasks", { overdue_only: true }); expect(r.length).toBe(3); });
  it("coverage", async () => { const r: any = await run("get_data_coverage"); expect(r.not_available.length).toBeGreaterThan(3); });
  it("calculate", () => { expect(calculate("2240000 / 24")).toBeCloseTo(93333.333333); expect(() => calculate("process.exit()")).toThrow(); });
});
