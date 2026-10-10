
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AcceptInvitationInput,
  CreateInvitationInput,
} from "@/backend/validators/household-invitation";

export async function createHouseholdInvitation(
  supabase: SupabaseClient,
  input: CreateInvitationInput
) {
  const baseUrl = process.env.APP_BASE_URL;

  if (!baseUrl) {
    throw new Error("APP_BASE_URL_MISSING");
  }

  let inviteUrl: URL;

  try {
    inviteUrl = new URL("/invite", baseUrl);

    if (!["http:", "https:"].includes(inviteUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    throw new Error("APP_BASE_URL_INVALID");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const { data, error } = await supabase.rpc(
    "create_household_invitation",
    {
      p_household_id: input.householdId,
      p_invited_email: input.invitedEmail,
      p_invited_name: input.invitedName,
      p_token_hash: tokenHash,
    }
  );

  if (error) {
    return { success: false as const, error };
  }

  inviteUrl.searchParams.set("token", token);

  return {
    success: true as const,
    invitation: data,
    inviteUrl: inviteUrl.toString(),
  };
}

export async function acceptHouseholdInvitation(
  supabase: SupabaseClient,
  input: AcceptInvitationInput
) {
  const tokenHash = createHash("sha256")
    .update(input.token)
    .digest("hex");

  const { data, error } = await supabase.rpc(
    "accept_household_invitation",
    { p_token_hash: tokenHash }
  );

  if (error) {
    return { success: false as const, error };
  }

  return { success: true as const, data };
}
