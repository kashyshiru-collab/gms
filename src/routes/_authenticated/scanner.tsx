import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Crosshair, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { deepScanMarket } from "@/lib/scanner.functions";
import { toast } from "sonner";
import { logDebugEvent, serializeError } from "@/lib/debug-logger";

export const Route = createFileRoute("/_authenticated/scanner")({
  component: ScannerPage,
});

const CATEGORIES = ["Buy/Sell", "Even/Odd", "Matches/Differs", "Over/Under"] as const;
type Cat = (typeof CATEGORIES)[number];

const DEFAULT_SCANNER_SETUP = {
  stake: "10",
  ticks: "1",
  targetProfit: "200",
  targetLoss: "999",
  lossMultiple: "2",
  digit: "5",
};

function ScannerPage() {
  const [cat, setCat] = useState<Cat>("Buy/Sell");
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState(DEFAULT_SCANNER_SETUP);
  const [result, setResult] = useState<Awaited<
    ReturnType<ReturnType<typeof useServerFn<typeof deepScanMarket>>>
  > | null>(null);
  const scan = useServerFn(deepScanMarket);
  const navigate = useNavigate();

  async function runScan() {
    logDebugEvent("info", "scanner", "AI scanner started", { category: cat });
    setScanning(true);
    setResult(null);
    setSetupOpen(false);
    setProgress(0);
    const tick = setInterval(() => setProgress((p) => Math.min(11, p + 1)), 250);
    try {
      const out = await scan({ data: { category: cat } });
      logDebugEvent("info", "scanner", "AI scanner completed", out);
      clearInterval(tick);
      setProgress(12);
      setResult(out);
    } catch (e) {
      logDebugEvent("error", "scanner", "AI scanner failed", serializeError(e));
      clearInterval(tick);
      setProgress(0);
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function openSetup() {
    if (!result) {
      toast.error("Run a scan first");
      return;
    }
    setSetupOpen(true);
  }

  function loadBot() {
    if (!result) {
      toast.error("Run a scan first");
      return;
    }

    const normalizedSetup = normalizeSetup(setup);
    window.sessionStorage.setItem(
      "tronix-option-scanner-bot",
      JSON.stringify({
        source: "scanner",
        name: "AI scanner setup",
        category: cat,
        market: result.bestMarket,
        direction: result.bias,
        bias: result.bias,
        edge: result.edge,
        ...normalizedSetup,
        // Load the filled parameters for review; do not start trading yet.
        autotrade: false,
      }),
    );
    toast.success("Scanner bot loaded with your trade settings");
    navigate({ to: "/binary" });
  }

  return (
    <div className="h-full min-h-0 w-full space-y-4 overflow-y-auto overscroll-contain p-4 pb-36 scroll-pb-36 lg:pb-4 lg:scroll-pb-4">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary grid place-items-center glow-primary border border-primary/40">
          <Crosshair className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-bold text-xl">AI Market Scanner</h1>
          <p className="text-xs text-muted-foreground">
            Deep scan for the best market — picked for you.
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 text-xs text-muted-foreground leading-relaxed">
        AI-powered market finder: deep-scans volatility indices for the strongest trade setup in
        your chosen category. Signals only — not financial advice.
      </div>

      <div>
        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
          Market category
        </div>
        <select
          value={cat}
          onChange={(e) => {
            setCat(e.target.value as Cat);
            setSetupOpen(false);
          }}
          className="w-full bg-card border border-border rounded-xl px-4 py-3 font-bold outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c} className="bg-card">
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {scanning
            ? `Scanning 12 indices for the best ${cat} setup…`
            : result
              ? "Scan complete"
              : "Ready to scan"}
        </span>
        <span className="font-bold tabular-nums">{progress}/12</span>
      </div>
      <div className="h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-primary-glow transition-all"
          style={{ width: `${(progress / 12) * 100}%` }}
        />
      </div>

      <button
        onClick={runScan}
        disabled={scanning}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-primary/80 to-primary-glow/60 text-primary-foreground font-bold flex items-center justify-center gap-2 glow-primary disabled:opacity-60"
      >
        <Search className="h-4 w-4" /> {scanning ? "Scanning…" : "Deep scan for best market"}
      </button>
      <button
        onClick={openSetup}
        disabled={!result || scanning}
        className="w-full py-3 rounded-xl border border-primary text-primary font-bold disabled:opacity-50"
      >
        Load trade parameters
      </button>

      {result && (
        <div className="bg-card border border-primary/40 rounded-2xl p-4 space-y-3 glow-primary">
          <div className="text-[10px] uppercase tracking-wider font-bold text-primary">
            Best market to trade
          </div>
          <div>
            <h2 className="font-extrabold text-xl">{result.bestMarket}</h2>
            <div className="text-sm text-muted-foreground">
              {cat} · {result.recommendation}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-bull font-semibold">
              Buy {result.buyCount} · Sell {result.sellCount} · edge {result.edge}
            </span>
            <span className="text-xs text-muted-foreground">
              bias <span className="font-bold text-foreground">{result.bias}</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{result.rationale}</p>
          <button
            onClick={openSetup}
            className="w-full py-3 rounded-xl bg-bull/15 border border-bull text-bull font-bold"
          >
            Set parameters
          </button>
        </div>
      )}

      {result && setupOpen && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-primary">
              Trade parameters
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Defaults are ready. Change only what you want before loading the bot.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ScannerField
              label="Stake"
              prefix="$"
              value={setup.stake}
              min={0.35}
              step={0.5}
              onChange={(stake) => setSetup((current) => ({ ...current, stake }))}
            />
            <ScannerField
              label="Ticks"
              value={setup.ticks}
              min={1}
              step={1}
              onChange={(ticks) => setSetup((current) => ({ ...current, ticks }))}
            />
            <ScannerField
              label="Take profit"
              prefix="$"
              value={setup.targetProfit}
              min={1}
              step={1}
              onChange={(targetProfit) => setSetup((current) => ({ ...current, targetProfit }))}
            />
            <ScannerField
              label="Stop loss"
              prefix="$"
              value={setup.targetLoss}
              min={1}
              step={1}
              onChange={(targetLoss) => setSetup((current) => ({ ...current, targetLoss }))}
            />
            <ScannerField
              label="Loss multiple"
              prefix="x"
              value={setup.lossMultiple}
              min={1}
              step={0.1}
              onChange={(lossMultiple) => setSetup((current) => ({ ...current, lossMultiple }))}
            />
            {(cat === "Over/Under" || cat === "Matches/Differs") && (
              <ScannerField
                label="Digit"
                value={setup.digit}
                min={0}
                max={9}
                step={1}
                onChange={(digit) => setSetup((current) => ({ ...current, digit }))}
              />
            )}
          </div>

          <button
            onClick={loadBot}
            className="w-full py-3 rounded-xl bg-bull text-bull-foreground font-bold"
          >
            Load with these settings
          </button>
        </div>
      )}
    </div>
  );
}

function ScannerField({
  label,
  prefix,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  prefix?: string;
  value: string;
  min: number;
  max?: number;
  step: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
        {label}
      </span>
      <span className="relative block">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full rounded-xl border border-border bg-background py-3 text-sm font-bold outline-none focus:border-primary ${
            prefix ? "pl-7 pr-3" : "px-3"
          }`}
        />
      </span>
    </label>
  );
}

function normalizeSetup(setup: typeof DEFAULT_SCANNER_SETUP) {
  return {
    stake: normalizeNumber(setup.stake, 10, 0.35),
    ticks: Math.round(normalizeNumber(setup.ticks, 1, 1, 10)),
    targetProfit: normalizeNumber(setup.targetProfit, 200, 1),
    targetLoss: normalizeNumber(setup.targetLoss, 999, 1),
    lossMultiple: normalizeNumber(setup.lossMultiple, 2, 1),
    digit: Math.round(normalizeNumber(setup.digit, 5, 0, 9)),
  };
}

function normalizeNumber(
  value: string,
  fallback: number,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
