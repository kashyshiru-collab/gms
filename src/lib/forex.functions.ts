import { createServerFn } from "@tanstack/react-start";
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
  });
