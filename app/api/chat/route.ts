import { NextResponse } from "next/server";
import { chat } from "@/lib/copilot";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const { conversationId, messages } = await req.json();
    if (!conversationId || !Array.isArray(messages) || !messages.length) return NextResponse.json({ error: "conversationId and messages are required" }, { status: 400 });
    const clean = messages.filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));
    return NextResponse.json(await chat(String(conversationId), clean));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
