import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ExternalLink, Target, X } from "lucide-react";
import { toast } from "sonner";
import { getCryptoQuote } from "@/lib/crypto.functions";
import { getForexQuote } from "@/lib/forex.functions";
import { cancelTrade, closeTradeAtPrice } from "@/lib/trades.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/positions")({
  component: PositionsPage,
});

type Trade = {
  id: string;
  module: "forex" | "binary" | "aviator" | "predict" | "crypto";
  market: string;
  direction: string;
  stake: number;
  entry_price: number | null;
  exit_price: number | null;
  payout: number | null;
  status: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

function PositionsPage() {
  const [tab, setTab] = useState<"open" | "closed" | "tx">("open");
  const { data: trades = [] } = useQuery({
    queryKey: ["trades", tab],
    queryFn: async () => {
      let q = supabase.from("trades").select("*").order("created_at", { ascending: false }).limit(50);
      if (tab === "open") q = q.eq("status", "open");
      if (tab === "closed") q = q.in("status", ["won", "lost", "closed", "cancelled"]);
      const { data } = await q;
      return (data ?? []) as Trade[];
    },
    refetchInterval: 2500,
  });

  const tabs = [
    { k: "open" as const, label: `Open (${tab === "open" ? trades.length : ""})` },
    { k: "closed" as const, label: "Closed" },
    { k: "tx" as const, label: "Transactions" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={
              "flex-1 py-3 text-sm font-bold border-b-2 transition " +
              (tab === t.k ? "border-primary text-primary" : "border-transparent text-muted-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <div className="h-16 w-16 rounded-full bg-surface grid place-items-center mb-4 border border-border">
            <Target className="h-6 w-6" />
          </div>
          <p className="text-sm">
            Your {tab === "open" ? "active trades" : tab === "closed" ? "closed trades" : "transactions"} will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((trade) => (
            <PositionRow key={trade.id} trade={trade} active={tab === "open"} />
          ))}
        </div>
      )}
    </div>
  );
}

function PositionRow({ trade, active }: { trade: Trade; active: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const closeAtPrice = useServerFn(closeTradeAtPrice);
  const cancel = useServerFn(cancelTrade);
  const forexQuote = useServerFn(getForexQuote);
  const cryptoQuote = useServerFn(getCryptoQuote);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const canCloseAtMarket = trade.module === "forex" || trade.module === "crypto";
  const digits = trade.module === "forex" && trade.market.includes("JPY") ? 2 : trade.module === "forex" ? 5 : 2;

  const { data: livePrice } = useQuery({
    queryKey: ["position-live-price", trade.id, trade.module, trade.market],
    enabled: active && canCloseAtMarket,
    queryFn: async () => {
      if (trade.module === "forex") {
        const quote = await forexQuote({ data: { symbol: trade.market } });
        return quote.ok ? quote.price : Number(trade.entry_price ?? 0);
      }
      const symbol = trade.market.split("/")[0];
      const quote = await cryptoQuote({ data: { symbol } });
      return quote.ok ? quote.price : Number(trade.entry_price ?? 0);
    },
    refetchInterval: 5000,
  });

  const price = Number(livePrice ?? trade.exit_price ?? trade.entry_price ?? 0);
  const pnl = canCloseAtMarket ? estimatePnl(trade, price) : 0;
  const positive = pnl >= 0;
  const route = routeForModule(trade.module);

  async function closeOrCancel() {
    setBusy(true);
    try {
      if (canCloseAtMarket) {
        if (!price) throw new Error("Live price is not available yet");
        const result = await closeAtPrice({ data: { trade_id: trade.id, exit_price: price } });
        toast.success(`Closed ${trade.market} ${money(Number(result.pnl ?? pnl))}`);
      } else {
        await cancel({ data: { trade_id: trade.id } });
        toast.success(`Cancelled ${trade.market} - $${Number(trade.stake).toFixed(2)} returned`);
      }
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["trades"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update trade");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-3 flex items-center justify-between gap-3 text-left"
      >
        <div className="min-w-0">
          <div className="font-bold text-sm">
            {trade.market}{" "}
            <span className={"ml-1 text-xs " + (isLong(trade.direction) ? "text-bull" : "text-bear")}>
              {trade.direction}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {trade.module} - ${Number(trade.stake).toFixed(2)} - {new Date(trade.created_at).toLocaleTimeString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div
              className={
                "text-sm font-bold " +
                (active && canCloseAtMarket ? (positive ? "text-bull" : "text-bear") : statusTone(trade.status))
              }
            >
              {active && canCloseAtMarket ? money(pnl) : trade.status.toUpperCase()}
            </div>
            {Number(trade.payout) > 0 && <div className="text-xs text-bull tabular-nums">+${Number(trade.payout).toFixed(2)}</div>}
          </div>
          <ChevronDown className={"h-4 w-4 text-muted-foreground transition " + (expanded ? "rotate-180" : "")} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Info label="Entry" value={trade.entry_price ? Number(trade.entry_price).toFixed(digits) : "-"} />
            <Info label="Current" value={price ? price.toFixed(digits) : "-"} />
            <Info label="Amount" value={`$${Number(trade.stake).toFixed(2)}`} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate({ to: route })}
              className="h-10 rounded-xl border border-primary/50 text-primary text-xs font-extrabold flex items-center justify-center gap-1"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Open
            </button>
            {active && (
              <button
                onClick={closeOrCancel}
                disabled={busy}
                className="h-10 rounded-xl bg-bear text-bear-foreground text-xs font-extrabold flex items-center justify-center gap-1 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" /> {busy ? "Working" : canCloseAtMarket ? "Close" : "Cancel"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function estimatePnl(trade: Trade, livePrice: number) {
  const entry = Number(trade.entry_price ?? 0);
  if (!entry || !livePrice) return 0;
  if (trade.module === "forex") {
    const pip = trade.market.includes("JPY") ? 0.01 : 0.0001;
    const fallbackLot = Number(trade.stake) / 100 || 0.01;
    const lot = Number(trade.meta?.lot ?? fallbackLot);
    return ((isLong(trade.direction) ? livePrice - entry : entry - livePrice) / pip) * lot * 10;
  }
  const leverage = Number(trade.meta?.leverage ?? 1);
  return ((isLong(trade.direction) ? livePrice - entry : entry - livePrice) / entry) * Number(trade.stake) * leverage;
}

function routeForModule(module: Trade["module"]) {
  if (module === "forex") return "/forex";
  if (module === "crypto") return "/crypto";
  if (module === "aviator") return "/aviator";
  if (module === "predict") return "/predict";
  return "/binary";
}

function isLong(direction: string) {
  return ["BUY", "LONG", "OVER", "EVEN", "MATCH", "YES", "FLY"].includes(direction.toUpperCase());
}

function statusTone(status: string) {
  if (status === "won" || status === "closed") return "text-bull";
  if (status === "lost" || status === "cancelled") return "text-bear";
  return "text-muted-foreground";
}

function money(value: number) {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface border border-border p-2">
      <div className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}
