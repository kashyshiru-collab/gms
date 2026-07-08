import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  basePrice?: number;
  volatility?: number;
  className?: string;
  tickMs?: number;
  candleMs?: number;
  onPrice?: (p: number) => void;
  /** Overlay text shown bottom-right (e.g. current digit) */
  badge?: string;
  badgeTone?: "neutral" | "bull" | "bear";
  note?: string;
  noteTone?: "neutral" | "bull" | "bear";
  mode?: "line" | "candles";
  indicators?: string[];
}

type Candle = { bucket: number; o: number; h: number; l: number; c: number };

/**
 * Smooth, realistic-feeling synthetic ticker.
 * Uses mean-reversion + small step size so movement isn't jittery/rapid.
 */
export function LiveChart({
  basePrice = 1000,
  volatility = 0.0008,
  className,
  tickMs = 500,
  candleMs = 2200,
  onPrice,
  badge,
  badgeTone = "neutral",
  note,
  noteTone = "neutral",
  mode = "line",
  indicators = [],
}: Props) {
  const buildInitialPoints = useCallback(() => {
    const nowStep = Math.floor(Date.now() / 1000);
    let drift = Math.sin(nowStep / 19) * basePrice * volatility * 0.8;
    return Array.from({ length: 90 }, (_, i) => {
      const t = nowStep - (89 - i);
      drift = drift * 0.86 + Math.sin(t / 7) * basePrice * volatility * 0.18;
      const wave = Math.sin(t / 11) * basePrice * volatility * 3;
      const pulse = Math.cos(t / 5) * basePrice * volatility * 0.9;
      return basePrice + wave + pulse + drift;
    });
  }, [basePrice, volatility]);
  const [points, setPoints] = useState<number[]>(buildInitialPoints);
  const [candles, setCandles] = useState<Candle[]>(() => buildInitialCandles(basePrice, volatility, candleMs));
  const driftRef = useRef(0);
  const impulseRef = useRef(0);

  useEffect(() => {
    const seeded = buildInitialPoints();
    setPoints(seeded);
    setCandles(buildInitialCandles(basePrice, volatility, candleMs));
    onPrice?.(seeded[seeded.length - 1]);
  }, [basePrice, buildInitialPoints, candleMs, onPrice, volatility]);

  useEffect(() => {
    const id = setInterval(() => {
      setPoints((prev) => {
        const last = prev[prev.length - 1];
        const pull = (basePrice - last) * 0.015;
        const burst = Math.random() < 0.13 ? (Math.random() - 0.5) * volatility * basePrice * 7.5 : 0;
        impulseRef.current = impulseRef.current * 0.68 + burst;
        driftRef.current =
          driftRef.current * 0.76 +
          (Math.random() - 0.5) * volatility * basePrice * 1.35 +
          Math.sin(Date.now() / 4100) * volatility * basePrice * 0.18;
        const next = Math.max(0.01, last + pull + driftRef.current + impulseRef.current);
        const arr = [...prev.slice(1), next];
        setCandles((current) => updateCandles(current, next, candleMs));
        onPrice?.(next);
        return arr;
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [volatility, basePrice, tickMs, candleMs, onPrice]);

  const candleMin = Math.min(...candles.map((c) => c.l));
  const candleMax = Math.max(...candles.map((c) => c.h));
  const candlePad = (candleMax - candleMin) * 0.12 || basePrice * volatility * 8 || 1;
  const rawMin = Math.min(...points);
  const rawMax = Math.max(...points);
  const pad = (rawMax - rawMin) * 0.08 || basePrice * volatility * 3 || 1;
  const min = mode === "candles" ? candleMin - candlePad : rawMin - pad;
  const max = mode === "candles" ? candleMax + candlePad : rawMax + pad;
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${path} L${w},${h} L0,${h} Z`;
  // indicators: SMA, EMA, BOLL
  function calcSMA(arr: number[], period: number) {
    const res: (number | null)[] = Array(arr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
      if (i >= period) sum -= arr[i - period];
      if (i >= period - 1) res[i] = sum / period;
    }
    return res;
  }
  function calcEMA(arr: number[], period: number) {
    const res: (number | null)[] = Array(arr.length).fill(null);
    const k = 2 / (period + 1);
    let prev: number | null = null;
    for (let i = 0; i < arr.length; i++) {
      if (i === 0) {
        prev = arr[0];
        res[i] = prev;
        continue;
      }
      prev = (arr[i] - (prev as number)) * k + (prev as number);
      res[i] = prev;
    }
    return res;
  }
  function calcRSI(arr: number[], period = 14) {
    const res: (number | null)[] = Array(arr.length).fill(null);
    if (arr.length < period) return res;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = arr[i] - arr[i - 1];
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    res[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    for (let i = period + 1; i < arr.length; i++) {
      const diff = arr[i] - arr[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      res[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return res;
  }
  function calcMACD(arr: number[], fast = 12, slow = 26, sig = 9) {
    const emaFast = calcEMA(arr, fast);
    const emaSlow = calcEMA(arr, slow);
    const macd: (number | null)[] = Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) {
      if (emaFast[i] == null || emaSlow[i] == null) macd[i] = null;
      else macd[i] = (emaFast[i] as number) - (emaSlow[i] as number);
    }
    const signal = calcEMA(macd.map((v) => (v == null ? 0 : v)), sig);
    return { macd, signal };
  }
  let sma8: (number | null)[] = [];
  let ema12: (number | null)[] = [];
  let bbUpper: (number | null)[] = [];
  let bbLower: (number | null)[] = [];
  if (indicators.includes("SMA") || indicators.includes("BOLL")) sma8 = calcSMA(points, 8);
  if (indicators.includes("EMA")) ema12 = calcEMA(points, 12);
  const rsi14 = indicators.includes("RSI") ? calcRSI(points, 14) : [];
  const macdObj = indicators.includes("MACD") ? calcMACD(points, 12, 26, 9) : { macd: [], signal: [] };
  if (indicators.includes("BOLL")) {
    const period = 20;
    const sma = calcSMA(points, period);
    for (let i = 0; i < points.length; i++) {
      const s = sma[i];
      if (s == null) {
        bbUpper.push(null);
        bbLower.push(null);
        continue;
      }
      // calc std dev for window
      const start = Math.max(0, i - period + 1);
      let sum = 0;
      for (let j = start; j <= i; j++) sum += Math.pow(points[j] - (s as number), 2);
      const variance = sum / (i - start + 1);
      const sd = Math.sqrt(variance);
      bbUpper.push((s as number) + sd * 2);
      bbLower.push((s as number) - sd * 2);
    }
  }
  function toPathFromArray(arr: (number | null)[], color: string) {
    const parts: string[] = [];
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (p == null) continue;
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      parts.push(`${parts.length === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return parts.join(" ");
  }
  const last = points[points.length - 1];
  const first = points[0];
  const latestCandle = candles[candles.length - 1];
  const up = last >= first;
  const stroke = up ? "oklch(0.76 0.18 152)" : "oklch(0.66 0.24 22)";
  const priceY = h - (((mode === "candles" && latestCandle ? latestCandle.c : last) - min) / range) * h;
  const badgeBg = badgeTone === "bull" ? "bg-bull text-bull-foreground" : badgeTone === "bear" ? "bg-bear text-bear-foreground" : "bg-surface text-foreground border border-border";
  const noteBg = noteTone === "bull" ? "bg-bull/10 text-bull border border-bull/30" : noteTone === "bear" ? "bg-bear/10 text-bear border border-bear/30" : "bg-surface/95 text-foreground border border-border";

  return (
    <div className={"relative w-full " + (className ?? "")}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="lc-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1="0" x2={w} y1={h * t} y2={h * t} stroke="currentColor" strokeOpacity="0.08" strokeWidth="0.2" />
        ))}
        {mode === "line" ? (
          <>
            <path d={area} fill="url(#lc-fill)" />
            <path d={path} fill="none" stroke={stroke} strokeWidth="0.7" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            {indicators.includes("SMA") && (
              <path
                d={toPathFromArray(sma8, "#60a5fa")}
                fill="none"
                stroke="#60a5fa"
                strokeWidth="0.45"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            )}
            {indicators.includes("EMA") && (
              <path
                d={toPathFromArray(ema12, "#a78bfa")}
                fill="none"
                stroke="#a78bfa"
                strokeWidth="0.45"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            )}
            {indicators.includes("BOLL") && (
              <>
                <path
                  d={toPathFromArray(bbUpper, "#93c5fd")}
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="0.3"
                  strokeOpacity="0.7"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={toPathFromArray(bbLower, "#bfdbfe")}
                  fill="none"
                  stroke="#bfdbfe"
                  strokeWidth="0.3"
                  strokeOpacity="0.7"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            {indicators.includes("MACD") && (
              <>
                <path
                  d={toPathFromArray(macdObj.macd, "#ef4444")}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="0.35"
                  strokeOpacity="0.9"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={toPathFromArray(macdObj.signal, "#10b981")}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="0.35"
                  strokeOpacity="0.9"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            {indicators.includes("RSI") && (
              <path
                d={toPathFromArray(rsi14.map((v) => (v == null ? null : min + ((v / 100) * range))) , "#f59e0b")}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="0.35"
                strokeOpacity="0.9"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <circle
              cx={w}
              cy={h - ((last - min) / range) * h}
              r="1.2"
              fill={stroke}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <>
            {candles.map((c, i) => {
              const candleUp = c.c >= c.o;
              const color = candleUp ? "oklch(0.76 0.18 152)" : "oklch(0.66 0.24 22)";
              const step = w / candles.length;
              const cx = i * step + step / 2;
              const bodyTop = h - ((Math.max(c.o, c.c) - min) / range) * h;
              const bodyBottom = h - ((Math.min(c.o, c.c) - min) / range) * h;
              const bodyH = Math.max(1.05, bodyBottom - bodyTop);
              return (
                <g key={c.bucket}>
                  <line
                    x1={cx}
                    x2={cx}
                    y1={h - ((c.h - min) / range) * h}
                    y2={h - ((c.l - min) / range) * h}
                    stroke={color}
                    strokeWidth="0.36"
                    strokeOpacity="0.8"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect x={cx - step * 0.36} y={bodyTop} width={step * 0.72} height={bodyH} fill={color} rx="0.08" />
                </g>
              );
            })}
            <line x1="0" x2={w} y1={priceY} y2={priceY} stroke="oklch(0.78 0.13 86)" strokeOpacity="0.55" strokeDasharray="1 1" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {mode === "candles" && latestCandle && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded border border-border bg-surface/85 text-[10px] font-extrabold tabular-nums">
          {latestCandle.c.toFixed(5)}
        </div>
      )}
      {badge !== undefined && (
        <div className={"absolute right-2 bottom-2 px-2 py-1 rounded-lg text-xs font-extrabold tabular-nums shadow-lg " + badgeBg}>
          {badge}
        </div>
      )}
      {note && (
        <div className={"absolute left-2 bottom-2 px-2 py-1 rounded-lg text-xs font-semibold tabular-nums shadow-lg " + noteBg}>
          {note}
        </div>
      )}
    </div>
  );
}

function seededRandom(seed: number) {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function buildInitialCandles(basePrice: number, volatility: number, candleMs: number): Candle[] {
  const nowBucket = Math.floor(Date.now() / candleMs);
  const candleCount = 46;
  const unit = Math.max(basePrice * volatility * 3.2, 0.12);
  let close = basePrice - basePrice * volatility * 6;
  return Array.from({ length: candleCount }, (_, i) => {
    const bucket = nowBucket - (candleCount - 1 - i);
    const r1 = seededRandom(Math.round(basePrice * 10) + bucket * 17);
    const r2 = seededRandom(Math.round(basePrice * 10) + bucket * 31);
    const r3 = seededRandom(Math.round(basePrice * 10) + bucket * 47);
    const pulse = Math.sin((bucket + i) / 4) * unit * 1.15;
    const body = (r1 - 0.48) * unit * 3.1 + pulse;
    const o = close;
    const c = Math.max(0.01, o + body);
    const upperWick = (0.18 + r2 * 1.45) * unit;
    const lowerWick = (0.18 + r3 * 1.45) * unit;
    const h = Math.max(o, c) + upperWick;
    const l = Math.max(0.01, Math.min(o, c) - lowerWick);
    close = c + (basePrice - c) * 0.028;
    return { bucket, o, h, l, c };
  });
}

function updateCandles(candles: Candle[], price: number, candleMs: number) {
  const bucket = Math.floor(Date.now() / candleMs);
  const last = candles[candles.length - 1];
  if (!last || last.bucket !== bucket) {
    return [...candles.slice(-45), { bucket, o: price, h: price, l: price, c: price }];
  }
  return [
    ...candles.slice(0, -1),
    {
      ...last,
      h: Math.max(last.h, price),
      l: Math.min(last.l, price),
      c: price,
    },
  ];
}
