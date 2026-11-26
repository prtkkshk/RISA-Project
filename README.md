# Sponsor Growth Center

**Challenge B: Sponsorship growth.** A command center for collecting the most sponsorship cash before a Bengaluru college festival, with an embedded AI Growth Analyst that works on the app's live data.

> **Thesis.** Sponsorship runs on trust, and a promise is not cash. In the source data, warm channels (creator referrals, the inbound form, warm introductions) produced **24 of 24 lasting confirmed partnerships**. Cold email, LinkedIn and revival produced **0 from 33 opportunities**. **₹2.4L of the ₹22.4L "confirmed" value is in-kind**, and **no bank receipts exist**. So the strategy is to build a warm-introduction engine and sign deals on cash-first terms. The product therefore tracks **cash collected**, not promises.

---

## 1. What's in the product

| Area | What it does | Where |
|---|---|---|
| **Measure** | Full funnel from brands → contacted → responded → met → qualified → opportunities → proposal → confirmed → invoiced → **cash collected**. Targets vs actuals use the target version in force. KPIs, forecast and a weekly trend. | Overview |
| **Diagnose** | Channel table (touches, brands, responses, meetings, qualified, opps, wins, win rate, touches per win, open and stale pipeline), owners **adjusted for channel mix**, industries. Rule-based alerts: target gap, cold channels with 0 wins, stale deals, qualified brands with no deal, uncollected cash, post-confirmation withdrawal, stop signals, overdue tasks. | Overview, Channels |
| **Decide** | Five ranked growth bets, each with a KPI, **pre-set scale / change / stop thresholds** and a decision computed from the latest reading. Rejected ideas are shown explicitly. A what-if forecast is available through the copilot. | Execution |
| **Manage** | Edit deal stage, value and owner. Create deals from leakage. Log interactions, record invoices and receipts, manage tasks (owner, due date, priority, links), update initiatives and record KPI readings, add target versions, change assumptions. **Every edit updates all analytics immediately and is written to the audit log.** | Pipeline, Execution, Data |
| **AI copilot** | Tool-calling LLM over the same metrics engine. It cites the data it used, labels evidence, simulated data and assumptions, says when the data can't answer, handles follow-ups and **proposes** actions that a human confirms or edits on a card. | Right-hand panel, plus "Ask analyst" buttons on alerts and initiatives |
| **Time travel** | A "Snapshot as of" date picker re-computes every view at the end of that day (IST), with no leakage from later records. | Header |
| **Reset** | Restores the original dataset in one click, so reviewers can change data freely. | Data & Assumptions |

## 2. Data handling (the rules the source pack sets, and how they're applied)

| Rule in the source "Read me" | Implementation (`lib/engine.ts`) |
|---|---|
| Rows repeated with the same stable ID are import retries | Original rows are stored **untouched**. The engine keeps the first row per ID at read time (3 interactions, 1 qualification version and 2 opportunity versions are removed). These counts are shown on the Data page. |
| A selected date means the end of that day in Asia/Kolkata | `endOfDayIST(date)` = `date T23:59:59.999+05:30` |
| Use the latest full-state version; never sum history states | `latestAsOf()` picks the latest version at or before the snapshot. Ties are broken by load order. |
| No later outcome in an earlier snapshot | Every table is filtered by its timestamp before aggregation. The weekly trend re-runs a full snapshot each week. |
| Outreach, contacts, responding brands, qualified brands and confirmed partnerships are different populations | Each funnel step states its population. Brand steps count distinct brands and deal steps count opportunities. |
| A positive reply is not qualification or a partnership | "Responded" and "Qualified" are separate steps. Qualification uses the latest qualification status only. |
| Partnership value is not proof of bank receipt | Cash collected comes **only** from the payments ledger, which is **simulated** (flagged `is_simulated`). User-entered receipts are flagged as real. |
| Activations are associations, not causal uplift | Shown as associations. The copilot refuses causal claims. |

App writes follow the same model. A stage change **appends** a new history version (`_origin='app'`) stamped at 23:00 IST on the app's **operating date** (default 2025-04-20, the end of the source history, and changeable on the Data page). Time travel therefore stays correct after edits.

**Warm vs cold** is derived from the campaign's `channel` field: `introduction` and `web_inbound` are warm, and `email` and `linkedin` are cold.

## 3. Verified numbers (source data, as of 2025-04-20)

These were computed independently in pandas before the app was built, then asserted in `tests/engine.test.ts`.

| Metric | Value |
|---|---|
| Qualified brands (latest status) | 60 vs goal 55 (revised plan, 15 Mar) |
| Confirmed partnerships | 24 vs goal 28 |
| Confirmed value | ₹22.4L (₹20.0L cash, ₹2.4L in-kind); average ₹93,333 |
| Warm channels | 25 opportunities, 24 confirmed |
| Cold channels | 33 opportunities, 0 confirmed. 1 LinkedIn deal (Cobalt Learning, ₹80K) was confirmed on 25 Feb and **withdrew** on 20 Mar |
| Open pipeline | 26 deals, ₹14.4L, **all cold and all stale** (no stage change after 30 Mar) |
| Leakage | 18 brands are qualified but have no opportunity |
| Owners | Raw: Riya 10 wins (₹10.75L), Nisha 9, Meera 5. **After adjusting for channel mix, each owner is within 1 win of expectation.** The gap comes from the channels each owner was given, not from skill |

## 4. Strategy model (Slide 1)

`analysis/target_model.py` holds the reproducible calculation. Every rate is anchored to the source warm channels (24 wins from 44 warm brands, 54.5% per brand touched).

The formula is: cash collected = Σ(sourced warm brands × win rate) × average deal × cash share × collection rate before festival day, plus the anchor deal.

| Source | Base brands × win | Stretch brands × win |
|---|---|---|
| Partner referrals (sponsor-gets-sponsor) | 24 × 45% | 36 × 50% |
| Creator and community referrals | 19 × 50% | 25 × 55% |
| Inbound partner form | 17 × 50% | 22 × 55% |
| Alumni warm intros | 8 × 50% | 12 × 55% |
| Leakage rescue | 18 × 25% | 18 × 35% |
| Average deal / cash share / collection | ₹93K / 89% / 80% | ₹1.05L / 95% / 90% |
| Anchor tender | – | 1 × ₹8L |
| **Deals / confirmed / cash collected** | **37 / ₹34.7L / ₹24.7L** | **58 / ₹67.6L / ₹58.1L** |

**Capacity check.** The same 3-person team handled 58 opportunities in the source period while spending 82% of its touches (782 of 950) on cold channels that produced nothing. The stretch case needs about the same number of deals, with that effort moved to warm channels.

**Sensitivity.** In the base case, ±20% on any single driver moves cash between about ₹19.6L and ₹29.8L. Warm intro volume is the driver we can control most directly, so it gets bet #1 and the first leading indicator.

## 5. Prioritisation framework

The framework is **expected cash per team-hour × confidence**. The binding constraint is three owners' time, not budget (the total test budget is ₹1.25L). Confidence is high when the bet repeats a pattern proven in the source data and low when it's new.

| Rank | Bet | Evidence | Expected collected cash | Budget | KPI and thresholds |
|---|---|---|---|---|---|
| 1 | Sponsor-gets-sponsor referral engine | Warm won 24 of 25 | ₹7.2L (base) | ₹40K | Intro-to-meeting within 7 days: scale ≥50%, stop <25% |
| 2 | Cash-first deal terms (50% advance, invoice at signing, T-21 checkpoint) | 1 of 25 confirmations reneged; confirmed ≠ cash | ₹3.1L (collection 80→90%) | ₹30K | % of confirmed value with an advance: scale ≥60%, stop <30% |
| 3 | Rescue leaked and stalled demand | 18 qualified with no deal; ₹14.4L stale | ₹3.0L | ₹10K | % rescued with a meeting in 10 days: scale ≥40%, stop <15% |
| 4 | Proof-based packages using attendee outcomes | Average deal ₹93K; 3 activations link to attendee campaigns | ₹3.5L (average deal +13%) | ₹25K | Average proposal value: scale ≥₹1.1L, stop <₹85K |
| 5 | Category-exclusive anchor tender | Food and beverage, and mobility, win most | ₹7.2L (stretch only, high variance) | ₹20K | Bids by deadline: scale ≥3, stop <2 |
| ✕ | Scale cold email | 507 touches, 91 brands, 0 wins | – | – | Rejected |
| ✕ | Cold LinkedIn | 12 opportunities, 0 lasting wins | – | – | Rejected |
| ✕ | Count in-kind toward cash | Not cash | – | – | Rejected |

## 6. The AI copilot

- **Model.** OpenAI Chat Completions with function calling (`OPENAI_MODEL`, default `gpt-5-mini`). The key stays on the server only.
- **Grounding.** There are 17 tools (`lib/copilot.ts`) running the same engine as the dashboard: overview, channels, owners, industries, filtered deal lists, deal and brand detail with full history, leakage, trend, snapshot comparison, what-if forecast, initiatives, tasks, data coverage, audit log, a safe calculator, and `propose_action`. No answers are hardcoded.
- **Honesty.** The `get_data_coverage` tool lists what's available, what's simulated and what's **not available**: bank receipts, outreach cost, loss reasons, ROI, causal impact and brand size. The system prompt requires every number to come from a tool in the current turn.
- **Insight to action.** The copilot only *proposes* changes (`pending_actions`). The user can edit the fields on the card, then confirm or reject. Confirmed actions run through the same validated code path as the UI (`lib/actions.ts`) and are logged with actor `copilot`.
- **Follow-ups.** The last 16 turns are sent back, and the model re-queries tools for fresh numbers.

## 7. Testing

| Suite | What it checks | Command |
|---|---|---|
| Engine (11 tests) | Every headline number above, deduplication, the target version in force, time travel without leakage, the Cobalt withdrawal | `npm test` |
| Copilot tools (18 tests) | Every read tool returns correct numbers from the live DB; the calculator rejects code | `npm test` |
| Copilot eval (11 cases) | Grounded KPIs, cash honesty, a follow-up, owner fairness, 3 can't-answer questions (loss reason, cost, causal), time travel, a calculation, a recommendation, propose → confirm → persisted task, and a **changed-data** check (confirms a deal, then expects the new numbers). The suite resets the database afterwards | `npm run eval` (needs the app running and an OpenAI key). It writes `eval-report.md` |

## 8. Setup

See **SETUP.md** for the 15-minute Supabase + Vercel deployment. Local development:

```bash
npm install
cp .env.example .env.local      # set DATABASE_URL and OPENAI_API_KEY
npm run db:seed                 # or click "Initialize database" in the app
npm run dev                     # http://localhost:3000
npm test                        # engine + tool tests (needs DATABASE_URL)
npm run eval                    # copilot eval (needs the app running and OPENAI_API_KEY)
```

To regenerate the seed from the original xlsx, run `python3 scripts/gen_seed.py "Sponsor Dataset.xlsx" > db/seed.sql`.

## 9. Tools used

- **Next.js 16, React 19, Tailwind 4, Recharts**: the UI.
- **PostgreSQL** (Supabase free tier in production, local Postgres 16 in development) with `pg`.
- **OpenAI API** for the copilot (pay as you go; gpt-5-mini by default).
- **Vercel** (Hobby) for hosting.
- **Python and pandas** for the independent analysis and for generating the seed.
- **Claude Code**, used to write the code and the analysis. All numbers were verified by automated tests against an independent pandas computation. No templates were reused.

## 10. Assumptions and known limitations

- **Simulated data:** the payments ledger, the initiatives and their KPI readings, and the seeded tasks. Each is flagged in the UI and in copilot answers.
- **Assumptions:** an 80% collection rate on outstanding confirmed cash (editable); 14 days without a stage change counts as "stale" (editable); open deals get each channel's empirical **closed** win rate; small samples are flagged.
- The source data has no acquisition cost, so cost per sponsor can't be computed. The initiative budgets are planning assumptions.
- There's no authentication. Anyone with the link can edit or reset the data, which is intended for review. Production would add Supabase Auth and row-level security.
- Copilot quality depends on the LLM. The eval suite documents current behaviour, but it isn't a guarantee.
- The forecast is a simple expected-value model, not a statistical forecast. With 58 opportunities, per-segment rates are noisy.

## 11. Data sources

- The RISA Labs Growth APM assignment brief and its **Sponsor Dataset.xlsx** (fictional CampusFest 2025, 15 Jan to 20 Apr 2025).
- Background on RISA Labs (oncology workflow AI, B2B enterprise sales): HIT Consultant, *RISA Labs closes $11.1M Series A* (Jan 2026), and Healthcare IT Today (May 2025).
