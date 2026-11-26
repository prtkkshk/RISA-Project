/**
 * AI Growth Analyst & Copilot.
 * The model never sees a pre-written answer: it must call tools that run the same metrics engine
 * as the dashboard against the live database. All arithmetic comes from tools (or the calculate
 * tool). Writes are only PROPOSED; a human confirms them in the UI, then they run through
 * lib/actions.ts and are written to the audit log.
 */
import OpenAI from "openai";
import { q } from "./db";
import { loadDataset } from "./load";
import { snapshot, trend, DATA_COVERAGE, type Dataset } from "./engine";
import { ACTIONS } from "./actions";


function pickOpp(o: any) {
  return { id: o.opportunity_id, brand: o.brand_name, industry: o.industry, campaign: o.originating_campaign, channel_group: o.warm ? "warm" : "cold", owner: o.owner_name, stage: o.stage, support_type: o.support_type, proposed_value_inr: o.proposed_value_inr, confirmed_value_inr: o.confirmed_value_inr, days_since_stage_change: o.days_since_change, stale: o.stale, invoiced_inr_sim: o.invoiced_inr, collected_inr_sim: o.collected_inr, outstanding_inr: o.outstanding_inr, win_probability: o.win_probability };
}

/** Safe arithmetic: numbers, + - * / % ^ ( ) and . only. */
export function calculate(expr: string): number {
  if (!/^[\d\s+\-*/%^().,eE]+$/.test(expr)) throw new Error("Only numbers and + - * / % ^ ( ) are allowed");
  const js = expr.replace(/,/g, "").replace(/\^/g, "**");
  // eslint-disable-next-line no-new-func
  const v = Function(`"use strict"; return (${js});`)();
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Result is not a finite number");
  return Math.round(v * 1e6) / 1e6;
}

function whatIf(ds: Dataset, args: any) {
  const base = snapshot(ds, args.as_of);
  const rate = args.collection_rate ?? base.assumptions.collection_rate_confirmed;
  const overrides: Record<string, number> = args.win_rate_overrides ?? {};
  const open = base.opportunities.filter((o) => o.open && o.support_type === "cash");
  let pipelineCash = 0, pipelineWins = 0;
  for (const o of open) {
    const p = overrides[o.originating_campaign] ?? (base.forecast.event_started ? 0 : o.win_probability ?? 0);
    pipelineCash += p * o.proposed_value_inr; pipelineWins += p;
  }
  const extra = args.additional_deals ?? null;
  const extraWins = extra ? Number(extra.count) * Number(extra.win_rate) : 0;
  const extraCash = extra ? extraWins * Number(extra.avg_value_inr) : 0;
  const k = base.kpis;
  const outstanding = base.forecast.outstanding_confirmed_cash_inr;
  return {
    as_of: base.as_of, assumptions_used: { collection_rate: rate, win_rate_overrides: overrides, additional_deals: extra },
    baseline_projected_cash_inr: base.forecast.projected_cash_inr,
    scenario_projected_cash_inr: Math.round(k.collected_inr_simulated + outstanding * rate + (pipelineCash + extraCash) * rate),
    scenario_projected_confirmed_partnerships: Math.round((k.confirmed_partnerships + pipelineWins + extraWins) * 10) / 10,
    target_confirmed_partnerships: base.target?.confirmed_partnerships_goal ?? null,
    components: { collected_inr_simulated: k.collected_inr_simulated, outstanding_confirmed_x_rate: Math.round(outstanding * rate), open_pipeline_cash_x_p_x_rate: Math.round(pipelineCash * rate), additional_deals_cash_x_rate: Math.round(extraCash * rate) },
    caveat: "Scenario output. Win rates and collection rate are assumptions; collected cash is from the SIMULATED ledger.",
  };
}

type ToolDef = { description: string; parameters: any; run: (args: any, ctx: { ds: Dataset; conversationId: string }) => Promise<any> | any };
const asOfParam = { as_of: { type: "string", description: "Snapshot date YYYY-MM-DD (end of day IST). Omit for the current operating date." } };

export const TOOLS: Record<string, ToolDef> = {
  get_overview: {
    description: "Headline KPIs, target in force, full funnel with population definitions, qualification counts and the cash forecast, at a snapshot date.",
    parameters: { type: "object", properties: asOfParam },
    run: ({ as_of }, { ds }) => { const s = snapshot(ds, as_of); return { as_of: s.as_of, event: s.event, target: s.target, kpis: s.kpis, qualification_counts: s.qualification_counts, funnel: s.funnel, forecast: { ...s.forecast }, assumptions: s.assumptions }; },
  },
  get_channel_performance: {
    description: "Per sponsor-acquisition campaign: touches, brands touched/responded/met, qualified brands, opportunities, wins, win rates, confirmed value, open and stale pipeline. Also warm vs cold group totals.",
    parameters: { type: "object", properties: asOfParam },
    run: ({ as_of }, { ds }) => { const s = snapshot(ds, as_of); return { as_of: s.as_of, channels: s.channels, groups: s.channel_groups, note: "Campaign association is observational, not causal." }; },
  },
  get_owner_performance: {
    description: "Per team owner: opportunities, warm-channel share, wins, value, open/stale pipeline and wins vs what their channel mix would predict.",
    parameters: { type: "object", properties: asOfParam },
    run: ({ as_of }, { ds }) => { const s = snapshot(ds, as_of); return { as_of: s.as_of, owners: s.owners, note: "expected_wins_given_channel_mix applies each channel's closed win rate to the owner's closed deals. Differences under ~1 win are noise at this sample size." }; },
  },
  get_industry_performance: {
    description: "Per brand industry: brands, opportunities, wins, win rate, confirmed value, average deal.",
    parameters: { type: "object", properties: asOfParam },
    run: ({ as_of }, { ds }) => snapshot(ds, as_of).industries,
  },
  list_opportunities: {
    description: "Filter and list opportunities with stage, value, owner, channel, staleness and simulated payment status.",
    parameters: { type: "object", properties: {
      ...asOfParam,
      stage: { type: "string", description: "prospecting|contacted|proposal_sent|negotiating|partner_confirmed|lost|withdrawn" },
      open_only: { type: "boolean" }, stale_only: { type: "boolean" },
      channel_group: { type: "string", enum: ["warm", "cold"] }, campaign: { type: "string" }, owner: { type: "string" }, industry: { type: "string" },
      brand_contains: { type: "string" }, min_value_inr: { type: "number" },
      unpaid_only: { type: "boolean", description: "Confirmed cash deals with outstanding balance" },
      sort_by: { type: "string", enum: ["value", "days_since_change", "brand"] }, limit: { type: "number" },
    } },
    run: (a, { ds }) => {
      let o = snapshot(ds, a.as_of).opportunities;
      const lc = (s: any) => String(s ?? "").toLowerCase();
      if (a.stage) o = o.filter((x) => x.stage === a.stage);
      if (a.open_only) o = o.filter((x) => x.open);
      if (a.stale_only) o = o.filter((x) => x.stale);
      if (a.channel_group) o = o.filter((x) => (a.channel_group === "warm") === x.warm);
      if (a.campaign) o = o.filter((x) => lc(x.originating_campaign).includes(lc(a.campaign)));
      if (a.owner) o = o.filter((x) => lc(x.owner_name).includes(lc(a.owner)));
      if (a.industry) o = o.filter((x) => lc(x.industry).includes(lc(a.industry)));
      if (a.brand_contains) o = o.filter((x) => lc(x.brand_name).includes(lc(a.brand_contains)));
      if (a.min_value_inr) o = o.filter((x) => Math.max(x.proposed_value_inr, x.confirmed_value_inr) >= a.min_value_inr);
      if (a.unpaid_only) o = o.filter((x) => x.stage === "partner_confirmed" && x.outstanding_inr > 0);
      if (a.sort_by === "value") o = [...o].sort((x, y) => Math.max(y.proposed_value_inr, y.confirmed_value_inr) - Math.max(x.proposed_value_inr, x.confirmed_value_inr));
      if (a.sort_by === "days_since_change") o = [...o].sort((x, y) => y.days_since_change - x.days_since_change);
      if (a.sort_by === "brand") o = [...o].sort((x, y) => x.brand_name.localeCompare(y.brand_name));
      const total = o.length;
      return { total_matching: total, total_proposed_inr: o.reduce((s, x) => s + x.proposed_value_inr, 0), total_confirmed_inr: o.reduce((s, x) => s + x.confirmed_value_inr, 0), rows: o.slice(0, Math.min(a.limit ?? 60, 60)).map(pickOpp) };
    },
  },
  get_opportunity: {
    description: "Full detail for one opportunity: every stage version, simulated payments, brand qualification and that brand's interactions.",
    parameters: { type: "object", properties: { opportunity_id: { type: "string" }, brand_name: { type: "string" }, ...asOfParam } },
    run: async (a, { ds }) => {
      const s = snapshot(ds, a.as_of);
      const lc = (x: any) => String(x ?? "").toLowerCase();
      const matches = s.opportunities.filter((o) => (a.opportunity_id && o.opportunity_id === a.opportunity_id) || (a.brand_name && lc(o.brand_name) === lc(a.brand_name)) || (a.brand_name && lc(o.brand_name).includes(lc(a.brand_name))));
      if (!matches.length) return { error: "No opportunity matches. Try list_opportunities with brand_contains." };
      if (matches.length > 1 && !a.opportunity_id) return { ambiguous: true, candidates: matches.map(pickOpp) };
      const o = matches[0];
      const hist = (await q("select stage, proposed_value_inr, confirmed_value_inr, owner_name, effective_at, history_id, _origin from opportunity_history where opportunity_id=$1 order by effective_at, _row", [o.opportunity_id]));
      const seen = new Set<string>();
      const versions = hist.filter((h) => !seen.has(h.history_id) && seen.add(h.history_id));
      const pays = await q("select kind, amount_inr, event_date, due_date, note, is_simulated from payments where opportunity_id=$1 order by event_date", [o.opportunity_id]);
      const ints = await q("select distinct on (interaction_id) occurred_at, campaign_name, event_type, outcome, contact_name from sponsor_interactions where brand_id=$1 order by interaction_id, _row", [o.brand_id]);
      ints.sort((x: any, y: any) => +new Date(x.occurred_at) - +new Date(y.occurred_at));
      return { opportunity: pickOpp(o), brand_qualification: o.brand_qualification, versions, payments: pays, interactions: ints, note: "Payments are simulated unless is_simulated=false (entered by a user)." };
    },
  },
  get_brand: {
    description: "Detail for a brand: industry, owner, contacts, qualification history, interactions and opportunities.",
    parameters: { type: "object", properties: { brand_id: { type: "string" }, brand_name: { type: "string" } } },
    run: async (a) => {
      const b = a.brand_id ? await q("select * from brands where brand_id=$1 limit 1", [a.brand_id]) : await q("select * from brands where lower(brand_name)=lower($1) or lower(brand_name) like lower($2) order by _row limit 5", [a.brand_name ?? "", `%${a.brand_name ?? ""}%`]);
      if (!b.length) return { error: "Brand not found" };
      if (b.length > 1 && !a.brand_id && b[0].brand_name.toLowerCase() !== String(a.brand_name).toLowerCase()) return { ambiguous: true, candidates: b.map((x) => ({ brand_id: x.brand_id, brand_name: x.brand_name })) };
      const brand = b[0];
      const [contacts, qual, ints, opps] = await Promise.all([
        q("select contact_id, contact_name, job_title from sponsor_contacts where brand_id=$1", [brand.brand_id]),
        q("select distinct on (history_id) qualification_status, reason, source_campaign_name, effective_at from brand_qualification_history where brand_id=$1 order by history_id, _row", [brand.brand_id]),
        q("select distinct on (interaction_id) occurred_at, campaign_name, event_type, outcome, contact_name from sponsor_interactions where brand_id=$1 order by interaction_id, _row", [brand.brand_id]),
        q("select opportunity_id, opportunity_name, originating_campaign_name, support_type from partner_opportunities where brand_id=$1", [brand.brand_id]),
      ]);
      const byT = (x: any, y: any, k: string) => +new Date(x[k]) - +new Date(y[k]);
      return { brand: { brand_id: brand.brand_id, brand_name: brand.brand_name, industry: brand.industry, owner: brand.owner_name }, contacts, qualification_history: qual.sort((x, y) => byT(x, y, "effective_at")), interactions: ints.sort((x, y) => byT(x, y, "occurred_at")), opportunities: opps };
    },
  },
  list_leakage: {
    description: "Brands whose latest qualification is 'qualified' but that have no opportunity: qualified demand nobody is working.",
    parameters: { type: "object", properties: asOfParam },
    run: ({ as_of }, { ds }) => { const l = snapshot(ds, as_of).leakage; return { count: l.length, brands: l }; },
  },
  get_trend: {
    description: "Weekly series of qualified brands, confirmed partnerships, confirmed value, simulated cash collected and goals in force. Each week is its own snapshot (no leakage).",
    parameters: { type: "object", properties: { up_to: { type: "string" } } },
    run: ({ up_to }, { ds }) => trend(ds, up_to),
  },
  compare_snapshots: {
    description: "Compare headline KPIs and channel wins between two dates to explain what changed.",
    parameters: { type: "object", properties: { date_a: { type: "string" }, date_b: { type: "string" } }, required: ["date_a", "date_b"] },
    run: ({ date_a, date_b }, { ds }) => {
      const a = snapshot(ds, date_a), b = snapshot(ds, date_b);
      const d: any = {};
      for (const k of Object.keys(b.kpis) as (keyof typeof b.kpis)[]) { const x = a.kpis[k] as any, y = b.kpis[k] as any; if (typeof y === "number") d[k] = { [date_a]: x, [date_b]: y, change: y - (x ?? 0) }; }
      const ch = b.channels.map((c) => { const p = a.channels.find((z) => z.sponsor_campaign_id === c.sponsor_campaign_id)!; return { campaign: c.campaign_name, confirmed_change: c.confirmed - p.confirmed, opportunities_change: c.opportunities - p.opportunities, confirmed_value_change_inr: c.confirmed_value_inr - p.confirmed_value_inr }; });
      return { kpi_changes: d, channel_changes: ch, target_a: a.target, target_b: b.target };
    },
  },
  forecast_scenario: {
    description: "What-if cash forecast: change collection rate, override win rates per originating campaign name, or add hypothetical new deals {count, win_rate, avg_value_inr}.",
    parameters: { type: "object", properties: { ...asOfParam, collection_rate: { type: "number" }, win_rate_overrides: { type: "object", additionalProperties: { type: "number" } }, additional_deals: { type: "object", properties: { count: { type: "number" }, win_rate: { type: "number" }, avg_value_inr: { type: "number" } } } } },
    run: (a, { ds }) => whatIf(ds, a),
  },
  list_initiatives: {
    description: "The growth bets (ranked) and rejected ideas: status, owner, budget/spend, expected cash, KPI, thresholds, readings and the computed scale/change/stop decision.",
    parameters: { type: "object", properties: asOfParam },
    run: ({ as_of }, { ds }) => snapshot(ds, as_of).initiatives.map((i) => ({ id: i.id, rank: i.rank, name: i.name, status: i.status, owner: i.owner_name, budget_inr: i.budget_inr, spent_inr: i.spent_inr, expected_cash_inr: i.expected_cash_inr, kpi: i.kpi_name, unit: i.kpi_unit, scale_threshold: i.scale_threshold, stop_threshold: i.stop_threshold, decision_rule: i.decision_rule, readings: i.readings.map((r: any) => ({ date: r.reading_date, value: r.value, note: r.note, simulated: r.is_simulated })), computed_decision: i.decision, open_tasks: i.open_tasks, simulated: i.is_simulated })),
  },
  list_tasks: {
    description: "Tasks with owner, due date, status, priority and links; overdue is relative to the operating date.",
    parameters: { type: "object", properties: { status: { type: "string" }, owner: { type: "string" }, overdue_only: { type: "boolean" } } },
    run: (a, { ds }) => {
      let t = snapshot(ds).tasks;
      if (a.status) t = t.filter((x) => x.status === a.status);
      if (a.owner) t = t.filter((x) => String(x.owner_name ?? "").toLowerCase().includes(String(a.owner).toLowerCase()));
      if (a.overdue_only) t = t.filter((x) => x.overdue);
      return t.map((x) => ({ id: x.id, title: x.title, owner: x.owner_name, due: x.due_date, status: x.status, priority: x.priority, overdue: x.overdue, initiative_id: x.initiative_id, opportunity_id: x.opportunity_id, created_by: x.created_by }));
    },
  },
  get_data_coverage: {
    description: "What the data contains, what is simulated, what is NOT available, data-quality fixes applied and current assumptions. Call this when unsure whether the data can answer a question.",
    parameters: { type: "object", properties: {} },
    run: (_a, { ds }) => { const s = snapshot(ds); return { ...DATA_COVERAGE, data_quality: s.data_quality, assumptions: s.assumptions, operating_date: s.campaign_date, history_window: [s.event.history_start, s.event.history_end] }; },
  },
  get_audit_log: {
    description: "Recent changes made in the app (by users or by the copilot after confirmation).",
    parameters: { type: "object", properties: { limit: { type: "number" } } },
    run: async ({ limit }) => q("select at, actor, action, entity, entity_id, detail from audit_log order by id desc limit $1", [Math.min(limit ?? 20, 50)]),
  },
  calculate: {
    description: "Evaluate an arithmetic expression exactly. Use for any arithmetic not already returned by another tool.",
    parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
    run: ({ expression }) => ({ expression, result: calculate(expression) }),
  },
  propose_action: {
    description: `Propose a change for the user to confirm. Nothing is executed until the user clicks Confirm. action_type is one of: ${Object.entries(ACTIONS).map(([k, v]) => `${k} (${v.describe})`).join("; ")}. Payload fields: update_opportunity{opportunity_id, stage?, proposed_value_inr?, confirmed_value_inr?, owner_name?}; create_opportunity{brand_id, sponsor_campaign_id, support_type?, proposed_value_inr?, owner_name?}; update_brand_qualification{brand_id, status, reason?}; log_interaction{brand_id, sponsor_campaign_id, event_type, outcome?, summary?}; create_task{title, description?, owner_name?, due_date?, priority?, initiative_id?, opportunity_id?, brand_id?}; update_task{id, status?, owner_name?, due_date?, priority?}; update_initiative{id, status?, owner_name?, budget_inr?, spent_inr?, expected_cash_inr?, scale_threshold?, stop_threshold?}; add_kpi_reading{initiative_id, value, reading_date?, note?}; record_payment{opportunity_id, kind, amount_inr, event_date?, due_date?, note?}; add_target_version{qualified_brands_goal, confirmed_partnerships_goal, target_version?}; set_assumptions{collection_rate_confirmed?, stale_days?}. Several related changes = call this tool several times.`,
    parameters: { type: "object", properties: { action_type: { type: "string", enum: Object.keys(ACTIONS).filter((k) => k !== "set_campaign_date") }, payload: { type: "object" }, summary: { type: "string", description: "One line the user will read on the confirm card" }, rationale: { type: "string", description: "The data-backed reason" } }, required: ["action_type", "payload", "summary"] },
    run: async (a, { conversationId }) => {
      if (!ACTIONS[a.action_type]) return { error: "Unknown action_type" };
      const r = await q("insert into pending_actions(conversation_id,action_type,payload,summary,rationale) values ($1,$2,$3,$4,$5) returning id", [conversationId, a.action_type, JSON.stringify(a.payload ?? {}), a.summary, a.rationale ?? null]);
      return { pending_action_id: r[0].id, status: "awaiting_user_confirmation", note: "Tell the user to confirm on the card. Do NOT say it is done." };
    },
  },
};

function systemPrompt(operatingDate: string) {
  return `You are the Growth Analyst & Copilot inside the CampusFest Sponsor Growth Center, used by the sponsorship team.
Operating date ("today"): ${operatingDate} (end of day, Asia/Kolkata). Data history: 15 Jan to 20 Apr 2025. Event: 12-13 Apr 2025. Currency: INR.

RULES
1. Every number you state must come from a tool result in THIS turn or from the calculate tool. Never estimate, recall or invent numbers. If you need arithmetic, call calculate.
2. Ground answers in the app's data, not general marketing knowledge. If the user asks something the data cannot answer (e.g. actual bank receipts, outreach cost, why a deal was lost, sponsor ROI, causal impact), say clearly that the data cannot support it, name what data would be needed, and offer the closest thing the data CAN show. Call get_data_coverage when unsure.
3. Label claims: "Evidence" (source data), "Simulated" (payments ledger, initiatives, KPI readings, seeded tasks) and "Assumption" (collection rate, win-rate extrapolation). Confirmed value is NOT cash collected. Cash collected comes only from the simulated ledger unless rows have is_simulated=false.
4. Populations differ: outreach touches, contacts, responding brands, qualified brands, opportunities and confirmed partnerships are not interchangeable. Say which one you count.
5. When comparing owners, account for channel mix (use expected_wins_given_channel_mix). Do not blame individuals on raw counts. Flag small samples (n < 5) as weak evidence.
6. Time: questions about a past date use as_of. Never let later outcomes leak into earlier dates.
7. Actions: you can only PROPOSE changes with propose_action. Never claim a change was made. After proposing, tell the user to review the confirm card. Propose only when the user asks for an action or agrees to a recommendation, or when offering one concrete next step; keep proposals specific (owner, due date, linked record).
8. Recommendations: say what to scale, change or stop, the data reason, the expected effect, and the main uncertainty.
9. If the question is ambiguous, state the interpretation you used (or ask one short question if interpretations lead to very different answers).
10. Style: lead with the answer in one or two sentences, then short bullets. Format money as Rs with Indian grouping (e.g. Rs 22.4 lakh / Rs 2,24,000). End with a one-line "Sources:" listing the tools you used. Keep it under ~200 words unless asked for detail.`;
}

export async function chat(conversationId: string, history: { role: "user" | "assistant"; content: string }[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { reply: "The copilot is not configured: OPENAI_API_KEY is missing on the server. The dashboard still works.", tools_used: [], pending_actions: [] };
  const client = new OpenAI({ apiKey: key });
  const model = process.env.OPENAI_MODEL || "gpt-5-mini";
  const ds = await loadDataset();
  const ctx = { ds, conversationId };
  const tools = Object.entries(TOOLS).map(([name, t]) => ({ type: "function" as const, function: { name, description: t.description, parameters: t.parameters } }));
  const messages: any[] = [{ role: "system", content: systemPrompt(ds.settings.campaign_date) }, ...history.slice(-16)];
  const toolsUsed: { name: string; args: any }[] = [];
  const pending: number[] = [];
  const last = history.at(-1);
  if (last?.role === "user") await q("insert into chat_messages(conversation_id,role,content) values ($1,'user',$2)", [conversationId, last.content]);

  for (let step = 0; step < 10; step++) {
    const r = await client.chat.completions.create({ model, messages, tools, tool_choice: "auto" });
    const m = r.choices[0].message;
    messages.push(m);
    if (!m.tool_calls?.length) {
      const reply = m.content ?? "";
      await q("insert into chat_messages(conversation_id,role,content,meta) values ($1,'assistant',$2,$3)", [conversationId, reply, JSON.stringify({ tools_used: toolsUsed, pending_actions: pending, model })]);
      const actions = pending.length ? await q("select * from pending_actions where id = any($1::bigint[])", [pending]) : [];
      return { reply, tools_used: toolsUsed, pending_actions: actions };
    }
    for (const tc of m.tool_calls) {
      if (tc.type !== "function") continue;
      let out: any;
      let args: any = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
        const t = TOOLS[tc.function.name];
        out = t ? await t.run(args, ctx) : { error: `Unknown tool ${tc.function.name}` };
        if (tc.function.name === "propose_action" && out?.pending_action_id) pending.push(out.pending_action_id);
      } catch (e: any) {
        out = { error: e.message };
      }
      toolsUsed.push({ name: tc.function.name, args });
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 60000) });
    }
  }
  return { reply: "I could not finish this analysis within the step limit. Try narrowing the question.", tools_used: toolsUsed, pending_actions: [] };
}
