import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getQuotes, getCandles } from "@/lib/forex.functions";
import { getDashboard, openPosition, closePosition, initiateDeposit, reconcilePendingDeposits } from "@/lib/wallet.functions";
import { checkIsAdmin } from "@/lib/admin.functions";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { PriceChart } from "@/components/trading/PriceChart";
import { TickChart } from "@/components/trading/TickChart";
import { DerivedPanel } from "@/components/trading/DerivedPanel";
import { DigitStatsStrip } from "@/components/trading/DigitStatsStrip";
import { ActivityFeed } from "@/components/trading/ActivityFeed";
import { WithdrawDialog } from "@/components/trading/WithdrawDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, LogOut, Plus, Shield, Users, Wallet, CheckCircle2, Lock } from "lucide-react";
import { AppMenu } from "@/components/AppMenu";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — GMX Trader" }] }),
  component: Dashboard,
});

const fmtKES = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(n);

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const quotesFn = useServerFn(getQuotes);
  const candlesFn = useServerFn(getCandles);
  const dashFn = useServerFn(getDashboard);
  const isAdminFn = useServerFn(checkIsAdmin);
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => isAdminFn(), staleTime: 60_000, retry: false });

  const [category, setCategory] = useState<"synthetic" | "forex">("synthetic");
  const [symbol, setSymbol] = useState("VOL10");
  const [stake, setStake] = useState("100");
  const [derivedTicks, setDerivedTicks] = useState(5);
  const [expanded, setExpanded] = useState(false);
  const [marketsOpen, setMarketsOpen] = useState(false);

  const isDerived = category === "synthetic";

  const quotesQ = useQuery({ queryKey: ["quotes"], queryFn: () => quotesFn(), refetchInterval: 2_000 });
  const candlesQ = useQuery({
    queryKey: ["candles", symbol, "1m"],
    queryFn: () => candlesFn({ data: { symbol, interval: "1m" } }),
    enabled: !isDerived,
    refetchInterval: isDerived ? false : 10_000,
  });
  const dashQ = useQuery({ queryKey: ["dash"], queryFn: () => dashFn(), refetchInterval: 8_000 });

  const openFn = useServerFn(openPosition);
  const closeFn = useServerFn(closePosition);
  const depositFn = useServerFn(initiateDeposit);
  const reconcileFn = useServerFn(reconcilePendingDeposits);

  const hasPendingDeposit = (dashQ.data?.transactions ?? []).some(
    (t: any) => t.type === "deposit" && t.status === "pending",
  );
  useQuery({
    queryKey: ["reconcile-deposits"],
    queryFn: async () => {
      const r = await reconcileFn();
      if (r.credited > 0) {
        toast.success(`Deposit confirmed: ${r.credited} credited`);
        qc.invalidateQueries({ queryKey: ["dash"] });
      }
      return r;
    },
    enabled: hasPendingDeposit,
    refetchInterval: hasPendingDeposit ? 6_000 : false,
  });

  const openMut = useMutation({
    mutationFn: (vars: { side: "buy" | "sell" }) =>
      openFn({ data: { symbol, side: vars.side, stake: Number(stake) } }),
    onSuccess: (_, vars) => {
      toast.success(`${vars.side.toUpperCase()} ${symbol} for ${fmtKES(Number(stake))} opened`);
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMut = useMutation({
    mutationFn: (id: string) => closeFn({ data: { positionId: id } }),
    onSuccess: (r) => {
      toast[r.pnl >= 0 ? "success" : "warning"](`Closed @ ${r.exit.toFixed(5)} · P&L ${fmtKES(r.pnl)}`);
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedQuote = quotesQ.data?.find((q) => q.symbol === symbol);
  

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground md:bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-2 px-3 py-2 md:px-6 md:py-3">
          <div className="flex items-center gap-1">
            <AppMenu isAdmin={adminQ.data?.isAdmin} />
            <SecretAdminLogo isAdmin={Boolean(adminQ.data?.isAdmin)} />
          </div>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-xs tabular sm:gap-2 sm:rounded-md sm:px-3 sm:py-1.5 sm:text-sm">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-primary sm:h-4 sm:w-4" />
              <span className="hidden text-muted-foreground sm:inline">Balance</span>
              <span className="max-w-[112px] truncate font-semibold sm:max-w-none">{fmtKES(dashQ.data?.balance ?? 0)}</span>
            </div>
            <DepositDialog depositFn={depositFn} onDone={() => qc.invalidateQueries({ queryKey: ["dash"] })} />
            <div className="hidden sm:block">
              <WithdrawDialog balance={dashQ.data?.balance ?? 0} />
            </div>
            <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
              <Link to="/referrals"><Users className="h-4 w-4 mr-1.5" />Refer</Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="md:hidden" title="Refer">
              <Link to="/referrals"><Users className="h-4 w-4" /></Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className={`grid gap-0 p-0 md:gap-4 md:p-4 ${expanded ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]" : "lg:grid-cols-[minmax(0,1fr)_320px]"}`}>
        {/* Chart + market selector */}
        <section className="flex min-h-0 flex-col border-b border-border bg-card md:min-h-[520px] md:rounded-xl md:border">
          {isDerived && (
            <div className="grid grid-cols-3 gap-1 border-b border-border bg-background/50 p-2 md:hidden">
              {["Rise/Fall", "Even/Odd", "Over/Under"].map((label) => (
                <button
                  key={label}
                  className={`rounded-md px-2 py-3 text-center text-sm font-semibold ${
                    label === "Rise/Fall" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2 md:px-4 md:py-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Category toggle */}
              <div className="hidden rounded-md border border-border bg-muted/40 p-0.5 md:inline-flex">
                {(["synthetic", "forex"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setCategory(c);
                      const first = (quotesQ.data ?? []).find((q) =>
                        c === "synthetic" ? q.category === "synthetic" : q.category !== "synthetic",
                      );
                      if (first) setSymbol(first.symbol);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      category === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >{c === "synthetic" ? "Derived" : "Forex"}</button>
                ))}
              </div>

              {/* Markets dropdown */}
              <div className="relative">
                <button
                  onClick={() => setMarketsOpen((v) => !v)}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <span className="font-semibold">{symbol}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">{selectedQuote?.label}</span>
                  <svg width="10" height="10" viewBox="0 0 10 10" className={`transition-transform ${marketsOpen ? "rotate-180" : ""}`}><path d="M2 4l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
                </button>
                {marketsOpen && (
                  <div className="absolute z-40 mt-1 w-72 max-h-80 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                    {(quotesQ.data ?? [])
                      .filter((q) => (category === "synthetic" ? q.category === "synthetic" : q.category !== "synthetic"))
                      .map((q) => {
                        const up = q.changePct >= 0;
                        return (
                          <button
                            key={q.symbol}
                            onClick={() => { setSymbol(q.symbol); setMarketsOpen(false); }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-accent ${q.symbol === symbol ? "bg-accent" : ""}`}
                          >
                            <div>
                              <div className="text-sm font-medium">{q.symbol}</div>
                              <div className="text-[11px] text-muted-foreground">{q.label}</div>
                            </div>
                            <div className="text-right tabular">
                              <div className="font-mono text-sm">{q.price.toFixed(q.decimals ?? 5)}</div>
                              <div className={`text-[11px] ${up ? "text-bull" : "text-bear"}`}>
                                {up ? "+" : ""}{q.changePct.toFixed(2)}%
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>

              {selectedQuote && (
                <div className="hidden md:flex items-baseline gap-2">
                  <span className="font-mono text-lg tabular">{selectedQuote.price.toFixed(selectedQuote.decimals ?? 5)}</span>
                  <span className={`text-xs font-medium ${selectedQuote.changePct >= 0 ? "text-bull" : "text-bear"}`}>
                    {selectedQuote.changePct >= 0 ? "+" : ""}{selectedQuote.changePct.toFixed(2)}%
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto">
              {!isDerived && (
                <span className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground font-medium">
                  1m
                </span>
              )}
              <button
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                title={expanded ? "Collapse" : "Expand chart"}
              >
                {expanded ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 1v4H1M9 13V9h4M9 5V1h4M5 9v4H1" stroke="currentColor" strokeWidth="1.5"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 5V1h4M13 5V1H9M1 9v4h4M13 9v4H9" stroke="currentColor" strokeWidth="1.5"/></svg>
                )}
              </button>
            </div>
          </div>
          <div className={`h-[260px] p-2 md:h-auto md:flex-1 ${expanded ? "min-h-[70vh]" : ""}`}>
            {isDerived ? (
              <TickChart symbol={symbol} windowTicks={derivedTicks} />
            ) : candlesQ.data ? (
              <PriceChart data={candlesQ.data.candles} livePrice={selectedQuote?.price} />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
            )}
          </div>
          {category === "synthetic" && <DigitStatsStrip symbol={symbol} />}
        </section>

        {/* Trade panel */}
        <aside className="h-fit border-b border-border bg-card p-4 lg:sticky lg:top-20 lg:rounded-xl lg:border lg:p-5">
          <div className="mb-3 hidden items-center justify-between md:flex">
            <h2 className="text-sm font-semibold">Place order</h2>
            <span className="text-xs text-muted-foreground">{symbol}</span>
          </div>

          {category === "forex" ? (
            <ForexOrderPanel
              symbol={symbol}
              stake={stake}
              setStake={setStake}
              spot={selectedQuote?.price}
              decimals={selectedQuote?.decimals ?? 5}
              openMut={openMut}
              closeMut={closeMut}
              positions={dashQ.data?.positions ?? []}
            />
          ) : (
            <DerivedPanel
              symbol={symbol}
              stake={stake}
              setStake={setStake}
              ticks={derivedTicks}
              setTicks={setDerivedTicks}
            />
          )}
        </aside>
      </main>


      <section className="hidden px-4 pb-4 md:block">
        <ActivityFeed />
      </section>

      {/* Positions */}
      <section className="px-0 pb-8 md:px-4">
        <div className="grid grid-cols-3 border-b border-border bg-card text-sm font-medium md:hidden">
          <button className="border-b border-primary px-4 py-4 text-left text-foreground">Open ({(dashQ.data?.positions ?? []).filter((p: any) => p.status === "open").length})</button>
          <button className="px-4 py-4 text-left text-muted-foreground">Closed ({(dashQ.data?.positions ?? []).filter((p: any) => p.status !== "open").length})</button>
          <button className="px-4 py-4 text-left text-muted-foreground">Transactions</button>
        </div>
        <div className="border-border bg-card md:rounded-xl md:border">
          <div className="hidden border-b border-border px-5 py-3 md:block">
            <h2 className="text-sm font-semibold">Positions & history</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Pair</th>
                  <th className="px-4 py-2 font-medium">Side</th>
                  <th className="px-4 py-2 font-medium">Stake</th>
                  <th className="px-4 py-2 font-medium">Entry</th>
                  <th className="px-4 py-2 font-medium">Exit</th>
                  <th className="px-4 py-2 font-medium">P&L</th>
                  <th className="px-4 py-2 font-medium">Opened</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border tabular">
                {(dashQ.data?.positions ?? []).length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No positions yet.</td></tr>
                )}
                {(dashQ.data?.positions ?? []).map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-medium">{p.pair}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${p.side === "buy" ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"}`}>
                        {p.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2">{fmtKES(Number(p.stake_kes))}</td>
                    <td className="px-4 py-2 font-mono">{Number(p.entry_price).toFixed(5)}</td>
                    <td className="px-4 py-2 font-mono">{p.exit_price ? Number(p.exit_price).toFixed(5) : "—"}</td>
                    <td className={`px-4 py-2 font-medium ${p.pnl_kes == null ? "" : Number(p.pnl_kes) >= 0 ? "text-bull" : "text-bear"}`}>
                      {p.pnl_kes == null ? "—" : fmtKES(Number(p.pnl_kes))}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(p.opened_at), { addSuffix: true })}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.status === "open" ? (
                        <Button size="sm" variant="outline" onClick={() => closeMut.mutate(p.id)} disabled={closeMut.isPending}>
                          Close
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">closed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function DepositDialog({ depositFn, onDone }: { depositFn: ReturnType<typeof useServerFn<typeof initiateDeposit>>; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"broker" | "form">("broker");
  const [broker, setBroker] = useState<"HIGH_MAX_SUPER" | null>(null);
  const [amount, setAmount] = useState("100");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("broker");
    setBroker(null);
    supabase.auth.getUser().then(({ data }) => {
      const p = (data.user?.user_metadata as any)?.phone;
      if (p && !phone) setPhone(p);
    });
  }, [open]);

  async function submit() {
    setLoading(true);
    try {
      const r = await depositFn({ data: { amount: Number(amount), phone, broker: broker ?? "HIGH_MAX_SUPER" } });
      toast.success(r.message);
      setOpen(false);
      setTimeout(onDone, 4000);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start deposit");
    } finally {
      setLoading(false);
    }
  }

  const brokers = [
    { id: "HIGH_MAX_SUPER" as const, name: "HIGH MAX SUPER", desc: "M-Pesa STK push · instant", available: true },
    { id: "DCASH", name: "DCASH", desc: "Currently unavailable", available: false },
    { id: "FX_TRADER", name: "FX TRADER", desc: "Currently unavailable", available: false },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Deposit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step === "broker" ? "Choose a broker" : "Top up via HIGH MAX SUPER"}</DialogTitle>
        </DialogHeader>

        {step === "broker" ? (
          <div className="space-y-2">
            {brokers.map((b) => (
              <button
                key={b.id}
                disabled={!b.available}
                onClick={() => {
                  if (!b.available) return;
                  setBroker(b.id as "HIGH_MAX_SUPER");
                  setStep("form");
                }}
                className={`w-full text-left rounded-lg border p-3 flex items-center justify-between transition-colors ${
                  b.available
                    ? "border-border hover:bg-accent cursor-pointer"
                    : "border-border/60 bg-muted/30 opacity-60 cursor-not-allowed"
                }`}
              >
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {b.name}
                    {b.available ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-bull" />
                    ) : (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{b.desc}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="amt">Amount (KES)</Label>
              <Input id="amt" type="number" min={10} max={150000} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ph">M-Pesa phone</Label>
              <Input id="ph" placeholder="07XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              You'll receive an STK push prompt. Approve it on your phone to credit your wallet.
            </p>
          </div>
        )}

        {step === "form" && (
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep("broker")}>Back</Button>
            <Button onClick={submit} disabled={loading || !phone || Number(amount) < 10}>
              {loading ? "Sending…" : `Send STK for ${fmtKES(Number(amount) || 0)}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}


function ForexOrderPanel({
  symbol,
  stake,
  setStake,
  spot,
  decimals,
  openMut,
  closeMut,
  positions,
}: {
  symbol: string;
  stake: string;
  setStake: (v: string) => void;
  spot?: number;
  decimals: number;
  openMut: { mutate: (v: { side: "buy" | "sell" }) => void; isPending: boolean };
  closeMut: { mutate: (id: string) => void };
  positions: any[];
}) {
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [trigger, setTrigger] = useState("");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [pendingSide, setPendingSide] = useState<"buy" | "sell" | null>(null);

  type Plan = { tp?: number; sl?: number; side: "buy" | "sell"; symbol: string };
  const STORAGE_KEY = "forex-order-plans";
  const readPlans = (): Record<string, Plan> => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); } catch { return {}; }
  };
  const writePlans = (p: Record<string, Plan>) =>
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));

  function submitMarket(side: "buy" | "sell") {
    const tpN = Number(tp) || undefined;
    const slN = Number(sl) || undefined;
    openMut.mutate({ side });
    setTimeout(() => {
      const p = (positions ?? []).find((x) => x.pair === symbol && x.status === "open");
      if (p && (tpN || slN)) {
        const plans = readPlans();
        plans[p.id] = { side, symbol, tp: tpN, sl: slN };
        writePlans(plans);
        toast.info(`TP/SL armed for ${symbol}`);
      }
      setTp(""); setSl("");
    }, 1500);
  }

  useEffect(() => {
    if (!pendingSide || !trigger || !spot) return;
    const t = Number(trigger);
    const hit = pendingSide === "buy" ? spot <= t : spot >= t;
    if (hit) {
      submitMarket(pendingSide);
      setPendingSide(null);
      setTrigger("");
      toast.success(`Trigger hit @ ${t}, ${pendingSide.toUpperCase()} sent`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, pendingSide, trigger]);

  useEffect(() => {
    if (!spot) return;
    const plans = readPlans();
    let mutated = false;
    for (const pos of positions ?? []) {
      if (pos.status !== "open" || pos.pair !== symbol) continue;
      const plan = plans[pos.id];
      if (!plan) continue;
      const longSide = plan.side === "buy";
      const tpHit = plan.tp && (longSide ? spot >= plan.tp : spot <= plan.tp);
      const slHit = plan.sl && (longSide ? spot <= plan.sl : spot >= plan.sl);
      if (tpHit || slHit) {
        closeMut.mutate(pos.id);
        delete plans[pos.id];
        mutated = true;
        toast[tpHit ? "success" : "warning"](`${tpHit ? "Take-profit" : "Stop-loss"} hit on ${pos.pair}`);
      }
    }
    if (mutated) writePlans(plans);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, positions, symbol]);

  function place(side: "buy" | "sell") {
    if (orderType === "limit") {
      if (!trigger) { toast.error("Set a trigger price"); return; }
      setPendingSide(side);
      toast.info(`Pending ${side.toUpperCase()} @ ${trigger}`);
      return;
    }
    submitMarket(side);
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Market</Label>
        <div className="rounded-md border border-border bg-input px-3 py-2 text-sm flex items-center justify-between">
          <span className="font-medium">{symbol}</span>
          <span className="font-mono text-xs text-muted-foreground tabular">
            {spot != null ? spot.toFixed(decimals) : "—"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-card/60 p-1">
        {(["market", "limit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`py-1.5 text-xs rounded font-medium ${
              orderType === t ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
            }`}
          >{t === "market" ? "Market" : "Limit / Trigger"}</button>
        ))}
      </div>

      <div>
        <Label htmlFor="stake">Stake (KES)</Label>
        <Input id="stake" type="number" min={10} value={stake} onChange={(e) => setStake(e.target.value)} />
        <p className="mt-1 text-[11px] text-muted-foreground">50x leverage applied to P&L on close.</p>
      </div>

      {orderType === "limit" && (
        <div>
          <Label htmlFor="trig">Trigger price</Label>
          <Input id="trig" type="number" step="any" placeholder={spot?.toFixed(decimals)} value={trigger} onChange={(e) => setTrigger(e.target.value)} />
          <p className="mt-1 text-[11px] text-muted-foreground">Buy fires when price ≤ trigger; Sell when ≥.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="tp" className="text-bull">Take-profit</Label>
          <Input id="tp" type="number" step="any" placeholder="optional" value={tp} onChange={(e) => setTp(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="sl" className="text-bear">Stop-loss</Label>
          <Input id="sl" type="number" step="any" placeholder="optional" value={sl} onChange={(e) => setSl(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          onClick={() => place("buy")}
          disabled={openMut.isPending}
          className="bg-bull text-bull-foreground hover:bg-bull/90"
        >
          <ArrowUp className="h-4 w-4 mr-1" /> Buy
        </Button>
        <Button
          onClick={() => place("sell")}
          disabled={openMut.isPending}
          className="bg-bear text-bear-foreground hover:bg-bear/90"
        >
          <ArrowDown className="h-4 w-4 mr-1" /> Sell
        </Button>
      </div>

      {pendingSide && (
        <div className="rounded-md border border-dashed border-border px-2.5 py-2 text-xs flex items-center justify-between">
          <span className="text-muted-foreground">Pending {pendingSide.toUpperCase()} @ {trigger}</span>
          <button onClick={() => { setPendingSide(null); setTrigger(""); }} className="text-bear hover:underline">cancel</button>
        </div>
      )}
    </div>
  );
}

function SecretAdminLogo({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();
  const [taps, setTaps] = useState(0);
  useEffect(() => {
    if (taps === 0) return;
    const t = setTimeout(() => setTaps(0), 1500);
    return () => clearTimeout(t);
  }, [taps]);
  function onTap() {
    const next = taps + 1;
    if (next >= 5) {
      setTaps(0);
      if (isAdmin) navigate({ to: "/admin" });
      return;
    }
    setTaps(next);
  }
  return (
    <button
      onClick={onTap}
      className="flex items-center gap-2 shrink-0 select-none"
      aria-label="GMX Trader"
    >
      <img src="/gmx-logo.png" alt="" width={28} height={28} className="h-7 w-7 rounded-md" />
      <span className="font-semibold tracking-tight hidden sm:inline">GMX Trader</span>
    </button>
  );
}
