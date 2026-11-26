/**
 * Metrics engine. Pure functions over the raw dataset, so every number in the dashboard and
 * every number the copilot quotes comes from the same deterministic code.
 *
 * Rules applied (from the source pack's Read me):
 *  1. Rows repeated with the same stable ID are import retries: keep the first, count the rest.
 *  2. A selected date means the END of that day in Asia/Kolkata.
 *  3. History tables are full-state versions: use the latest version at or before the snapshot,
 *     never sum history states. Ties on timestamp are broken by load order (_row).
 *  4. Nothing dated after the snapshot leaks into it.
 *  5. Outreach attempts, contacts, responding brands, qualified brands and confirmed partnerships
 *     are different populations and are counted separately.
 *  6. Confirmed value is NOT cash. Cash collected only comes from the payments ledger, which is a
 *     SIMULATED layer (the source pack has no bank receipts).
 */

export type Row = Record<string, any>;
export interface Dataset {
  event: Row; targets: Row[]; brands: Row[]; contacts: Row[]; campaigns: Row[]; interactions: Row[];
  qualHistory: Row[]; opportunities: Row[]; oppHistory: Row[]; activations: Row[]; payments: Row[];
  initiatives: Row[]; kpiReadings: Row[]; tasks: Row[];
  settings: { campaign_date: string; assumptions: { collection_rate_confirmed: number; stale_days: number; payment_terms_days: number; [k: string]: any } };
}

export const OPEN_STAGES = ["prospecting", "contacted", "proposal_sent", "negotiating"];
export const STAGE_ORDER = ["prospecting", "contacted", "proposal_sent", "negotiating", "partner_confirmed"];
export const CLOSED_STAGES = ["partner_confirmed", "lost", "withdrawn"];
export const QUAL_STATUSES = ["unreviewed", "engaged", "qualified", "unqualified", "dormant"];
export const RESPONSE_EVENTS = ["replied", "introduction_received", "web_inbound"];
const DAY = 86400000;

export function endOfDayIST(date: string): Date {
  return new Date(`${date}T23:59:59.999+05:30`);
}
export function istDate(d: Date | string): string {
  const t = typeof d === "string" ? new Date(d) : d;
  return new Date(t.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
}
const ts = (v: any): number => (v instanceof Date ? v.getTime() : new Date(v).getTime());
const dateTs = (d: string) => endOfDayIST(d).getTime();

export function dedupe<T extends Row>(rows: T[], idKey: string): { rows: T[]; removed: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = r[idKey];
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return { rows: out, removed: rows.length - out.length };
}

/** Latest full-state version per entity at or before `asOf`. */
export function latestAsOf<T extends Row>(rows: T[], key: string, tsKey: string, asOf: number): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    const t = ts(r[tsKey]);
    if (t > asOf) continue;
    const cur = m.get(r[key]);
    if (!cur) { m.set(r[key], r); continue; }
    const ct = ts(cur[tsKey]);
    if (t > ct || (t === ct && Number(r._row ?? 0) > Number(cur._row ?? 0))) m.set(r[key], r);
  }
  return m;
}

export const isWarmChannel = (channel?: string) => channel === "introduction" || channel === "web_inbound";

export interface Clean {
  interactions: Row[]; qualHistory: Row[]; oppHistory: Row[]; opportunities: Row[]; brands: Row[];
  contacts: Row[]; activations: Row[]; targets: Row[];
  quality: { table: string; source_rows: number; duplicates_removed: number; app_rows: number }[];
}

export function clean(ds: Dataset): Clean {
  const spec: [keyof Dataset, string, string][] = [
    ["interactions", "interaction_id", "sponsor_interactions"],
    ["qualHistory", "history_id", "brand_qualification_history"],
    ["oppHistory", "history_id", "opportunity_history"],
    ["opportunities", "opportunity_id", "partner_opportunities"],
    ["brands", "brand_id", "brands"],
    ["contacts", "contact_id", "sponsor_contacts"],
    ["activations", "activation_id", "sponsor_activations"],
  ];
  const out: any = { quality: [] };
  for (const [k, id, table] of spec) {
    const rows = ds[k] as Row[];
    const d = dedupe(rows, id);
    out[k] = d.rows;
    out.quality.push({ table, source_rows: rows.filter((r) => r._origin !== "app").length, duplicates_removed: d.removed, app_rows: rows.filter((r) => r._origin === "app").length });
  }
  out.targets = ds.targets;
  return out as Clean;
}

const sum = (a: number[]) => a.reduce((s, x) => s + (Number(x) || 0), 0);
const pct = (n: number, d: number) => (d > 0 ? n / d : null);

export interface OppView {
  opportunity_id: string; opportunity_name: string; brand_id: string; brand_name: string; industry: string | null;
  originating_campaign: string; sponsor_campaign_id: string; channel: string; warm: boolean;
  support_type: string; owner_name: string | null; stage: string; proposed_value_inr: number; confirmed_value_inr: number;
  created_at: string; last_change_date: string; days_since_change: number; stale: boolean; open: boolean;
  stages_reached: string[]; ever_confirmed: boolean; brand_qualification: string | null;
  invoiced_inr: number; collected_inr: number; outstanding_inr: number; win_probability: number | null; history_versions: number;
}

export function snapshot(ds: Dataset, asOfDate?: string) {
  const asOfStr = asOfDate || ds.settings.campaign_date;
  const asOf = dateTs(asOfStr);
  const c = clean(ds);
  const A = ds.settings.assumptions;
  const campaigns = new Map(ds.campaigns.map((x) => [x.sponsor_campaign_id, x]));
  const brandById = new Map(c.brands.map((b) => [b.brand_id, b]));

  const brands = c.brands.filter((b) => !b.created_at || ts(b.created_at) <= asOf);
  const interactions = c.interactions.filter((i) => ts(i.occurred_at) <= asOf);
  const qualLatest = latestAsOf(c.qualHistory, "brand_id", "effective_at", asOf);
  const opps = c.opportunities.filter((o) => ts(o.created_at) <= asOf);
  const ohAsOf = c.oppHistory.filter((h) => ts(h.effective_at) <= asOf);
  const oppLatest = latestAsOf(ohAsOf, "opportunity_id", "effective_at", asOf);
  const payments = ds.payments.filter((p) => dateTs(p.event_date) <= asOf);

  // target version in force
  const targetRows = [...c.targets].filter((t) => ts(t.effective_at) <= asOf).sort((a, b) => ts(a.effective_at) - ts(b.effective_at) || a._row - b._row);
  const target = targetRows.at(-1) ?? null;

  // per-opportunity view
  const stagesByOpp = new Map<string, Row[]>();
  for (const h of ohAsOf) {
    const arr = stagesByOpp.get(h.opportunity_id) ?? [];
    arr.push(h);
    stagesByOpp.set(h.opportunity_id, arr);
  }
  const payByOpp = new Map<string, { inv: number; rec: number }>();
  for (const p of payments) {
    const cur = payByOpp.get(p.opportunity_id) ?? { inv: 0, rec: 0 };
    if (p.kind === "invoice") cur.inv += Number(p.amount_inr); else cur.rec += Number(p.amount_inr);
    payByOpp.set(p.opportunity_id, cur);
  }

  // empirical win probability per channel campaign from CLOSED opportunities as of the snapshot
  const closedByCampaign = new Map<string, { won: number; closed: number }>();
  const closedOverall = { won: 0, closed: 0 };
  for (const o of opps) {
    const l = oppLatest.get(o.opportunity_id);
    if (!l || !CLOSED_STAGES.includes(l.stage)) continue;
    const cur = closedByCampaign.get(o.sponsor_campaign_id) ?? { won: 0, closed: 0 };
    cur.closed++; closedOverall.closed++;
    if (l.stage === "partner_confirmed") { cur.won++; closedOverall.won++; }
    closedByCampaign.set(o.sponsor_campaign_id, cur);
  }

  const event = ds.event;
  const eventStart = ts(event.event_starts_at);
  const eventPassed = asOf >= eventStart;

  const oppViews: OppView[] = opps.map((o) => {
    const l = oppLatest.get(o.opportunity_id);
    const hist = (stagesByOpp.get(o.opportunity_id) ?? []).sort((a, b) => ts(a.effective_at) - ts(b.effective_at) || a._row - b._row);
    const stage = l?.stage ?? "prospecting";
    // last date the STAGE changed (value edits without stage change don't reset the clock)
    let lastChange = hist.length ? ts(hist[0].effective_at) : ts(o.created_at);
    for (let i = 1; i < hist.length; i++) if (hist[i].stage !== hist[i - 1].stage) lastChange = ts(hist[i].effective_at);
    const camp = campaigns.get(o.sponsor_campaign_id);
    const open = OPEN_STAGES.includes(stage);
    const days = Math.max(0, Math.floor((asOf - lastChange) / DAY));
    const pay = payByOpp.get(o.opportunity_id) ?? { inv: 0, rec: 0 };
    const cr = closedByCampaign.get(o.sponsor_campaign_id);
    const confirmedVal = stage === "partner_confirmed" ? Number(l?.confirmed_value_inr ?? 0) : 0;
    let winP: number | null = null;
    if (open) winP = eventPassed ? 0 : cr && cr.closed > 0 ? cr.won / cr.closed : null;
    return {
      opportunity_id: o.opportunity_id, opportunity_name: o.opportunity_name, brand_id: o.brand_id, brand_name: o.brand_name,
      industry: brandById.get(o.brand_id)?.industry ?? null,
      originating_campaign: o.originating_campaign_name, sponsor_campaign_id: o.sponsor_campaign_id,
      channel: camp?.channel ?? "unknown", warm: isWarmChannel(camp?.channel),
      support_type: o.support_type, owner_name: l?.owner_name ?? null, stage,
      proposed_value_inr: Number(l?.proposed_value_inr ?? 0), confirmed_value_inr: confirmedVal,
      created_at: istDate(o.created_at), last_change_date: istDate(new Date(lastChange)), days_since_change: days,
      stale: open && days >= A.stale_days, open,
      stages_reached: [...new Set(hist.map((h) => h.stage))],
      ever_confirmed: hist.some((h) => h.stage === "partner_confirmed"),
      brand_qualification: qualLatest.get(o.brand_id)?.qualification_status ?? null,
      invoiced_inr: pay.inv, collected_inr: pay.rec, outstanding_inr: Math.max(0, (o.support_type === "cash" ? confirmedVal : 0) - pay.rec),
      win_probability: winP, history_versions: hist.length,
    };
  });

  // ---------- brand-level funnel ----------
  const touchedBrands = new Set(interactions.map((i) => i.brand_id));
  const respondedBrands = new Set(interactions.filter((i) => RESPONSE_EVENTS.includes(i.event_type)).map((i) => i.brand_id));
  const meetingBrands = new Set(interactions.filter((i) => i.event_type === "meeting_held").map((i) => i.brand_id));
  const qualCounts: Record<string, number> = Object.fromEntries(QUAL_STATUSES.map((s) => [s, 0]));
  for (const [bid, r] of qualLatest) if (brands.some((b) => b.brand_id === bid)) qualCounts[r.qualification_status] = (qualCounts[r.qualification_status] ?? 0) + 1;
  const reached = (s: string) => oppViews.filter((o) => o.stages_reached.some((x) => STAGE_ORDER.indexOf(x) >= STAGE_ORDER.indexOf(s))).length;
  const confirmed = oppViews.filter((o) => o.stage === "partner_confirmed");
  const confirmedCash = confirmed.filter((o) => o.support_type === "cash");
  const totalInvoiced = sum(payments.filter((p) => p.kind === "invoice").map((p) => p.amount_inr));
  const totalCollected = sum(payments.filter((p) => p.kind === "receipt").map((p) => p.amount_inr));

  const funnel = [
    { step: "Target brands", count: brands.length, unit: "brands", population: "brands created in the target list" },
    { step: "Brands contacted", count: touchedBrands.size, unit: "brands", population: "brands with at least one recorded interaction" },
    { step: "Brands responded", count: respondedBrands.size, unit: "brands", population: "brands with a reply, introduction or inbound form (a response is not qualification)" },
    { step: "Brands with meeting held", count: meetingBrands.size, unit: "brands", population: "brands with a meeting_held interaction" },
    { step: "Qualified brands", count: qualCounts.qualified, unit: "brands", population: "brands whose latest qualification status is qualified" },
    { step: "Opportunities", count: opps.length, unit: "opportunities", population: "partner opportunities created" },
    { step: "Proposal sent", count: reached("proposal_sent"), unit: "opportunities", population: "opportunities that reached proposal_sent or later" },
    { step: "Confirmed partnerships", count: confirmed.length, unit: "opportunities", population: "opportunities whose latest stage is partner_confirmed" },
    { step: "Invoiced (simulated)", count: confirmedCash.filter((o) => o.invoiced_inr > 0).length, unit: "opportunities", population: "confirmed cash deals with an invoice in the simulated ledger", simulated: true },
    { step: "Cash collected (simulated)", count: confirmedCash.filter((o) => o.collected_inr > 0).length, unit: "opportunities", population: "confirmed cash deals with any receipt in the simulated ledger", simulated: true },
  ];

  // ---------- channel table ----------
  const channels = ds.campaigns.map((camp) => {
    const id = camp.sponsor_campaign_id;
    const ints = interactions.filter((i) => i.sponsor_campaign_id === id);
    const ov = oppViews.filter((o) => o.sponsor_campaign_id === id);
    const won = ov.filter((o) => o.stage === "partner_confirmed");
    const closed = ov.filter((o) => CLOSED_STAGES.includes(o.stage));
    const openO = ov.filter((o) => o.open);
    const qualified = [...qualLatest.values()].filter((r) => r.sponsor_campaign_id === id && r.qualification_status === "qualified").length;
    return {
      sponsor_campaign_id: id, campaign_name: camp.campaign_name, channel: camp.channel, warm: isWarmChannel(camp.channel), owner_name: camp.owner_name,
      touches: ints.length, outreach_sent: ints.filter((i) => i.event_type === "outreach_sent").length,
      brands_touched: new Set(ints.map((i) => i.brand_id)).size,
      brands_responded: new Set(ints.filter((i) => RESPONSE_EVENTS.includes(i.event_type)).map((i) => i.brand_id)).size,
      positive_responses: ints.filter((i) => i.outcome === "positive").length,
      brands_meeting_held: new Set(ints.filter((i) => i.event_type === "meeting_held").map((i) => i.brand_id)).size,
      opt_outs: ints.filter((i) => i.event_type === "opt_out").length,
      qualified_brands: qualified,
      opportunities: ov.length, confirmed: won.length, lost: closed.filter((o) => o.stage !== "partner_confirmed").length,
      win_rate_closed: pct(won.length, closed.length), win_rate_all: pct(won.length, ov.length),
      confirmed_value_inr: sum(won.map((o) => o.confirmed_value_inr)),
      confirmed_cash_value_inr: sum(won.filter((o) => o.support_type === "cash").map((o) => o.confirmed_value_inr)),
      open_opportunities: openO.length, open_pipeline_inr: sum(openO.map((o) => o.proposed_value_inr)),
      stale_open: openO.filter((o) => o.stale).length,
      touches_per_win: won.length ? ints.length / won.length : null,
      collected_inr_simulated: sum(ov.map((o) => o.collected_inr)),
    };
  });
  const groupSum = (warm: boolean) => {
    const ch = channels.filter((x) => x.warm === warm);
    const o = sum(ch.map((x) => x.opportunities)), w = sum(ch.map((x) => x.confirmed));
    return { group: warm ? "warm (introductions + inbound)" : "cold (email, LinkedIn, revival)", campaigns: ch.map((x) => x.campaign_name), touches: sum(ch.map((x) => x.touches)), brands_touched: sum(ch.map((x) => x.brands_touched)), opportunities: o, confirmed: w, win_rate_all: pct(w, o), confirmed_value_inr: sum(ch.map((x) => x.confirmed_value_inr)), open_pipeline_inr: sum(ch.map((x) => x.open_pipeline_inr)) };
  };

  // ---------- owner table (with channel-mix adjustment) ----------
  const owners = [...new Set(oppViews.map((o) => o.owner_name).filter(Boolean))] as string[];
  const ownerTable = owners.map((name) => {
    const ov = oppViews.filter((o) => o.owner_name === name);
    const closed = ov.filter((o) => CLOSED_STAGES.includes(o.stage));
    const won = ov.filter((o) => o.stage === "partner_confirmed");
    const expected = sum(closed.map((o) => { const cr = closedByCampaign.get(o.sponsor_campaign_id); return cr && cr.closed ? cr.won / cr.closed : 0; }));
    return {
      owner_name: name, opportunities: ov.length, warm_share: pct(ov.filter((o) => o.warm).length, ov.length),
      confirmed: won.length, closed: closed.length, confirmed_value_inr: sum(won.map((o) => o.confirmed_value_inr)),
      open_pipeline_inr: sum(ov.filter((o) => o.open).map((o) => o.proposed_value_inr)), stale_open: ov.filter((o) => o.stale).length,
      expected_wins_given_channel_mix: Math.round(expected * 10) / 10, wins_vs_expected: Math.round((won.length - expected) * 10) / 10,
    };
  }).sort((a, b) => b.confirmed_value_inr - a.confirmed_value_inr);

  const industries = [...new Set(c.brands.map((b) => b.industry))].map((ind) => {
    const ov = oppViews.filter((o) => o.industry === ind);
    const won = ov.filter((o) => o.stage === "partner_confirmed");
    return { industry: ind, brands: brands.filter((b) => b.industry === ind).length, opportunities: ov.length, confirmed: won.length, win_rate_all: pct(won.length, ov.length), confirmed_value_inr: sum(won.map((o) => o.confirmed_value_inr)), avg_deal_inr: won.length ? Math.round(sum(won.map((o) => o.confirmed_value_inr)) / won.length) : null };
  }).sort((a, b) => b.confirmed_value_inr - a.confirmed_value_inr);

  // ---------- leakage & risk ----------
  const oppBrands = new Set(opps.map((o) => o.brand_id));
  const leakage = [...qualLatest.values()].filter((r) => r.qualification_status === "qualified" && !oppBrands.has(r.brand_id))
    .map((r) => ({ brand_id: r.brand_id, brand_name: r.brand_name, industry: brandById.get(r.brand_id)?.industry ?? null, source_campaign: r.source_campaign_name, qualified_since: istDate(r.effective_at), owner_name: brandById.get(r.brand_id)?.owner_name ?? null }));
  const reneged = oppViews.filter((o) => o.ever_confirmed && o.stage !== "partner_confirmed");

  // ---------- forecast ----------
  const rate = A.collection_rate_confirmed;
  const outstandingConfirmed = sum(confirmedCash.map((o) => o.outstanding_inr));
  const openViews = oppViews.filter((o) => o.open);
  const pipelineExpectedWins = sum(openViews.map((o) => o.win_probability ?? 0));
  const pipelineExpectedCash = sum(openViews.filter((o) => o.support_type === "cash").map((o) => (o.win_probability ?? 0) * o.proposed_value_inr));
  const unknownP = openViews.filter((o) => o.win_probability === null).length;
  const forecast = {
    method: "Collected (simulated ledger) + outstanding confirmed cash x collection-rate assumption + open cash pipeline x channel's empirical closed win rate x collection-rate assumption. Open deals get 0 once the event has started.",
    collection_rate_assumption: rate,
    collected_inr_simulated: totalCollected,
    outstanding_confirmed_cash_inr: outstandingConfirmed,
    expected_from_outstanding_inr: Math.round(outstandingConfirmed * rate),
    open_pipeline_inr: sum(openViews.map((o) => o.proposed_value_inr)),
    open_pipeline_expected_wins: Math.round(pipelineExpectedWins * 10) / 10,
    expected_from_pipeline_inr: Math.round(pipelineExpectedCash * rate),
    open_deals_without_channel_history: unknownP,
    projected_cash_inr: Math.round(totalCollected + outstandingConfirmed * rate + pipelineExpectedCash * rate),
    projected_confirmed_partnerships: Math.round((confirmed.length + pipelineExpectedWins) * 10) / 10,
    channel_win_rates: Object.fromEntries([...closedByCampaign].map(([k, v]) => [campaigns.get(k)?.campaign_name ?? k, { won: v.won, closed: v.closed, rate: v.closed ? v.won / v.closed : null }])),
    event_started: eventPassed,
    days_to_event: Math.ceil((eventStart - asOf) / DAY),
  };

  // ---------- initiatives & tasks ----------
  const today = asOfStr;
  const initiatives = ds.initiatives.map((i): Row => {
    const readings = ds.kpiReadings.filter((r) => r.initiative_id === i.id && r.reading_date <= today);
    const last = readings.at(-1);
    let decision = i.status === "rejected" ? "rejected" : "no data yet";
    if (last && i.scale_threshold != null && i.stop_threshold != null) {
      const v = Number(last.value), hi = Number(i.scale_threshold), lo = Number(i.stop_threshold);
      const better = i.direction !== "lower_is_better";
      decision = better ? (v >= hi ? "scale" : v < lo ? "stop" : "change") : (v <= hi ? "scale" : v > lo ? "stop" : "change");
    }
    const tasks = ds.tasks.filter((t) => t.initiative_id === i.id);
    return { ...i, latest_reading: last ?? null, readings, decision, open_tasks: tasks.filter((t) => t.status !== "done").length, budget_remaining_inr: Number(i.budget_inr) - Number(i.spent_inr) };
  });
  const tasks = ds.tasks.map((t): Row => ({ ...t, overdue: t.status !== "done" && t.due_date && t.due_date < today }));

  return {
    as_of: asOfStr, campaign_date: ds.settings.campaign_date,
    event: { name: event.event_name, starts: istDate(event.event_starts_at), ends: istDate(event.event_ends_at), history_start: event.history_start, history_end: event.history_end },
    target: target ? { version: target.target_version, effective: istDate(target.effective_at), qualified_brands_goal: target.qualified_brands_goal, confirmed_partnerships_goal: target.confirmed_partnerships_goal } : null,
    target_history: c.targets.map((t) => ({ version: t.target_version, effective: istDate(t.effective_at), qualified_brands_goal: t.qualified_brands_goal, confirmed_partnerships_goal: t.confirmed_partnerships_goal, origin: t._origin })),
    kpis: {
      qualified_brands: qualCounts.qualified,
      confirmed_partnerships: confirmed.length,
      confirmed_value_inr: sum(confirmed.map((o) => o.confirmed_value_inr)),
      confirmed_cash_value_inr: sum(confirmedCash.map((o) => o.confirmed_value_inr)),
      confirmed_in_kind_value_inr: sum(confirmed.filter((o) => o.support_type !== "cash").map((o) => o.confirmed_value_inr)),
      avg_confirmed_deal_inr: confirmed.length ? Math.round(sum(confirmed.map((o) => o.confirmed_value_inr)) / confirmed.length) : null,
      invoiced_inr_simulated: totalInvoiced, collected_inr_simulated: totalCollected,
      collected_share_of_confirmed_cash: pct(totalCollected, sum(confirmedCash.map((o) => o.confirmed_value_inr))),
      open_opportunities: openViews.length, open_pipeline_inr: forecast.open_pipeline_inr,
      stale_open_opportunities: openViews.filter((o) => o.stale).length,
      qualified_without_opportunity: leakage.length,
      reneged_after_confirmation: reneged.length,
    },
    qualification_counts: qualCounts,
    funnel, channels, channel_groups: [groupSum(true), groupSum(false)], owners: ownerTable, industries,
    opportunities: oppViews, leakage, reneged: reneged.map((o) => ({ opportunity_id: o.opportunity_id, brand_name: o.brand_name, stage: o.stage, originating_campaign: o.originating_campaign })),
    forecast, initiatives, tasks,
    data_quality: c.quality,
    activations: c.activations.filter((a) => ts(a.linked_at) <= asOf).map((a) => ({ brand_name: a.brand_name, opportunity_id: a.opportunity_id, attendee_campaign: a.attendee_campaign_name, linked_at: istDate(a.linked_at), note: a.activation_note })),
    assumptions: A,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;

/** Weekly trend: re-runs the snapshot at each week end so no later outcome leaks backwards. */
export function trend(ds: Dataset, upTo?: string) {
  const end = upTo || ds.settings.campaign_date;
  const out: { week_ending: string; qualified: number; confirmed: number; confirmed_value_inr: number; collected_inr: number; goal_confirmed: number | null; goal_qualified: number | null }[] = [];
  let d = new Date(`${ds.event.history_start}T12:00:00Z`);
  while (d.getUTCDay() !== 0) d = new Date(d.getTime() + DAY);
  const push = (s: string) => {
    const snap = snapshot(ds, s);
    out.push({ week_ending: s, qualified: snap.kpis.qualified_brands, confirmed: snap.kpis.confirmed_partnerships, confirmed_value_inr: snap.kpis.confirmed_value_inr, collected_inr: snap.kpis.collected_inr_simulated, goal_confirmed: snap.target?.confirmed_partnerships_goal ?? null, goal_qualified: snap.target?.qualified_brands_goal ?? null });
  };
  while (d.toISOString().slice(0, 10) < end) { push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 7 * DAY); }
  push(end);
  return out;
}

/** What the data can and cannot answer. Used by the copilot to stay honest. */
export const DATA_COVERAGE = {
  available: [
    "180 target brands with industry and owner",
    "270 sponsor contacts with job titles (Partnerships Manager, Brand Marketing Lead)",
    "6 sponsor acquisition campaigns and every recorded interaction (outreach, delivery, replies, meetings, opt-outs) with timestamps",
    "Brand qualification history (unreviewed, engaged, qualified, unqualified, dormant) with reasons",
    "58 partner opportunities with full stage history, proposed and confirmed INR value, owner, cash vs in-kind",
    "Two target versions (launch plan 15 Jan, revised plan 15 Mar) for qualified brands and confirmed partnerships",
    "3 sponsor activations linked to attendee campaigns (association only)",
  ],
  simulated: [
    "Payments ledger (invoices and receipts): the source pack has NO bank receipts, so all cash-collected figures are simulated",
    "Initiatives (the five growth bets), their budgets, KPI thresholds and KPI readings",
    "Seeded tasks",
  ],
  not_available: [
    "Actual cash received or bank receipts in the source data",
    "Outreach cost, team hours or acquisition spend for sponsor campaigns (no budget data in the source)",
    "Reasons why deals were lost or withdrawn (only the stage is recorded)",
    "Sponsor satisfaction, renewal intent or post-event ROI",
    "Causal impact of sponsor activations on attendance (the link is an association only)",
    "Brand size, revenue or marketing budget",
    "Any data after 20 April 2025 except what users add in the app",
  ],
};
