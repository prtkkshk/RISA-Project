import { NextResponse } from "next/server";
import { loadDataset } from "@/lib/load";
import { snapshot, trend } from "@/lib/engine";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const asOf = new URL(req.url).searchParams.get("asOf") || undefined;
    const ds = await loadDataset();
    const s = snapshot(ds, asOf);
    return NextResponse.json({ ...s, trend: trend(ds, s.as_of), brands: ds.brands.map((b) => ({ brand_id: b.brand_id, brand_name: b.brand_name, industry: b.industry })).filter((b, i, a) => a.findIndex((x) => x.brand_id === b.brand_id) === i), campaigns: ds.campaigns.map((c) => ({ sponsor_campaign_id: c.sponsor_campaign_id, campaign_name: c.campaign_name, channel: c.channel })), payments: ds.payments });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: /Invalid date/.test(e.message) ? 400 : 500 });
  }
}
