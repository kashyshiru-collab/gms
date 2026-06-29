import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import logoAsset from "@/assets/tronix-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — TRONIXOPTION" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
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
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/binary`,
            data: { full_name: fullName, username: fullName.split(" ")[0] },
          },
        });
        if (error) throw error;
        // Save referral code if provided (RLS allows client to insert own)
        if (data.user && referralCode.trim()) {
          await supabase.from("referrals").insert({
            client_id: data.user.id,
            referral_code: referralCode.trim().toUpperCase(),
          });
        }
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
    }
  }

  async function handleGoogle() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/binary` },
    });
    if (error) {
      toast.error("Google sign-in failed");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2.5 mb-2">
            <img src={logoAsset.url} alt="TRONIXOPTION" className="h-11 w-11 object-contain drop-shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_55%,transparent)]" />
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

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button onClick={handleGoogle} disabled={busy}
            className="w-full py-2.5 rounded-xl bg-surface border border-border-strong font-semibold text-sm hover:bg-accent transition">
            Continue with Google
          </button>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
