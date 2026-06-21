import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMarketOverrides, createMarketOverride, cancelMarketOverride } from "@/lib/admin.functions";
import { getQuotes } from "@/lib/forex.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Activity, X } from "lucide-react";

export function MarketOverridePanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMarketOverrides);
  const createFn = useServerFn(createMarketOverride);
  const cancelFn = useServerFn(cancelMarketOverride);
  const quotesFn = useServerFn(getQuotes);

  const quotesQ = useQuery({ queryKey: ["quotes"], queryFn: () => quotesFn(), refetchInterval: 5_000 });
  const listQ = useQuery({ queryKey: ["overrides"], queryFn: () => listFn(), refetchInterval: 5_000 });

  const [symbol, setSymbol] = useState("EURUSD");
  const [target, setTarget] = useState("");
  const [durationMin, setDurationMin] = useState("5");
  const [revertMin, setRevertMin] = useState("5");

  const current = quotesQ.data?.find((q) => q.symbol === symbol);

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          symbol,
          targetPrice: Number(target),
          durationSeconds: Math.round(Number(durationMin) * 60),
          revertSeconds: Math.round(Number(revertMin) * 60),
        },
      }),
    onSuccess: () => {
      toast.success(`Override set: ${symbol} → ${target} over ${durationMin}m`);
      setTarget("");
      qc.invalidateQueries({ queryKey: ["overrides"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Override cancelled");
      qc.invalidateQueries({ queryKey: ["overrides"] });
    },
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Market chart override</h2>
          <p className="text-sm text-muted-foreground">
            Steer a market toward a target price over a duration, then smoothly revert to the real trend. Affects all users' charts and trade settlement.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-5 sm:items-end">
        <div className="space-y-1.5">
          <Label>Symbol</Label>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full h-10 rounded-md border border-border bg-input px-3 text-sm"
          >
            {(quotesQ.data ?? []).map((q) => (
              <option key={q.symbol} value={q.symbol}>{q.symbol}</option>
            ))}
          </select>
          {current && (
            <p className="text-[11px] text-muted-foreground tabular">
              Now: {current.price.toFixed(current.decimals ?? 5)}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-target">Target price</Label>
          <Input id="ov-target" type="number" step="any" placeholder="1.23400" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-dur">Duration (min)</Label>
          <Input id="ov-dur" type="number" min={1} max={1440} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ov-rev">Revert (min)</Label>
          <Input id="ov-rev" type="number" min={0} max={1440} value={revertMin} onChange={(e) => setRevertMin(e.target.value)} />
        </div>
        <Button
          onClick={() => {
            if (!target || !Number(target)) { toast.error("Target price required"); return; }
            createMut.mutate();
          }}
          disabled={createMut.isPending}
        >{createMut.isPending ? "Applying…" : "Apply override"}</Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Recent overrides</h3>
        {(listQ.data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">None yet.</p>
        )}
        <div className="divide-y divide-border rounded-md border border-border">
          {(listQ.data ?? []).map((o: any) => {
            const now = Date.now();
            const start = new Date(o.start_at).getTime();
            const end = new Date(o.end_at).getTime();
            const revertEnd = end + (o.revert_seconds ?? 0) * 1000;
            const phase =
              !o.active ? "cancelled" :
              now < end ? "steering" :
              now < revertEnd ? "reverting" :
              "done";
            return (
              <div key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold">{o.symbol}</span>
                  <span className="text-muted-foreground tabular">
                    {Number(o.start_price).toFixed(5)} → {Number(o.target_price).toFixed(5)}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    phase === "steering" ? "bg-primary/20 text-primary" :
                    phase === "reverting" ? "bg-amber-500/20 text-amber-500" :
                    "bg-muted text-muted-foreground"
                  }`}>{phase}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                  </span>
                  {o.active && phase !== "done" && (
                    <Button size="icon" variant="ghost" onClick={() => cancelMut.mutate(o.id)} title="Cancel">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
