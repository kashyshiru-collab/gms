import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requestWithdrawal, listMyWithdrawals } from "@/lib/withdrawals.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(n);

export function WithdrawDialog({ balance }: { balance: number }) {
  const qc = useQueryClient();
  const reqFn = useServerFn(requestWithdrawal);
  const listFn = useServerFn(listMyWithdrawals);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("100");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => {
      const p = (data.user?.user_metadata as any)?.phone;
      if (p && !phone) setPhone(p);
    });
  }, [open, phone]);

  const myQ = useQuery({
    queryKey: ["my-withdrawals"],
    queryFn: () => listFn(),
    enabled: open,
    refetchInterval: open ? 8_000 : false,
  });

  const mut = useMutation({
    mutationFn: () => reqFn({ data: { amount: Number(amount), phone } }),
    onSuccess: () => {
      toast.success("Withdrawal request submitted. Status: Pending.");
      qc.invalidateQueries({ queryKey: ["dash"] });
      qc.invalidateQueries({ queryKey: ["my-withdrawals"] });
      setAmount("100");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowUpFromLine className="h-4 w-4 mr-1" /> Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw to M-Pesa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Available</span>
            <span className="font-semibold">{fmt(balance)}</span>
          </div>
          <div>
            <Label htmlFor="wd-amt">Amount (KES)</Label>
            <Input id="wd-amt" type="number" min={10} max={Math.max(10, Math.floor(balance))}
              value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="wd-ph">M-Pesa phone</Label>
            <Input id="wd-ph" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Funds are held immediately and sent to your M-Pesa once your request is processed. Pending requests are returned to your wallet if cancelled.
          </p>

          {(myQ.data ?? []).length > 0 && (
            <div className="border-t border-border pt-3 space-y-1.5 max-h-40 overflow-y-auto">
              <div className="text-xs text-muted-foreground">Recent</div>
              {(myQ.data ?? []).slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
                  <span className="tabular">{fmt(Number(r.amount_kes))}</span>
                  <span className={
                    r.status === "paid" ? "text-bull font-medium" :
                    r.status === "rejected" || r.status === "failed" ? "text-bear font-medium" :
                    "text-amber-500 font-medium"
                  }>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !phone || Number(amount) < 10 || Number(amount) > balance}
          >{mut.isPending ? "Submitting…" : `Request ${fmt(Number(amount) || 0)}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
