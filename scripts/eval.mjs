// Copilot evaluation suite. Runs against a running app (default http://localhost:3000).
// Usage: npm run eval            (or BASE_URL=https://your-app.vercel.app npm run eval)
// Writes eval-report.md. Expected numbers are read live from /api/snapshot, so the
// suite stays valid when the data changes. NOTE: the "changed data" case edits data and
// then calls /api/reset, which restores the ORIGINAL dataset (all app edits are erased).
const BASE = process.env.BASE_URL || "http://localhost:3000";
const j = async (path, body) => {
  const r = await fetch(BASE + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  return r.json();
};
const has = (t, ...alts) => alts.some((a) => (a instanceof RegExp ? a.test(t) : t.toLowerCase().includes(String(a).toLowerCase())));
const fmtIN = (n) => Number(n).toLocaleString("en-IN");

async function ask(conv, history, question) {
  const messages = [...history, { role: "user", content: question }];
  const r = await j("/api/chat", { conversationId: conv, messages });
  const reply = r.reply ?? `ERROR ${r.error}`;
  return { reply, tools: (r.tools_used ?? []).map((t) => t.name), actions: r.pending_actions ?? [], history: [...messages, { role: "assistant", content: reply }] };
}

const results = [];
function record(name, category, q, out, checks) {
  const failed = checks.filter(([, ok]) => !ok).map(([label]) => label);
  results.push({ name, category, q, reply: out.reply, tools: out.tools, pass: failed.length === 0, failed });
  console.log(`${failed.length ? "FAIL" : "PASS"}  ${name}${failed.length ? "  -> " + failed.join("; ") : ""}`);
}

const s = await j("/api/snapshot");
const k = s.kpis;
const march1 = await j("/api/snapshot?asOf=2025-03-01");
const fnb = s.industries.find((x) => x.industry === "Food and beverage");
const conv = () => "eval-" + Math.random().toString(36).slice(2);

// 1 grounded KPI
let o = await ask(conv(), [], "How many confirmed partnerships do we have and how does that compare with the target?");
record("Confirmed vs target", "grounded numbers", "How many confirmed partnerships…", o, [["mentions " + k.confirmed_partnerships, has(o.reply, String(k.confirmed_partnerships))], ["mentions goal " + s.target.confirmed_partnerships_goal, has(o.reply, String(s.target.confirmed_partnerships_goal))], ["used a tool", o.tools.length > 0]]);

// 2 confirmed is not cash + follow-up
const c2 = conv();
o = await ask(c2, [], "How much cash have we actually collected from sponsors?");
record("Cash collected honesty", "uncertainty", "How much cash have we actually collected?", o, [["flags simulated", has(o.reply, "simulat")], ["says source has no receipts", has(o.reply, "receipt", "bank", "no actual", "not in the source")]]);
const share = Math.round((k.collected_inr_simulated / k.confirmed_cash_value_inr) * 100);
o = await ask(c2, o.history, "And what share of confirmed cash value is that?");
record("Follow-up: share", "follow-up", "And what share of confirmed cash value is that?", o, [[`mentions ~${share}%`, has(o.reply, `${share}%`, `${share} %`, `${(k.collected_inr_simulated / k.confirmed_cash_value_inr * 100).toFixed(1)}%`)]]);

// 3 owner fairness
o = await ask(conv(), [], "Which owner is underperforming?");
record("Owner comparison adjusts for channel mix", "diagnosis", "Which owner is underperforming?", o, [["mentions channel mix", has(o.reply, "channel mix", "mix", "expected")], ["used owner tool", o.tools.includes("get_owner_performance")]]);

// 4 data cannot answer
o = await ask(conv(), [], "Why did Cobalt Learning withdraw after confirming?");
record("Loss reason not in data", "cannot answer", "Why did Cobalt Learning withdraw?", o, [["admits no reason recorded", has(o.reply, "not record", "doesn't record", "does not record", "no reason", "not captured", "isn't recorded", "is not recorded", "cannot tell", "can't tell", "doesn't include", "does not include", "doesn't say", "does not say")]]);
o = await ask(conv(), [], "How much did we spend on LinkedIn outreach and what was the cost per sponsor?");
record("No cost data", "cannot answer", "How much did we spend on LinkedIn outreach…", o, [["admits no spend data", has(o.reply, "no cost", "no spend", "not available", "doesn't contain", "does not contain", "no budget", "isn't in", "is not in", "not in the data", "no data on", "doesn't include", "does not include", "not tracked")]]);
o = await ask(conv(), [], "Did the Beardo activation increase festival attendance?");
record("Causal claim refused", "cannot answer", "Did the Beardo activation increase attendance?", o, [["says association not causal", has(o.reply, "association", "causal", "cannot", "can't")]]);

// 5 time travel
o = await ask(conv(), [], "On 1 March 2025, how many brands were qualified and what was the qualified-brands goal at that time?");
record("Time travel", "grounded numbers", "On 1 March 2025…", o, [[`mentions ${march1.kpis.qualified_brands}`, has(o.reply, String(march1.kpis.qualified_brands))], [`mentions goal ${march1.target.qualified_brands_goal}`, has(o.reply, String(march1.target.qualified_brands_goal))]]);

// 6 calculation
const avg = Math.round(fnb.confirmed_value_inr / fnb.confirmed);
o = await ask(conv(), [], "What's the average confirmed deal size in Food and beverage?");
record("Calculation", "calculation", "Average confirmed deal size in F&B", o, [[`mentions ${fmtIN(avg)} or ${(avg / 1000).toFixed(1)}K`, has(o.reply, fmtIN(avg), avg.toLocaleString("en-US"), `${(avg / 100000).toFixed(2)} lakh`, `${(avg / 1000).toFixed(1)}K`, `${(avg / 1000).toFixed(1)}k`, `${Math.round(avg / 1000)}K`, `${Math.round(avg / 1000)}k`)]]);

// 7 recommendation
o = await ask(conv(), [], "Which channels should we scale and which should we stop? Be specific.");
record("Recommendation", "recommendation", "Which channels to scale/stop", o, [["mentions warm/referral", has(o.reply, "referral", "introduction", "warm", "inbound")], ["mentions stopping cold email", has(o.reply, "email")]]);

// 8 insight to action
const c8 = conv();
o = await ask(c8, [], "Create a high-priority task for Meera Iyer to open a deal with Ripple Pantry, due 2025-04-25.");
record("Proposes task (needs confirmation)", "action", "Create a task for Meera…", o, [["pending action created", o.actions.length > 0 && o.actions[0].action_type === "create_task"], ["does not claim done", !has(o.reply, "has been created", "i created", "i've created", "task created")]]);
if (o.actions[0]) {
  const c = await j("/api/chat/confirm", { id: o.actions[0].id, decision: "confirm" });
  const tasks = (await j("/api/snapshot")).tasks;
  results.push({ name: "Confirm executes and persists", category: "action", q: "(confirm card)", reply: JSON.stringify(c).slice(0, 200), tools: [], pass: c.ok && tasks.some((t) => /ripple/i.test(t.title) && t.created_by === "copilot"), failed: [] });
  console.log(`${results.at(-1).pass ? "PASS" : "FAIL"}  Confirm executes and persists`);
}

// 9 changed data
const target = s.opportunities.find((x) => x.open && x.support_type === "cash");
await j("/api/actions", { type: "update_opportunity", payload: { opportunity_id: target.opportunity_id, stage: "partner_confirmed", confirmed_value_inr: 150000 } });
o = await ask(conv(), [], "How many confirmed partnerships do we have now, and what is the total confirmed value?");
record("Changed data is reflected", "changed data", "After confirming one more deal…", o, [[`mentions ${k.confirmed_partnerships + 1}`, has(o.reply, String(k.confirmed_partnerships + 1))], ["mentions new value", has(o.reply, fmtIN(k.confirmed_value_inr + 150000), `${((k.confirmed_value_inr + 150000) / 100000).toFixed(1)}`)]]);
await j("/api/reset", {});

// report
const pass = results.filter((r) => r.pass).length;
let md = `# Copilot evaluation report\n\nRun: ${new Date().toISOString()} against ${BASE}\n\n**${pass} / ${results.length} passed**\n\n| # | Case | Category | Result | Tools used |\n|---|---|---|---|---|\n`;
results.forEach((r, i) => (md += `| ${i + 1} | ${r.name} | ${r.category} | ${r.pass ? "PASS" : "FAIL: " + r.failed.join("; ")} | ${[...new Set(r.tools)].join(", ")} |\n`));
md += `\n## Transcripts\n\n` + results.map((r, i) => `### ${i + 1}. ${r.name}\n\n**Q:** ${r.q}\n\n${r.reply}\n`).join("\n");
(await import("node:fs")).writeFileSync("eval-report.md", md);
console.log(`\n${pass}/${results.length} passed. Report: eval-report.md`);
