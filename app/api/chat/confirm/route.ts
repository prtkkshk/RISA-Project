import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { runAction } from "@/lib/actions";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { id, decision, payload } = await req.json();
  const a = (await q("select * from pending_actions where id=$1", [id]))[0];
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (a.status !== "pending") return NextResponse.json({ error: `Already ${a.status}` }, { status: 409 });
  if (decision === "reject") {
    await q("update pending_actions set status='rejected', resolved_at=now() where id=$1", [id]);
    await q("insert into chat_messages(conversation_id,role,content) values ($1,'system',$2)", [a.conversation_id, `User rejected proposed action #${id}: ${a.summary}`]);
    return NextResponse.json({ ok: true, status: "rejected" });
  }
  try {
    const finalPayload = payload ?? a.payload; // the user may edit fields on the card before confirming
    const result = await runAction(a.action_type, finalPayload, "copilot");
    await q("update pending_actions set status='confirmed', payload=$2, resolved_at=now() where id=$1", [id, JSON.stringify(finalPayload)]);
    await q("insert into chat_messages(conversation_id,role,content) values ($1,'system',$2)", [a.conversation_id, `User confirmed action #${id}: ${a.summary}`]);
    return NextResponse.json({ ok: true, status: "confirmed", result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
