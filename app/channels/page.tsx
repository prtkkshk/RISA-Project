"use client";
import { useData } from "@/components/DataProvider";
import { Card, fmtINR, pct, Badge } from "@/components/ui";

export default function Channels() {
  const { data: d, ask } = useData();
  return (
    <>
      <Card title="Sponsor acquisition channels" subtitle="Touches are interaction records; brands are distinct brands. A response is not qualification; campaign association is observational, not causal." right={<button className="btn text-xs" onClick={() => ask("Rank our channels by cash potential per unit of effort and tell me what to scale, change and stop.")}>Ask analyst to rank</button>}>
        <div className="overflow-x-auto">
          <table className="tbl w-full">
            <thead><tr><th>Campaign</th><th>Type</th><th>Owner</th><th className="num">Touches</th><th className="num">Brands touched</th><th className="num">Responded</th><th className="num">Met</th><th className="num">Qualified</th><th className="num">Opps</th><th className="num">Confirmed</th><th className="num">Win rate (closed)</th><th className="num">Confirmed value</th><th className="num">Touches / win</th><th className="num">Open pipeline</th><th className="num">Stale</th><th className="num">Opt-outs</th></tr></thead>
            <tbody>{d.channels.map((c: any) => (
              <tr key={c.sponsor_campaign_id}>
                <td className="font-medium">{c.campaign_name}</td><td><Badge kind={c.warm ? "warm" : "cold"}>{c.warm ? "warm" : "cold"} · {c.channel}</Badge></td><td>{c.owner_name}</td>
                <td className="num">{c.touches}</td><td className="num">{c.brands_touched}</td><td className="num">{c.brands_responded}</td><td className="num">{c.brands_meeting_held}</td><td className="num">{c.qualified_brands}</td>
                <td className="num">{c.opportunities}</td><td className="num font-semibold">{c.confirmed}</td><td className="num">{pct(c.win_rate_closed)}</td><td className="num">{fmtINR(c.confirmed_value_inr)}</td>
                <td className="num">{c.touches_per_win ? c.touches_per_win.toFixed(1) : "no wins"}</td><td className="num">{fmtINR(c.open_pipeline_inr)}</td><td className="num">{c.stale_open}</td><td className="num">{c.opt_outs}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card title="Owners, adjusted for channel mix" subtitle="Expected wins apply each channel's closed win rate to the owner's closed deals. Raw totals mostly reflect which channels an owner was given.">
          <table className="tbl w-full">
            <thead><tr><th>Owner</th><th className="num">Opps</th><th className="num">Warm share</th><th className="num">Confirmed</th><th className="num">Expected</th><th className="num">vs expected</th><th className="num">Value</th><th className="num">Stale open</th></tr></thead>
            <tbody>{d.owners.map((o: any) => <tr key={o.owner_name}><td>{o.owner_name}</td><td className="num">{o.opportunities}</td><td className="num">{pct(o.warm_share)}</td><td className="num">{o.confirmed}</td><td className="num">{o.expected_wins_given_channel_mix}</td><td className="num">{o.wins_vs_expected > 0 ? "+" : ""}{o.wins_vs_expected}</td><td className="num">{fmtINR(o.confirmed_value_inr)}</td><td className="num">{o.stale_open}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card title="Industries" subtitle="Brand industry from the target list.">
          <table className="tbl w-full">
            <thead><tr><th>Industry</th><th className="num">Brands</th><th className="num">Opps</th><th className="num">Confirmed</th><th className="num">Win rate</th><th className="num">Value</th><th className="num">Avg deal</th></tr></thead>
            <tbody>{d.industries.map((i: any) => <tr key={i.industry}><td>{i.industry}</td><td className="num">{i.brands}</td><td className="num">{i.opportunities}</td><td className="num">{i.confirmed}</td><td className="num">{pct(i.win_rate_all)}</td><td className="num">{fmtINR(i.confirmed_value_inr)}</td><td className="num">{fmtINR(i.avg_deal_inr)}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
