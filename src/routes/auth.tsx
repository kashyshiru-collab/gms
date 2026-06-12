import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { getSupabaseConfigError, supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { attachReferrerByCode } from "@/lib/referrals.functions";
import { ensureMyAccount } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const currencies = ["KES", "USD", "EUR", "GBP", "UGX", "TZS"];

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Log in - GMX Trader" }] }),
  validateSearch: z.object({ ref: z.string().optional() }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { ref } = Route.useSearch();
  const attachFn = useServerFn(attachReferrerByCode);
  const ensureFn = useServerFn(ensureMyAccount);
  const [mode, setMode] = useState<"signin" | "signup">(ref ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const submitLockRef = useRef(false);
  const verifyLockRef = useRef(false);
  const configError = getSupabaseConfigError();

  const normalizedEmail = email.trim().toLowerCase();
  const fullName = `${firstName.trim()} ${secondName.trim()}`.trim();

  useEffect(() => {
    if (configError) return;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (data.session) navigate({ to: "/dashboard" });
      })
      .catch((error) => {
        console.error("Session check failed", error);
      });
  }, [configError, navigate]);

  useEffect(() => {
    if (verifyCooldown <= 0) return;
    const id = window.setInterval(() => {
      setVerifyCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [verifyCooldown]);

  function resetVerification(nextMode = mode) {
    setOtp("");
    setOtpSent(false);
    setEmailVerified(false);
    setVerifyCooldown(0);
    if (nextMode === "signin") {
      setFirstName("");
      setSecondName("");
      setPhone("");
      setCurrency("KES");
    }
  }

  async function sendVerificationCode() {
    if (verifyLockRef.current) return;
    if (configError) {
      toast.error(configError);
      return;
    }
    if (!normalizedEmail) {
      toast.error("Enter your email first.");
      return;
    }
    if (password.length < 6) {
      toast.error("Enter a password of at least 6 characters before verifying your email.");
      return;
    }
    if (verifyCooldown > 0) {
      toast.message(`Wait ${verifyCooldown}s before sending another code.`);
      return;
    }
    verifyLockRef.current = true;
    setVerifyLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: undefined,
          data: {
            first_name: firstName.trim(),
            second_name: secondName.trim(),
            full_name: fullName,
            phone: phone.trim(),
            currency,
          },
        },
      });
      if (error) throw error;
      setOtpSent(true);
      setEmailVerified(false);
      setVerifyCooldown(30);
      toast.success("Verification code sent to your email.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Could not send verification code.";
      toast.error(message);
    } finally {
      setVerifyLoading(false);
      verifyLockRef.current = false;
    }
  }

  async function verifyEmailCode() {
    if (verifyLockRef.current) return;
    if (!otp.trim()) {
      toast.error("Paste the verification code from your email.");
      return;
    }
    verifyLockRef.current = true;
    setVerifyLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: otp.trim(),
        type: "signup",
      });
      if (error) throw error;
      setEmailVerified(true);
      toast.success("Email verified. You can submit your details now.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Invalid verification code.";
      toast.error(message);
    } finally {
      setVerifyLoading(false);
      verifyLockRef.current = false;
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
        if (!emailVerified) {
          throw new Error("Please verify your email before submitting details.");
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
          data: {
            first_name: firstName.trim(),
            second_name: secondName.trim(),
            full_name: fullName,
            phone: phone.trim(),
            currency,
          },
        });
        if (updateError) throw updateError;

        try {
          await ensureFn();
        } catch (e) {
          console.warn("ensureMyAccount failed", e);
        }
        if (ref) {
          try {
            await attachFn({ data: { code: ref } });
          } catch (e) {
            console.warn("attach referrer failed", e);
          }
        }
        toast.success("Account created. You're logged in.");
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
      }
      navigate({ to: "/dashboard" });
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
          {mode === "signin" ? "Welcome back." : "Verify your email, then submit your details."}
        </p>
        {configError && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {configError}
          </div>
        )}
        {ref && mode === "signup" && (
          <div className="mt-3 rounded-md border border-bull/40 bg-bull/10 px-3 py-2 text-xs">
            Invited by code <span className="font-mono font-semibold">{ref.toUpperCase()}</span> -
            you'll be linked to their team.
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
            </div>
          )}

          <div>
            <Label htmlFor="email">Email</Label>
            <div className="flex gap-2">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (mode === "signup") resetVerification("signup");
                }}
                required
              />
              {mode === "signup" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={sendVerificationCode}
                  disabled={verifyLoading || verifyCooldown > 0 || !normalizedEmail}
                >
                  {verifyLoading && !otpSent
                    ? "Sending"
                    : emailVerified
                      ? "Verified"
                      : verifyCooldown > 0
                        ? `${verifyCooldown}s`
                        : "Verify email"}
                </Button>
              )}
            </div>
          </div>

          {mode === "signup" && otpSent && !emailVerified && (
            <div>
              <Label htmlFor="otp">Email code</Label>
              <div className="flex gap-2">
                <Input
                  id="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Paste code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={verifyEmailCode}
                  disabled={verifyLoading}
                >
                  {verifyLoading ? "Checking" : "Confirm"}
                </Button>
              </div>
            </div>
          )}

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
          <Button
            type="submit"
            disabled={loading || (mode === "signup" && !emailVerified)}
            className="w-full"
          >
            {loading ? "Please wait..." : mode === "signin" ? "Log in" : "Submit details"}
          </Button>
        </form>

        <button
          onClick={() => {
            const nextMode = mode === "signin" ? "signup" : "signin";
            setMode(nextMode);
            resetVerification(nextMode);
          }}
          className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "No account? Create account" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
