import { createFileRoute, useNavigate } from "@tanstack/react-router";
<<<<<<< HEAD
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { getSupabaseConfigError, supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { ensureMyAccount } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Log in - TronixOption" }] }),
  validateSearch: z.object({ ref: z.string().optional(), verified: z.string().optional() }),
=======
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { LOGO_URL } from "@/lib/brand";
import { useServerFn } from "@tanstack/react-start";
import { signUpWithoutEmailVerification } from "@/lib/auth.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — TRONIXOPTION" }] }),
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
<<<<<<< HEAD
  const { ref, verified } = Route.useSearch();
  const ensureFn = useServerFn(ensureMyAccount);
  const [mode, setMode] = useState<"signin" | "signup">(ref ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [phone, setPhone] = useState("");
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
              currency: "USD",
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
=======
  const signUpNow = useServerFn(signUpWithoutEmailVerification);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/binary" });
    });
  }, [navigate]);

  function validate(): string | null {
    if (mode === "signup") {
      if (!fullName.trim() || fullName.trim().length < 2) return "Enter your full name";
      if (!isValidKenyanPhone(phone)) return "Enter a valid Safaricom number";
      if (password.length < 8) return "Password must be at least 8 characters";
      if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) return "Use an uppercase letter and a number";
      if (password !== confirm) return "Passwords don't match";
    } else if (password.length < 6) return "Password too short";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email";
    return null;
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUpNow({ data: { email, password, fullName, phone, referralCode: referralCode || undefined } });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Account created. Welcome aboard.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/binary" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
    }
  }

  return (
<<<<<<< HEAD
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8">
        <div className="mb-6 flex items-center gap-2">
          <img
            src="/tronixoption-logo.png"
            alt="TronixOption"
            width={150}
            height={54}
            className="h-11 w-auto"
          />
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
=======
    <div className="min-h-screen grid place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <img src={LOGO_URL} alt="TRONIXOPTION" className="h-11 w-11 object-contain drop-shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_55%,transparent)]" />
            <span className="text-xl font-extrabold tracking-wider">TRONIX<span className="text-primary">OPTION</span></span>
          </div>
          <p className="text-xs text-muted-foreground">Forex · Crypto · Binaries · Polymarket · Aviator</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-2xl">
          <div className="flex gap-1.5 mb-4 p-1 bg-surface rounded-xl">
            {(["signin", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={"flex-1 py-2 rounded-lg text-sm font-semibold transition " + (mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleEmail} className="space-y-2.5">
            {mode === "signup" && (
              <Field label="Full name">
                <input type="text" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe" className="auth-input" />
              </Field>
            )}
            {mode === "signup" && (
              <Field label="Safaricom number">
                <input type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="0712345678" className="auth-input" />
              </Field>
            )}
            <Field label="Email">
              <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com" className="auth-input" />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input type={showPwd ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required minLength={mode === "signup" ? 8 : 6} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "Min 8, 1 uppercase, 1 number" : "Your password"} className="auth-input pr-10" />
                <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label="Toggle password"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {mode === "signup" && (
              <>
                <Field label="Confirm password">
                  <div className="relative">
                    <input type={showConfirm ? "text" : "password"} autoComplete="new-password" required value={confirm}
                      onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" className="auth-input pr-10" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} aria-label="Toggle confirm"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Referral code (optional)">
                  <input type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="e.g. AGENT123" className="auth-input uppercase tracking-wider" maxLength={16} />
                </Field>
              </>
            )}
            <button disabled={busy} className="w-full mt-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm glow-primary disabled:opacity-50">
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="text-[10px] text-muted-foreground mt-3 text-center">
            By continuing you agree to our terms. Trading involves risk.
          </p>
        </div>
      </div>

      <style>{`
        .auth-input { width: 100%; padding: 0.65rem 0.9rem; border-radius: 0.7rem; background: var(--color-surface); border: 1px solid var(--color-border); outline: none; font-size: 0.875rem; }
        .auth-input:focus { border-color: var(--color-primary); }
      `}</style>
    </div>
  );
}

function isValidKenyanPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return (digits.startsWith("254") && digits.length === 12) ||
    (digits.startsWith("0") && digits.length === 10) ||
    digits.length === 9;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
