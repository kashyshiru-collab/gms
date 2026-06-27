import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyStatus } from "@/lib/wallet.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { AppMenu } from "@/components/AppMenu";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile - TronixOption" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const statusFn = useServerFn(getMyStatus);
  const adminFn = useServerFn(checkIsAdmin);
  const statusQ = useQuery({
    queryKey: ["my-status"],
    queryFn: () => statusFn(),
    refetchInterval: 15_000,
  });
  const adminQ = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => adminFn(),
    staleTime: 60_000,
    retry: false,
  });

  const s = statusQ.data;
  const prof = s?.profile;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <AppMenu isAdmin={adminQ.data?.isAdmin} isAgent={adminQ.data?.isAgent} />
            <h1 className="font-semibold">Profile</h1>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Field label="Name" value={prof?.full_name ?? "—"} />
          <Field label="Email" value={prof?.email ?? "—"} />
          <Field label="Phone" value={prof?.phone ?? "—"} />
          {adminQ.data?.isAgent && (
            <Field label="Referral code" value={prof?.referral_code ?? "—"} mono />
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="text-sm font-medium">Trading activity</div>
          <Field
            label="Trades since last deposit"
            value={s?.has_prior_deposit ? String(s.trades_since_last_deposit) : "No deposits yet"}
          />
        </div>

        {Number(s?.warnings_count ?? 0) > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
            <div>
              <div className="font-medium text-amber-500">
                Account warning ({s?.warnings_count}/2)
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Please contact support if you believe this warning should be removed. Further
                violations may result in your account being permanently disabled.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
