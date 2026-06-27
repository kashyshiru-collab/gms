import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { openDigitTrade, getActiveBinaryTrades, resolveMyDueBinaryTrades, PAYOUT_MULTIPLIER } from "@/lib/binary.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bot, Info, Minus, Plus, User, TrendingDown, TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { DIGIT_OVER_PAYOUTS, DIGIT_UNDER_PAYOUTS, MAX_TRADE_STAKE_USD } from "@/lib/risk";

type ContractGroup = "rise_fall" | "even_odd" | "matches" | "over_under";

const GROUPS: { id: ContractGroup; label: string; sub: [string, string] }[] = [
  { id: "rise_fall",       label: "Buy / Sell",        sub: ["Buy", "Sell"] },
  { id: "even_odd",        label: "Even / Odd",        sub: ["Even", "Odd"] },
  { id: "matches",         label: "Matches",           sub: ["Matches", "Differs"] },
  { id: "over_under",      label: "Over / Under",      sub: ["Over", "Under"] },
];

const TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const fmt = formatMoney;

function payoutFor(group: ContractGroup, side: "a" | "b", barrier: number): number {
  if (group === "rise_fall" || group === "even_odd") return PAYOUT_MULTIPLIER;
  if (group === "matches") return side === "a" ? 8.2 : 1.03;
  return side === "a"
    ? (DIGIT_OVER_PAYOUTS[barrier] ?? PAYOUT_MULTIPLIER)
    : (DIGIT_UNDER_PAYOUTS[barrier] ?? PAYOUT_MULTIPLIER);
}

export function DerivedPanel({
  symbol,
  stake,
  setStake,
  ticks,
  setTicks,
  groupIdx,
  setGroupIdx,
}: {
  symbol: string;
  stake: string;
  setStake: (v: string) => void;
  ticks: number;
  setTicks: (v: number) => void;
  groupIdx: number;
  setGroupIdx: (v: number) => void;
}) {
  const qc = useQueryClient();
  const openFn = useServerFn(openDigitTrade);
  const listFn = useServerFn(getActiveBinaryTrades);

  const [barrier, setBarrier] = useState(5);
  const [tab, setTab] = useState<"stake" | "payout">("stake");

  const group = GROUPS[groupIdx];

  // Keep digit contracts aligned with the chart's 1Hz tick stream.
  const duration = useMemo(() => {
    return Math.max(1, ticks);
  }, [ticks]);

  const tradesQ = useQuery({
    queryKey: ["binary-trades"],
    queryFn: () => listFn(),
    refetchInterval: 1_000,
  });

  // Auto-resolve the current user's expired trades and toast the outcome.
  const resolveFn = useServerFn(resolveMyDueBinaryTrades);
  const seenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await resolveFn();
        if (!alive) return;
        for (const x of r.resolved ?? []) {
          if (seenRef.current.has(x.id)) continue;
          seenRef.current.add(x.id);
          if (x.status === "won") {
            toast.success(`WIN · +${fmt(Math.max(0, x.payout - x.stake))}`);
          } else if (x.status === "lost") {
            toast.warning(`LOSS · -${fmt(x.stake)}`);
          } else if (x.status === "refund") {
            toast.message(`Refund · ${fmt(x.stake)}`);
          }
        }
        if ((r.resolved ?? []).length > 0) {
          qc.invalidateQueries({ queryKey: ["binary-trades"] });
          qc.invalidateQueries({ queryKey: ["dash"] });
        }
      } catch {
        // ignore
      }
    };
    const id = setInterval(tick, 500);
    tick();
    return () => { alive = false; clearInterval(id); };
  }, [resolveFn, qc]);


  const mut = useMutation({
    mutationFn: (vars: { contract: string; prediction: string }) =>
      openFn({
        data: {
          symbol,
          contract: vars.contract as any,
          prediction: vars.prediction as any,
          barrier:
            group.id === "over_under" || group.id === "matches" ? barrier : null,
          stake: Number(stake) || 0,
          duration,
        },
      }),
    onSuccess: (_, v) => {
      toast.success(`${v.prediction.toUpperCase()} · ${symbol} · ${fmt(Number(stake))} · ${ticks}T`);
      qc.invalidateQueries({ queryKey: ["binary-trades"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payoutA = useMemo(() => payoutFor(group.id, "a", barrier), [group.id, barrier]);
  const payoutB = useMemo(() => payoutFor(group.id, "b", barrier), [group.id, barrier]);
  const stakeNum = Number(stake) || 0;
  const payoutAValue = stakeNum * payoutA;
  const payoutBValue = stakeNum * payoutB;
  const pctA = ((payoutA - 1) * 100).toFixed(2);
  const pctB = ((payoutB - 1) * 100).toFixed(2);
  const mobileA =
    group.id === "rise_fall"
      ? "BUY"
      : group.id === "over_under"
        ? "OVER"
        : group.id === "matches"
          ? "MATCHES"
          : "EVEN";
  const mobileB =
    group.id === "rise_fall"
      ? "SELL"
      : group.id === "over_under"
        ? "UNDER"
        : group.id === "matches"
          ? "DIFFERS"
          : "ODD";
  const quickStakes = [1, 5, 10, 25, 50, 100];

  function placeA() {
    if (group.id === "rise_fall")       return mut.mutate({ contract: "rise_fall", prediction: "up" });
    if (group.id === "over_under")      return mut.mutate({ contract: "over",      prediction: "over" });
    if (group.id === "matches")         return mut.mutate({ contract: "matches",   prediction: "matches" });
    return mut.mutate({ contract: "even", prediction: "even" });
  }
  function placeB() {
    if (group.id === "rise_fall")       return mut.mutate({ contract: "rise_fall", prediction: "down" });
    if (group.id === "over_under")      return mut.mutate({ contract: "under",     prediction: "under" });
    if (group.id === "matches")         return mut.mutate({ contract: "differs",   prediction: "differs" });
    return mut.mutate({ contract: "odd", prediction: "odd" });
  }

  const stepStake = (delta: number) => {
    const next = Math.min(MAX_TRADE_STAKE_USD, Math.max(10, (Number(stake) || 0) + delta));
    setStake(String(next));
  };

  const showBarrier = group.id === "over_under" || group.id === "matches";
  const open = (tradesQ.data ?? []).filter((t: any) => t.status === "open");
  const recent = (tradesQ.data ?? []).filter((t: any) => t.status !== "open").slice(0, 5);

  // arrow-shaped right edge (chevron-cut) for action buttons
  const arrowClip = { clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)" } as const;

  return (
    <div className="space-y-2 lg:space-y-3">
      <div className="hidden rounded-lg border border-border bg-card/60 p-1 lg:grid lg:grid-cols-4 lg:gap-1">
        {GROUPS.map((item, index) => (
          <button
            key={item.id}
            onClick={() => setGroupIdx(index)}
            className={`rounded-md px-2 py-2 text-xs font-semibold transition ${
              groupIdx === index ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Last digit prediction */}
      {showBarrier && (
        <div className="lg:hidden border-b border-border/80 px-0 pb-2">
          <div className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Select digit (0-9)
          </div>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <button
                key={i}
                onClick={() => setBarrier(i)}
                className={`h-11 rounded-md border text-lg font-bold transition ${
                  barrier === i
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_0_18px_var(--primary)]"
                    : "border-border bg-muted/35 text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      )}

      {showBarrier && (
        <div className="hidden rounded-lg border border-border bg-card/60 p-3 lg:block">
          <div className="text-center text-sm font-medium mb-2">Last Digit Prediction</div>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => (
              <button
                key={i}
                onClick={() => setBarrier(i)}
                className={`py-2 text-sm rounded-md border transition ${
                  barrier === i
                    ? "bg-muted border-foreground/40 text-foreground font-bold"
                    : "bg-card border-border text-foreground hover:bg-muted/60"
                }`}
              >{i}</button>
            ))}
          </div>
        </div>
      )}

      {/* Ticks */}
      <div className="hidden rounded-lg border border-border bg-card/60 p-3">
        <div className="text-center text-sm font-medium mb-3">Ticks</div>
        <div className="relative h-6 flex items-center">
          <div className="absolute inset-x-1 h-[3px] bg-muted rounded-full" />
          <div
            className="absolute left-1 h-[3px] bg-primary rounded-full"
            style={{ width: `calc(${((ticks - 1) / 9) * 100}% )` }}
          />
          <div className="relative flex w-full justify-between px-0.5">
            {TICKS.map((t) => {
              const active = t <= ticks;
              const isCurrent = t === ticks;
              return (
                <button
                  key={t}
                  onClick={() => setTicks(t)}
                  className={`h-3 w-3 rounded-full transition ${
                    active ? "bg-primary" : "bg-muted-foreground/30"
                  } ${isCurrent ? "ring-2 ring-primary/30 h-4 w-4 -mt-0.5" : ""}`}
                  aria-label={`${t} ticks`}
                />
              );
            })}
          </div>
        </div>
        <div className="mt-3 text-center font-semibold text-sm">{ticks} Ticks</div>
      </div>

      {/* Stake / Payout tabs */}
      <div className="grid grid-cols-2 gap-2 lg:hidden">
        <button className="flex h-12 items-center justify-center gap-2 rounded-md bg-primary text-sm font-bold text-primary-foreground">
          <User className="h-4 w-4" />
          Manual Trading
        </button>
        <button className="flex h-12 items-center justify-center gap-2 rounded-md border border-border bg-card/70 text-sm font-bold text-foreground">
          <Bot className="h-4 w-4 text-primary" />
          Smart Trading Bot
        </button>
      </div>

      <div className="lg:hidden">
        <div className="grid grid-cols-[52px_1fr_52px] gap-2">
          <button
            onClick={() => stepStake(-10)}
            className="flex h-14 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground"
            aria-label="decrease stake"
          >
            <Minus className="h-5 w-5" />
          </button>
          <div className="flex h-14 items-center justify-center rounded-md border border-primary/55 bg-background px-3">
            <span className="mr-3 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
              Stake $
            </span>
            <Input
              type="number"
              min={10}
              max={MAX_TRADE_STAKE_USD}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="h-12 border-0 bg-transparent p-0 text-center text-3xl font-bold shadow-none focus-visible:ring-0"
            />
          </div>
          <button
            onClick={() => stepStake(10)}
            className="flex h-14 items-center justify-center rounded-md border border-border bg-muted/40 text-foreground"
            aria-label="increase stake"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1">
          {quickStakes.map((value) => (
            <button
              key={value}
              onClick={() => setStake(String(value))}
              className={`h-9 rounded border text-xs font-bold ${
                Number(stake) === value
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-card/60 text-muted-foreground"
              }`}
            >
              ${value}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden rounded-lg border border-border bg-card/60 overflow-hidden lg:block">
        <div className="grid grid-cols-2 text-sm font-medium">
          <button
            onClick={() => setTab("stake")}
            className={`py-2 ${tab === "stake" ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground"}`}
          >Stake</button>
          <button
            onClick={() => setTab("payout")}
            className={`py-2 ${tab === "payout" ? "bg-muted text-foreground" : "bg-transparent text-muted-foreground"}`}
          >Payout</button>
        </div>
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            onClick={() => stepStake(-10)}
            className="h-9 w-9 rounded-md border border-border hover:bg-muted text-muted-foreground flex items-center justify-center"
            aria-label="decrease"
          ><Minus className="h-4 w-4" /></button>
          <Input
            type="number"
            min={10}
            max={MAX_TRADE_STAKE_USD}
            value={tab === "stake" ? stake : (stakeNum * Math.max(payoutA, payoutB)).toFixed(2)}
            onChange={(e) => tab === "stake" && setStake(e.target.value)}
            readOnly={tab === "payout"}
            className="text-center h-9 font-semibold"
          />
          <button
            onClick={() => stepStake(10)}
            className="h-9 w-9 rounded-md border border-border hover:bg-muted text-muted-foreground flex items-center justify-center"
            aria-label="increase"
          ><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Payout row A */}
      <div className="grid grid-cols-2 gap-2 pt-1 lg:hidden">
        <button
          onClick={placeA}
          disabled={mut.isPending || !stakeNum}
          className="h-14 rounded-full bg-bull text-xl font-black tracking-wide text-bull-foreground shadow-[0_-6px_16px_rgba(255,255,255,0.18)_inset] disabled:opacity-60"
        >
          {mobileA}
        </button>
        <button
          onClick={placeB}
          disabled={mut.isPending || !stakeNum}
          className="h-14 rounded-full bg-bear text-xl font-black tracking-wide text-bear-foreground shadow-[0_-6px_16px_rgba(255,255,255,0.18)_inset] disabled:opacity-60"
        >
          {mobileB}
        </button>
      </div>

      <div className="hidden lg:block">
        <div className="flex items-center justify-between text-[11px] mb-1 px-0.5">
          <span className="text-muted-foreground">Payout <span className="font-semibold text-foreground">{fmt(payoutAValue)}</span></span>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <button
          onClick={placeA}
          disabled={mut.isPending || !stakeNum}
          style={arrowClip}
          className="w-full h-14 pr-6 pl-4 flex items-center justify-between bg-bull text-bull-foreground hover:bg-bull/90 disabled:opacity-60 font-bold transition"
        >
          <span className="flex items-center gap-2">
            {group.id === "rise_fall" && <TrendingUp className="h-4 w-4" />}
            <span className="tracking-wide">{group.sub[0]}</span>
          </span>
          <span className="tabular text-sm">{pctA}%</span>
        </button>
      </div>

      {/* Payout row B */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between text-[11px] mb-1 px-0.5">
          <span className="text-muted-foreground">Payout <span className="font-semibold text-foreground">{fmt(payoutBValue)}</span></span>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <button
          onClick={placeB}
          disabled={mut.isPending || !stakeNum}
          style={arrowClip}
          className="w-full h-14 pr-6 pl-4 flex items-center justify-between bg-bear text-bear-foreground hover:bg-bear/90 disabled:opacity-60 font-bold transition"
        >
          <span className="flex items-center gap-2">
            {group.id === "rise_fall" && <TrendingDown className="h-4 w-4" />}
            <span className="tracking-wide">{group.sub[1]}</span>
          </span>
          <span className="tabular text-sm">{pctB}%</span>
        </button>
      </div>

      {open.length > 0 && (
        <div className="hidden space-y-1.5 pt-2 border-t border-border lg:block">
          <div className="text-xs text-muted-foreground">Open</div>
          {open.map((t: any) => <OpenRow key={t.id} trade={t} />)}
        </div>
      )}

      {recent.length > 0 && (
        <div className="hidden space-y-1.5 pt-2 border-t border-border lg:block">
          <div className="text-xs text-muted-foreground">Recent</div>
          {recent.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-border/60 px-2.5 py-1.5 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{(t.contract_type ?? "rise_fall").replace("_", "/")}</span>
                {t.pair} · {fmt(Number(t.stake_kes))}
              </span>
              <span className={
                t.status === "won" ? "text-bull font-medium" :
                t.status === "lost" ? "text-bear font-medium" :
                "text-muted-foreground"
              }>
                {t.status === "won" ? `+${fmt(Number(t.payout_kes) - Number(t.stake_kes))}` :
                 t.status === "lost" ? `-${fmt(Number(t.stake_kes))}` :
                 "refund"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OpenRow({ trade }: { trade: any }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(trade.expires_at).getTime() - Date.now()) / 1000)),
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(trade.expires_at).getTime() - Date.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [trade.expires_at]);
  const total = trade.duration_seconds;
  const pct = Math.min(100, ((total - remaining) / total) * 100);
  return (
    <div className="rounded-md border border-border/60 px-2.5 py-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{(trade.contract_type ?? "rise_fall").replace("_", "/")}</span>
          {trade.pair} · {fmt(Number(trade.stake_kes))}
        </span>
        <span className="font-mono tabular">{remaining}s</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
