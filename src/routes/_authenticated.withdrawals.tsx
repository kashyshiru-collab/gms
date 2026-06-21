import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyWithdrawals } from "@/lib/withdrawals.functions";
import { getDashboard } from "@/lib/wallet.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { WithdrawDialog } from "@/components/trading/WithdrawDialog";
import { AppMenu } from "@/components/AppMenu";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/withdrawals")({
  head: () => ({ meta: [{ title: "Withdrawals - GMX Trader" }] }),
  component: WithdrawalsPage,
});

const fmt = formatMoney;

const statusBadge = (s: string) => {
  if (s === "paid") return "text-bull";
  if (s === "rejected" || s === "failed") return "text-bear";
  return "text-amber-500";
};

function WithdrawalsPage() {
  const listFn = useServerFn(listMyWithdrawals);
  const dashFn = useServerFn(getDashboard);
  const adminFn = useServerFn(checkIsAdmin);
  const listQ = useQuery({ queryKey: ["my-withdrawals"], queryFn: () => listFn(), refetchInterval: 8_000 });
  const dashQ = useQuery({ queryKey: ["dash"], queryFn: () => dashFn() });
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn(), staleTime: 60_000, retry: false });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <AppMenu isAdmin={adminQ.data?.isAdmin} isAgent={adminQ.data?.isAgent} />
            <h1 className="font-semibold">Withdrawals</h1>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Available balance</div>
            <div className="text-2xl font-semibold tabular">{fmt(dashQ.data?.balance ?? 0)}</div>
          </div>
          <WithdrawDialog balance={dashQ.data?.balance ?? 0} />
        </div>

        <div className="rounded-xl border border-border bg-card">
          <div className="px-4 py-3 border-b border-border font-medium">History</div>
          <div className="divide-y divide-border">
            {(listQ.data ?? []).length === 0 && (
              <div className="px-4 py-8 text-sm text-muted-foreground text-center">No withdrawals yet.</div>
            )}
            {(listQ.data ?? []).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium tabular">{fmt(Number(r.amount_kes))}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} · {r.phone}
                  </div>
                </div>
                <div className={`text-sm font-medium capitalize ${statusBadge(r.status)}`}>
                  {r.status === "pending" || r.status === "approved" ? "Pending" : r.status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
