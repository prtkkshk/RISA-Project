/**
 * Every write in the app goes through here — the UI and the copilot share the same code path,
 * the same validation and the same audit log.
 *
 * History tables are append-only: a stage change adds a new full-state version (like the source
 * data does) instead of overwriting, so time-travel snapshots stay correct.
 * New versions are stamped at 23:00 IST on the app's campaign date (the "operating clock").
 */
import { pool, q } from "./db";
import { OPEN_STAGES, CLOSED_STAGES, QUAL_STATUSES } from "./engine";
import fs from "node:fs";
import path from "node:path";

export type Actor = "user" | "copilot";
const STAGES = [...OPEN_STAGES, ...CLOSED_STAGES];
const TASK_STATUS = ["todo", "in_progress", "blocked", "done"];
const PRIORITY = ["low", "medium", "high"];
const INIT_STATUS = ["planned", "testing", "scaling", "changed", "stopped", "rejected", "done"];

class ActionError extends Error {}
const fail = (m: string): never => { throw new ActionError(m); };
const need = (v: any, name: string) => (v === undefined || v === null || v === "" ? fail(`${name} is required`) : v);
const isDate = (s: any) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const money = (v: any, name: string) => { const n = Number(v); if (!Number.isFinite(n) || n < 0) fail(`${name} must be a non-negative number`); return Math.round(n); };

async function clock(): Promise<string> {
  const r = await q<{ value: string }>("select value from app_settings where key='campaign_date'");
  return (r[0]?.value as any) ?? "2025-04-20";
}
const stamp = (d: string) => `${d}T23:00:00+05:30`;

async function audit(actor: Actor | "system", action: string, entity: string, entity_id: string | null, detail: any) {
  await q("insert into audit_log(actor,action,entity,entity_id,detail) values ($1,$2,$3,$4,$5)", [actor, action, entity, entity_id, JSON.stringify(detail)]);
}

async function nextId(prefix: string, table: string, col: string) {
  const r = await q<{ n: number }>(`select count(*)::int as n from ${table} where ${col} like $1`, [`${prefix}%`]);
  return `${prefix}${String(r[0].n + 1).padStart(3, "0")}`;
}

export const ACTIONS: Record<string, { describe: string; run: (p: any, actor: Actor) => Promise<any> }> = {
  update_opportunity: {
    describe: "Change an opportunity's stage, proposed value, confirmed value or owner (appends a new history version).",
    async run(p, actor) {
      const id = need(p.opportunity_id, "opportunity_id");
      const cur = (await q("select * from opportunity_history where opportunity_id=$1 order by effective_at desc, _row desc limit 1", [id]))[0];
      if (!cur) fail(`Opportunity ${id} not found`);
      const stage = p.stage ?? cur.stage;
      if (!STAGES.includes(stage)) fail(`stage must be one of ${STAGES.join(", ")}`);
      const proposed = p.proposed_value_inr !== undefined ? money(p.proposed_value_inr, "proposed_value_inr") : Number(cur.proposed_value_inr);
      let confirmed = p.confirmed_value_inr !== undefined ? money(p.confirmed_value_inr, "confirmed_value_inr") : stage === "partner_confirmed" ? (Number(cur.confirmed_value_inr) || proposed) : 0;
      if (stage !== "partner_confirmed") confirmed = 0;
      const owner = p.owner_name ?? cur.owner_name;
      const hid = await nextId("OH-APP-", "opportunity_history", "history_id");
      const d = await clock();
      await q(`insert into opportunity_history(_origin,opportunity_name,brand_name,stage,proposed_value_inr,confirmed_value_inr,owner_name,effective_at,history_id,opportunity_id,brand_id,owner_id)
               values ('app',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [cur.opportunity_name, cur.brand_name, stage, proposed, confirmed, owner, stamp(d), hid, id, cur.brand_id, cur.owner_id]);
      const after = { stage, proposed_value_inr: proposed, confirmed_value_inr: confirmed, owner_name: owner };
      await audit(actor, "update_opportunity", "opportunity", id, { before: { stage: cur.stage, proposed_value_inr: cur.proposed_value_inr, confirmed_value_inr: cur.confirmed_value_inr, owner_name: cur.owner_name }, after, effective_date: d, note: p.note });
      return { ok: true, opportunity_id: id, history_id: hid, effective_date: d, ...after };
    },
  },
  create_opportunity: {
    describe: "Create a new partner opportunity for an existing brand.",
    async run(p, actor) {
      const brand = (await q("select * from brands where brand_id=$1 limit 1", [need(p.brand_id, "brand_id")]))[0] ?? fail(`Brand ${p.brand_id} not found`);
      const camp = (await q("select * from sponsor_campaigns where sponsor_campaign_id=$1 limit 1", [need(p.sponsor_campaign_id, "sponsor_campaign_id")]))[0] ?? fail(`Campaign ${p.sponsor_campaign_id} not found`);
      const support = p.support_type ?? "cash";
      if (!["cash", "in_kind"].includes(support)) fail("support_type must be cash or in_kind");
      const proposed = money(p.proposed_value_inr ?? 0, "proposed_value_inr");
      const contact = (await q("select * from sponsor_contacts where brand_id=$1 order by _row limit 1", [brand.brand_id]))[0];
      const oid = await nextId("O-APP-", "partner_opportunities", "opportunity_id");
      const d = await clock();
      const name = `${brand.brand_name} festival partnership`;
      await q(`insert into partner_opportunities(_origin,opportunity_name,brand_name,primary_contact_name,originating_campaign_name,support_type,created_at,opportunity_id,brand_id,primary_contact_id,sponsor_campaign_id)
               values ('app',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [name, brand.brand_name, contact?.contact_name ?? null, camp.campaign_name, support, stamp(d), oid, brand.brand_id, contact?.contact_id ?? null, camp.sponsor_campaign_id]);
      const hid = await nextId("OH-APP-", "opportunity_history", "history_id");
      await q(`insert into opportunity_history(_origin,opportunity_name,brand_name,stage,proposed_value_inr,confirmed_value_inr,owner_name,effective_at,history_id,opportunity_id,brand_id)
               values ('app',$1,$2,'prospecting',$3,0,$4,$5,$6,$7,$8)`, [name, brand.brand_name, proposed, p.owner_name ?? brand.owner_name, stamp(d), hid, oid, brand.brand_id]);
      await audit(actor, "create_opportunity", "opportunity", oid, { brand: brand.brand_name, campaign: camp.campaign_name, proposed, support });
      return { ok: true, opportunity_id: oid, opportunity_name: name, effective_date: d };
    },
  },
  update_brand_qualification: {
    describe: "Set a brand's qualification status (appends a new qualification version).",
    async run(p, actor) {
      const cur = (await q("select * from brand_qualification_history where brand_id=$1 order by effective_at desc, _row desc limit 1", [need(p.brand_id, "brand_id")]))[0] ?? fail(`Brand ${p.brand_id} has no qualification history`);
      const status = need(p.status, "status");
      if (!QUAL_STATUSES.includes(status)) fail(`status must be one of ${QUAL_STATUSES.join(", ")}`);
      const hid = await nextId("BQ-APP-", "brand_qualification_history", "history_id");
      const d = await clock();
      await q(`insert into brand_qualification_history(_origin,brand_name,qualification_status,reason,source_campaign_name,effective_at,history_id,brand_id,sponsor_campaign_id)
               values ('app',$1,$2,$3,$4,$5,$6,$7,$8)`, [cur.brand_name, status, p.reason ?? "Updated in Growth Center", cur.source_campaign_name, stamp(d), hid, cur.brand_id, cur.sponsor_campaign_id]);
      await audit(actor, "update_brand_qualification", "brand", cur.brand_id, { before: cur.qualification_status, after: status, reason: p.reason });
      return { ok: true, brand_id: cur.brand_id, brand_name: cur.brand_name, status, effective_date: d };
    },
  },
  log_interaction: {
    describe: "Record an outreach interaction (outreach_sent, replied, meeting_booked, meeting_held, opt_out...).",
    async run(p, actor) {
      const brand = (await q("select * from brands where brand_id=$1 limit 1", [need(p.brand_id, "brand_id")]))[0] ?? fail("Brand not found");
      const camp = (await q("select * from sponsor_campaigns where sponsor_campaign_id=$1 limit 1", [need(p.sponsor_campaign_id, "sponsor_campaign_id")]))[0] ?? fail("Campaign not found");
      const types = ["outreach_sent", "delivered", "replied", "meeting_booked", "meeting_held", "introduction_received", "web_inbound", "opt_out"];
      if (!types.includes(p.event_type)) fail(`event_type must be one of ${types.join(", ")}`);
      const contact = (await q("select * from sponsor_contacts where brand_id=$1 order by _row limit 1", [brand.brand_id]))[0];
      const iid = await nextId("SI-APP-", "sponsor_interactions", "interaction_id");
      const d = await clock();
      await q(`insert into sponsor_interactions(_origin,brand_name,contact_name,campaign_name,channel,event_type,outcome,summary,occurred_at,interaction_id,brand_id,contact_id,sponsor_campaign_id,owner_id)
               values ('app',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, [brand.brand_name, contact?.contact_name ?? null, camp.campaign_name, camp.channel, p.event_type, p.outcome ?? null, p.summary ?? "Logged in Growth Center", stamp(d), iid, brand.brand_id, contact?.contact_id ?? null, camp.sponsor_campaign_id, camp.owner_id]);
      await audit(actor, "log_interaction", "interaction", iid, { brand: brand.brand_name, campaign: camp.campaign_name, event_type: p.event_type });
      return { ok: true, interaction_id: iid, effective_date: d };
    },
  },
  create_task: {
    describe: "Create a task with an owner and due date, optionally linked to an initiative, opportunity or brand.",
    async run(p, actor) {
      const title = need(p.title, "title");
      if (p.due_date && !isDate(p.due_date)) fail("due_date must be YYYY-MM-DD");
      if (p.priority && !PRIORITY.includes(p.priority)) fail(`priority must be one of ${PRIORITY.join(", ")}`);
      const r = await q(`insert into tasks(title,description,owner_name,due_date,status,priority,initiative_id,opportunity_id,brand_id,created_by)
                         values ($1,$2,$3,$4,'todo',$5,$6,$7,$8,$9) returning *`, [title, p.description ?? null, p.owner_name ?? null, p.due_date ?? null, p.priority ?? "medium", p.initiative_id ?? null, p.opportunity_id ?? null, p.brand_id ?? null, actor]);
      await audit(actor, "create_task", "task", String(r[0].id), { title, owner: p.owner_name, due: p.due_date });
      return { ok: true, task: r[0] };
    },
  },
  update_task: {
    describe: "Update a task's status, owner, due date, priority, title or description.",
    async run(p, actor) {
      const cur = (await q("select * from tasks where id=$1", [need(p.id, "id")]))[0] ?? fail(`Task ${p.id} not found`);
      if (p.status && !TASK_STATUS.includes(p.status)) fail(`status must be one of ${TASK_STATUS.join(", ")}`);
      if (p.due_date && !isDate(p.due_date)) fail("due_date must be YYYY-MM-DD");
      const n = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== undefined && ["title", "description", "owner_name", "due_date", "status", "priority"].includes(k))) };
      const r = await q(`update tasks set title=$2,description=$3,owner_name=$4,due_date=$5,status=$6,priority=$7,updated_at=now() where id=$1 returning *`, [cur.id, n.title, n.description, n.owner_name, n.due_date, n.status, n.priority]);
      await audit(actor, "update_task", "task", String(cur.id), { before: { status: cur.status, owner: cur.owner_name, due: cur.due_date }, after: { status: n.status, owner: n.owner_name, due: n.due_date } });
      return { ok: true, task: r[0] };
    },
  },
  delete_task: {
    describe: "Delete a task.",
    async run(p, actor) {
      const r = await q("delete from tasks where id=$1 returning *", [need(p.id, "id")]);
      if (!r.length) fail("Task not found");
      await audit(actor, "delete_task", "task", String(p.id), { title: r[0].title });
      return { ok: true };
    },
  },
  update_initiative: {
    describe: "Update a growth initiative's status, owner, budget, spend, expected cash or KPI thresholds.",
    async run(p, actor) {
      const cur = (await q("select * from initiatives where id=$1", [need(p.id, "id")]))[0] ?? fail(`Initiative ${p.id} not found`);
      if (p.status && !INIT_STATUS.includes(p.status)) fail(`status must be one of ${INIT_STATUS.join(", ")}`);
      const f = ["status", "owner_name", "budget_inr", "spent_inr", "expected_cash_inr", "scale_threshold", "stop_threshold", "decision_rule", "rank"];
      const n: any = { ...cur };
      for (const k of f) if (p[k] !== undefined) n[k] = ["budget_inr", "spent_inr", "expected_cash_inr"].includes(k) ? money(p[k], k) : p[k];
      const r = await q(`update initiatives set status=$2,owner_name=$3,budget_inr=$4,spent_inr=$5,expected_cash_inr=$6,scale_threshold=$7,stop_threshold=$8,decision_rule=$9,rank=$10,updated_at=now() where id=$1 returning *`,
        [cur.id, n.status, n.owner_name, n.budget_inr, n.spent_inr, n.expected_cash_inr, n.scale_threshold, n.stop_threshold, n.decision_rule, n.rank]);
      await audit(actor, "update_initiative", "initiative", String(cur.id), { name: cur.name, before: Object.fromEntries(f.map((k) => [k, cur[k]])), after: Object.fromEntries(f.map((k) => [k, n[k]])) });
      return { ok: true, initiative: r[0] };
    },
  },
  add_kpi_reading: {
    describe: "Record a new KPI reading for an initiative (drives scale / change / stop).",
    async run(p, actor) {
      const init = (await q("select * from initiatives where id=$1", [need(p.initiative_id, "initiative_id")]))[0] ?? fail("Initiative not found");
      const d = p.reading_date ?? (await clock());
      if (!isDate(d)) fail("reading_date must be YYYY-MM-DD");
      const v = Number(need(p.value, "value"));
      if (!Number.isFinite(v)) fail("value must be a number");
      const r = await q("insert into kpi_readings(initiative_id,reading_date,value,note,is_simulated) values ($1,$2,$3,$4,false) returning *", [init.id, d, v, p.note ?? null]);
      await audit(actor, "add_kpi_reading", "initiative", String(init.id), { name: init.name, value: v, date: d });
      return { ok: true, reading: r[0] };
    },
  },
  record_payment: {
    describe: "Record an invoice or a cash receipt against an opportunity.",
    async run(p, actor) {
      const opp = (await q("select * from partner_opportunities where opportunity_id=$1 limit 1", [need(p.opportunity_id, "opportunity_id")]))[0] ?? fail("Opportunity not found");
      if (!["invoice", "receipt"].includes(p.kind)) fail("kind must be invoice or receipt");
      const amt = money(need(p.amount_inr, "amount_inr"), "amount_inr");
      if (amt === 0) fail("amount_inr must be greater than 0");
      const d = p.event_date ?? (await clock());
      if (!isDate(d)) fail("event_date must be YYYY-MM-DD");
      const r = await q("insert into payments(opportunity_id,kind,amount_inr,event_date,due_date,note,is_simulated,created_by) values ($1,$2,$3,$4,$5,$6,false,$7) returning *", [opp.opportunity_id, p.kind, amt, d, p.due_date ?? null, p.note ?? null, actor]);
      await audit(actor, "record_payment", "payment", String(r[0].id), { opportunity: opp.opportunity_name, kind: p.kind, amount: amt });
      return { ok: true, payment: r[0] };
    },
  },
  add_target_version: {
    describe: "Add a new target version (goals for qualified brands and confirmed partnerships).",
    async run(p, actor) {
      const qb = Number(need(p.qualified_brands_goal, "qualified_brands_goal")), cp = Number(need(p.confirmed_partnerships_goal, "confirmed_partnerships_goal"));
      if (!(qb >= 0 && cp >= 0)) fail("goals must be non-negative numbers");
      const d = await clock();
      await q("insert into targets(_origin,effective_at,qualified_brands_goal,confirmed_partnerships_goal,target_version) values ('app',$1,$2,$3,$4)", [stamp(d), qb, cp, p.target_version ?? `Plan updated ${d}`]);
      await audit(actor, "add_target_version", "targets", null, { qb, cp, effective_date: d });
      return { ok: true, effective_date: d };
    },
  },
  set_campaign_date: {
    describe: "Move the operating clock (the 'today' used for snapshots and for stamping new records).",
    async run(p, actor) {
      if (!isDate(p.date)) fail("date must be YYYY-MM-DD");
      await q("insert into app_settings(key,value) values ('campaign_date',$1::jsonb) on conflict (key) do update set value=excluded.value, updated_at=now()", [JSON.stringify(p.date)]);
      await audit(actor, "set_campaign_date", "settings", "campaign_date", { date: p.date });
      return { ok: true, campaign_date: p.date };
    },
  },
  set_assumptions: {
    describe: "Change forecast assumptions (collection_rate_confirmed 0-1, stale_days).",
    async run(p, actor) {
      const cur = (await q<{ value: any }>("select value from app_settings where key='assumptions'"))[0]?.value ?? {};
      const n = { ...cur };
      if (p.collection_rate_confirmed !== undefined) { const v = Number(p.collection_rate_confirmed); if (!(v >= 0 && v <= 1)) fail("collection_rate_confirmed must be between 0 and 1"); n.collection_rate_confirmed = v; }
      if (p.stale_days !== undefined) { const v = Number(p.stale_days); if (!(v >= 1 && v <= 90)) fail("stale_days must be 1-90"); n.stale_days = v; }
      await q("insert into app_settings(key,value) values ('assumptions',$1::jsonb) on conflict (key) do update set value=excluded.value, updated_at=now()", [JSON.stringify(n)]);
      await audit(actor, "set_assumptions", "settings", "assumptions", { before: cur, after: n });
      return { ok: true, assumptions: n };
    },
  },
};

export async function runAction(type: string, payload: any, actor: Actor) {
  const a = ACTIONS[type];
  if (!a) throw new ActionError(`Unknown action ${type}`);
  return a.run(payload ?? {}, actor);
}
export { ActionError };

export async function resetDatabase() {
  const dir = path.join(process.cwd(), "db");
  const schema = fs.readFileSync(path.join(dir, "schema.sql"), "utf8");
  const seed = fs.readFileSync(path.join(dir, "seed.sql"), "utf8");
  const c = await pool().connect();
  try { await c.query(schema); await c.query(seed); } finally { c.release(); }
  await audit("user", "reset_database", "database", null, { note: "Restored the original source dataset and the simulated app layer" });
}
