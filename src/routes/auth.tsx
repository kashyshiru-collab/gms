import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getSupabaseConfigError, supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { attachReferrerByCode } from "@/lib/referrals.functions";
import { ensureMyAccount } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — GMX Trader" }] }),
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
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const configError = getSupabaseConfigError();

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (configError) {
      toast.error(configError);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: phone.trim(),
            },
          },
        });

        if (signUpError) {
          if (!/already|registered|exists/i.test(signUpError.message)) throw signUpError;
          throw new Error("An account with this email already exists. Please sign in.");
        }

        if (!signUpData.session) {
          toast.success("Account created. Please confirm your email, then sign in.");
          return;
        }

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
        toast.success("Account created. You're signed in.");
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
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8">
        <div className="flex items-center gap-2 mb-6">
          <img
            src="/gmx-logo.png"
            alt="GMX Trader"
            width={32}
            height={32}
            className="h-8 w-8 rounded-md"
          />
          <span className="font-semibold tracking-tight">GMX Trader</span>
        </div>
        <h1 className="text-2xl font-bold">{mode === "signin" ? "Sign in" : "Create account"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "signin" ? "Welcome back." : "Start trading in under a minute."}
        </p>
        {configError && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {configError}
          </div>
        )}
        {ref && mode === "signup" && (
          <div className="mt-3 rounded-md border border-bull/40 bg-bull/10 px-3 py-2 text-xs">
            Invited by code <span className="font-mono font-semibold">{ref.toUpperCase()}</span> ·
            you'll be linked to their team.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">M-Pesa phone</Label>
                <Input
                  id="phone"
                  placeholder="07XX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </>
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
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
