import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview, adminWithdrawPayhero } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useState } from "react";
import { ArrowLeft, Banknote, Users, Wallet } from "lucide-react";
import { WithdrawalQueue } from "@/components/admin/WithdrawalQueue";
import { MarketOverridePanel } from "@/components/admin/MarketOverridePanel";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin - GMX Trader" }] }),
  component: AdminPage,
});

const fmtKES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(n);

function AdminPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getAdminOverview);
  const withdrawFn = useServerFn(adminWithdrawPayhero);

  const q = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 15_000,
    retry: false,
  });

  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");

  const wallet = q.data?.payheroWallet ?? {};
  const payheroBalance = Number(
    wallet?.service_wallet_balance ?? wallet?.balance ?? wallet?.amount ?? 0,
  );

  const mut = useMutation({
    mutationFn: (vars: { amount: number; phone: string }) => withdrawFn({ data: vars }),
    onSuccess: () => {
      toast.success("Withdrawal initiated");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">{(q.error as Error).message}</p>
          <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <span className="font-semibold tracking-tight">Admin Panel</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" /> Payhero merchant wallet</div>
            <div className="text-2xl font-bold tabular">{fmtKES(payheroBalance)}</div>
            {q.data?.payheroError && (
              <p className="text-xs text-destructive break-all">{q.data.payheroError}</p>
            )}
          </Card>
          <Card className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Banknote className="h-4 w-4" /> Total user balances</div>
            <div className="text-2xl font-bold tabular">{fmtKES(q.data?.totalUserBalance ?? 0)}</div>
          </Card>
          <Card className="p-5 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Users</div>
            <div className="text-2xl font-bold tabular">{q.data?.users?.length ?? 0}</div>
          </Card>
        </div>

        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Withdraw Payhero wallet to M-Pesa</h2>
            <p className="text-sm text-muted-foreground">Sends funds from the Payhero merchant wallet to the phone number you specify.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="wd-phone">M-Pesa phone</Label>
              <Input id="wd-phone" placeholder="07XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wd-amount">Amount (KES)</Label>
              <Input id="wd-amount" type="number" placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setAmount(String(Math.floor(payheroBalance)))}
                disabled={!payheroBalance}
              >Max</Button>
              <Button
                onClick={() => {
                  const a = Number(amount);
                  if (!phone || !a) { toast.error("Phone and amount required"); return; }
                  mut.mutate({ amount: a, phone });
                }}
                disabled={mut.isPending}
              >{mut.isPending ? "Sending…" : "Withdraw"}</Button>
            </div>
          </div>
        </Card>

        <MarketOverridePanel />

        <WithdrawalQueue />

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-semibold">Recent transactions</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left p-3">Time</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-right p-3">Amount</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Reference</th>
                  <th className="text-left p-3">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.transactions ?? []).map((t: any) => (
                  <tr key={t.id} className="border-b border-border/50">
                    <td className="p-3 text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                    <td className="p-3">{t.type}</td>
                    <td className="p-3 text-right tabular">{fmtKES(Number(t.amount_kes))}</td>
                    <td className="p-3">{t.status}</td>
                    <td className="p-3 text-xs">{t.reference}</td>
                    <td className="p-3 text-xs">{t.mpesa_receipt ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
