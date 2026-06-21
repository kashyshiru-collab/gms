import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createChart,
  AreaSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type UTCTimestamp,
  type Time,
  ColorType,
  CrosshairMode,
} from "lightweight-charts";
import { getTick, getTicks } from "@/lib/forex.functions";
import { getActiveBinaryTrades } from "@/lib/binary.functions";
import { PAIRS } from "@/lib/pricing.shared";

/**
 * Deriv-style live tick chart. Polls a single price at 1Hz, plots each
 * tick as one point on an area/line series, keeps the latest point pinned
 * to the right edge with a price marker, and renders entry markers for
 * the user's binary trades — yellow while open, green on win, red on loss.
 */
// Module-level cache so charts stay continuous when the user switches symbols.
const tickCache = new Map<string, { ticks: { time: UTCTimestamp; value: number }[]; t: number }>();
const tradeMarkCache = new Map<string, Map<string, { time: UTCTimestamp; status: string }>>();
const warmSymbols = PAIRS.filter((p) => p.category === "synthetic").map((p) => p.symbol);
let warmTimer: ReturnType<typeof setTimeout> | null = null;
let warmRefCount = 0;
type MarkerTrade = { id: string; status: string };

function mergeCachedTick(symbol: string, point: { time: UTCTimestamp; value: number }) {
  const cached = tickCache.get(symbol);
  const arr = cached?.ticks.slice() ?? [];
  if (arr[arr.length - 1]?.time === point.time) arr[arr.length - 1] = point;
  else if (!arr.length || (arr[arr.length - 1].time as number) < (point.time as number)) arr.push(point);
  if (arr.length > 600) arr.splice(0, arr.length - 600);
  tickCache.set(symbol, { ticks: arr, t: point.time as number });
}

function startSyntheticWarmFeed(
  getTickFn: ReturnType<typeof useServerFn<typeof getTick>>,
  getTicksFn: ReturnType<typeof useServerFn<typeof getTicks>>,
) {
  warmRefCount += 1;
  if (warmTimer) {
    return () => {
      warmRefCount = Math.max(0, warmRefCount - 1);
      if (warmRefCount === 0 && warmTimer) {
        clearTimeout(warmTimer);
        warmTimer = null;
      }
    };
  }

  let stopped = false;
  const backfill = async () => {
    await Promise.all(
      warmSymbols.map(async (symbol) => {
        if (tickCache.has(symbol)) return;
        try {
          const r = await getTicksFn({ data: { symbol, seconds: 180 } });
          const ticks = r.ticks.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
          tickCache.set(symbol, { ticks, t: ticks[ticks.length - 1]?.time ?? Math.floor(Date.now() / 1000) });
        } catch {
          // A visible chart can still backfill its own symbol if this warm pass fails.
        }
      }),
    );
  };

  const pump = async () => {
    await Promise.all(
      warmSymbols.map(async (symbol) => {
        try {
          const r = await getTickFn({ data: { symbol } });
          const cached = tickCache.get(symbol);
          const time = Math.max(Math.floor(r.at / 1000), (cached?.t ?? 0) + 1);
          mergeCachedTick(symbol, { time: time as UTCTimestamp, value: r.price });
        } catch {
          // Keep the existing cache and try again on the next beat.
        }
      }),
    );
    if (!stopped) warmTimer = setTimeout(pump, 1_000);
  };

  backfill().finally(() => {
    if (!stopped) void pump();
  });

  return () => {
    warmRefCount = Math.max(0, warmRefCount - 1);
    if (warmRefCount === 0) {
      stopped = true;
      if (warmTimer) {
        clearTimeout(warmTimer);
        warmTimer = null;
      }
    }
  };
}

export function TickChart({ symbol, windowTicks = 60 }: { symbol: string; windowTicks?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const ticksRef = useRef<{ time: UTCTimestamp; value: number }[]>([]);
  const tRef = useRef<number>(Math.floor(Date.now() / 1000));
  const getTickFn = useServerFn(getTick);
  const getTicksFn = useServerFn(getTicks);
  const listFn = useServerFn(getActiveBinaryTrades);

  // tradeId -> { time, status }
  const tradeMarksRef = useRef<Map<string, { time: UTCTimestamp; status: string }>>(new Map());

  const tradesQ = useQuery({
    queryKey: ["binary-trades"],
    queryFn: () => listFn(),
    refetchInterval: 1_000,
  });

  useEffect(() => startSyntheticWarmFeed(getTickFn, getTicksFn), [getTickFn, getTicksFn]);

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
      rightPriceScale: { borderColor: "#334155", scaleMargins: { top: 0.15, bottom: 0.15 } },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 4,
      },
      autoSize: true,
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#22d3ee",
      topColor: "rgba(34,211,238,0.28)",
      bottomColor: "rgba(34,211,238,0.02)",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "#e2e8f0",
      priceLineWidth: 1,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: "#e2e8f0",
      crosshairMarkerBackgroundColor: "#e2e8f0",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersApiRef.current = createSeriesMarkers(series, []);
    const resize = () => {
      const el = containerRef.current;
      if (!el) return;
      chart.resize(Math.max(1, el.clientWidth), Math.max(1, el.clientHeight));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);
    requestAnimationFrame(resize);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersApiRef.current = null;
    };
  }, []);

  const setVisibleWindow = () => {
    const arr = ticksRef.current;
    if (arr.length === 0) return;
    const to = (arr[arr.length - 1].time as number) + 1;
    const visibleSeconds = Math.max(2, windowTicks * 2);
    const from = Math.max(arr[0].time as number, to - visibleSeconds);
    chartRef.current?.timeScale().setVisibleRange({
      from: from as UTCTimestamp,
      to: to as UTCTimestamp,
    });
  };

  // Restore per-symbol history immediately, then backfill from wall-clock time
  // so symbols keep moving even while their chart is not mounted.
  useEffect(() => {
    const cached = tickCache.get(symbol);
    if (cached && cached.ticks.length) {
      ticksRef.current = cached.ticks.slice();
      tRef.current = cached.t;
    } else {
      ticksRef.current = [];
      tRef.current = Math.floor(Date.now() / 1000);
    }
    tradeMarksRef.current = tradeMarkCache.get(symbol) ?? new Map();
    if (!tradeMarkCache.has(symbol)) tradeMarkCache.set(symbol, tradeMarksRef.current);
    seriesRef.current?.setData(ticksRef.current);
    markersApiRef.current?.setMarkers([]);

    setVisibleWindow();
    let alive = true;
    async function backfill() {
      try {
        const historySeconds = Math.max(180, windowTicks * 8);
        const r = await getTicksFn({ data: { symbol, seconds: historySeconds } });
        if (!alive) return;
        const ticks = r.ticks.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
        }));
        ticksRef.current = ticks;
        tRef.current = ticks[ticks.length - 1]?.time ?? Math.floor(Date.now() / 1000);
        tickCache.set(symbol, { ticks: ticks.slice(), t: tRef.current });
        seriesRef.current?.setData(ticks);
        setVisibleWindow();
      } catch {
        // keep cached data if backfill has a network/server blip
      }
    }
    backfill();
    return () => {
      alive = false;
    };
  }, [symbol, windowTicks, getTicksFn]);

  // Poll ticks
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function pump() {
      try {
        const r = await getTickFn({ data: { symbol } });
        if (!alive) return;
        const time = Math.max(Math.floor(r.at / 1000), tRef.current + 1);
        tRef.current = time;
        const point = { time: time as UTCTimestamp, value: r.price };
        const arr = ticksRef.current;
        if (arr[arr.length - 1]?.time === point.time) arr[arr.length - 1] = point;
        else arr.push(point);
        if (arr.length > 600) arr.splice(0, arr.length - 600);
        tickCache.set(symbol, { ticks: arr.slice(), t: tRef.current });
        seriesRef.current?.setData(arr);
        setVisibleWindow();
      } catch {
        // ignore
      }
      if (alive) timer = setTimeout(pump, 1000);
    }
    pump();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [symbol, windowTicks, getTickFn]);

  // Sync markers from trade list
  useEffect(() => {
    const trades = tradesQ.data ?? [];
    const marks = tradeMarksRef.current;
    const arr = ticksRef.current;
    const nowTickTime = (arr[arr.length - 1]?.time ??
      (tRef.current as UTCTimestamp)) as UTCTimestamp;

    for (const t of trades as MarkerTrade[]) {
      const existing = marks.get(t.id);
      if (!existing) {
        // New trade — anchor to the latest tick we have.
        marks.set(t.id, { time: nowTickTime, status: t.status });
      } else if (existing.status !== t.status) {
        marks.set(t.id, { time: existing.time, status: t.status });
      }
    }

    // Build marker array, sorted ascending by time (required by lightweight-charts).
    const list: SeriesMarker<Time>[] = Array.from(marks.entries())
      .map(([id, m]) => {
        const isOpen = m.status === "open";
        const won = m.status === "won";
        const lost = m.status === "lost";
        const color = isOpen ? "#f59e0b" : won ? "#22c55e" : lost ? "#ef4444" : "#94a3b8";
        return {
          id,
          time: m.time,
          position: "inBar" as const,
          color,
          shape: (isOpen ? "circle" : won ? "arrowUp" : lost ? "arrowDown" : "square") as
            | "circle"
            | "arrowUp"
            | "arrowDown"
            | "square",
          text: isOpen ? "•" : won ? "W" : lost ? "L" : "",
        };
      })
      .sort((a, b) => (a.time as number) - (b.time as number));

    markersApiRef.current?.setMarkers(list);
  }, [tradesQ.data]);

  return <div ref={containerRef} className="h-full min-h-0 w-full" />;
}
