import { NextResponse } from "next/server";
import { runAction, ActionError } from "@/lib/actions";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { type, payload } = await req.json();
    return NextResponse.json(await runAction(type, payload, "user"));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e instanceof ActionError ? 400 : 500 });
  }
}
