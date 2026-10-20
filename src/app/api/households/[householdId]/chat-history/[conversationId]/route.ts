import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forbidUnlessMember } from "@/backend/services/membership.service";

type RouteContext = { params: Promise<{ householdId: string; conversationId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  P0002: { status: 404, message: "Conversation not found." },
  "42501": { status: 403, message: "Only the person who started this chat can change it." },
  "22023": { status: 400, message: "Invalid conversation details." },
};

async function authorize(context: RouteContext) {
  const { householdId, conversationId } = await context.params;
  if (!UUID_PATTERN.test(householdId) || !UUID_PATTERN.test(conversationId)) {
    return { error: NextResponse.json({ success: false, message: "Invalid parameters." }, { status: 400 }) };
  }
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ success: false, message: "Login required." }, { status: 401 }) };
  }
  const notMember = await forbidUnlessMember(supabase, householdId, user.id);
  if (notMember) return { error: notMember };
  return { supabase, conversationId };
}

function rpcError(error: { code?: string; message?: string }, tag: string) {
  const mapped = RPC_ERRORS[error.code ?? ""];
  if (!mapped) console.error(`[chat-history/${tag}]`, error.message ?? error);
  return NextResponse.json(
    { success: false, message: mapped?.message ?? "Unable to update this conversation." },
    { status: mapped?.status ?? 500 }
  );
}

/** Rename and/or share: { title?: string, visibility?: "private" | "shared" }. */
export async function PATCH(request: Request, context: RouteContext) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const input = (body ?? {}) as { title?: unknown; visibility?: unknown };
  const title = typeof input.title === "string" ? input.title.trim() : undefined;
  const visibility = input.visibility === "private" || input.visibility === "shared" ? input.visibility : undefined;
  if (title === undefined && visibility === undefined) {
    return NextResponse.json({ success: false, message: "Nothing to update." }, { status: 400 });
  }
  if (title !== undefined && (title.length < 1 || title.length > 120)) {
    return NextResponse.json({ success: false, message: "Title must be between 1 and 120 characters." }, { status: 400 });
  }

  try {
    const auth = await authorize(context);
    if (auth.error) return auth.error;
    const { supabase, conversationId } = auth;

    if (title !== undefined) {
      const { error } = await supabase.rpc("rename_agent_conversation", { p_conversation_id: conversationId, p_title: title });
      if (error) return rpcError(error, "rename");
    }
    if (visibility !== undefined) {
      const { error } = await supabase.rpc("set_agent_conversation_visibility", {
        p_conversation_id: conversationId,
        p_visibility: visibility,
      });
      if (error) return rpcError(error, "visibility");
    }

    return NextResponse.json({ success: true, ...(title !== undefined ? { title } : {}), ...(visibility ? { visibility } : {}) });
  } catch (error) {
    console.error("[chat-history/patch] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await authorize(context);
    if (auth.error) return auth.error;
    const { supabase, conversationId } = auth;

    const { data, error } = await supabase.rpc("delete_agent_conversation", { p_conversation_id: conversationId });
    if (error) return rpcError(error, "delete");
    if (!(data as { deleted?: boolean } | null)?.deleted) {
      return NextResponse.json({ success: false, message: "Only the person who started this chat can delete it." }, { status: 403 });
    }

    return NextResponse.json({ success: true, message: "Conversation deleted." });
  } catch (error) {
    console.error("[chat-history/delete] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
