import { NextResponse } from "next/server";
import { q } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await q("select * from audit_log order by id desc limit 100"));
}
