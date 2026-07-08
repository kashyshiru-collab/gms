import { createServerFn } from "@tanstack/react-start";
<<<<<<< HEAD
import { PAIRS, findPair } from "./pricing.shared";

export { PAIRS };

const INTERVALS = {
  "15s": { step: 15_000, count: 500 },
  "1m":  { step: 60_000, count: 600 },
  "5m":  { step: 5 * 60_000, count: 600 },
  "15m": { step: 15 * 60_000, count: 600 },
  "1h":  { step: 60 * 60_000, count: 600 },
  "4h":  { step: 4 * 60 * 60_000, count: 500 },
  "1d":  { step: 24 * 60 * 60_000, count: 365 },
  "1w":  { step: 7 * 24 * 60 * 60_000, count: 260 },
  "1M":  { step: 30 * 24 * 60 * 60_000, count: 120 },
} as const;

export type Interval = keyof typeof INTERVALS;

// Single-symbol live tick — used by tick-chart aggregation on the client.
export const getTick = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) => d)
  .handler(async ({ data }) => {
    const { getPriceAt } = await import("./pricing.server");
    const pair = findPair(data.symbol);
    if (!pair) throw new Error("Unknown symbol");
    const price = await getPriceAt(data.symbol, Date.now());
    return { symbol: data.symbol, price, decimals: pair.decimals, at: Date.now() };
  });

export const getTicks = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; seconds?: number }) => d)
  .handler(async ({ data }) => {
    const { getPriceAt } = await import("./pricing.server");
    const pair = findPair(data.symbol);
    if (!pair) throw new Error("Unknown symbol");
    const seconds = Math.max(2, Math.min(600, Math.floor(data.seconds ?? 180)));
    const nowSec = Math.floor(Date.now() / 1000);
    const ticks = await Promise.all(
      Array.from({ length: seconds + 1 }, async (_, i) => {
        const time = nowSec - seconds + i;
        const value = await getPriceAt(data.symbol, time * 1000);
        return { time, value };
      }),
    );
    return { symbol: data.symbol, decimals: pair.decimals, ticks };
  });

export const getQuotes = createServerFn({ method: "GET" }).handler(async () => {
  const { getPriceAt } = await import("./pricing.server");
  const now = Date.now();
  const prev = now - 60_000;
  return Promise.all(
    PAIRS.map(async (p) => {
      const [price, before] = await Promise.all([
        getPriceAt(p.symbol, now),
        getPriceAt(p.symbol, prev),
      ]);
      const changePct = before ? ((price - before) / before) * 100 : 0;
      return {
        symbol: p.symbol,
        label: p.label,
        kind: p.kind,
        category: p.category,
        decimals: p.decimals,
        price,
        changePct: Number(changePct.toFixed(3)),
      };
    }),
  );
});

export const getCandles = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; interval?: Interval }) => d)
  .handler(async ({ data }) => {
    const { buildCandles } = await import("./pricing.server");
    const interval: Interval = (data.interval ?? "15m") as Interval;
    const cfg = INTERVALS[interval] ?? INTERVALS["15m"];
    const candles = await buildCandles(data.symbol, cfg.step, cfg.count);
    const spot = candles[candles.length - 1]?.c ?? 0;
    return { symbol: data.symbol, interval, spot, candles };
  });

// Last-digit distribution from the most recent ~200 one-second ticks.
export const getDigitStats = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) => d)
  .handler(async ({ data }) => {
    const { getPriceAt } = await import("./pricing.server");
    const pair = findPair(data.symbol);
    if (!pair) throw new Error("Unknown symbol");
    const N = 200;
    const now = Date.now();
    const samples = await Promise.all(
      Array.from({ length: N }, (_, i) => getPriceAt(data.symbol, now - i * 1000)),
    );
    const mult = Math.pow(10, pair.decimals);
    const counts = new Array(10).fill(0);
    for (const p of samples) {
      const d = Math.floor(Math.abs(p) * mult) % 10;
      counts[d]++;
    }
    const digits = counts.map((c, d) => ({ d, pct: (c / N) * 100 }));
    const lastDigit = Math.floor(Math.abs(samples[0]) * mult) % 10;
    const maxPct = Math.max(...digits.map((x) => x.pct));
    const minPct = Math.min(...digits.map((x) => x.pct));
    return { digits, lastDigit, maxPct, minPct, price: samples[0] };
=======
import { z } from "zod";

const QuoteInput = z.object({ symbol: z.string().min(3).max(16) });

function splitPair(pair: string) {
  const [base, quote] = pair.toUpperCase().replace("_", "/").split("/");
  if (!base || !quote || base.length !== 3 || quote.length !== 3) {
    throw new Error("Unsupported forex pair");
  }
  return { base, quote };
}

function seedFromSymbol(symbol: string) {
  return symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function yahooSymbol(symbol: string) {
  const { base, quote } = splitPair(symbol);
  return `${base}${quote}=X`;
}

async function fetchYahooCandles(
  symbol: string,
  resolution: "1" | "5" | "15" | "60" | "D",
  count: number,
) {
  const interval = resolution === "D" ? "1d" : `${resolution}m`;
  const range = resolution === "1" ? "1d" : resolution === "D" ? "6mo" : "5d";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=${range}&interval=${interval}&includePrePost=false`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 TRONIXOPTION market chart",
    },
  });
  if (!res.ok) return { ok: false as const, reason: "upstream" as const, status: res.status };

  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: Array<number | null>;
            high?: Array<number | null>;
            low?: Array<number | null>;
            close?: Array<number | null>;
          }>;
        };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!result || !quote || timestamps.length === 0) return { ok: false as const, reason: "no_data" as const };

  const candles = timestamps
    .map((t, i) => {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) return null;
      return { t, o, h, l, c };
    })
    .filter((c): c is { t: number; o: number; h: number; l: number; c: number } => Boolean(c))
    .slice(-count);

  if (!candles.length) return { ok: false as const, reason: "no_data" as const };
  return { ok: true as const, candles };
}

async function fetchRate(symbol: string) {
  const { base, quote } = splitPair(symbol);
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return { ok: false as const, reason: "upstream" as const, status: res.status };

  const json = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
  };
  const price = json.rates?.[quote];
  if (json.result !== "success" || !price) return { ok: false as const, reason: "no_data" as const };

  return { ok: true as const, price, ts: json.time_last_update_unix ?? Math.floor(Date.now() / 1000) };
}

export const getForexQuote = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => QuoteInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const rate = await fetchRate(data.symbol);
      if (!rate.ok) return rate;

      const prevClose = rate.price * (1 - Math.sin(seedFromSymbol(data.symbol)) * 0.0007);
      const change = rate.price - prevClose;
      return {
        ok: true as const,
        symbol: data.symbol,
        price: rate.price,
        change,
        changePct: (change / prevClose) * 100,
        high: rate.price * 1.001,
        low: rate.price * 0.999,
        open: prevClose,
        prevClose,
        ts: rate.ts,
      };
    } catch (e) {
      return { ok: false as const, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

const CandleInput = z.object({
  symbol: z.string().min(3).max(16),
  resolution: z.enum(["1", "5", "15", "60", "D"]).default("5"),
  count: z.number().int().min(20).max(200).default(80),
});

export const getForexCandles = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => CandleInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const candleRes = await fetchYahooCandles(data.symbol, data.resolution, data.count);
      if (!candleRes.ok) return candleRes;

      return {
        ok: true as const,
        symbol: data.symbol,
        candles: candleRes.candles,
        source: "Yahoo Finance",
      };
    } catch (e) {
      return { ok: false as const, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
  });
