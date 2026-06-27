import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { openDigitTrade, getActiveBinaryTrades, PAYOUT_MULTIPLIER } from "@/lib/binary.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TrendingDown, TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { DIGIT_OVER_PAYOUTS, DIGIT_UNDER_PAYOUTS } from "@/lib/risk";

const DURATIONS = [
  { s: 15, label: "15s" },
  { s: 30, label: "30s" },
  { s: 60, label: "1m" },
  { s: 120, label: "2m" },
  { s: 300, label: "5m" },
] as const;

type ContractType = "rise_fall" | "even" | "odd" | "over" | "under";

const CONTRACTS: { id: ContractType; label: string; hint: string }[] = [
  { id: "rise_fall", label: "Rise / Fall", hint: "Will the price end higher or lower than entry?" },
  { id: "even",      label: "Even",        hint: "Last digit is 0, 2, 4, 6 or 8" },
  { id: "odd",       label: "Odd",         hint: "Last digit is 1, 3, 5, 7 or 9" },
  { id: "over",      label: "Over",        hint: "Last digit > barrier" },
  { id: "under",     label: "Under",       hint: "Last digit < barrier" },
];

const fmt = formatMoney;

function payoutFor(contract: ContractType, barrier: number): number {
  if (contract === "rise_fall") return PAYOUT_MULTIPLIER;
  if (contract === "even" || contract === "odd") return PAYOUT_MULTIPLIER;
  if (contract === "over") {
    return DIGIT_OVER_PAYOUTS[barrier] ?? PAYOUT_MULTIPLIER;
  }
  // under
  return DIGIT_UNDER_PAYOUTS[barrier] ?? PAYOUT_MULTIPLIER;
}

export function BinaryPanel({ symbol, stake }: { symbol: string; stake: number }) {
  const qc = useQueryClient();
  const openFn = useServerFn(openDigitTrade);
  const listFn = useServerFn(getActiveBinaryTrades);
  const [duration, setDuration] = useState<15 | 30 | 60 | 120 | 300>(60);
  const [contract, setContract] = useState<ContractType>("rise_fall");
  const [barrier, setBarrier] = useState(5);

  const tradesQ = useQuery({
    queryKey: ["binary-trades"],
    queryFn: () => listFn(),
    refetchInterval: 3_000,
  });

  const mut = useMutation({
    mutationFn: (prediction: string) =>
      openFn({
        data: {
          symbol,
          contract,
          prediction: prediction as any,
          barrier: contract === "over" || contract === "under" ? barrier : null,
          stake,
          duration,
        },
      }),
    onSuccess: (_, p) => {
      toast.success(`${p.toString().toUpperCase()} · ${symbol} · ${fmt(stake)} · ${duration}s`);
      qc.invalidateQueries({ queryKey: ["binary-trades"] });
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = (tradesQ.data ?? []).filter((t: any) => t.status === "open");
  const recent = (tradesQ.data ?? []).filter((t: any) => t.status !== "open").slice(0, 5);

  const payout = useMemo(() => payoutFor(contract, barrier), [contract, barrier]);

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Derivatives · fixed-time</h3>
        <span className="text-xs text-muted-foreground">Payout ×{payout.toFixed(2)}</span>
      </div>

      {/* Contract toggle bar */}
      <div className="flex flex-wrap gap-1">
        {CONTRACTS.map((c) => (
          <button
            key={c.id}
            onClick={() => setContract(c.id)}
            className={`px-2 py-1 text-[11px] rounded-md border transition-colors ${
              contract === c.id
                ? "bg-primary border-primary text-primary-foreground font-medium"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
            title={c.hint}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Duration */}
      <div className="flex gap-1">
        {DURATIONS.map((d) => (
          <button
            key={d.s}
            onClick={() => setDuration(d.s)}
            className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${
              duration === d.s
                ? "bg-primary border-primary text-primary-foreground font-medium"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >{d.label}</button>
        ))}
      </div>

      {/* Barrier picker for digit contracts */}
      {(contract === "over" || contract === "under") && (
        <div>
          <div className="text-[11px] text-muted-foreground mb-1">Choose digit (0–9)</div>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <button
                key={i}
                onClick={() => setBarrier(i)}
                className={`py-1.5 text-xs rounded border transition ${
                  barrier === i
                    ? "bg-primary border-primary text-primary-foreground font-bold"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >{i}</button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons depend on contract */}
      {contract === "rise_fall" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="h-12 bg-[oklch(0.72_0.18_150)] hover:bg-[oklch(0.66_0.18_150)] text-black font-bold"
            disabled={mut.isPending || !stake}
            onClick={() => mut.mutate("up")}
          ><TrendingUp className="h-4 w-4 mr-1.5" />RISE</Button>
          <Button
            className="h-12 bg-[oklch(0.66_0.22_25)] hover:bg-[oklch(0.60_0.22_25)] text-white font-bold"
            disabled={mut.isPending || !stake}
            onClick={() => mut.mutate("down")}
          ><TrendingDown className="h-4 w-4 mr-1.5" />FALL</Button>
        </div>
      ) : (
        <Button
          className="h-12 w-full bg-primary text-primary-foreground font-bold"
          disabled={mut.isPending || !stake}
          onClick={() => mut.mutate(contract)}
        >
          {CONTRACTS.find((c) => c.id === contract)?.label.toUpperCase()}
          {(contract === "over" || contract === "under") &&
            ` · ${barrier}`}
        </Button>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Win returns {fmt(stake * payout)} · auto-resolves at expiry
      </p>

      {open.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-muted-foreground">Open</div>
          {open.map((t: any) => <OpenRow key={t.id} trade={t} />)}
        </div>
      )}

      {recent.length > 0 && (
        <div className="space-y-1.5">
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
    const id = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(trade.expires_at).getTime() - Date.now()) / 1000)));
    }, 250);
    return () => clearInterval(id);
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
