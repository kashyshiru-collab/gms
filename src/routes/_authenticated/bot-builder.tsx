import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Play, Plus, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bot-builder")({
  component: BotBuilderPage,
});

const MARKET_OPTIONS = ["Vol 100", "Vol 75", "Vol 50"] as const;
const VOLATILITY_OPTIONS = ["1s", "3s", "5s"] as const;
const STRATEGIES = ["Purchase Rise", "Purchase Fall", "Purchase Even", "Purchase Odd"] as const;
const TICK_OPTIONS = [1, 2, 3, 5, 10] as const;
const CONTRACT_TYPES = ["Both", "Call", "Put"] as const;
const CANDLE_INTERVALS = ["1 minute", "5 minutes", "15 minutes"] as const;
const SELL_RULES = ["Sell when available", "Take profit", "Stop loss", "Sell at market"] as const;
const RESTART_RULES = ["Restart on error", "Restart last trade", "Wait 1 tick", "Reset counters"] as const;

type MarketOption = (typeof MARKET_OPTIONS)[number];
type VolatilityOption = (typeof VOLATILITY_OPTIONS)[number];
type StrategyOption = (typeof STRATEGIES)[number];
type TickOption = (typeof TICK_OPTIONS)[number];
type ContractType = (typeof CONTRACT_TYPES)[number];
type CandleInterval = (typeof CANDLE_INTERVALS)[number];

function BotBuilderPage() {
  const [botName, setBotName] = useState("Quick bot");
  const [market, setMarket] = useState<MarketOption>(MARKET_OPTIONS[0]);
  const [volatility, setVolatility] = useState<VolatilityOption>(VOLATILITY_OPTIONS[0]);
  const [strategy, setStrategy] = useState<StrategyOption>(STRATEGIES[0]);
  const [ticks, setTicks] = useState<TickOption>(TICK_OPTIONS[0]);
  const [stake, setStake] = useState(1);
  const [maxLoss, setMaxLoss] = useState(5);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [contractType, setContractType] = useState<ContractType>(CONTRACT_TYPES[0]);
  const [candleInterval, setCandleInterval] = useState<CandleInterval>(CANDLE_INTERVALS[0]);
  const [sellRule, setSellRule] = useState(SELL_RULES[0]);
  const [restartRule, setRestartRule] = useState(RESTART_RULES[0]);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Ready to run");
  const [profit, setProfit] = useState(0);

  const navigate = useNavigate();

  const formatMoney = (value: number) => `USD ${value.toFixed(2)}`;

  const startRun = () => {
    setIsRunning(true);
    setStatus("Starting trade page...");
    window.sessionStorage.setItem(
      "tronix-scanner-bot",
      JSON.stringify({
        category: "Buy/Sell",
        market,
        volatility,
        strategy,
        ticks,
        stake,
        maxLoss,
        contractType,
        candleInterval,
        sellRule,
        restartRule,
        autotrade: true,
      }),
    );
    navigate({ to: "/binary" });
  };

  const reset = () => {
    setBotName("Quick bot");
    setMarket(MARKET_OPTIONS[0]);
    setVolatility(VOLATILITY_OPTIONS[0]);
    setStrategy(STRATEGIES[0]);
    setTicks(TICK_OPTIONS[0]);
    setStake(1);
    setMaxLoss(5);
    setMoreOptionsOpen(false);
    setContractType(CONTRACT_TYPES[0]);
    setCandleInterval(CANDLE_INTERVALS[0]);
    setSellRule(SELL_RULES[0]);
    setRestartRule(RESTART_RULES[0]);
    setIsRunning(false);
    setStatus("Ready to run");
    setProfit(0);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-screen-lg space-y-6">
        <section className="rounded-3xl bg-white border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Bot name</p>
              <input
                value={botName}
                onChange={(event) => setBotName(event.target.value)}
                className="mt-3 w-full max-w-md rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-lg font-semibold text-slate-900 outline-none"
              />
              <p className="mt-2 text-sm text-slate-600">Set the bot name and launch the trading page.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={startRun}
                className="inline-flex items-center justify-center rounded-3xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Play className="mr-2 h-4 w-4" />
                Run
              </button>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Market</label>
              <select
                value={market}
                onChange={(event) => setMarket(event.target.value as MarketOption)}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
              >
                {MARKET_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Volatility</label>
              <select
                value={volatility}
                onChange={(event) => setVolatility(event.target.value as VolatilityOption)}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
              >
                {VOLATILITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Ticks</label>
              <select
                value={ticks}
                onChange={(event) => setTicks(Number(event.target.value) as TickOption)}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
              >
                {TICK_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Strategy</label>
              <select
                value={strategy}
                onChange={(event) => setStrategy(event.target.value as StrategyOption)}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
              >
                {STRATEGIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Stake</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={stake}
                onChange={(event) => setStake(Number(event.target.value))}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Max loss</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={maxLoss}
                onChange={(event) => setMaxLoss(Number(event.target.value))}
                className="mt-2 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">Simplified view with only core bot settings.</div>
            <button
              type="button"
              onClick={() => setMoreOptionsOpen((open) => !open)}
              className="inline-flex items-center justify-center rounded-3xl bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-900 border border-slate-200 transition hover:bg-slate-100"
            >
              <Plus className="mr-2 h-4 w-4" />
              More options
            </button>
          </div>

          {moreOptionsOpen && (
            <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Contract type</label>
                  <select
                    value={contractType}
                    onChange={(event) => setContractType(event.target.value as ContractType)}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    {CONTRACT_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Candle interval</label>
                  <select
                    value={candleInterval}
                    onChange={(event) => setCandleInterval(event.target.value as CandleInterval)}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    {CANDLE_INTERVALS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Sell condition</label>
                  <select
                    value={sellRule}
                    onChange={(event) => setSellRule(event.target.value)}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    {SELL_RULES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-[0.28em] text-slate-500">Restart rule</label>
                  <select
                    value={restartRule}
                    onChange={(event) => setRestartRule(event.target.value)}
                    className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    {RESTART_RULES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Profit</p>
                <h2 className="mt-2 text-3xl font-semibold text-slate-900">{formatMoney(profit)}</h2>
              </div>
              <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-600">
                Live
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-600">Simplified profit display visible on initial open.</p>
          </div>

          <aside className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Current setup</p>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div>Market: {market}</div>
              <div>Volatility: {volatility}</div>
              <div>Ticks: {ticks}</div>
              <div>Strategy: {strategy}</div>
              <div>Stake: {formatMoney(stake)}</div>
              <div>Max loss: {formatMoney(maxLoss)}</div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
