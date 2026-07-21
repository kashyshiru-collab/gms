import { useEffect, useRef, useState } from "react";
import { LiveChart } from "@/components/LiveChart";
import { Plus, Minus, Bot, User, Square, ChevronDown, CandlestickChart, LineChart } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { placeTrade, settleTrade, getMyProfile } from "@/lib/trades.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logDebugEvent, serializeError } from "@/lib/debug-logger";
import { getProfitRateForContract, getTickLabel, normalizeTickCount, resolveContractOutcome } from "@/lib/binary-simulation";
import { supabase } from "@/integrations/supabase/client";

const VOL_INDICES = [
  {
    label: "Volatility 10 Index",
    value: "Vol 10",
    basePrice: 1000,
    volatility: 0.00024,
    tickMs: 1400,
    rhythm: [2100, 1800, 1200, 2200, 900],
    volatilityLabel: "Low",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 25 Index",
    value: "Vol 25",
    basePrice: 1000,
    volatility: 0.00038,
    tickMs: 1200,
    rhythm: [1800, 1300, 900, 1600, 520],
    volatilityLabel: "Low-Medium",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 50 Index",
    value: "Vol 50",
    basePrice: 1000,
    volatility: 0.00058,
    tickMs: 1000,
    rhythm: [1500, 880, 620, 1200, 420],
    volatilityLabel: "Medium",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 75 Index",
    value: "Vol 75",
    basePrice: 1000,
    volatility: 0.00078,
    tickMs: 850,
    rhythm: [1200, 640, 420, 900, 320],
    volatilityLabel: "High",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 100 Index",
    value: "Vol 100",
    basePrice: 1000,
    volatility: 0.001,
    tickMs: 750,
    rhythm: [980, 520, 360, 740, 260],
    volatilityLabel: "Very High",
    tickSpeedLabel: "≈1 tick/sec",
  },
  {
    label: "Volatility 10 (1s) Index",
    value: "Vol 10 (1s)",
    basePrice: 1000,
    volatility: 0.00036,
    tickMs: 1000,
    rhythm: [2000, 1400, 650, 420, 250],
    volatilityLabel: "Low",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Volatility 25 (1s) Index",
    value: "Vol 25 (1s)",
    basePrice: 1000,
    volatility: 0.00054,
    tickMs: 1000,
    rhythm: [1600, 900, 500, 300, 220],
    volatilityLabel: "Low-Medium",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Volatility 50 (1s) Index",
    value: "Vol 50 (1s)",
    basePrice: 1000,
    volatility: 0.00072,
    tickMs: 1000,
    rhythm: [1300, 760, 440, 260, 190],
    volatilityLabel: "Medium",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Volatility 75 (1s) Index",
    value: "Vol 75 (1s)",
    basePrice: 1000,
    volatility: 0.00094,
    tickMs: 1000,
    rhythm: [1100, 620, 340, 220, 170],
    volatilityLabel: "High",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Volatility 100 (1s) Index",
    value: "Vol 100 (1s)",
    basePrice: 1000,
    volatility: 0.00115,
    tickMs: 1000,
    rhythm: [900, 500, 280, 190, 150],
    volatilityLabel: "Very High",
    tickSpeedLabel: "1 tick/sec",
  },
  {
    label: "Crash 500 Index",
    value: "Crash 500",
    basePrice: 500,
    volatility: 0.00066,
    tickMs: 520,
    rhythm: [1900, 1450, 900, 520, 760],
  },
  {
    label: "Boom 500 Index",
    value: "Boom 500",
    basePrice: 500,
    volatility: 0.00066,
    tickMs: 520,
    rhythm: [760, 520, 900, 1450, 1900],
  },
] as const;
const TYPES = ["Buy/Sell", "Even/Odd", "Matches/Differs", "Over/Under"] as const;
type TradeType = (typeof TYPES)[number];
const INDICATOR_OPTIONS = [
  "SMA",
  "EMA",
  "Bollinger",
  "RSI",
  "MACD",
  "ATR",
  "VWAP",
  "Stochastic",
  "Momentum",
  "OBV",
  "ADX",
  "CCI",
] as const;
type IndicatorOption = (typeof INDICATOR_OPTIONS)[number];
const QUICK = [1, 5, 10, 25, 50, 100];

type Tick = { d: number; tone: "neutral" | "bull" | "bear" };

export function BinaryPanel() {
  const [index, setIndex] = useState("Vol 10 (1s)");
  const [type, setType] = useState<TradeType>("Even/Odd");
  const [marketOpen, setMarketOpen] = useState(false);
  const [chartMode, setChartMode] = useState<"line" | "candles">("line");
  const [stake, setStake] = useState(10);
  const [selectedDigit, setSelectedDigit] = useState(5);
  const [tickProgression, setTickProgression] = useState(1);
  const [selectedIndicators, setSelectedIndicators] = useState<IndicatorOption[]>([]);
  const [chartOptionsOpen, setChartOptionsOpen] = useState(false);
  const [botMode, setBotMode] = useState(true);
  const [botRunning, setBotRunning] = useState(false);
  const [target, setTarget] = useState(200);
  const [stop, setStop] = useState(999);
  const [martingale, setMartingale] = useState(2);
  const [price, setPrice] = useState(1000);
  const [pendingTrade, setPendingTrade] = useState<{
    tradeId: string;
    direction: string;
    stake: number;
    type: TradeType;
    market: string;
    entryPrice: number;
    status: "open" | "settled";
    result?: "win" | "loss";
    pnl?: number;
  } | null>(null);
  const [settleNote, setSettleNote] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [tickTrail, setTickTrail] = useState<Tick[]>([]);
  const [digitHistory, setDigitHistory] = useState<number[]>([]);
  const [positionsTab, setPositionsTab] = useState<"open" | "closed" | "tx">("open");

  const place = useServerFn(placeTrade);
  const settle = useServerFn(settleTrade);
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    staleTime: 20_000,
  });
  const qc = useQueryClient();

  // refs for bot loop
  const botRunningRef = useRef(false);
  const sessionPnLRef = useRef(0);
  const currentStakeRef = useRef(stake);
  const activeDirectionRef = useRef<string | null>(null);
  const indexRef = useRef(index);
  const typeRef = useRef<TradeType>(type);
  const selectedDigitRef = useRef(selectedDigit);
  const priceRef = useRef(price);
  const digitHistoryRef = useRef<number[]>([]);
  const priceTickCountRef = useRef(0);
  const autoSignalConsumedRef = useRef(false);
  const pendingTradeRef = useRef<typeof pendingTrade>(null);
  const placingRef = useRef(false);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    typeRef.current = type;
  }, [type]);
  useEffect(() => {
    selectedDigitRef.current = selectedDigit;
  }, [selectedDigit]);
  useEffect(() => {
    priceRef.current = price;
  }, [price]);
  useEffect(() => {
    digitHistoryRef.current = digitHistory;
  }, [digitHistory]);
  useEffect(() => {
    pendingTradeRef.current = pendingTrade;
  }, [pendingTrade]);
  useEffect(() => {
    placingRef.current = placing;
  }, [placing]);
  const market = VOL_INDICES.find((m) => m.value === index) ?? VOL_INDICES[1];

  type PositionTrade = {
    id: string;
    module: string;
    market: string;
    direction: string;
    stake: number;
    entry_price: number | null;
    exit_price: number | null;
    payout: number | null;
    status: string;
    created_at: string;
  };

  const { data: positionTrades = [] } = useQuery({
    queryKey: ["binary-positions", market.value],
    queryFn: async () => {
      const { data } = await supabase
        .from("trades")
        .select("id,module,market,direction,stake,entry_price,exit_price,payout,status,created_at")
        .eq("module", "binary")
        .eq("market", market.value)
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as PositionTrade[];
    },
    refetchInterval: 2500,
  });

  const visiblePositionTrades = positionsTab === "open"
    ? positionTrades.filter((t) => t.status === "open")
    : positionsTab === "closed"
      ? positionTrades.filter((t) => ["won", "lost", "closed", "cancelled", "settled"].includes(t.status))
      : positionTrades;

  const hour = new Date().getHours();
  const intradayPace = 0.76 + ((Math.sin((hour / 24) * Math.PI * 2 + 0.7) + 1) / 2) * 0.72;
  const chartTickMs = Math.max(
    market.tickMs < 280 ? 260 : 140,
    Math.round(market.tickMs / intradayPace),
  );
  const chartCandleMs = Math.max(1600, Math.min(3600, Math.round(chartTickMs * 4.5)));
  const chartVolatility = market.volatility * (0.88 + intradayPace * 0.22);
  const settlementTicks = normalizeTickCount(tickProgression);
  const settlementTickLabel = getTickLabel(settlementTicks);
  const showDigitStats = type !== "Buy/Sell";
  const showDigitPicker = type === "Over/Under" || type === "Matches/Differs";

  useEffect(() => {
    if (autoSignalConsumedRef.current) return;
    const raw = window.sessionStorage.getItem("tronix-scanner-bot");
    if (!raw) return;
    autoSignalConsumedRef.current = true;
    window.sessionStorage.removeItem("tronix-scanner-bot");
    try {
      const signal = JSON.parse(raw) as { category?: TradeType; market?: string; direction?: string; digit?: number };
      if (signal.category && TYPES.includes(signal.category)) {
        typeRef.current = signal.category;
        setType(signal.category);
      }
      if (signal.direction && signal.direction.length > 0) {
        activeDirectionRef.current = signal.direction;
      }
      if (signal.digit !== undefined && signal.digit !== null) {
        selectedDigitRef.current = signal.digit;
        setSelectedDigit(signal.digit);
      }
      if (signal.market && VOL_INDICES.some((m) => m.value === signal.market)) {
        indexRef.current = signal.market;
        setIndex(signal.market);
      }
      setBotMode(true);
      toast.success("Scanner bot loaded and auto trade started");
      const initialDirection = signal.direction && signal.direction.length > 0 ? signal.direction : "AUTO";
      window.setTimeout(() => startBot(initialDirection), 450);
    } catch {
      toast.error("Could not load scanner bot signal");
    }
  }, []);

  // Track last digit + paint trail, then color active digit contracts by win/loss.
  useEffect(() => {
    priceTickCountRef.current += 1;
    const d = Math.floor(price * 10000) % 10;
    setDigitHistory((prev) => [...prev.slice(-99), d]);
    setTickTrail((prev) => {
      const dir = activeDirectionRef.current;
      const ty = typeRef.current;
      const sel = selectedDigitRef.current;
      let tone: "neutral" | "bull" | "bear" = "neutral";
      if (dir && ty !== "Buy/Sell") {
        let winning = false;
        if (ty === "Even/Odd") winning = dir === "EVEN" ? d % 2 === 0 : d % 2 === 1;
        else if (ty === "Over/Under") winning = dir === "OVER" ? d > sel : d < sel;
        else winning = dir === "MATCH" ? d === sel : d !== sel;
        tone = winning ? "bull" : "bear";
      }
      return [...prev.slice(-19), { d, tone }];
    });
  }, [price]);

  const digitStats = Array.from({ length: 10 }, (_, d) => {
    const c = digitHistory.filter((x) => x === d).length;
    return { d, pct: digitHistory.length ? (c / digitHistory.length) * 100 : 10 };
  });
  const maxPct = Math.max(...digitStats.map((s) => s.pct));
  const minPct = Math.min(...digitStats.map((s) => s.pct));
  const currentDigit = digitHistory[digitHistory.length - 1] ?? 0;
  const isDemoAccount = profile?.active_account === "demo";
  const overRate = getProfitRateForContract(type, "OVER", settlementTicks);
  const underRate = getProfitRateForContract(type, "UNDER", settlementTicks);
  const payoutOver = (stake * (1 + overRate)) || 0;
  const payoutUnder = (stake * (1 + underRate)) || 0;
  const chartNote = pendingTrade
    ? pendingTrade.status === "open"
      ? `Open ${pendingTrade.direction} ${pendingTrade.type} $${pendingTrade.stake} · ${settlementTickLabel}`
      : settleNote
    : settleNote ?? `Settles on ${settlementTickLabel}`;
  const chartNoteTone = pendingTrade
    ? pendingTrade.status === "open"
      ? "neutral"
      : pendingTrade.result === "win"
      ? "bull"
      : "bear"
    : "neutral";
  const digitMarkerTone =
    pendingTrade?.status === "open"
      ? "active"
      : pendingTrade?.status === "settled"
        ? pendingTrade.result === "win"
          ? "win"
          : "loss"
        : "idle";
  useEffect(() => {
    if (pendingTrade?.status !== "settled") return;
    const timeout = window.setTimeout(() => {
      setPendingTrade(null);
      setSettleNote(null);
    }, 4000);
    return () => clearTimeout(timeout);
  }, [pendingTrade?.status]);

  async function placeAndSettle(direction: string, useStake: number): Promise<boolean> {
    if (placingRef.current || pendingTradeRef.current?.status === "open") {
      toast("Wait for the open contract to settle first");
      throw new Error("An existing binary contract is still open");
    }
    const ty = typeRef.current;
    const sel = selectedDigitRef.current;
    const entryPrice = priceRef.current;
    const neededTicks = settlementTicks;
    activeDirectionRef.current = direction;
    let trade;
    logDebugEvent("info", "binary.trade", "Placing binary trade", {
      market: indexRef.current,
      type: ty,
      direction,
      stake: useStake,
      selectedDigit: ty === "Over/Under" || ty === "Matches/Differs" ? sel : undefined,
      price: priceRef.current,
    });
    setPlacing(true);
    placingRef.current = true;
    setSettleNote(null);
    try {
      trade = await place({
        data: {
          module: "binary",
          market: indexRef.current,
          direction,
          stake: useStake,
          entry_price: priceRef.current,
          meta: {
            type: ty,
            digit: ty === "Over/Under" || ty === "Matches/Differs" ? sel : undefined,
          },
        },
      });
      const id = trade.id ?? `pending-${Date.now()}`;
      setPendingTrade({
        tradeId: id,
        direction,
        stake: useStake,
        type: ty,
        market: indexRef.current,
        entryPrice: priceRef.current,
        status: "open",
      });
      toast.success("Contract placed and open — waiting for result");
      logDebugEvent("info", "binary.trade", "Binary trade placed", {
        tradeId: trade.id,
        direction,
        stake: useStake,
      });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      logDebugEvent("error", "binary.trade", "Binary trade placement failed", serializeError(e));
      toast.error(e instanceof Error ? e.message : "Failed");
      activeDirectionRef.current = null;
      setPendingTrade(null);
      setPlacing(false);
      placingRef.current = false;
      throw e;
    }
    const priceCursor = priceTickCountRef.current;
    while (priceTickCountRef.current - priceCursor < neededTicks) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const settlementPrice = priceRef.current;
    const finalDigit = Math.floor(settlementPrice * 10000) % 10;
    const won = resolveContractOutcome({
      type: ty,
      direction,
      entryPrice,
      settlementPrice,
      selectedDigit: sel,
    });

    const winProfitRate = getProfitRateForContract(ty, direction, neededTicks);
    try {
      await settle({
        data: {
          trade_id: trade.id,
          won,
          exit_price: settlementPrice,
          multiplier: 1 + winProfitRate,
        },
      });
      const pnl = won ? useStake * winProfitRate : -useStake;
      setPendingTrade((prev) =>
        prev
          ? {
              ...prev,
              status: "settled",
              result: won ? "win" : "loss",
              pnl,
            }
          : null,
      );
      setSettleNote(won ? `WIN +$${(useStake * winProfitRate).toFixed(2)}` : `LOSS -$${useStake}`);
      logDebugEvent("info", "binary.trade", "Binary trade settled", {
        tradeId: trade.id,
        won,
        finalDigit,
        exitPrice: settlementPrice,
      });
    } catch (e) {
      logDebugEvent("error", "binary.trade", "Binary trade settlement failed", serializeError(e));
      toast.error("Contract result could not be saved. Trade stopped.");
      setSettleNote("Settlement failed");
      throw e;
    } finally {
      setPlacing(false);
      placingRef.current = false;
      activeDirectionRef.current = null;
    }
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["trades"] });

    if (won) {
      const profit = useStake * winProfitRate;
      sessionPnLRef.current += profit;
      toast.success(`WIN +$${profit.toFixed(2)} · session $${sessionPnLRef.current.toFixed(2)}`);
    } else {
      sessionPnLRef.current -= useStake;
      toast.error(`LOSS -$${useStake} · session $${sessionPnLRef.current.toFixed(2)}`);
    }
    return won;
  }

  async function fireManual(direction: string) {
    if (botRunningRef.current || placingRef.current || pendingTradeRef.current?.status === "open") return;
    try {
      await placeAndSettle(direction, stake);
    } catch {
      // The trade function already shows the failure toast.
    }
  }

  function autoDirection() {
    const ty = typeRef.current;
    const activeMarket = VOL_INDICES.find((m) => m.value === indexRef.current) ?? VOL_INDICES[1];
    const lastDigits = digitHistoryRef.current.slice(-24);
    const even = lastDigits.filter((d) => d % 2 === 0).length;
    const avg = lastDigits.length ? lastDigits.reduce((sum, d) => sum + d, 0) / lastDigits.length : 4.5;
    const current = priceRef.current;
    if (ty === "Buy/Sell") return current >= activeMarket.basePrice ? "SELL" : "BUY";
    if (ty === "Even/Odd") return even > lastDigits.length / 2 ? "ODD" : "EVEN";
    if (ty === "Over/Under") return avg >= selectedDigitRef.current ? "UNDER" : "OVER";
    return avg >= selectedDigitRef.current ? "DIFFER" : "MATCH";
  }

  async function startBot(direction: string) {
    if (botRunningRef.current || placingRef.current || pendingTradeRef.current?.status === "open") {
      toast("Wait for the open contract to settle first");
      return;
    }
    logDebugEvent("info", "binary.bot", "Binary bot started", {
      direction,
      stake,
      target,
      stop,
      martingale,
      type,
      market: indexRef.current,
    });
    botRunningRef.current = true;
    setBotRunning(true);
    sessionPnLRef.current = 0;
    currentStakeRef.current = stake;
    toast.success(`Bot started — ${direction} · target $${target} · stop -$${stop}`);
    while (botRunningRef.current) {
      try {
        const nextDirection = direction === "AUTO" ? autoDirection() : direction;
        const won = await placeAndSettle(nextDirection, currentStakeRef.current);
        if (won) {
          currentStakeRef.current = stake; // reset on win
        } else {
          currentStakeRef.current = +(currentStakeRef.current * martingale).toFixed(2);
        }
        if (sessionPnLRef.current >= target) {
          toast.success(`Target hit +$${sessionPnLRef.current.toFixed(2)}`);
          break;
        }
        if (sessionPnLRef.current <= -stop) {
          toast.error(`Stop hit -$${(-sessionPnLRef.current).toFixed(2)}`);
          break;
        }
        await new Promise((r) => setTimeout(r, 800));
      } catch (e) {
        logDebugEvent(
          "error",
          "binary.bot",
          "Binary bot stopped after trade error",
          serializeError(e),
        );
        break;
      }
    }
    botRunningRef.current = false;
    setBotRunning(false);
  }

  function stopBot() {
    logDebugEvent("info", "binary.bot", "Binary bot stop requested", {
      sessionPnL: sessionPnLRef.current,
    });
    botRunningRef.current = false;
    setBotRunning(false);
    toast("Bot stopped");
  }

  const actions = {
    "Buy/Sell": [
      ["BUY", "bull"],
      ["SELL", "bear"],
    ],
    "Even/Odd": [
      ["EVEN", "bull"],
      ["ODD", "bear"],
    ],
    "Matches/Differs": [
      ["MATCH", "bull"],
      ["DIFFER", "bear"],
    ],
    "Over/Under": [
      ["OVER", "bull"],
      ["UNDER", "bear"],
    ],
  }[type] as [string, "bull" | "bear"][];

  // For chart badge tone
  const activeDir = activeDirectionRef.current;
  let badgeTone: "neutral" | "bull" | "bear" = "neutral";
  if (activeDir && type !== "Buy/Sell") {
    let winning = false;
    if (type === "Even/Odd")
      winning = activeDir === "EVEN" ? currentDigit % 2 === 0 : currentDigit % 2 === 1;
    else if (type === "Over/Under")
      winning = activeDir === "OVER" ? currentDigit > selectedDigit : currentDigit < selectedDigit;
    else
      winning =
        activeDir === "MATCH" ? currentDigit === selectedDigit : currentDigit !== selectedDigit;
    badgeTone = winning ? "bull" : "bear";
  }

  return (
    <div className="w-full h-full md:pb-0">
      <div className="hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-black text-primary">
              T
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Binary</div>
              <div className="truncate text-sm font-semibold">{market.label}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full border border-border bg-surface px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
              {profile?.active_account === "demo" ? "Demo" : "Real"}
            </div>
            <button className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground">
              Deposit
            </button>
            <button className="rounded-full border border-border bg-surface p-2 text-sm text-muted-foreground">
              🔔
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-border bg-surface/80 px-3 py-2">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Balance</div>
            <div className="text-sm font-extrabold">$12,340.00</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Price</div>
            <div className="text-sm font-extrabold tabular-nums">{price.toFixed(5)}</div>
          </div>
        </div>
      </div>

      <div className="md:hidden h-[calc(100dvh-7rem)] overflow-hidden px-2 py-1.5">
        <div className="flex h-full min-h-0 flex-col gap-1.5 border-y border-border bg-background">
          <div className="grid shrink-0 grid-cols-4 gap-1 text-xs text-muted-foreground uppercase tracking-[0.1em]">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={
                  "rounded-full py-1.5 text-[8px] font-semibold transition sm:text-[9px] " +
                  (type === t
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border text-muted-foreground")
                }
              >
                {t === "Matches/Differs" ? "Match/Diff" : t}
              </button>
            ))}
          </div>

          <div className="hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Volatility</div>
                <div className="font-semibold">{market.value}</div>
                <div className="text-[10px] text-muted-foreground">{market.volatilityLabel} · {market.tickSpeedLabel}</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-extrabold tabular-nums">{price.toFixed(5)}</div>
                <div className="text-[10px] text-muted-foreground">last digit <span className="text-primary font-bold">{currentDigit}</span></div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 rounded-2xl border border-border bg-card p-1.5">
            <div className="hidden">
              <button
                onClick={() => setChartMode("line")}
                className={
                  "py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 " +
                  (chartMode === "line"
                    ? "bg-primary/20 text-primary border-primary/50"
                    : "bg-surface border-border text-muted-foreground")
                }
              >
                <LineChart className="h-4 w-4" /> Line
              </button>
              <button
                onClick={() => setChartMode("candles")}
                className={
                  "py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 " +
                  (chartMode === "candles"
                    ? "bg-primary/20 text-primary border-primary/50"
                    : "bg-surface border-border text-muted-foreground")
                }
              >
                <CandlestickChart className="h-4 w-4" /> Candles
              </button>
            </div>
            <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-border bg-card/90 p-1">
              <div className="absolute left-2 top-2 z-20 rounded-xl border border-border bg-card/90 px-2.5 py-1.5 backdrop-blur">
                <div className="text-xs font-extrabold">{market.value}</div>
                <div className="text-[10px] text-muted-foreground">{price.toFixed(2)}</div>
              </div>
              <LiveChart
                basePrice={market.basePrice}
                volatility={chartVolatility}
                tickMs={chartTickMs}
                candleMs={chartCandleMs}
                onPrice={setPrice}
                badge={`${currentDigit}`}
                badgeTone={badgeTone}
                note={chartNote ?? undefined}
                noteTone={chartNote ? chartNoteTone : "neutral"}
                indicators={selectedIndicators}
                mode={chartMode}
                className="h-full min-h-0 w-full"
                digitStats={digitStats}
                currentDigit={currentDigit}
                digitMarkerTone={digitMarkerTone}
              />
            </div>
          </div>

          <div className="hidden">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold mb-3">Last digits</div>
            <div className="grid grid-cols-5 gap-2">
              {digitStats.map(({ d, pct }) => {
                const isCurrent = d === currentDigit;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDigit(d)}
                    className={
                      "flex flex-col items-center justify-center gap-1 rounded-3xl border p-2 transition " +
                      (isCurrent
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground")
                    }
                  >
                    <span className="h-11 w-11 rounded-full border border-border bg-surface grid place-items-center text-sm font-extrabold">
                      {d}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 rounded-2xl border border-border bg-surface p-1 overflow-x-auto">
            <div className="flex items-center justify-between gap-1.5">
              {Array.from({ length: 10 }).map((_, d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDigit(d)}
                  className={
                    "min-w-[2rem] h-8 rounded-full text-xs font-bold border transition " +
                    (d === currentDigit
                      ? "bg-primary text-primary-foreground border-primary shadow-[0_0_24px_color-mix(in_oklab,var(--gold)_42%,transparent)]"
                      : selectedDigit === d
                        ? "bg-primary/20 text-primary border-primary/60"
                        : "bg-card border-border text-muted-foreground")
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="shrink-0 rounded-2xl border border-border bg-surface p-1.5">
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              <button
                onClick={() => setBotMode(false)}
                className={
                  "rounded-2xl py-2 text-sm font-semibold transition " +
                  (!botMode
                    ? "bg-white text-background border border-primary"
                    : "bg-surface border border-border text-muted-foreground")
                }
              >
                Manual
              </button>
              <button
                onClick={() => setBotMode(true)}
                className={
                  "rounded-2xl py-2 text-sm font-semibold transition " +
                  (botMode
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border border-border text-muted-foreground")
                }
              >
                Auto
              </button>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 items-center mb-1.5">
              <button
                onClick={() => setStake(Math.max(1, stake - 1))}
                className="h-9 w-9 rounded-xl bg-surface border border-border text-xl font-bold"
              >
                -
              </button>
              <div className="rounded-[22px] border border-primary bg-card/90 py-1.5 text-center">
                <div className="text-[9px] uppercase text-muted-foreground">Stake</div>
                <div className="text-lg font-extrabold">{stake}</div>
              </div>
              <button
                onClick={() => setStake(stake + 1)}
                className="h-9 w-9 rounded-xl bg-surface border border-border text-xl font-bold"
              >
                +
              </button>
            </div>
            <button className="w-full rounded-2xl bg-primary text-primary-foreground py-2 text-sm font-semibold">
              AI Scanner
            </button>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-1.5 text-center text-[8px] uppercase tracking-[0.08em] text-muted-foreground">
            <div className="rounded-2xl border border-border bg-surface p-1.5">
              <div>Take Profit</div>
              <div className="mt-1 font-bold text-foreground">${target}</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-1.5">
              <div>Stop Loss</div>
              <div className="mt-1 font-bold text-foreground">${stop}</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-1.5">
              <div>Multiplier</div>
              <div className="mt-1 font-bold text-foreground">x{martingale}</div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2">
            <button
              onClick={() => (botMode ? startBot(actions[0][0]) : fireManual(actions[0][0]))}
              className="rounded-2xl bg-bull text-bull-foreground py-2.5 text-sm font-extrabold"
            >
              {botMode ? `BOT ${actions[0][0]}` : actions[0][0]}
            </button>
            <button
              onClick={() => (botMode ? startBot(actions[1][0]) : fireManual(actions[1][0]))}
              className="rounded-2xl bg-bear text-bear-foreground py-2.5 text-sm font-extrabold"
            >
              {botMode ? `BOT ${actions[1][0]}` : actions[1][0]}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile stacks vertically; desktop uses 3-column grid */}
      <div className="hidden md:grid md:grid-cols-[320px_minmax(0,1fr)_320px] xl:grid-cols-[340px_minmax(0,1fr)_340px] md:h-[calc(100dvh-3.5rem)] md:overflow-hidden">
        {/* Left column - appears second on mobile (order-2), sticky on desktop */}
        <div className="space-y-2 w-full md:w-auto md:h-full md:overflow-hidden order-2 md:order-3 border-l border-border bg-surface/70 p-3">
          {(placing || pendingTrade?.status === "open" || settleNote) && (
            <div className="bg-card border border-border rounded-xl p-3 text-sm space-y-1 text-foreground">
              {placing && <div className="text-muted-foreground">Placing trade… please wait.</div>}
              {pendingTrade?.status === "open" && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-primary font-semibold">
                  Contract placed: {pendingTrade.direction} {pendingTrade.type} ${pendingTrade.stake} — waiting for result.
                </div>
              )}
              {pendingTrade?.status === "settled" && settleNote && (
                <div className={
                  "rounded-xl px-3 py-2 font-semibold " +
                  (pendingTrade.result === "win"
                    ? "bg-bull/10 text-bull border border-bull/30"
                    : "bg-bear/10 text-bear border border-bear/30")
                }>
                  {settleNote} · settled on digit {currentDigit}
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg bg-background p-1 grid grid-cols-2 gap-1">
            <button
              onClick={() => setBotMode(false)}
              disabled={botRunning}
              className={
                "py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 " +
                (!botMode
                  ? "bg-card text-foreground"
                  : "text-muted-foreground")
              }
            >
              <User className="h-4 w-4" /> Manual
            </button>
            <button
              onClick={() => setBotMode(true)}
              disabled={botRunning}
              className={
                "py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 " +
                (botMode
                  ? "bg-card text-foreground"
                  : "text-muted-foreground")
              }
            >
              <Bot className="h-4 w-4" /> Bot
            </button>
          </div>

          <div className="rounded-2xl border border-border bg-card/80 p-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Bot status</div>
                <div className="text-sm font-semibold">{botMode ? (botRunning ? "Auto trading live" : "Ready to auto") : "Manual mode"}</div>
              </div>
              <div className={"rounded-full px-2.5 py-1 text-[10px] font-semibold " + (botRunning ? "bg-bull/15 text-bull" : "bg-surface text-muted-foreground")}>
                {botRunning ? "LIVE" : "STANDBY"}
              </div>
            </div>
          </div>

          <button className="w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary">
            AI Scanner
          </button>

          {showDigitPicker && (
            <div className="bg-card border border-border rounded-xl p-2.5 space-y-2">
              <div className="text-[10px] uppercase text-muted-foreground font-bold text-center">Last Digit Prediction</div>
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 10 }).map((_, d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDigit(d)}
                    className={
                      "h-10 rounded-md font-semibold text-sm border " +
                      (selectedDigit === d
                        ? "bg-muted-foreground/10 text-foreground border-border-strong"
                        : "bg-white/0 border-border text-muted-foreground")
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStake(Math.max(1, stake - 1))}
              className="h-12 w-12 rounded-xl bg-surface border border-border grid place-items-center"
            >
              <Minus />
            </button>
            <div className="flex-1 bg-card border-2 border-primary rounded-xl py-2 text-center">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Stake $</div>
              <div className="text-2xl font-extrabold tabular-nums">{stake}</div>
            </div>
            <button
              onClick={() => setStake(stake + 1)}
              className="h-12 w-12 rounded-xl bg-surface border border-border grid place-items-center"
            >
              <Plus />
            </button>
          </div>

          <div className="hidden md:grid grid-cols-3 gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => setStake(q)}
                className={
                  "py-1.5 rounded-lg border text-xs font-bold " +
                  (stake === q
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground")
                }
              >
                ${q}
              </button>
            ))}
          </div>

          {botMode && (
            <div className="grid grid-cols-3 gap-2">
              <BotField label="Target" prefix="$" value={target} onChange={setTarget} accent="text-bull" />
              <BotField label="Stop" prefix="$" value={stop} onChange={setStop} accent="text-bear" />
              <BotField label="Mult" prefix="x" value={martingale} onChange={setMartingale} accent="text-primary" />
            </div>
          )}

          <div className="hidden xl:grid grid-cols-2 gap-2">
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Payout</div>
              <div className="mt-2 text-sm font-semibold">{payoutOver.toFixed(2)} AUD</div>
              <div className="mt-2 text-xs text-muted-foreground">Over · {(overRate * 100).toFixed(2)}%</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Payout</div>
              <div className="mt-2 text-sm font-semibold">{payoutUnder.toFixed(2)} AUD</div>
              <div className="mt-2 text-xs text-muted-foreground">Under · {(underRate * 100).toFixed(2)}%</div>
            </div>
          </div>

          {type === "Over/Under" && (
            <div className="space-y-3">
              <button
                onClick={() => fireManual("OVER")}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-teal-400 to-teal-600 text-white font-extrabold text-lg flex items-center justify-between px-4 shadow-md hover:scale-[1.01] transition-transform"
              >
                <span className="flex items-center gap-3"><svg className="h-4 w-4 opacity-90" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>Over</span>
                <span className="text-base font-mono">{((1 + overRate) * 100).toFixed(2)}%</span>
              </button>
              <button
                onClick={() => fireManual("UNDER")}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-red-500 to-red-700 text-white font-extrabold text-lg flex items-center justify-between px-4 shadow-md hover:scale-[1.01] transition-transform"
              >
                <span className="flex items-center gap-3"><svg className="h-4 w-4 opacity-90" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>Under</span>
                <span className="text-base font-mono">{((1 + underRate) * 100).toFixed(2)}%</span>
              </button>
            </div>
          )}

          {botRunning ? (
            <button
              onClick={stopBot}
                  className="w-full py-3 rounded-2xl bg-bear text-bear-foreground font-extrabold text-base glow-bear flex items-center justify-center gap-2"
            >
              <Square className="h-5 w-5" /> STOP BOT · session ${sessionPnLRef.current.toFixed(2)}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {botMode && (
                <button
                  onClick={() => startBot("AUTO")}
                  className="col-span-2 py-3 rounded-2xl bg-primary text-primary-foreground font-extrabold text-base glow-primary"
                >
                  AUTO TRADE
                </button>
              )}
              {actions.map(([label, tone]) => (
                <button
                  key={label}
                  onClick={() => (botMode ? startBot(label) : fireManual(label))}
                  className={
                    "py-3 rounded-lg font-extrabold text-base tracking-wide " +
                    (tone === "bull"
                      ? "bg-bull text-bull-foreground glow-bull"
                      : "bg-bear text-bear-foreground glow-bear")
                  }
                >
                  {botMode ? `BOT ${label}` : label} {tone === "bull" ? "↑" : "↓"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center column: chart area and chart controls - appears first on mobile (order-1) */}
        <div className="w-full md:w-auto order-1 md:order-2 bg-background p-2 overflow-hidden flex min-h-0 flex-col">
          <div className="hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Market</div>
                <div className="text-sm font-semibold">{market.label}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold tabular-nums">{price.toFixed(5)}</div>
                <div className="text-[11px] text-muted-foreground">Last digit <span className="font-semibold text-primary">{currentDigit}</span></div>
              </div>
            </div>
          </div>

          <div className="mb-2 hidden lg:grid grid-cols-4 gap-2">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={
                  "h-10 rounded-lg border text-xs font-bold transition " +
                  (type === t
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_0_18px_color-mix(in_oklab,var(--gold)_30%,transparent)]"
                    : "bg-surface border-border text-muted-foreground")
                }
              >
                {t === "Matches/Differs" ? "Match/Diff" : t}
              </button>
            ))}
          </div>

          <div className="lg:hidden relative">
            <button
              onClick={() => setMarketOpen(!marketOpen)}
              className="w-full bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 text-left min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/20 text-primary grid place-items-center font-extrabold text-xs shrink-0">
                  V
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{market.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {market.volatilityLabel} · {market.tickSpeedLabel}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-bold tabular-nums">{price.toFixed(5)}</div>
                <div className="text-xs text-muted-foreground">
                  last digit <span className="text-primary font-bold tabular-nums">{currentDigit}</span>{" "}
                  <span className="live-dot ml-1" />
                </div>
              </div>
              <ChevronDown
                className={
                  "h-4 w-4 text-muted-foreground shrink-0 transition " +
                  (marketOpen ? "rotate-180" : "")
                }
              />
            </button>

            {marketOpen && (
              <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-xl divide-y divide-border max-h-72 overflow-auto shadow-xl">
                {VOL_INDICES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => {
                      setIndex(m.value);
                      setMarketOpen(false);
                    }}
                    className="w-full text-left p-2.5 hover:bg-accent flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-semibold truncate">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {m.volatilityLabel} · {m.tickSpeedLabel}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-2 hidden lg:flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/70 p-2">
            <div className="flex items-center gap-1">
            <button
              onClick={() => setChartMode("line")}
              className={
                "h-9 rounded-md border px-3 text-xs font-bold flex items-center justify-center gap-2 " +
                (chartMode === "line"
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-card border-border text-muted-foreground")
              }
            >
              <LineChart className="h-3.5 w-3.5" /> Line
            </button>
            <button
              onClick={() => setChartMode("candles")}
              className={
                "h-9 rounded-md border px-3 text-xs font-bold flex items-center justify-center gap-2 " +
                (chartMode === "candles"
                  ? "bg-primary/20 text-primary border-primary/50"
                  : "bg-card border-border text-muted-foreground")
              }
            >
              <CandlestickChart className="h-3.5 w-3.5" /> Candles
            </button>
            </div>
            <button
              type="button"
              onClick={() => setChartOptionsOpen((prev) => !prev)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground"
            >
              <span>Indicators {selectedIndicators.length}</span>
              <ChevronDown className={"h-4 w-4 transition " + (chartOptionsOpen ? "rotate-180" : "")} />
            </button>
          </div>

          <div className={(chartOptionsOpen ? "mb-2 hidden lg:block" : "hidden")}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold">
                  Chart controls
                </div>
                <div className="text-sm font-semibold">Indicators & tick progression</div>
              </div>
              <button
                type="button"
                onClick={() => setChartOptionsOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground"
              >
                <span>{chartOptionsOpen ? "Hide" : "Show"} options</span>
                <ChevronDown className={"h-4 w-4 transition " + (chartOptionsOpen ? "rotate-180" : "")} />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border bg-surface px-2 py-1">Indicators: {selectedIndicators.length}</span>
              <span className="rounded-full border border-border bg-surface px-2 py-1">Progression: {settlementTicks} tick{settlementTicks === 1 ? "" : "s"}</span>
              {showDigitPicker && (
                <span className="rounded-full border border-border bg-surface px-2 py-1">Selected digit: {selectedDigit}</span>
              )}
            </div>
            {chartOptionsOpen && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold mb-2">
                    Chart indicators
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {INDICATOR_OPTIONS.map((indicator) => {
                      const active = selectedIndicators.includes(indicator);
                      return (
                        <button
                          key={indicator}
                          type="button"
                          onClick={() =>
                            setSelectedIndicators((prev) =>
                              prev.includes(indicator)
                                ? prev.filter((item) => item !== indicator)
                                : [...prev, indicator],
                            )
                          }
                          className={
                            "rounded-xl border px-2 py-2 text-[11px] font-semibold transition " +
                            (active
                              ? "bg-primary/15 border-primary text-primary"
                              : "bg-card border-border text-muted-foreground")
                          }
                        >
                          {indicator}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold mb-2">
                    Tick progression
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: 5 }, (_, i) => i + 1).map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setTickProgression(count)}
                        className={
                          "rounded-xl py-2 text-xs font-bold transition " +
                          (tickProgression === count
                            ? "bg-primary text-primary-foreground border border-primary"
                            : "bg-card border border-border text-muted-foreground")
                        }
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
                {showDigitPicker && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground tracking-wider font-bold mb-2">
                      Select digit
                    </div>
                    <div className="grid grid-cols-10 gap-1">
                      {Array.from({ length: 10 }).map((_, d) => (
                        <button
                          key={d}
                          onClick={() => setSelectedDigit(d)}
                          className={
                            "h-9 rounded-full font-bold text-sm border-2 " +
                            (selectedDigit === d
                              ? "bg-primary text-primary-foreground border-primary glow-primary"
                              : "bg-surface border-border")
                          }
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="w-full flex-1 min-h-0 bg-background border-x border-border relative overflow-hidden">
            <div className="hidden lg:block absolute left-4 top-4 z-30 w-[320px]">
              <button
                onClick={() => setMarketOpen(!marketOpen)}
                className="w-full bg-card/90 border border-border rounded-xl p-3 flex items-center justify-between gap-3 backdrop-blur"
              >
                <div className="flex items-center gap-2 text-left min-w-0">
                  <div className="h-8 w-8 rounded-full bg-primary/20 text-primary grid place-items-center font-extrabold text-xs shrink-0">V</div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{market.label}</div>
                    <div className="text-[10px] text-muted-foreground">{market.volatilityLabel} · {market.tickSpeedLabel}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold tabular-nums">{price.toFixed(5)}</div>
                  <div className="text-xs text-muted-foreground">last digit <span className="text-primary font-bold tabular-nums">{currentDigit}</span> <span className="live-dot ml-1" /></div>
                </div>
                <ChevronDown className={"h-4 w-4 text-muted-foreground shrink-0 transition " + (marketOpen ? "rotate-180" : "")} />
              </button>

              {marketOpen && (
                <div className="mt-1 w-full bg-card border border-border rounded-xl divide-y divide-border max-h-72 overflow-auto shadow-xl">
                  {VOL_INDICES.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setIndex(m.value);
                        setMarketOpen(false);
                      }}
                      className="w-full text-left p-2.5 hover:bg-accent flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-semibold truncate">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{m.volatilityLabel} · {m.tickSpeedLabel}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden lg:block absolute right-6 top-20 z-30 w-56">
              <div className="bg-card/90 border border-border rounded-xl p-3 backdrop-blur">
                <div className="text-[10px] uppercase text-muted-foreground font-bold mb-2">Ticks</div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <div className="text-xs text-muted-foreground">{settlementTicks} tick{settlementTicks === 1 ? '' : 's'}</div>
                  <div className="text-xs text-muted-foreground">{market.tickSpeedLabel}</div>
                </div>
                <div className="w-full bg-surface rounded-xl h-2 relative">
                  <div className="absolute left-0 top-0 bottom-0 flex items-center justify-between px-1">
                    {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => setTickProgression(n)}
                        className={
                          "h-4 w-4 rounded-full grid place-items-center text-[9px] font-semibold transition " +
                          (tickProgression === n
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-surface border border-border text-muted-foreground")
                        }
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <LiveChart
              basePrice={market.basePrice}
              volatility={chartVolatility}
              tickMs={chartTickMs}
              candleMs={chartCandleMs}
              onPrice={setPrice}
              badge={`${currentDigit}`}
              badgeTone={badgeTone}
              note={chartNote ?? undefined}
              noteTone={chartNote ? chartNoteTone : "neutral"}
              indicators={selectedIndicators}
              mode={chartMode}
              className="h-full"
              digitStats={digitStats}
              currentDigit={currentDigit}
              digitMarkerTone={digitMarkerTone}
            />
          </div>

          <div className="hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Digits</span>
              <span className="text-[10px] text-muted-foreground">Pick forecast</span>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {Array.from({ length: 10 }).map((_, d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDigit(d)}
                  className={
                    "h-10 rounded-full border text-sm font-semibold transition " +
                    (selectedDigit === d
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground")
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden">
            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider shrink-0 mr-1">
              Ticks
            </span>
            {tickTrail.length === 0 && <span className="text-xs text-muted-foreground">waiting…</span>}
            {tickTrail.map((t, i) => {
              const highlightCount = tickProgression + 1;
              const isRecent = i >= tickTrail.length - highlightCount;
              return (
                <span
                  key={i}
                  className={
                    "shrink-0 h-7 w-7 grid place-items-center rounded-full text-xs font-extrabold tabular-nums border transition-all " +
                    (isRecent ? "scale-110 shadow-lg" : "") +
                    (t.tone === "bull"
                      ? " bg-bull text-bull-foreground border-bull glow-bull"
                      : t.tone === "bear"
                        ? " bg-bear text-bear-foreground border-bear glow-bear"
                        : " bg-surface border-border text-muted-foreground")
                  }
                >
                  {t.d}
                </span>
              );
            })}
          </div>

          {showDigitStats && (
            <div className="hidden">
              <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">
                Last 100 digits
              </div>
              <div className="grid grid-cols-10 gap-1">
                {digitStats.map(({ d, pct }) => {
                  const isMax = pct === maxPct;
                  const isMin = pct === minPct;
                  const isCurrent = d === currentDigit;
                  return (
                    <div key={d} className="flex flex-col items-center gap-1">
                      <div
                        className={
                          "h-9 w-9 rounded-full grid place-items-center text-sm font-extrabold border-2 transition-all " +
                          (isCurrent ? "ring-2 ring-primary digit-pop " : "") +
                          (isMax
                            ? "bg-bull/20 border-bull text-bull"
                            : isMin
                              ? "bg-bear/15 border-bear/60 text-bear"
                              : "bg-surface border-border text-foreground")
                        }
                      >
                        {d}
                      </div>
                      <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              {type === "Even/Odd" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-bull/10 border border-bull/30 p-2 text-center">
                    <div className="text-[10px] uppercase text-bull font-bold">Even</div>
                    <div className="text-lg font-extrabold tabular-nums">
                      {digitStats
                        .filter((s) => s.d % 2 === 0)
                        .reduce((sum, s) => sum + s.pct, 0)
                        .toFixed(1)}
                      %
                    </div>
                  </div>
                  <div className="rounded-lg bg-bear/10 border border-bear/30 p-2 text-center">
                    <div className="text-[10px] uppercase text-bear font-bold">Odd</div>
                    <div className="text-lg font-extrabold tabular-nums">
                      {digitStats
                        .filter((s) => s.d % 2 === 1)
                        .reduce((sum, s) => sum + s.pct, 0)
                        .toFixed(1)}
                      %
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column: position tabs and trades history - appears third on mobile (order-3) */}
        <div className="space-y-0 w-full md:w-auto md:h-full md:overflow-hidden order-3 md:order-1 border-r border-border bg-surface/70">
          <div className="bg-surface/80 border-b border-border p-3 space-y-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-bold mb-2">Positions</div>
              <div className="text-lg font-extrabold">Binary history</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "open", label: `Open (${positionsTab === "open" ? visiblePositionTrades.length : positionTrades.filter((t) => t.status === "open").length})` },
                { key: "closed", label: `Closed (${positionsTab === "closed" ? visiblePositionTrades.length : positionTrades.filter((t) => ["won", "lost", "closed", "cancelled", "settled"].includes(t.status)).length})` },
                { key: "tx", label: `Transactions (${positionsTab === "tx" ? visiblePositionTrades.length : positionTrades.length})` },
              ].map((tabDef) => (
                <button
                  key={tabDef.key}
                  onClick={() => setPositionsTab(tabDef.key as "open" | "closed" | "tx")}
                  className={
                    "rounded-2xl py-2 text-xs font-bold transition " +
                    (positionsTab === tabDef.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface border border-border text-muted-foreground")
                  }
                >
                  {tabDef.label}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {visiblePositionTrades.length === 0 ? (
                <div className="rounded-3xl bg-surface border border-border p-5 text-center text-sm text-muted-foreground">
                  No {positionsTab === "open" ? "open positions" : positionsTab === "closed" ? "closed trades" : "trade history"} yet.
                </div>
              ) : (
                visiblePositionTrades.slice(0, 3).map((trade) => (
                  <PositionCard key={trade.id} trade={trade} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function BotField({
  label,
  prefix,
  value,
  onChange,
  accent,
}: {
  label: string;
  prefix: string;
  value: number;
  onChange: (n: number) => void;
  accent: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-2">
      <div className={"text-[10px] uppercase font-bold tracking-wider mb-1 " + accent}>{label}</div>
      <div className="flex items-center gap-1">
        <span className={"text-sm font-bold " + accent}>{prefix}</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent text-center font-bold text-lg outline-none tabular-nums"
        />
      </div>
    </div>
  );
}

function PositionCard({ trade }: { trade: PositionTrade }) {
  const positive = Number(trade.payout ?? 0) - Number(trade.stake) >= 0;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{trade.market}</div>
          <div className="text-[11px] text-muted-foreground">{trade.direction} · ${trade.stake.toFixed(2)}</div>
        </div>
        <div className={"text-right text-sm font-extrabold " + (trade.status === "open" ? "text-primary" : positive ? "text-bull" : "text-bear")}>
          {trade.status === "open" ? "OPEN" : trade.status.toUpperCase()}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div className="rounded-xl bg-card p-2">
          <div className="font-bold">Entry</div>
          <div>{trade.entry_price ? trade.entry_price.toFixed(5) : "-"}</div>
        </div>
        <div className="rounded-xl bg-card p-2">
          <div className="font-bold">Payout</div>
          <div>{trade.payout ? `$${trade.payout.toFixed(2)}` : "-"}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{new Date(trade.created_at).toLocaleTimeString()}</span>
        <span className={positive ? "text-bull" : "text-bear"}>
          {trade.payout ? `${positive ? "+" : "-"}$${Math.abs(Number(trade.payout) - Number(trade.stake)).toFixed(2)}` : "-"}
        </span>
      </div>
    </div>
  );
}
