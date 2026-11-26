import { NextResponse } from "next/server";
import { resetDatabase } from "@/lib/actions";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST() {
  try { await resetDatabase(); return NextResponse.json({ ok: true }); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
