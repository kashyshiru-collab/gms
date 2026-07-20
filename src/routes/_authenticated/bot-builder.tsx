import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Bot, ChevronDown, Play, Plus, RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/bot-builder")({
  component: BotBuilderPage,
});

const BLOCK_CATEGORIES = [
  {
    title: "Trade blocks",
    blocks: ["Market", "Trade type", "Contract type", "Candle interval", "Stake", "Duration"],
  },
  {
    title: "Purchase blocks",
    blocks: ["Purchase Rise", "Purchase Fall", "Purchase Even", "Purchase Odd"],
  },
  {
    title: "Exit blocks",
    blocks: ["Sell when available", "Take profit", "Stop loss", "Sell at market"],
  },
  {
    title: "Control blocks",
    blocks: ["Restart on error", "Restart last trade", "Wait 1 tick", "Reset counters"],
  },
];

const MARKET_OPTIONS = ["Vol 100 (1s)", "Vol 75 (1s)", "Vol 50 (1s)"];
const TRADE_TYPES = ["Rise/Fall", "Up/Down"] as const;
const CONTRACT_TYPES = ["Both", "Call", "Put"] as const;
const CANDLE_INTERVALS = ["1 minute", "5 minutes", "15 minutes"] as const;
const PURCHASE_ACTIONS = ["Purchase Rise", "Purchase Fall", "Purchase Even", "Purchase Odd"] as const;
const SUMMARY_TABS = ["Summary", "Transactions", "Journal"] as const;

type PurchaseAction = (typeof PURCHASE_ACTIONS)[number];
type TradeType = (typeof TRADE_TYPES)[number];
type ContractType = (typeof CONTRACT_TYPES)[number];
type CandleInterval = (typeof CANDLE_INTERVALS)[number];
type SummaryTab = (typeof SUMMARY_TABS)[number];

type Transaction = {
  id: string;
  action: string;
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

const INITIAL_SUMMARY: Summary = {
  totalStake: 0,
  totalPayout: 0,
  contractsWon: 0,
  contractsLost: 0,
  profit: 0,
  runs: 0,
};

function BotBuilderPage() {
  const [search, setSearch] = useState("");
  const [botName, setBotName] = useState("Quick bot");
  const [market, setMarket] = useState(MARKET_OPTIONS[0]);
  const [tradeType, setTradeType] = useState<TradeType>("Rise/Fall");
  const [contractType, setContractType] = useState<ContractType>("Both");
  const [candleInterval, setCandleInterval] = useState<CandleInterval>("1 minute");
  const [stake, setStake] = useState(1);
  const [duration, setDuration] = useState(1);
  const [purchaseAction, setPurchaseAction] = useState<PurchaseAction>("Purchase Rise");
  const [sellRule, setSellRule] = useState("Sell when available");
  const [restartRule, setRestartRule] = useState("Restart on error");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("Ready to run");
  const [activeTab, setActiveTab] = useState<SummaryTab>("Summary");
  const [summary, setSummary] = useState<Summary>(INITIAL_SUMMARY);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [journal, setJournal] = useState<string[]>(["Workflow loaded.", "Bot is ready."]);

  const botConfig = useMemo(
    () => ({
      market,
      tradeType,
      contractType,
      candleInterval,
      stake,
      duration,
      purchase: purchaseAction,
      sell: sellRule,
      restart: restartRule,
    }),
    [market, tradeType, contractType, candleInterval, stake, duration, purchaseAction, sellRule, restartRule],
  );

  const formatMoney = (value: number) => `USD ${value.toFixed(2)}`;

  const navigate = useNavigate();

  const startRun = () => {
    setIsRunning(true);
    setStatus("Starting trade page...");
    window.sessionStorage.setItem(
      "tronix-scanner-bot",
      JSON.stringify({
        category: "Buy/Sell",
        market,
        bias: purchaseAction,
        autotrade: true,
      }),
    );
    navigate({ to: "/binary" });
  };

  const reset = () => {
    setIsRunning(false);
    setStatus("Ready to run");
    setSummary(INITIAL_SUMMARY);
    setTransactions([]);
    setJournal(["Workflow reset."]);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl bg-white border border-slate-200 p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              <Bot className="h-4 w-4" />
              Bot Builder
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">Bot Builder</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Build a powerful bot workflow with block categories, a central logic canvas, and live monitoring.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Status</div>
              <div className="mt-2 font-semibold text-slate-900">{status}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Strategy</div>
              <div className="mt-2 font-semibold text-slate-900">{purchaseAction}</div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-700">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Run mode</div>
              <div className="mt-2 font-semibold text-slate-900">{isRunning ? "Running" : "Stopped"}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_420px]">
          <aside className="space-y-5 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Block library</p>
                <h2 className="mt-3 text-lg font-semibold text-slate-900">Add strategy blocks</h2>
              </div>
              <button className="rounded-full bg-slate-900 px-3 py-2 text-white transition hover:bg-slate-800">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search blocks"
                  className="w-full rounded-3xl border border-transparent bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            <div className="space-y-4">
              {BLOCK_CATEGORIES.map((category) => (
                <div key={category.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.28em] text-slate-500">
                    <span>{category.title}</span>
                    <ChevronDown className="h-4 w-4" />
                  </div>
                  <div className="mt-3 space-y-3">
                    {category.blocks
                      .filter((block) => block.toLowerCase().includes(search.toLowerCase()))
                      .map((block) => (
                        <button
                          key={block}
                          type="button"
                          className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                        >
                          {block}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <main className="space-y-5">
            <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Bot name</p>
                  <input
                    value={botName}
                    onChange={(event) => setBotName(event.target.value)}
                    className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none"
                  />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={startRun}
                    className="inline-flex items-center justify-center rounded-3xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {isRunning ? "Stop" : "Run"}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex items-center justify-center rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Market</div>
                  <div className="mt-2 font-semibold text-slate-900">{market}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Trade type</div>
                  <div className="mt-2 font-semibold text-slate-900">{tradeType}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Contract</div>
                  <div className="mt-2 font-semibold text-slate-900">{contractType}</div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Duration</div>
                  <div className="mt-2 font-semibold text-slate-900">{duration} tick</div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Strategy canvas</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">Logic flow</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-600">
                  Drag blocks here
                </span>
              </div>

              <div className="mt-5 space-y-5 rounded-[32px] border border-dashed border-slate-200 bg-slate-50 p-5">
                <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                  <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">Start</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-600">Entry</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">Begin the bot sequence and wait for the next trade opportunity.</p>
                  </div>
                  <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">Trade parameters</span>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div>Market: {market}</div>
                      <div>Type: {tradeType}</div>
                      <div>Contract: {contractType}</div>
                      <div>Candle: {candleInterval}</div>
                      <div>Stake: USD {stake}</div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">Purchase condition</span>
                      <span className="text-xs uppercase tracking-[0.28em] text-slate-500">IF</span>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">{purchaseAction}</div>
                  </div>
                  <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">Sell condition</span>
                      <span className="text-xs uppercase tracking-[0.28em] text-slate-500">THEN</span>
                    </div>
                    <div className="mt-3 text-sm text-slate-600">{sellRule}</div>
                  </div>
                </div>

                <div className="rounded-3xl bg-white border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-900">Restart condition</span>
                    <span className="text-xs uppercase tracking-[0.28em] text-slate-500">RESET</span>
                  </div>
                  <div className="mt-3 text-sm text-slate-600">{restartRule}</div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Live bot summary</div>
                  <div className="mt-3 text-lg font-semibold text-slate-900">{botName}</div>
                  <div className="mt-1 text-sm text-slate-600">Auto restart: {restartRule}</div>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Selected block</div>
                  <div className="mt-3 text-lg font-semibold text-slate-900">{purchaseAction}</div>
                  <div className="mt-1 text-sm text-slate-600">{sellRule} after {duration} tick(s)</div>
                </div>
              </div>
            </section>
          </main>

          <aside className="space-y-5 rounded-3xl bg-white border border-slate-200 p-5 shadow-sm">
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Live monitor</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-900">Performance</h2>
                </div>
                <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">{isRunning ? "LIVE" : "OFFLINE"}</div>
              </div>
              <div className="mt-5 grid gap-3">
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Total stake</div>
                  <div className="mt-2 font-semibold text-slate-900">{formatMoney(summary.totalStake)}</div>
                </div>
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Total payout</div>
                  <div className="mt-2 font-semibold text-slate-900">{formatMoney(summary.totalPayout)}</div>
                </div>
                <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm">
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Profit</div>
                  <div className="mt-2 font-semibold text-slate-900">{formatMoney(summary.profit)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap gap-2">
                {SUMMARY_TABS.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-3xl px-3 py-2 text-sm font-semibold ${activeTab === tab ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl bg-white border border-slate-200 p-4 text-sm text-slate-700">
              {activeTab === "Summary" ? (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Summary</div>
                  <div className="grid gap-2">
                    <div>Total runs: {summary.runs}</div>
                    <div>Won: {summary.contractsWon}</div>
                    <div>Lost: {summary.contractsLost}</div>
                  </div>
                </div>
              ) : activeTab === "Transactions" ? (
                <div className="space-y-3">
                  {transactions.length === 0 ? (
                    <div className="text-slate-500">No transactions yet.</div>
                  ) : (
                    transactions.map((tx) => (
                      <div key={tx.id} className="rounded-3xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                          <span>{tx.action}</span>
                          <span>{tx.status}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">{tx.time}</div>
                        <div className="mt-3 text-sm text-slate-600">Profit: {formatMoney(tx.profit)}</div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {journal.map((entry, index) => (
                    <div key={`${entry}-${index}`} className="rounded-3xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
                      {entry}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
