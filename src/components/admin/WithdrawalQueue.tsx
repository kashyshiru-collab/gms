import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllWithdrawals, approveWithdrawal, rejectWithdrawal } from "@/lib/withdrawals.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { formatMoney } from "@/lib/money";

const fmt = formatMoney;

const statusStyle: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500",
  approved: "bg-blue-500/15 text-blue-400",
  paid: "bg-bull/15 text-bull",
  rejected: "bg-muted text-muted-foreground",
  failed: "bg-bear/15 text-bear",
};

export function WithdrawalQueue() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllWithdrawals);
  const approveFn = useServerFn(approveWithdrawal);
  const rejectFn = useServerFn(rejectWithdrawal);

  const q = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: () => listFn(),
    refetchInterval: 8_000,
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id } }),
    onSuccess: () => { toast.success("Approved & paid"); qc.invalidateQueries({ queryKey: ["admin-withdrawals"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [rejecting, setRejecting] = useState<{ id: string; amount: number } | null>(null);
  const [reason, setReason] = useState("");
  const rejectMut = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => rejectFn({ data: vars }),
    onSuccess: () => {
      toast.success("Refunded & rejected");
      setRejecting(null); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];
  const pending = rows.filter((r: any) => r.status === "pending");

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-3 flex items-center justify-between">
        <div className="font-semibold">User withdrawal requests</div>
        <div className="text-xs text-muted-foreground">{pending.length} pending</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground bg-muted/30">
            <tr className="border-b border-border">
              <th className="text-left p-3">Requested</th>
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Phone</th>
              <th className="text-right p-3">Amount</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">No withdrawal requests yet.</td></tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="p-3 text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </td>
                <td className="p-3">
                  <div className="font-medium">{r.profile?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.profile?.email ?? r.user_id.slice(0, 8)}</div>
                </td>
                <td className="p-3 font-mono text-xs">{r.phone}</td>
                <td className="p-3 text-right font-semibold tabular">{fmt(Number(r.amount_kes))}</td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyle[r.status] ?? "bg-muted"}`}>
                    {r.status}
                  </span>
                  {r.admin_note && <div className="text-[11px] text-muted-foreground mt-1 max-w-[200px] truncate" title={r.admin_note}>{r.admin_note}</div>}
                </td>
                <td className="p-3 text-right">
                  {r.status === "pending" ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setRejecting({ id: r.id, amount: Number(r.amount_kes) })}>
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => approveMut.mutate(r.id)} disabled={approveMut.isPending}>
                        {approveMut.isPending ? "Paying…" : "Approve & pay"}
                      </Button>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject withdrawal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Refund <b>{rejecting ? fmt(rejecting.amount) : ""}</b> back to the user's wallet.
            </p>
            <div>
              <Label htmlFor="reason">Reason (visible to user)</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. phone mismatch" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              onClick={() => rejecting && reason && rejectMut.mutate({ id: rejecting.id, reason })}
              disabled={!reason || rejectMut.isPending}
            >{rejectMut.isPending ? "Refunding…" : "Confirm reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
