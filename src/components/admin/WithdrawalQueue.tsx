import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllWithdrawals } from "@/lib/withdrawals.functions";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { formatMoney } from "@/lib/money";

const fmt = formatMoney;

const statusStyle: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500",
  approved: "bg-blue-500/15 text-blue-400",
  processing: "bg-blue-500/15 text-blue-400",
  paid: "bg-bull/15 text-bull",
  rejected: "bg-muted text-muted-foreground",
  failed: "bg-bear/15 text-bear",
};

export function WithdrawalQueue() {
  const listFn = useServerFn(listAllWithdrawals);

  const q = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: () => listFn(),
    refetchInterval: 8_000,
  });

  const rows = q.data ?? [];
  const inFlight = rows.filter((r: any) => ["pending", "processing", "approved"].includes(r.status));

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-5 py-3 flex items-center justify-between">
        <div className="font-semibold">User withdrawal payouts</div>
        <div className="text-xs text-muted-foreground">{inFlight.length} in progress</div>
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-muted-foreground">
                  No withdrawals yet.
                </td>
              </tr>
            )}
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="p-3 text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </td>
                <td className="p-3">
                  <div className="font-medium">{r.profile?.full_name ?? "-"}</div>
                  <div className="text-xs text-muted-foreground">{r.profile?.email ?? r.user_id.slice(0, 8)}</div>
                </td>
                <td className="p-3 font-mono text-xs">{r.phone}</td>
                <td className="p-3 text-right font-semibold tabular">{fmt(Number(r.amount_kes))}</td>
                <td className="p-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusStyle[r.status] ?? "bg-muted"}`}>
                    {r.status}
                  </span>
                  {r.admin_note && (
                    <div className="text-[11px] text-muted-foreground mt-1 max-w-[200px] truncate" title={r.admin_note}>
                      {r.admin_note}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
