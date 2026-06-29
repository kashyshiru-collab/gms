import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, History } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { placeTrade, settleTrade } from "@/lib/trades.functions";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import planeAsset from "@/assets/aviator-plane.png.asset.json";

export const Route = createFileRoute("/_authenticated/aviator")({
  component: AviatorPage,
});

type Phase = "waiting" | "flying" | "crashed";

// House edge ~7% → RTP ~93%. Lower constant = bigger edge.
function generateCrash() {
  const r = Math.random();
  return Math.max(1.0, +(1 / (1 - r * 0.93)).toFixed(2));
}

function AviatorPage() {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [multiplier, setMultiplier] = useState(1.0);
  const [crashAt, setCrashAt] = useState(0);
  const [history, setHistory] = useState<number[]>([1.20, 1.25, 3.95, 1.18, 2.41, 1.05]);
  const [stake, setStake] = useState(10);
  const [autoBet, setAutoBet] = useState(false);
  const [autoCashout, setAutoCashout] = useState(2.0);
  const [betActive, setBetActive] = useState(false);
  const [cashedAt, setCashedAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(5);
  const tradeIdRef = useRef<string | null>(null);
  const place = useServerFn(placeTrade);
  const settle = useServerFn(settleTrade);
  const qc = useQueryClient();

  useEffect(() => {
    if (phase === "waiting") {
      let t = 5;
      setCountdown(t);
      const id = setInterval(() => {
        t -= 1;
        setCountdown(Math.max(0, t));
        if (t <= 0) {
          clearInterval(id);
          setCrashAt(generateCrash());
          setMultiplier(1.0);
          setCashedAt(null);
          setPhase("flying");
        }
      }, 1000);
      return () => clearInterval(id);
    }
    if (phase === "flying") {
      const start = Date.now();
      const id = setInterval(() => {
        const t = (Date.now() - start) / 1000;
        const m = +(Math.pow(1.07, t * 3)).toFixed(2);
        if (m >= crashAt) {
          setMultiplier(crashAt);
          setPhase("crashed");
          clearInterval(id);
        } else {
          setMultiplier(m);
        }
      }, 60);
      return () => clearInterval(id);
    }
    if (phase === "crashed") {
      setHistory((h) => [crashAt, ...h].slice(0, 12));
      if (betActive && tradeIdRef.current) {
        settle({ data: { trade_id: tradeIdRef.current, won: false, multiplier: 0 } });
        toast.error(`Crashed at ${crashAt}x — lost $${stake}`);
        setBetActive(false);
        tradeIdRef.current = null;
        qc.invalidateQueries({ queryKey: ["profile"] });
      }
      const t = setTimeout(() => setPhase("waiting"), 3000);
      return () => clearTimeout(t);
    }
  }, [phase, crashAt, betActive, stake, settle, qc]);

  useEffect(() => {
    if (phase === "flying" && betActive && multiplier >= autoCashout && !cashedAt) {
      cashout();
    }
  }, [multiplier, phase, betActive, autoCashout, cashedAt]);

  useEffect(() => {
    if (autoBet && phase === "waiting" && !betActive) bet();
  }, [autoBet, phase, betActive]);

  async function bet() {
    if (phase !== "waiting" || betActive) return;
    try {
      const t = await place({ data: { module: "aviator", market: "Aviator", direction: "FLY", stake } });
      tradeIdRef.current = t.id;
      setBetActive(true);
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  async function cashout() {
    if (!betActive || !tradeIdRef.current || phase !== "flying") return;
    const m = multiplier;
    setCashedAt(m);
    setBetActive(false);
    try {
      await settle({ data: { trade_id: tradeIdRef.current, won: true, multiplier: m } });
      toast.success(`Cashed out @ ${m.toFixed(2)}x = $${(stake * m).toFixed(2)}`);
      tradeIdRef.current = null;
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  // Plane position based on multiplier — log scale curve across stage
  const progress = Math.min(0.92, Math.log(multiplier) / Math.log(8));
  const planeX = 8 + progress * 78; // %
  const planeY = 78 - progress * 60; // % (bottom-left -> top-right)

  // Build curve path from (8, 78) to (planeX, planeY) using quadratic
  const curvePath = `M 8 78 Q ${(8 + planeX) / 2} 78 ${planeX} ${planeY}`;

  return (
    <div className="space-y-3">
      <div className="bg-surface border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>
          {phase === "waiting" ? `Next round in ${countdown}s…` : phase === "flying" ? "In flight — cash out anytime" : "Round ended"}
        </span>
        <span className="text-primary font-semibold">Aviator</span>
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-3 px-3">
        {history.map((h, i) => (
          <span key={i} className={"px-3 py-1 rounded-full text-xs font-bold tabular-nums whitespace-nowrap " + (h >= 2 ? "bg-bull/20 text-bull border border-bull/40" : "bg-bear/15 text-bear border border-bear/30")}>{h.toFixed(2)}×</span>
        ))}
        <button className="ml-auto h-7 w-7 grid place-items-center rounded-full bg-surface text-muted-foreground"><History className="h-3 w-3" /></button>
      </div>

      {/* Stage */}
      <div className="relative h-72 rounded-2xl bg-gradient-to-br from-[oklch(0.18_0.05_265)] to-[oklch(0.10_0.04_280)] border border-border overflow-hidden">
        {/* stars */}
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i} className="absolute h-0.5 w-0.5 bg-white rounded-full opacity-70" style={{ top: `${(i * 37) % 100}%`, left: `${(i * 53) % 100}%` }} />
        ))}
        {/* sun/glow */}
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 75% 35%, oklch(0.78 0.13 86 / 0.45), transparent 50%)" }} />

        {/* flight curve */}
        {phase !== "waiting" && (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id="trail" x1="0" x2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.13 86)" stopOpacity="0" />
                <stop offset="100%" stopColor="oklch(0.78 0.13 86)" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="trail-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.78 0.13 86)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="oklch(0.78 0.13 86)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${curvePath} L ${planeX} 100 L 8 100 Z`} fill="url(#trail-fill)" />
            <path d={curvePath} fill="none" stroke="url(#trail)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
          </svg>
        )}

        {/* plane */}
        {phase === "flying" && (
          <img
            src={planeAsset.url}
            alt="plane"
            className="absolute h-14 w-14 plane-fly drop-shadow-[0_4px_18px_rgba(0,0,0,0.5)]"
            style={{ left: `calc(${planeX}% - 28px)`, top: `calc(${planeY}% - 28px)`, transition: "left 60ms linear, top 60ms linear" }}
          />
        )}
        {phase === "crashed" && (
          <img src={planeAsset.url} alt="plane" className="absolute h-14 w-14 opacity-50 grayscale" style={{ left: `calc(${planeX}% - 28px)`, top: `calc(${planeY}% - 28px)`, transform: "rotate(70deg)" }} />
        )}

        {/* multiplier center */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center">
            {phase === "crashed" ? (
              <>
                <div className="text-bear text-2xl font-extrabold animate-pulse">FLEW AWAY!</div>
                <div className="text-bear text-6xl font-black tabular-nums" style={{ textShadow: "0 0 30px oklch(0.66 0.24 22 / 0.8)" }}>{multiplier.toFixed(2)}×</div>
              </>
            ) : phase === "flying" ? (
              <div className="text-7xl font-black tabular-nums text-primary" style={{ textShadow: "0 0 40px color-mix(in oklab, var(--gold) 70%, transparent)" }}>{multiplier.toFixed(2)}×</div>
            ) : (
              <div className="text-center">
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Next round</div>
                <div className="text-6xl font-black text-primary tabular-nums">{countdown}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bet controls */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="text-center text-sm text-muted-foreground">
          {betActive ? "Bet active — waiting to cash out" : cashedAt ? `Cashed out @ ${cashedAt.toFixed(2)}×` : "Place your bet"}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setStake(Math.max(1, stake - 1))} className="h-10 w-10 rounded-xl bg-surface border border-border">−</button>
          <input type="number" value={stake} onChange={(e) => setStake(Math.max(1, Number(e.target.value)))} className="flex-1 bg-surface border border-border rounded-xl py-2 text-center font-bold text-lg tabular-nums" />
          <button onClick={() => setStake(stake + 1)} className="h-10 w-10 rounded-xl bg-surface border border-border">+</button>
        </div>

        {phase === "flying" && betActive ? (
          <button onClick={cashout} className="w-full py-4 rounded-2xl bg-bull text-bull-foreground font-extrabold text-lg glow-bull">
            CASH OUT ${(stake * multiplier).toFixed(2)}
          </button>
        ) : (
          <button onClick={bet} disabled={phase !== "waiting" || betActive} className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-extrabold text-lg glow-primary disabled:opacity-50">
            BET ${stake}
          </button>
        )}

        <div className="flex items-center justify-between bg-surface rounded-xl p-3 border border-border">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Auto Bet</span>
          </div>
          <button onClick={() => setAutoBet(!autoBet)} className={"h-6 w-11 rounded-full transition relative " + (autoBet ? "bg-primary" : "bg-border")}>
            <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white transition " + (autoBet ? "left-5" : "left-0.5")} />
          </button>
        </div>

        <div className="flex items-center justify-between bg-surface rounded-xl p-3 border border-border">
          <span className="text-sm font-semibold">Auto cash out</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setAutoCashout(Math.max(1.1, +(autoCashout - 0.1).toFixed(2)))} className="h-7 w-7 rounded bg-card">−</button>
            <span className="font-bold tabular-nums w-14 text-center">{autoCashout.toFixed(2)}×</span>
            <button onClick={() => setAutoCashout(+(autoCashout + 0.1).toFixed(2))} className="h-7 w-7 rounded bg-card">+</button>
          </div>
        </div>
      </div>
    </div>
  );
}
