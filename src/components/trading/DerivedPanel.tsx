import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { openDigitTrade, getActiveBinaryTrades, resolveMyDueBinaryTrades, PAYOUT_MULTIPLIER } from "@/lib/binary.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Info, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";

type ContractGroup = "rise_fall" | "over_under" | "matches_differs" | "even_odd";

const GROUPS: { id: ContractGroup; label: string; sub: [string, string] }[] = [
  { id: "rise_fall",       label: "Rise / Fall",       sub: ["Rise", "Fall"] },
  { id: "over_under",      label: "Over / Under",      sub: ["Over", "Under"] },
  { id: "matches_differs", label: "Matches / Differs", sub: ["Matches", "Differs"] },
  { id: "even_odd",        label: "Even / Odd",        sub: ["Even", "Odd"] },
];

const TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const fmt = (n: number) =>
  new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(n);

function payoutFor(group: ContractGroup, side: "a" | "b", barrier: number): number {
  if (group === "rise_fall" || group === "even_odd") return PAYOUT_MULTIPLIER;
  if (group === "matches_differs") return side === "a" ? 9.5 : 1.1;
  const over  = [1.10, 1.25, 1.40, 1.60, 1.85, 2.20, 2.80, 3.80, 7.50, 1.10];
  const under = [1.10, 7.50, 3.80, 2.80, 2.20, 1.85, 1.60, 1.40, 1.25, 1.10];
  return side === "a" ? (over[barrier] ?? 1.85) : (under[barrier] ?? 1.85);
}

export function DerivedPanel({
  symbol,
  stake,
  setStake,
}: {
  symbol: string;
  stake: string;
  setStake: (v: string) => void;
}) {
  const qc = useQueryClient();
  const openFn = useServerFn(openDigitTrade);
  const listFn = useServerFn(getActiveBinaryTrades);

  const [groupIdx, setGroupIdx] = useState(1); // default Over/Under like screenshot
  const [ticks, setTicks] = useState(5);
  const [barrier, setBarrier] = useState(5);
  const [tab, setTab] = useState<"stake" | "payout">("stake");

  const group = GROUPS[groupIdx];

  // tick -> seconds (1 tick ≈ 2s)
  const duration = useMemo(() => {
    const s = ticks * 2;
    if (s <= 15) return 15;
    if (s <= 30) return 30;
    if (s <= 60) return 60;
    if (s <= 120) return 120;
    return 300;
  }, [ticks]) as 15 | 30 | 60 | 120 | 300;

  const tradesQ = useQuery({
    queryKey: ["binary-trades"],
    queryFn: () => listFn(),
    refetchInterval: 3_000,
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
    const id = setInterval(tick, 2_000);
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
            group.id === "over_under" || group.id === "matches_differs" ? barrier : null,
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

  function placeA() {
    if (group.id === "rise_fall")       return mut.mutate({ contract: "rise_fall", prediction: "up" });
    if (group.id === "over_under")      return mut.mutate({ contract: "over",      prediction: "over" });
    if (group.id === "matches_differs") return mut.mutate({ contract: "matches",   prediction: "matches" });
    return mut.mutate({ contract: "even", prediction: "even" });
  }
  function placeB() {
    if (group.id === "rise_fall")       return mut.mutate({ contract: "rise_fall", prediction: "down" });
    if (group.id === "over_under")      return mut.mutate({ contract: "under",     prediction: "under" });
    if (group.id === "matches_differs") return mut.mutate({ contract: "differs",   prediction: "differs" });
    return mut.mutate({ contract: "odd", prediction: "odd" });
  }

  const stepStake = (delta: number) => {
    const next = Math.max(10, (Number(stake) || 0) + delta);
    setStake(String(next));
  };

  const showBarrier = group.id === "over_under" || group.id === "matches_differs";
  const open = (tradesQ.data ?? []).filter((t: any) => t.status === "open");
  const recent = (tradesQ.data ?? []).filter((t: any) => t.status !== "open").slice(0, 5);

  // arrow-shaped right edge (chevron-cut) for action buttons
  const arrowClip = { clipPath: "polygon(0 0, calc(100% - 18px) 0, 100% 50%, calc(100% - 18px) 100%, 0 100%)" } as const;

  return (
    <div className="space-y-3">
      {/* Learn about this trade type */}
      <a href="#" className="text-[11px] text-primary underline underline-offset-2 inline-block">
        Learn about this trade type
      </a>

      {/* Contract group selector */}
      <div className="rounded-lg border border-border bg-card/60 p-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setGroupIdx((i) => (i - 1 + GROUPS.length) % GROUPS.length)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            aria-label="Previous"
          ><ChevronLeft className="h-4 w-4" /></button>
          <div className="flex-1 flex items-center gap-2 px-1">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-bull/15 text-bull">
              <TrendingUp className="h-4 w-4" />
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-bear/15 text-bear">
              <TrendingDown className="h-4 w-4" />
            </span>
            <span className="font-semibold text-sm ml-1">{group.label}</span>
          </div>
          <button
            onClick={() => setGroupIdx((i) => (i + 1) % GROUPS.length)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground"
            aria-label="Next"
          ><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Ticks */}
      <div className="rounded-lg border border-border bg-card/60 p-3">
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

      {/* Last digit prediction */}
      {showBarrier && (
        <div className="rounded-lg border border-border bg-card/60 p-3">
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

      {/* Stake / Payout tabs */}
      <div className="rounded-lg border border-border bg-card/60 overflow-hidden">
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
          <div className="h-9 px-2.5 rounded-md border border-border flex items-center gap-1.5 text-xs font-semibold">
            <ChevronLeft className="h-3 w-3 text-muted-foreground" />
            KES
          </div>
        </div>
      </div>

      {/* Payout row A (Over / Up / Matches / Even) */}
      <div>
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

      {/* Payout row B (Under / Down / Differs / Odd) */}
      <div>
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
        <div className="space-y-1.5 pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground">Open</div>
          {open.map((t: any) => <OpenRow key={t.id} trade={t} />)}
        </div>
      )}

      {recent.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
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
