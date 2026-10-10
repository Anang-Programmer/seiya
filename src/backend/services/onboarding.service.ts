
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingInput } from "@/backend/validators/onboarding";

export async function saveOnboarding(
  supabase: SupabaseClient,
  userId: string,
  input: OnboardingInput
) {
  // Update only the authenticated user's profile.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({
      city: input.profile.city,
      country: input.profile.country,
      preferred_language: input.profile.preferredLanguage,
    })
    .eq("id", userId)
    .select(
      "id, full_name, city, country, preferred_language, children_count"
    )
    .maybeSingle();

  if (profileError) {
    console.error("[onboarding] Profile update failed:", profileError);
    throw new Error("PROFILE_SAVE_FAILED");
  }

  if (!profile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  // Find the latest saved onboarding version.
  const {
    data: latest,
    error: latestError,
  } = await supabase
    .from("onboarding_responses")
    .select("id, response_version, completed_at")
    .eq("user_id", userId)
    .order("response_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    console.error("[onboarding] Version lookup failed:", latestError);
    throw new Error("ONBOARDING_LOOKUP_FAILED");
  }

  const completedAt = new Date().toISOString();

  // Update an unfinished response, or create a new version
  // when the previous response was already completed.
  const query = latest && latest.completed_at === null
    ? supabase
        .from("onboarding_responses")
        .update({
          answers: input.answers,
          completed_at: completedAt,
        })
        .eq("id", latest.id)
        .eq("user_id", userId)
    : supabase
        .from("onboarding_responses")
        .insert({
          user_id: userId,
          response_version: (latest?.response_version ?? 0) + 1,
          answers: input.answers,
          completed_at: completedAt,
        });

  const { data: onboarding, error: onboardingError } = await query
    .select("id, response_version, answers, completed_at, created_at")
    .single();

  if (onboardingError) {
    console.error("[onboarding] Save failed:", onboardingError);
    throw new Error("ONBOARDING_SAVE_FAILED");
  }

  return { profile, onboarding };
}
