import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { getSupabaseConfigError, supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { ensureMyAccount } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const currencies = ["KES", "USD", "EUR", "GBP", "UGX", "TZS"];

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Log in - GMX Trader" }] }),
  validateSearch: z.object({ ref: z.string().optional(), verified: z.string().optional() }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { ref, verified } = Route.useSearch();
  const ensureFn = useServerFn(ensureMyAccount);
  const [mode, setMode] = useState<"signin" | "signup">(ref ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [referralCode, setReferralCode] = useState(ref ?? "");
  const [loading, setLoading] = useState(false);
  const submitLockRef = useRef(false);
  const configError = getSupabaseConfigError();

  const normalizedEmail = email.trim().toLowerCase();
  const fullName = `${firstName.trim()} ${secondName.trim()}`.trim();

  useEffect(() => {
    if (configError) return;
    if (verified) {
      setMode("signin");
      supabase.auth.signOut().catch((error) => {
        console.error("Post-verification sign out failed", error);
      });
      toast.success("Email verified. Please log in to continue.");
      return;
    }
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) navigate({ to: "/dashboard" });
      })
      .catch((error) => {
        console.error("Session check failed", error);
      });
  }, [configError, navigate, verified]);

  useEffect(() => {
    if (ref) {
      setMode("signup");
      setReferralCode(ref);
    }
  }, [ref]);

  function resetSignupFields(nextMode = mode) {
    if (nextMode === "signin") {
      setFirstName("");
      setSecondName("");
      setPhone("");
      setCurrency("KES");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLockRef.current) return;
    if (configError) {
      toast.error(configError);
      return;
    }
    submitLockRef.current = true;
    setLoading(true);
    try {
      if (mode === "signup") {
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters.");
        }

        const redirectTo =
          typeof window !== "undefined" ? `${window.location.origin}/auth?verified=1` : undefined;
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: redirectTo,
            data: {
              first_name: firstName.trim(),
              second_name: secondName.trim(),
              full_name: fullName,
              phone: phone.trim(),
              currency,
              referral_code: referralCode.trim().toUpperCase() || null,
            },
          },
        });
        if (error) throw error;
        await supabase.auth.signOut();
        toast.success("Account created. Check your email, verify the link, then log in.");
        setMode("signin");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (error) throw error;
        try {
          await ensureFn();
        } catch (e) {
          console.warn("ensureMyAccount failed", e);
        }
        toast.success("Welcome back");
        navigate({ to: "/dashboard" });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8">
        <div className="mb-6 flex items-center gap-2">
          <img
            src="/gmx-logo.png"
            alt="GMX Trader"
            width={32}
            height={32}
            className="h-8 w-8 rounded-md"
          />
          <span className="font-semibold tracking-tight">GMX Trader</span>
        </div>
        <h1 className="text-2xl font-bold">{mode === "signin" ? "Log in" : "Create account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Welcome back."
            : "Submit your details, then verify the link sent to your email."}
        </p>
        {configError && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {configError}
          </div>
        )}
        {referralCode.trim() && mode === "signup" && (
          <div className="mt-3 rounded-md border border-bull/40 bg-bull/10 px-3 py-2 text-xs">
            Invited by code{" "}
            <span className="font-mono font-semibold">{referralCode.trim().toUpperCase()}</span>.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="first-name">First name</Label>
                <Input
                  id="first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="second-name">Second name</Label>
                <Input
                  id="second-name"
                  value={secondName}
                  onChange={(e) => setSecondName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Number</Label>
                <Input
                  id="phone"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="currency">Currency</Label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {currencies.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="referral-code">Referral code (optional)</Label>
                <Input
                  id="referral-code"
                  placeholder="e.g. ALLAN1"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                />
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Please wait..." : mode === "signin" ? "Log in" : "Create account"}
          </Button>
        </form>

        <button
          onClick={() => {
            const nextMode = mode === "signin" ? "signup" : "signin";
            setMode(nextMode);
            resetSignupFields(nextMode);
          }}
          className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "No account? Create account" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
