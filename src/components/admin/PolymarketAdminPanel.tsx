import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createPolyMarket,
  listPolymarkets,
  resolvePolyMarket,
} from "@/lib/polymarket.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/money";
import { Scale } from "lucide-react";
import { toast } from "sonner";

export function PolymarketAdminPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPolymarkets);
  const createFn = useServerFn(createPolyMarket);
  const resolveFn = useServerFn(resolvePolyMarket);
  const marketsQ = useQuery({ queryKey: ["poly-markets"], queryFn: () => listFn(), refetchInterval: 5_000 });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [minBet, setMinBet] = useState("2");
  const [closesAt, setClosesAt] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title,
          description,
          minBet: Number(minBet),
          closesAt: closesAt || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Polymarket created");
      setTitle("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["poly-markets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resolveMut = useMutation({
    mutationFn: (vars: { marketId: string; outcome: "yes" | "no" | "void" }) =>
      resolveFn({ data: vars }),
    onSuccess: (r) => {
      toast.success(`Market settled: ${r.settled} bets`);
      qc.invalidateQueries({ queryKey: ["poly-markets"] });
      qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-center gap-2">
        <Scale className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Polymarket controls</h2>
          <p className="text-sm text-muted-foreground">
            Create markets, close them, and settle all client bets by outcome.
          </p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_120px_190px_auto] lg:items-end">
        <div>
          <Label>Question</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Will BTC close above..." />
        </div>
        <div>
          <Label>Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Rules and source" />
        </div>
        <div>
          <Label>Min bet</Label>
          <Input type="number" min={2} value={minBet} onChange={(e) => setMinBet(e.target.value)} />
        </div>
        <div>
          <Label>Close time</Label>
          <Input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </div>
        <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || title.length < 5}>
          Create
        </Button>
      </div>

      <div className="divide-y divide-border rounded-md border border-border">
        {(marketsQ.data?.markets ?? []).map((market: any) => (
          <div key={market.id} className="grid gap-3 p-3 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="font-semibold">{market.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                YES pool {formatMoney(Number(market.yesPool ?? 0))} - NO pool {formatMoney(Number(market.noPool ?? 0))} - status {market.status}
              </div>
            </div>
            {market.status === "open" ? (
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" className="bg-bull text-bull-foreground hover:bg-bull/90" onClick={() => resolveMut.mutate({ marketId: market.id, outcome: "yes" })}>
                  YES won
                </Button>
                <Button size="sm" className="bg-bear text-bear-foreground hover:bg-bear/90" onClick={() => resolveMut.mutate({ marketId: market.id, outcome: "no" })}>
                  NO won
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolveMut.mutate({ marketId: market.id, outcome: "void" })}>
                  Void
                </Button>
              </div>
            ) : (
              <div className="text-sm font-semibold uppercase text-muted-foreground">
                {market.outcome ?? market.status}
              </div>
            )}
          </div>
        ))}
        {(marketsQ.data?.markets ?? []).length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">No polymarkets yet.</div>
        )}
      </div>
    </Card>
  );
}
