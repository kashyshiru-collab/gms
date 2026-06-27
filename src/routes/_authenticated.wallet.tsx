import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import type React from "react";
import { AppMenu } from "@/components/AppMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WithdrawDialog } from "@/components/trading/WithdrawDialog";
import { checkIsAdmin } from "@/lib/admin.functions";
import { getDashboard, initiateDeposit } from "@/lib/wallet.functions";
import { listMyWithdrawals } from "@/lib/withdrawals.functions";
import { formatMoney, MIN_DEPOSIT_USD } from "@/lib/money";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowUpFromLine, Clock, Wallet } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({ meta: [{ title: "Wallet - TronixOption" }] }),
  component: WalletPage,
});

function WalletPage() {
  const qc = useQueryClient();
  const adminFn = useServerFn(checkIsAdmin);
  const dashFn = useServerFn(getDashboard);
  const withdrawalsFn = useServerFn(listMyWithdrawals);
  const depositFn = useServerFn(initiateDeposit);
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn(), staleTime: 60_000 });
  const dashQ = useQuery({ queryKey: ["dash"], queryFn: () => dashFn(), refetchInterval: 8_000 });
  const withdrawalsQ = useQuery({
    queryKey: ["my-withdrawals"],
    queryFn: () => withdrawalsFn(),
    refetchInterval: 8_000,
  });
  const [amount, setAmount] = useState(String(MIN_DEPOSIT_USD));
  const [phone, setPhone] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const p = (data.user?.user_metadata as any)?.phone;
      if (p) setPhone(p);
    });
  }, []);

  const depositMut = useMutation({
    mutationFn: () => depositFn({ data: { amount: Number(amount), phone } }),
    onSuccess: (r) => {
      toast.success(r.message);
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transactions = dashQ.data?.transactions ?? [];
  const withdrawals = withdrawalsQ.data ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-3 px-3">
          <div className="flex items-center gap-2">
            <AppMenu isAdmin={adminQ.data?.isAdmin} isAgent={adminQ.data?.isAgent} />
            <div className="flex items-center gap-2 font-semibold">
              <Wallet className="h-5 w-5 text-primary" />
              Wallet
            </div>
          </div>
          <div className="justify-self-center text-sm text-muted-foreground">
            USD account
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link to="/dashboard">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Trade
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 p-3 pb-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="text-xs text-muted-foreground">Available balance</div>
            <div className="mt-1 text-4xl font-black tabular">{formatMoney(dashQ.data?.balance ?? 0)}</div>
            <div className="mt-4 flex gap-2">
              <WithdrawDialog balance={dashQ.data?.balance ?? 0} />
              <Button asChild variant="outline">
                <Link to="/withdrawals">
                  <ArrowUpFromLine className="mr-2 h-4 w-4" />
                  Withdrawal page
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold">Deposit via M-Pesa</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Amount (USD)</label>
                <Input type="number" min={MIN_DEPOSIT_USD} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone number</label>
                <Input placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button className="w-full" disabled={depositMut.isPending || !phone} onClick={() => depositMut.mutate()}>
                {depositMut.isPending ? "Sending STK" : "Deposit now"}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <HistoryPanel title="Deposit and account history" empty="No wallet transactions yet.">
            {transactions.map((tx: any) => (
              <HistoryRow
                key={tx.id}
                title={tx.type.replaceAll("_", " ")}
                subtitle={`${formatDistanceToNow(new Date(tx.created_at), { addSuffix: true })} - ${tx.status}`}
                amount={Number(tx.amount_kes)}
              />
            ))}
          </HistoryPanel>

          <HistoryPanel title="Withdrawal history" empty="No withdrawals yet.">
            {withdrawals.map((w: any) => (
              <HistoryRow
                key={w.id}
                title={w.status}
                subtitle={`${formatDistanceToNow(new Date(w.created_at), { addSuffix: true })} - ${w.phone}`}
                amount={-Number(w.amount_kes)}
              />
            ))}
          </HistoryPanel>
        </section>
      </main>
    </div>
  );
}

function HistoryPanel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
        <Clock className="h-4 w-4 text-primary" />
        {title}
      </div>
      <div className="divide-y divide-border">
        {hasChildren ? children : <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>}
      </div>
    </div>
  );
}

function HistoryRow({ title, subtitle, amount }: { title: string; subtitle: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <div>
        <div className="font-medium capitalize">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className={`font-semibold tabular ${amount >= 0 ? "text-bull" : "text-bear"}`}>
        {amount >= 0 ? "+" : ""}
        {formatMoney(amount)}
      </div>
    </div>
  );
}
