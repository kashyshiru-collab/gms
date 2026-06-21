import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyReferralStats } from "@/lib/referrals.functions";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Referrals - GMX Trader" }] }),
  component: Referrals,
});

const fmt = formatMoney;

function Referrals() {
  const statsFn = useServerFn(getMyReferralStats);
  const q = useQuery({ queryKey: ["ref-stats"], queryFn: () => statsFn(), refetchInterval: 15_000 });
  const [origin] = useState(() => (typeof window !== "undefined" ? window.location.origin : ""));

  const code = q.data?.referralCode ?? "";
  const link = code && origin ? `${origin}/auth?ref=${code}` : "";

  function copy(text: string, label: string) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  }

  if (q.isError) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Dashboard</Link>
          </Button>
        </header>
        <main className="mx-auto max-w-md p-6">
          <section className="rounded-xl border border-border bg-card p-6 text-center">
            <h1 className="text-lg font-semibold">Agent access only</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Referral tools are available after an admin upgrades your account to agent.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Dashboard</Link>
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5" /> Referrals</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold mb-1">Your invite link</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Earn <span className="text-bull font-medium">15%</span> from direct referrals,
            <span className="text-bull font-medium"> 10%</span> from level 2, and
            <span className="text-bull font-medium"> 5%</span> from level 3 — on every winning trade.
          </p>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2">
            <div className="rounded-md border border-border bg-input px-3 py-2 text-sm font-mono truncate">
              {link || "—"}
            </div>
            <Button onClick={() => copy(link, "Link")} disabled={!link}>
              <Copy className="h-4 w-4 mr-1" /> Copy link
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Code:</span>
            <code className="font-mono font-semibold tracking-wide">{code || "—"}</code>
            <button onClick={() => copy(code, "Code")} className="text-muted-foreground hover:text-foreground">
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Total earned" value={fmt(q.data?.earnings.total ?? 0)} accent />
          <Stat label="L1 · 15%" value={fmt(q.data?.earnings.l1 ?? 0)} sub={`${q.data?.counts.l1 ?? 0} users`} />
          <Stat label="L2 · 10%" value={fmt(q.data?.earnings.l2 ?? 0)} sub={`${q.data?.counts.l2 ?? 0} users`} />
          <Stat label="L3 · 5%" value={fmt(q.data?.earnings.l3 ?? 0)} sub={`${q.data?.counts.l3 ?? 0} users`} />
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">Recent commissions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Level</th>
                  <th className="px-4 py-2 font-medium">Profit</th>
                  <th className="px-4 py-2 font-medium">Rate</th>
                  <th className="px-4 py-2 font-medium text-right">Credited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {(q.data?.recent ?? []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No commissions yet. Share your link to start building referrals.
                  </td></tr>
                )}
                {(q.data?.recent ?? []).map((c: any) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-2">L{c.level}</td>
                    <td className="px-4 py-2">{fmt(Number(c.profit_kes))}</td>
                    <td className="px-4 py-2">{(Number(c.rate) * 100).toFixed(0)}%</td>
                    <td className="px-4 py-2 text-right font-medium text-bull">+{fmt(Number(c.amount_kes))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tracking-tight ${accent ? "text-bull" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
