import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forbidUnlessMember } from "@/backend/services/membership.service";

type RouteContext = { params: Promise<{ householdId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Recent Ask Seiya conversations with their messages. Served from our own
 * domain so the browser never has to reach *.supabase.co directly (helps users
 * in mainland China). RLS still limits rows to the caller's private chats and
 * the household's shared ones.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { householdId } = await context.params;
  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json({ success: false, message: "Invalid household ID." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }
    const notMember = await forbidUnlessMember(supabase, householdId, user.id);
    if (notMember) return notMember;

    const { data: conversations, error } = await supabase
      .from("agent_conversations")
      .select("id, title, updated_at, created_at")
      .eq("household_id", householdId)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    if (!conversations?.length) return NextResponse.json({ success: true, conversations: [], messages: [] });

    const { data: messages, error: messagesError } = await supabase
      .from("agent_messages")
      .select("id, conversation_id, role, content, created_at")
      .in("conversation_id", conversations.map((c) => c.id))
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(400);
    if (messagesError) throw messagesError;

    return NextResponse.json({ success: true, conversations, messages: messages ?? [] });
  } catch (error) {
    console.error("[chat-history]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, message: "Chat history is unavailable right now." }, { status: 500 });
  }
}
