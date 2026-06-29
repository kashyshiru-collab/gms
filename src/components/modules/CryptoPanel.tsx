import { useState } from "react";
import { CandleChart } from "@/components/CandleChart";
import { Plus, Minus, Radio } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { placeTrade } from "@/lib/trades.functions";
import { getCryptoQuote, getCryptoCandles } from "@/lib/crypto.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const COINS = [
  { sym: "BTC", name: "Bitcoin", color: "#F7931A" },
  { sym: "ETH", name: "Ethereum", color: "#627EEA" },
  { sym: "SOL", name: "Solana", color: "#14F195" },
  { sym: "BNB", name: "BNB", color: "#F3BA2F" },
  { sym: "XRP", name: "XRP", color: "#0085c0" },
  { sym: "DOGE", name: "Dogecoin", color: "#C2A633" },
  { sym: "ADA", name: "Cardano", color: "#0033AD" },
  { sym: "AVAX", name: "Avalanche", color: "#E84142" },
];

export function CryptoPanel() {
  const [coin, setCoin] = useState(COINS[0]);
  const [stake, setStake] = useState(50);
  const [lev, setLev] = useState(10);
  const [pickerOpen, setPickerOpen] = useState(false);

  const quoteFn = useServerFn(getCryptoQuote);
  const candlesFn = useServerFn(getCryptoCandles);
  const place = useServerFn(placeTrade);
  const qc = useQueryClient();

  const { data: quote } = useQuery({
    queryKey: ["crypto-quote", coin.sym],
    queryFn: () => quoteFn({ data: { symbol: coin.sym } }),
    refetchInterval: 8000,
  });
  const { data: candleRes } = useQuery({
    queryKey: ["crypto-candles", coin.sym],
    queryFn: () => candlesFn({ data: { symbol: coin.sym, days: 1 } }),
    refetchInterval: 60_000,
  });

  const live = quote?.ok ? quote : null;
  const price = live?.price ?? 0;
  const change = live?.changePct ?? 0;
  const candles = candleRes?.ok ? candleRes.candles : [];

  async function submit(direction: "LONG" | "SHORT") {
    if (!price) { toast.error("Price not available"); return; }
    try {
      await place({ data: { module: "crypto", market: `${coin.sym}/USD`, direction, stake, entry_price: price, meta: { leverage: lev } } });
      toast.success(`${direction} ${coin.sym} ${lev}x @ $${price.toFixed(2)}`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["trades"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="space-y-2.5">
      <button onClick={() => setPickerOpen(!pickerOpen)} className="w-full flex items-center justify-between bg-card border border-border rounded-xl p-2.5">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full grid place-items-center text-white font-bold text-xs" style={{ background: coin.color }}>{coin.sym.slice(0, 1)}</div>
          <div className="text-left">
            <div className="font-bold text-sm">{coin.sym}/USD</div>
            <div className={"text-[10px] " + (change >= 0 ? "text-bull" : "text-bear")}>
              {change >= 0 ? "+" : ""}{change.toFixed(2)}% · ${price > 0 ? price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 5 : 2 }) : "—"} <Radio className="inline h-2.5 w-2.5 ml-0.5" />
            </div>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground">change ▾</span>
      </button>

      {pickerOpen && (
        <div className="bg-card border border-border rounded-xl divide-y divide-border max-h-72 overflow-auto">
          {COINS.map((c) => (
            <button key={c.sym} onClick={() => { setCoin(c); setPickerOpen(false); }}
              className="w-full text-left p-2.5 hover:bg-accent flex items-center gap-2 text-sm">
              <span className="h-6 w-6 rounded-full grid place-items-center text-white text-[10px] font-bold" style={{ background: c.color }}>{c.sym.slice(0, 1)}</span>
              <span className="font-semibold flex-1">{c.name}</span>
              <span className="text-muted-foreground text-xs">{c.sym}</span>
            </button>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-2 h-56">
        <CandleChart candles={candles} livePrice={live?.price} className="h-full" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => submit("LONG")} className="py-3 rounded-xl bg-bull text-bull-foreground font-extrabold glow-bull text-sm">LONG ↑</button>
        <button onClick={() => submit("SHORT")} className="py-3 rounded-xl bg-bear text-bear-foreground font-extrabold glow-bear text-sm">SHORT ↓</button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-card border border-border rounded-lg p-2">
          <div className="text-[9px] uppercase text-muted-foreground font-bold tracking-wider mb-0.5">Stake $</div>
          <div className="flex items-center justify-between">
            <button onClick={() => setStake(Math.max(5, stake - 5))} className="h-5 w-5 rounded bg-surface grid place-items-center"><Minus className="h-2.5 w-2.5" /></button>
            <span className="font-bold text-sm tabular-nums">${stake}</span>
            <button onClick={() => setStake(stake + 5)} className="h-5 w-5 rounded bg-surface grid place-items-center"><Plus className="h-2.5 w-2.5" /></button>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-2">
          <div className="text-[9px] uppercase text-muted-foreground font-bold tracking-wider mb-0.5">Leverage</div>
          <div className="flex items-center justify-between">
            <button onClick={() => setLev(Math.max(1, lev - 1))} className="h-5 w-5 rounded bg-surface grid place-items-center"><Minus className="h-2.5 w-2.5" /></button>
            <span className="font-bold text-sm tabular-nums">{lev}x</span>
            <button onClick={() => setLev(Math.min(100, lev + 1))} className="h-5 w-5 rounded bg-surface grid place-items-center"><Plus className="h-2.5 w-2.5" /></button>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground text-center">
        Notional: ${(stake * lev).toLocaleString()} · Liquidation buffer ~{(100 / lev).toFixed(1)}%
      </div>
    </div>
  );
}
