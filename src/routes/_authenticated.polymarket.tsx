import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkIsAdmin } from "@/lib/admin.functions";
import { getDashboard } from "@/lib/wallet.functions";
import { listPolymarkets, placePolyBet } from "@/lib/polymarket.functions";
import { formatMoney } from "@/lib/money";
import { ArrowLeft, Scale } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/polymarket")({
  head: () => ({ meta: [{ title: "Polymarket - TronixOption" }] }),
  component: PolymarketPage,
});

function PolymarketPage() {
  const qc = useQueryClient();
  const adminFn = useServerFn(checkIsAdmin);
  const dashFn = useServerFn(getDashboard);
  const listFn = useServerFn(listPolymarkets);
  const placeFn = useServerFn(placePolyBet);
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn(), staleTime: 60_000 });
  const dashQ = useQuery({ queryKey: ["dash"], queryFn: () => dashFn(), refetchInterval: 8_000 });
  const marketsQ = useQuery({ queryKey: ["poly-markets"], queryFn: () => listFn(), refetchInterval: 5_000 });
  const [amountByMarket, setAmountByMarket] = useState<Record<string, string>>({});

  const placeMut = useMutation({
    mutationFn: (vars: { marketId: string; side: "yes" | "no"; amount: number }) =>
      placeFn({ data: vars }),
    onSuccess: (result) => {
      toast.success(`Bet placed at ${Number(result.quotedMultiplier).toFixed(2)}x quoted payout`);
      qc.invalidateQueries({ queryKey: ["poly-markets"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markets = marketsQ.data?.markets ?? [];
  const bets = marketsQ.data?.bets ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-3 px-3">
          <div className="flex items-center gap-2">
            <AppMenu isAdmin={adminQ.data?.isAdmin} isAgent={adminQ.data?.isAgent} />
            <div className="flex items-center gap-2 font-semibold">
              <Scale className="h-5 w-5 text-primary" />
              Polymarket
            </div>
          </div>
          <div className="justify-self-center text-sm text-muted-foreground">
            {formatMoney(dashQ.data?.balance ?? 0)}
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link to="/dashboard">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Trade
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 p-3 pb-8">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Prediction markets
          </div>
          <h1 className="mt-2 text-2xl font-bold">Bet Yes or No from USD 2</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Payouts are pool based. If you enter when your side is crowded, a correct outcome can
            still pay only a small profit or less than your stake after the market fee.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {markets.map((market: any) => {
            const amount = Number(amountByMarket[market.id] ?? marketsQ.data?.minBetUsd ?? 2);
            const myBets = bets.filter((b: any) => b.market_id === market.id);
            return (
              <MarketCard
                key={market.id}
                market={market}
                amount={amount}
                myBets={myBets}
                disabled={placeMut.isPending}
                onAmount={(value) => setAmountByMarket((s) => ({ ...s, [market.id]: value }))}
                onPlace={(side) => placeMut.mutate({ marketId: market.id, side, amount })}
              />
            );
          })}
          {markets.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground md:col-span-2">
              No markets are open yet. Admin can create markets from the admin page.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MarketCard({
  market,
  amount,
  myBets,
  disabled,
  onAmount,
  onPlace,
}: {
  market: any;
  amount: number;
  myBets: any[];
  disabled: boolean;
  onAmount: (value: string) => void;
  onPlace: (side: "yes" | "no") => void;
}) {
  const totalPool = Number(market.yesPool ?? 0) + Number(market.noPool ?? 0);
  const yesShare = totalPool ? Math.round((Number(market.yesPool ?? 0) / totalPool) * 100) : 50;
  const noShare = 100 - yesShare;
  const yesReturn = useMemo(() => amount * Number(market.yesQuote ?? 0), [amount, market.yesQuote]);
  const noReturn = useMemo(() => amount * Number(market.noQuote ?? 0), [amount, market.noQuote]);
  const closed = market.status !== "open";

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold leading-snug">{market.title}</h2>
          {market.description && <p className="mt-1 text-sm text-muted-foreground">{market.description}</p>}
        </div>
        <span className={`rounded px-2 py-1 text-xs font-semibold ${closed ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}>
          {market.status}
        </span>
      </div>

      <div className="mt-4 overflow-hidden rounded-full bg-muted">
        <div className="flex h-3">
          <div className="bg-bull" style={{ width: `${yesShare}%` }} />
          <div className="bg-bear" style={{ width: `${noShare}%` }} />
        </div>
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>YES {yesShare}% pool</span>
        <span>NO {noShare}% pool</span>
      </div>

      <div className="mt-4">
        <label className="text-xs font-medium text-muted-foreground">Amount (USD)</label>
        <Input type="number" min={Number(market.min_bet_kes ?? 2)} value={String(amount)} onChange={(e) => onAmount(e.target.value)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          className="h-12 bg-bull text-bull-foreground hover:bg-bull/90"
          disabled={disabled || closed}
          onClick={() => onPlace("yes")}
        >
          YES {Number(market.yesQuote ?? 0).toFixed(2)}x
        </Button>
        <Button
          className="h-12 bg-bear text-bear-foreground hover:bg-bear/90"
          disabled={disabled || closed}
          onClick={() => onPlace("no")}
        >
          NO {Number(market.noQuote ?? 0).toFixed(2)}x
        </Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>YES returns about {formatMoney(yesReturn)}</span>
        <span>NO returns about {formatMoney(noReturn)}</span>
      </div>

      {myBets.length > 0 && (
        <div className="mt-4 space-y-1 border-t border-border pt-3">
          <div className="text-xs font-semibold text-muted-foreground">Your entries</div>
          {myBets.map((bet) => (
            <div key={bet.id} className="flex justify-between rounded bg-background px-2 py-1.5 text-xs">
              <span className="uppercase">{bet.side}</span>
              <span className="tabular">
                {formatMoney(Number(bet.amount_kes))} {"->"} {bet.status === "open" ? `${Number(bet.quoted_multiplier).toFixed(2)}x` : formatMoney(Number(bet.payout_kes))}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
