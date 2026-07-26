import { supabase } from "@/integrations/supabase/client";

export const DEMO_EMAIL = "demo@nestly.app";
export const DEMO_PASSWORD = "nestly-demo-2026";

/**
 * Ensures a signed-in Supabase session using the shared demo account.
 * Called from the protected route gate and /auth so users skip login entirely.
 */
export async function ensureDemoSession() {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) return existing.session;

  const signIn = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signIn.data.session) return signIn.data.session;

  // First run — provision the demo user, then sign in.
  await supabase.auth.signUp({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    options: { data: { full_name: "Demo User" } },
  });
  const retry = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  return retry.data.session;
}