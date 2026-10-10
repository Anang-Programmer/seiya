
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SignInInput,
  SignUpInput,
} from "@/backend/validators/auth";

export async function signUpWithEmail(
  supabase: SupabaseClient,
  input: SignUpInput
) {
  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
      },
    },
  });
}

export async function signInWithEmail(
  supabase: SupabaseClient,
  input: SignInInput
) {
  return supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
}
