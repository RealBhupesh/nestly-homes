import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

/**
 * Signs the user out, drops every cached query (so the next person on this
 * device never sees the previous user's data), re-runs route guards and goes home.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();

  return useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Even if the network call fails, the local session is cleared below.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    }
    queryClient.clear();
    await navigate({ to: "/", replace: true });
    router.invalidate();
  }, [queryClient, router, navigate]);
}

/**
 * Only allow same-origin relative paths (e.g. "/dashboard?tab=1").
 * Rejects protocol-relative ("//evil.com"), backslash tricks and absolute URLs.
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || v.includes("\\"))
    return fallback;
  if (/^\/(auth|reset-password)(\/|\?|#|$)/.test(v)) return fallback;
  // eslint-disable-next-line no-control-regex -- reject control chars in redirect targets
  if (/[\u0000-\u001f]/.test(v)) return fallback;
  return v.slice(0, 1000);
}

export const SMS_UNAVAILABLE_MESSAGE = "Phone sign-in isn't available yet — use email";

/** True when Supabase rejected an SMS because no SMS provider is configured. */
export function isSmsUnavailableError(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | null;
  const text = `${e?.code ?? ""} ${e?.message ?? ""}`.toLowerCase();
  return (
    text.includes("phone_provider_disabled") ||
    text.includes("sms_send_failed") ||
    text.includes("unsupported phone provider") ||
    text.includes("phone signups are disabled") ||
    text.includes("phone logins are disabled") ||
    text.includes("error sending confirmation sms") ||
    text.includes("error sending sms") ||
    text.includes("sms provider") ||
    text.includes("twilio") ||
    text.includes("messagebird") ||
    text.includes("vonage")
  );
}

/** Maps Supabase auth errors to short, human messages. */
export function friendlyAuthError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (isSmsUnavailableError(err)) return SMS_UNAVAILABLE_MESSAGE;
  const e = err as { message?: string; code?: string; status?: number } | null;
  const msg = (e?.message ?? "").toLowerCase();
  const code = e?.code ?? "";

  if (code === "invalid_credentials" || msg.includes("invalid login credentials"))
    return "That email and password don't match. Check them and try again.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return "Please confirm your email first — check your inbox for the link we sent.";
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    msg.includes("already registered")
  )
    return "An account with this email already exists. Sign in instead.";
  if (code === "phone_exists" || msg.includes("phone number already"))
    return "This phone number is already linked to another account.";
  if (code === "weak_password" || msg.includes("password should"))
    return "Choose a stronger password — at least 8 characters with letters and numbers.";
  if (code === "same_password" || msg.includes("should be different from the old"))
    return "Your new password must be different from the old one.";
  if (
    code === "otp_expired" ||
    msg.includes("token has expired") ||
    msg.includes("otp has expired") ||
    msg.includes("invalid otp")
  )
    return "That code is wrong or has expired. Request a new one.";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    msg.includes("rate limit") ||
    msg.includes("for security purposes")
  )
    return "Too many attempts. Please wait a minute and try again.";
  if (code === "signup_disabled" || msg.includes("signups not allowed"))
    return "New sign-ups are paused right now. Please try again later.";
  if (msg.includes("provider is not enabled") || code === "provider_disabled")
    return "Google sign-in isn't available yet — use email instead.";
  if (
    (code === "validation_failed" && msg.includes("email")) ||
    msg.includes("unable to validate email")
  )
    return "Enter a valid email address.";
  if (code === "reauthentication_needed" || code === "reauthentication_not_valid")
    return "For security, please sign out and sign back in, then try again.";
  if (code === "session_not_found" || msg.includes("auth session missing"))
    return "Your session has expired. Please sign in again.";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "Can't reach Nestly right now. Check your connection and retry.";
  return e?.message || fallback;
}

/**
 * Normalises Indian-first phone input to E.164. Ten-digit numbers get +91.
 * Returns null when the number is not valid.
 */
export function toE164(raw: string, defaultCountry = "91"): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+${defaultCountry}${digits}`;
  else if (digits.length === 11 && digits.startsWith("0"))
    e164 = `+${defaultCountry}${digits.slice(1)}`;
  else if (digits.length === 12 && digits.startsWith(defaultCountry)) e164 = `+${digits}`;
  else return null;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  if (e164.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(e164)) return null;
  return e164;
}
