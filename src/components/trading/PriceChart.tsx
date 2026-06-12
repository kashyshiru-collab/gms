import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type Time,
  ColorType,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";

export type Candle = { t: number; o: number; h: number; l: number; c: number };

type IndicatorKey = "ema20" | "ema50" | "sma200" | "bb";
type IndicatorDef = { key: IndicatorKey; label: string; color: string };
const INDICATORS: IndicatorDef[] = [
  { key: "ema20",  label: "EMA 20",  color: "#22d3ee" },
  { key: "ema50",  label: "EMA 50",  color: "#f59e0b" },
  { key: "sma200", label: "SMA 200", color: "#a78bfa" },
  { key: "bb",     label: "BB(20,2)",color: "#94a3b8" },
];

function sma(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}
function ema(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  const k = 2 / (period + 1);
  let prev: number | undefined;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (prev === undefined) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j];
      prev = s / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}
function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper: (number | undefined)[] = new Array(values.length).fill(undefined);
  const lower: (number | undefined)[] = new Array(values.length).fill(undefined);
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const m = mid[i]!;
    const variance = slice.reduce((a, v) => a + (v - m) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function PriceChart({
  data,
  livePrice,
}: {
  data: Candle[];
  livePrice?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);

  // Indicator series
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const sma200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLoRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMidRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [active, setActive] = useState<Record<IndicatorKey, boolean>>({
    ema20: true, ema50: true, sma200: false, bb: false,
  });

  // Build chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontSize: 11,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155", timeVisible: true, secondsVisible: true },
      autoSize: true,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    chartRef.current = chart;
    seriesRef.current = series;

    ema20Ref.current = chart.addSeries(LineSeries, { color: "#22d3ee", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    ema50Ref.current = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    sma200Ref.current = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    bbUpRef.current = chart.addSeries(LineSeries, { color: "#94a3b8", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
    bbLoRef.current = chart.addSeries(LineSeries, { color: "#94a3b8", lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false });
    bbMidRef.current = chart.addSeries(LineSeries, { color: "#64748b", lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  const didInitRef = useRef(false);
  const prevFirstTimeRef = useRef<number | null>(null);
  // Compute & push data
  useEffect(() => {
    if (!seriesRef.current || !data?.length) return;
    const formatted = data.map((c) => ({
      time: Math.floor(c.t / 1000) as UTCTimestamp,
      open: c.o, high: c.h, low: c.l, close: c.c,
    }));
    seriesRef.current.setData(formatted);
    lastCandleRef.current = data[data.length - 1] ?? null;

    const closes = data.map((c) => c.c);
    const times = data.map((c) => Math.floor(c.t / 1000) as UTCTimestamp);
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);
    const s200 = sma(closes, 200);
    const bb = bollinger(closes, 20, 2);

    const toLine = (arr: (number | undefined)[]) =>
      arr.map((v, i) => (v === undefined ? null : { time: times[i], value: v }))
         .filter(Boolean) as { time: UTCTimestamp; value: number }[];

    ema20Ref.current?.setData(active.ema20 ? toLine(e20) : []);
    ema50Ref.current?.setData(active.ema50 ? toLine(e50) : []);
    sma200Ref.current?.setData(active.sma200 ? toLine(s200) : []);
    bbUpRef.current?.setData(active.bb ? toLine(bb.upper) : []);
    bbLoRef.current?.setData(active.bb ? toLine(bb.lower) : []);
    bbMidRef.current?.setData(active.bb ? toLine(bb.mid) : []);

    // Only fit/scroll on first load OR when dataset changes range (symbol/interval switch).
    // This preserves the user's pan/zoom while live ticks stream in.
    const firstTime = data[0]?.t ?? null;
    const datasetChanged = prevFirstTimeRef.current !== firstTime;
    if (!didInitRef.current || datasetChanged) {
      chartRef.current?.timeScale().fitContent();
      // Then jump near the latest candle so user can scroll left into history.
      requestAnimationFrame(() => chartRef.current?.timeScale().scrollToRealTime());
      didInitRef.current = true;
      prevFirstTimeRef.current = firstTime;
    }
  }, [data, active]);

  // Stream live price into latest candle
  useEffect(() => {
    if (!seriesRef.current || !lastCandleRef.current || livePrice == null) return;
    const last = lastCandleRef.current;
    seriesRef.current.update({
      time: Math.floor(last.t / 1000) as UTCTimestamp,
      open: last.o,
      high: Math.max(last.h, livePrice),
      low: Math.min(last.l, livePrice),
      close: livePrice,
    } as unknown as { time: Time; open: number; high: number; low: number; close: number });
  }, [livePrice]);

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border/50 overflow-x-auto">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Indicators</span>
        {INDICATORS.map((ind) => {
          const on = active[ind.key];
          return (
            <button
              key={ind.key}
              type="button"
              onClick={() => setActive((s) => ({ ...s, [ind.key]: !s[ind.key] }))}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                on ? "border-transparent text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
              style={on ? { backgroundColor: ind.color + "33", borderColor: ind.color } : undefined}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: ind.color }} />
              {ind.label}
            </button>
          );
        })}
      </div>
      <div ref={containerRef} className="flex-1 w-full" />
    </div>
  );
}
