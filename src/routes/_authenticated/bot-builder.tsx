import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bot, Sparkles, Settings, ArrowRight, Circle, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bot-builder")({
  component: BotBuilderPage,
});

const MARKETS = ["Vol 10", "Vol 25", "Vol 50", "Vol 75", "Vol 100", "Crash 500", "Boom 500"];
const CONTRACT_TYPES = ["DIGIT_OVER", "DIGIT_UNDER", "EVEN", "ODD", "MATCHES", "DIFFERS"] as const;
const TOOLBOX = [
  {
    category: "Purchase Conditions",
    blocks: [
      "Buy DIGIT_OVER",
      "Buy DIGIT_UNDER",
      "IF last digit > 6",
      "IF RSI < 30",
      "IF EMA crossover",
    ],
  },
  { category: "Sell Conditions", blocks: ["Sell when available", "Take profit", "Stop loss"] },
  {
    category: "Restart Conditions",
    blocks: ["Trade again", "Restart after loss", "Restart on error"],
  },
  { category: "Analysis", blocks: ["Log balance", "Log profit", "Set martingale"] },
  { category: "Utility", blocks: ["Wait 1 tick", "Reset counters"] },
] as const;

type ContractType = (typeof CONTRACT_TYPES)[number];
type SectionName = (typeof TOOLBOX)[number]["category"];

type Transaction = {
  id: string;
  action: string;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  status: string;
  time: string;
};

type Summary = {
  totalStake: number;
  totalPayout: number;
  contractsWon: number;
  contractsLost: number;
  profit: number;
  runs: number;
};

const INITIAL_BLOCKS: Record<SectionName, string[]> = {
  "Purchase Conditions": ["IF last digit > 6", "Buy DIGIT_OVER"],
  "Sell Conditions": ["Sell when available"],
  "Restart Conditions": ["Trade again"],
  Analysis: ["Log profit"],
  Utility: ["Reset counters"],
};

const INITIAL_SUMMARY: Summary = {
  totalStake: 0,
  totalPayout: 0,
  contractsWon: 0,
  contractsLost: 0,
  profit: 0,
  runs: 0,
};

function BotBuilderPage() {
  const [botName, setBotName] = useState("Digit Over Strategy");
  const [description, setDescription] = useState(
    "Buy Digit Over when the last digit is greater than 6.",
  );
  const [market, setMarket] = useState(MARKETS[3]);
  const [contractType, setContractType] = useState<ContractType>("DIGIT_OVER");
  const [stake, setStake] = useState(5);
  const [currency, setCurrency] = useState("USD");
  const [duration, setDuration] = useState(1);
  const [durationUnit, setDurationUnit] = useState("tick");
  const [takeProfit, setTakeProfit] = useState(100);
  const [stopLoss, setStopLoss] = useState(50);
  const [martingale, setMartingale] = useState(2);
  const [maxTrades, setMaxTrades] = useState(10);
  const [canvasBlocks, setCanvasBlocks] = useState<Record<SectionName, string[]>>(INITIAL_BLOCKS);
  const [status, setStatus] = useState<string | null>("Ready to build your strategy.");
  const [isRunning, setIsRunning] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [journal, setJournal] = useState<string[]>(["Workspace loaded."]);
  const [summary, setSummary] = useState<Summary>(INITIAL_SUMMARY);
  const [activeTab, setActiveTab] = useState<"summary" | "transactions" | "journal">("summary");

  const botConfig = useMemo(
    () => ({
      botName,
      description,
      tradeParameters: {
        market,
        contract: contractType,
        stake,
        currency,
        duration,
        durationUnit,
      },
      risk: {
        takeProfit,
        stopLoss,
        martingale,
        maxTrades,
      },
      blocks: canvasBlocks,
    }),
    [
      botName,
      description,
      market,
      contractType,
      stake,
      currency,
      duration,
      durationUnit,
      takeProfit,
      stopLoss,
      martingale,
      maxTrades,
      canvasBlocks,
    ],
  );

  const strategyJson = useMemo(
    () => ({
      trade: {
        market: "synthetic",
        symbol: market === "Vol 100" ? "R_100" : "R_50",
        contract:
          contractType === "DIGIT_OVER" ? "CALL" : contractType === "DIGIT_UNDER" ? "PUT" : "CALL",
        duration,
        duration_unit: durationUnit,
        stake,
        currency,
      },
      purchase: {
        conditions: canvasBlocks["Purchase Conditions"],
      },
      sell: {
        enabled: canvasBlocks["Sell Conditions"].length > 0,
        rules: canvasBlocks["Sell Conditions"],
      },
      restart: {
        rules: canvasBlocks["Restart Conditions"],
      },
    }),
    [market, contractType, duration, durationUnit, stake, currency, canvasBlocks],
  );

  const addBlock = (section: SectionName, label: string) => {
    setCanvasBlocks((current) => ({
      ...current,
      [section]: [...current[section], label],
    }));
    setJournal((current) => [...current, `Added block '${label}' to ${section}.`]);
  };

  const removeBlock = (section: SectionName, index: number) => {
    setCanvasBlocks((current) => {
      const updated = [...current[section]];
      updated.splice(index, 1);
      return { ...current, [section]: updated };
    });
    setJournal((current) => [...current, `Removed block from ${section}.`]);
  };

  const formatMoney = (value: number) => `${currency} ${value.toFixed(2)}`;

  const runStrategy = () => {
    if (isRunning) {
      setIsRunning(false);
      setStatus("Bot stopped. Live execution paused.");
      setJournal((current) => [...current, "Engine stopped by user."]);
      return;
    }

    setIsRunning(true);
    setStatus("Connecting to broker API and loading strategy...");
    setJournal((current) => [
      ...current,
      "Run pressed: connecting to broker API.",
      "Strategy loaded from workspace.",
    ]);

    const nextStatus = `Subscribed to ${market} data. Evaluating purchase conditions.`;
    setStatus(nextStatus);
    setJournal((current) => [...current, nextStatus]);

    const outcome = Math.random() > 0.44;
    const profit = outcome ? stake * 0.82 : -stake;
    const transaction: Transaction = {
      id: `T-${Date.now()}`,
      action: contractType.replace("DIGIT_", ""),
      buyPrice: stake,
      sellPrice: outcome ? stake + profit : 0,
      profit,
      status: outcome ? "Won" : "Lost",
      time: new Date().toLocaleTimeString(),
    };

    setTransactions((current) => [transaction, ...current].slice(0, 10));
    setJournal((current) => [
      ...current,
      `Placed ${transaction.action} order.`,
      outcome ? "Trade won." : "Trade lost.",
      "Restarting after contract completion.",
    ]);
    setSummary((current) => ({
      totalStake: current.totalStake + stake,
      totalPayout: current.totalPayout + (outcome ? stake + profit : 0),
      contractsWon: current.contractsWon + (outcome ? 1 : 0),
      contractsLost: current.contractsLost + (outcome ? 0 : 1),
      profit: current.profit + profit,
      runs: current.runs + 1,
    }));
    setStatus(
      outcome ? "Trade executed and completed successfully." : "Trade executed, loss recorded.",
    );
  };

  const runBacktest = () => {
    const winRate = 50 + Math.floor(Math.random() * 30);
    setStatus(
      `Backtest complete: ${winRate}% win rate, ${Math.floor(maxTrades * 0.8)} trades, ${((winRate / 100) * stake * maxTrades).toFixed(2)} USD ROI.`,
    );
    setJournal((current) => [...current, "Backtest run completed."]);
  };

  return (
    <div className="space-y-6 bg-slate-50 text-slate-900 min-h-screen p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3 rounded-3xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary shadow-sm">
            <Bot className="h-5 w-5" />
            Bot Builder
          </div>
          <h1 className="mt-3 text-2xl font-extrabold">
            Visual strategy builder for automated trades
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Compose strategies with blocks, run simulations, and inspect the saved JSON strategy.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Current status</div>
            <div className="mt-3 text-sm font-semibold">{isRunning ? "Running" : "Stopped"}</div>
            <div className="mt-2 text-sm text-slate-500">{status}</div>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Bot settings</div>
            <div className="mt-2 text-lg font-semibold">{botName}</div>
          </div>
          <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Live metrics</div>
            <div className="mt-2 text-lg font-semibold">{summary.runs} runs</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
        <section className="space-y-4 rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <Sparkles className="h-4 w-4" />
            Blocks menu
          </div>
          <div className="space-y-4">
            {TOOLBOX.map((group) => (
              <div
                key={group.category}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="mb-3 text-xs uppercase tracking-[0.24em] text-slate-500">
                  {group.category}
                </div>
                <div className="grid gap-2">
                  {group.blocks.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => addBlock(group.category, label)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <ArrowRight className="h-4 w-4" />
            Strategy canvas
          </div>
          <div className="grid gap-4">
            {Object.entries(canvasBlocks).map(([section, blocksInSection]) => (
              <div key={section} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
                  <span>{section}</span>
                  <span>
                    {blocksInSection.length} block{blocksInSection.length === 1 ? "" : "s"}
                  </span>
                </div>
                {blocksInSection.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                    Drag blocks here to build the workflow.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {blocksInSection.map((block, index) => (
                      <div
                        key={`${block}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                      >
                        <span>{block}</span>
                        <button
                          type="button"
                          onClick={() => removeBlock(section as SectionName, index)}
                          className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700 transition hover:bg-slate-200"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <Settings className="h-4 w-4" />
            Bot settings
          </div>
          <div className="grid gap-3">
            <label className="space-y-1 text-sm font-medium">
              Bot name
              <input
                value={botName}
                onChange={(event) => setBotName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full min-h-[92px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Market
              <select
                value={market}
                onChange={(event) => setMarket(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              >
                {MARKETS.map((value) => (
                  <option key={value} value={value} className="bg-white text-slate-900">
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium">
              Contract type
              <select
                value={contractType}
                onChange={(event) => setContractType(event.target.value as ContractType)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              >
                {CONTRACT_TYPES.map((value) => (
                  <option key={value} value={value} className="bg-white text-slate-900">
                    {value.replace("DIGIT_", "")}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Stake
                <input
                  type="number"
                  min={1}
                  value={stake}
                  onChange={(event) => setStake(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Currency
                <input
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Duration
                <input
                  type="number"
                  min={1}
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Unit
                <select
                  value={durationUnit}
                  onChange={(event) => setDurationUnit(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                >
                  <option value="tick">Tick</option>
                  <option value="minute">Minute</option>
                </select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Take profit
                <input
                  type="number"
                  min={0}
                  value={takeProfit}
                  onChange={(event) => setTakeProfit(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Stop loss
                <input
                  type="number"
                  min={0}
                  value={stopLoss}
                  onChange={(event) => setStopLoss(Number(event.target.value))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
                />
              </label>
            </div>
            <label className="space-y-1 text-sm font-medium">
              Martingale multiplier
              <input
                type="number"
                min={1}
                value={martingale}
                onChange={(event) => setMartingale(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Max trades
              <input
                type="number"
                min={1}
                value={maxTrades}
                onChange={(event) => setMaxTrades(Number(event.target.value))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
              />
            </label>

            <div className="mt-4 grid gap-3">
              <button
                onClick={runStrategy}
                className="rounded-3xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                {isRunning ? "Stop Bot" : "Run Bot"}
              </button>
              <button
                onClick={runBacktest}
                className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Backtest Strategy
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <Circle className="h-4 w-4" />
            Live monitor
          </div>
          <div className="mt-4 rounded-3xl bg-slate-50 p-4">
            <div className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Total stake
                  </div>
                  <div className="mt-2 font-semibold">{formatMoney(summary.totalStake)}</div>
                </div>
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Total payout
                  </div>
                  <div className="mt-2 font-semibold">{formatMoney(summary.totalPayout)}</div>
                </div>
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Profit</div>
                  <div className="mt-2 font-semibold">{formatMoney(summary.profit)}</div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Wins</div>
                  <div className="mt-2 font-semibold">{summary.contractsWon}</div>
                </div>
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Losses</div>
                  <div className="mt-2 font-semibold">{summary.contractsLost}</div>
                </div>
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Runs</div>
                  <div className="mt-2 font-semibold">{summary.runs}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-3">
            {(["summary", "transactions", "journal"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-3xl px-4 py-2 text-sm font-semibold ${activeTab === tab ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-3xl bg-white border border-slate-200 p-4 text-sm text-slate-700">
            {activeTab === "summary" ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold">Summary</div>
                <div>Contracts won: {summary.contractsWon}</div>
                <div>Contracts lost: {summary.contractsLost}</div>
                <div>Total profit: {formatMoney(summary.profit)}</div>
                <div>Total trades: {summary.runs}</div>
              </div>
            ) : activeTab === "transactions" ? (
              <div className="space-y-3">
                <div className="text-sm font-semibold">Transactions</div>
                {transactions.length === 0 ? (
                  <div className="text-slate-500">No trades executed yet.</div>
                ) : (
                  <div className="space-y-3">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="rounded-3xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                          <span>{tx.action}</span>
                          <span>{tx.status}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{tx.time}</div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs text-slate-600">
                          <div>Buy {formatMoney(tx.buyPrice)}</div>
                          <div>Sell {formatMoney(tx.sellPrice)}</div>
                          <div>Profit {formatMoney(tx.profit)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm font-semibold">Journal</div>
                {journal.length === 0 ? (
                  <div className="text-slate-500">No journal entries yet.</div>
                ) : (
                  <div className="space-y-2">
                    {journal.map((entry, index) => (
                      <div
                        key={`${entry}-${index}`}
                        className="rounded-3xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600"
                      >
                        {entry}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <Target className="h-4 w-4" />
            Saved bot configuration
          </div>
          <pre className="mt-3 overflow-x-auto rounded-3xl bg-slate-50 p-4 text-xs text-slate-600">
            {JSON.stringify(strategyJson, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
