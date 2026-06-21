// Unified pricing for FX + synthetic indices + admin overrides.
// FX/metals use real Yahoo Finance OHLC; synthetics use a proper random walk.

export type Category = "forex" | "metals" | "synthetic";

export type PairDef = {
  symbol: string;
  label: string;
  kind: "fx" | "synthetic";
  category: Category;
  yahoo?: string; // Yahoo Finance symbol for real data
  seedOffset?: number;
  vol?: number; // per-second volatility (fraction)
  basePrice?: number;
  decimals: number;
};

export const PAIRS: PairDef[] = [
  // Forex majors — real data via Yahoo
  {
    symbol: "EURUSD",
    label: "Euro / US Dollar",
    kind: "fx",
    category: "forex",
    yahoo: "EURUSD=X",
    decimals: 5,
  },
  {
    symbol: "GBPUSD",
    label: "British Pound / US Dollar",
    kind: "fx",
    category: "forex",
    yahoo: "GBPUSD=X",
    decimals: 5,
  },
  {
    symbol: "USDJPY",
    label: "US Dollar / Japanese Yen",
    kind: "fx",
    category: "forex",
    yahoo: "JPY=X",
    decimals: 3,
  },
  {
    symbol: "AUDUSD",
    label: "Australian Dollar / US Dollar",
    kind: "fx",
    category: "forex",
    yahoo: "AUDUSD=X",
    decimals: 5,
  },
  {
    symbol: "USDCHF",
    label: "US Dollar / Swiss Franc",
    kind: "fx",
    category: "forex",
    yahoo: "CHF=X",
    decimals: 5,
  },
  // Metals — real spot via Yahoo
  {
    symbol: "XAUUSD",
    label: "Gold / US Dollar",
    kind: "fx",
    category: "metals",
    yahoo: "XAUUSD=X",
    decimals: 3,
  },
  {
    symbol: "XAGUSD",
    label: "Silver / US Dollar",
    kind: "fx",
    category: "metals",
    yahoo: "XAGUSD=X",
    decimals: 4,
  },
  {
    symbol: "XPTUSD",
    label: "Platinum / US Dollar",
    kind: "fx",
    category: "metals",
    yahoo: "XPTUSD=X",
    decimals: 3,
  },
  // Derived — Deriv-style synthetics (random walk)
  {
    symbol: "VOL10",
    label: "Volatility 10 Index",
    kind: "synthetic",
    category: "synthetic",
    seedOffset: 1011,
    vol: 0.0006,
    basePrice: 1000,
    decimals: 5,
  },
  {
    symbol: "VOL25",
    label: "Volatility 25 Index",
    kind: "synthetic",
    category: "synthetic",
    seedOffset: 2025,
    vol: 0.0015,
    basePrice: 1000,
    decimals: 5,
  },
  {
    symbol: "VOL50",
    label: "Volatility 50 Index",
    kind: "synthetic",
    category: "synthetic",
    seedOffset: 3050,
    vol: 0.003,
    basePrice: 1000,
    decimals: 5,
  },
  {
    symbol: "VOL100",
    label: "Volatility 100 Index",
    kind: "synthetic",
    category: "synthetic",
    seedOffset: 4100,
    vol: 0.006,
    basePrice: 1000,
    decimals: 5,
  },
  {
    symbol: "BOOM500",
    label: "Boom 500 Index",
    kind: "synthetic",
    category: "synthetic",
    seedOffset: 5500,
    vol: 0.002,
    basePrice: 9500,
    decimals: 4,
  },
  {
    symbol: "CRASH500",
    label: "Crash 500 Index",
    kind: "synthetic",
    category: "synthetic",
    seedOffset: 5501,
    vol: 0.002,
    basePrice: 8500,
    decimals: 4,
  },
];

export function findPair(symbol: string): PairDef | undefined {
  return PAIRS.find((p) => p.symbol === symbol);
}

// ---------- Yahoo Finance OHLC ----------
type YBar = { t: number; o: number; h: number; l: number; c: number };
type YahooChartResponse = {
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
const yCache = new Map<string, { at: number; bars: YBar[] }>();

async function fetchYahoo(symbol: string, interval: string, range: string): Promise<YBar[]> {
  const key = `${symbol}|${interval}|${range}`;
  const cached = yCache.get(key);
  // Cache TTL scales with interval to be polite & fast
  const ttl = interval === "1m" ? 15_000 : interval === "5m" ? 60_000 : 120_000;
  if (cached && Date.now() - cached.at < ttl) return cached.bars;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Yahoo ${symbol} ${res.status}`);
  const json = (await res.json()) as YahooChartResponse;
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error("Yahoo: empty result");
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const bars: YBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i],
      h = q.high?.[i],
      l = q.low?.[i],
      c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    bars.push({ t: ts[i] * 1000, o, h, l, c });
  }
  yCache.set(key, { at: Date.now(), bars });
  return bars;
}

// Latest price for an FX/metal symbol (with deterministic sub-minute jitter)
async function fxPriceAt(pair: PairDef, atMs: number): Promise<number> {
  const bars = await fetchYahoo(pair.yahoo!, "1m", "1d");
  if (!bars.length) throw new Error(`No bars for ${pair.symbol}`);
  // Find the bar covering atMs (or the latest if in the future)
  let bar = bars[bars.length - 1];
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i].t <= atMs) {
      bar = bars[i];
      break;
    }
  }
  // Sub-minute jitter so the live tick visibly moves between minute closes
  const tick = Math.floor(atMs / 1000);
  const seed = (pair.symbol.charCodeAt(0) + pair.symbol.charCodeAt(2) * 7) | 0;
  const j =
    Math.sin(tick * 0.37 + seed) * 0.00009 +
    Math.sin(tick * 1.71 + seed * 0.3) * 0.00006 +
    (hash01(tick + seed) - 0.5) * 0.00012;
  return bar.c * (1 + j);
}

// ---------- Synthetic random walk (proper cumulative GBM-ish) ----------
function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
// Box–Muller-ish normal from two uniforms
function gauss(s: number): number {
  const u = Math.max(1e-9, hash01(s));
  const v = hash01(s + 0.5);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Memoized 6h bucket trajectories — turns syntheticPrice into O(1) after first
// fill per bucket, so dense sampling for long timeframes (1d/1w/1M) stays fast.
type BucketTraj = { logRet: Float64Array; spike: Float64Array | null };
const bucketTraj = new Map<string, BucketTraj>();
const BUCKET_SIZE = 6 * 60 * 60;
const STRIDE = 1;

function getBucketTraj(pair: PairDef, bucket: number): BucketTraj {
  const key = `${pair.symbol}|${bucket}`;
  const existing = bucketTraj.get(key);
  if (existing) return existing;
  const len = Math.ceil(BUCKET_SIZE / STRIDE) + 1;
  const logRet = new Float64Array(len);
  const seed = pair.seedOffset ?? 0;
  const vol = pair.vol ?? 0.0005;
  const meanRev = 0.0008;
  let cur = 0;
  for (let i = 1; i < len; i++) {
    const s = (i - 1) * STRIDE;
    const absT = bucket * BUCKET_SIZE + s;
    const z = gauss(seed * 7919 + absT);
    // Time-varying volatility regime: slow swell (~3min) + medium swell (~40s)
    // + occasional sharp bursts. Same formula for all indices, but the base
    // `vol` differs per pair, so VOL100 bursts look dramatic vs VOL10 nudges.
    const regime =
      0.35 +
      0.75 * Math.abs(Math.sin(absT * 0.0035 + seed * 0.11)) +
      0.55 * Math.abs(Math.sin(absT * 0.027 + seed * 0.37));
    const burst = hash01(seed * 31 + absT) < 0.012 ? 3.5 + hash01(absT) * 2.5 : 1;
    const stepVol = vol * regime * burst;
    cur += stepVol * Math.sqrt(STRIDE) * z - meanRev * cur;
    logRet[i] = cur;
  }
  let spike: Float64Array | null = null;
  if (pair.symbol === "BOOM500" || pair.symbol === "CRASH500") {
    spike = new Float64Array(len);
    const dir = pair.symbol === "BOOM500" ? 1 : -1;
    let acc = 0;
    for (let i = 1; i < len; i++) {
      const s = (i - 1) * STRIDE + STRIDE;
      if (hash01(seed + s) < STRIDE / 500) {
        acc += dir * (0.003 + hash01(seed + s + 1) * 0.005);
      }
      spike[i] = acc;
    }
  }
  // Simple LRU-ish cap
  if (bucketTraj.size > 8000) {
    const first = bucketTraj.keys().next().value;
    if (first !== undefined) bucketTraj.delete(first);
  }
  const traj: BucketTraj = { logRet, spike };
  bucketTraj.set(key, traj);
  return traj;
}

function syntheticPrice(pair: PairDef, atMs: number): number {
  const seed = pair.seedOffset ?? 0;
  const base = pair.basePrice ?? 1000;
  const tickSec = Math.floor(atMs / 1000);
  const bucket = Math.floor(tickSec / BUCKET_SIZE);
  const stepsIn = tickSec - bucket * BUCKET_SIZE;
  const traj = getBucketTraj(pair, bucket);
  const idx = Math.min(traj.logRet.length - 1, Math.max(0, Math.floor(stepsIn / STRIDE)));
  const logRet = traj.logRet[idx];
  const spike = traj.spike ? traj.spike[idx] : 0;
  const bucketStart =
    base * (1 + 0.04 * Math.sin(bucket * 1.3 + seed) + 0.02 * Math.cos(bucket * 0.7 + seed * 0.3));
  const price = bucketStart * Math.exp(logRet + spike);
  return Math.max(price, bucketStart * 0.3);
}

// ---------- Override blending ----------
export type Override = {
  symbol: string;
  start_at: string;
  end_at: string;
  revert_seconds: number;
  target_price: number;
  start_price: number;
  active: boolean;
};

let cachedOverrides: { at: number; rows: Override[] } | null = null;
async function loadOverrides(): Promise<Override[]> {
  if (cachedOverrides && Date.now() - cachedOverrides.at < 3_000) return cachedOverrides.rows;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("market_overrides")
      .select("symbol, start_at, end_at, revert_seconds, target_price, start_price, active")
      .eq("active", true)
      .gte("end_at", cutoff)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as Override[];
    cachedOverrides = { at: Date.now(), rows };
    return rows;
  } catch {
    // Charts should still render natural market prices when admin overrides
    // are unavailable locally or before the database schema is fully applied.
    cachedOverrides = { at: Date.now(), rows: [] };
    return [];
  }
}

export function invalidateOverrideCache() {
  cachedOverrides = null;
}

function applyOverride(natural: number, ov: Override, atMs: number): number {
  const start = new Date(ov.start_at).getTime();
  const end = new Date(ov.end_at).getTime();
  if (atMs < start) return natural;
  if (atMs <= end) {
    const span = Math.max(1, end - start);
    const t = Math.min(1, (atMs - start) / span);
    const linear = ov.start_price + (ov.target_price - ov.start_price) * t;
    const noise = (natural - ov.start_price) * 0.15 * (1 - t);
    return linear + noise;
  }
  const revertEnd = end + ov.revert_seconds * 1000;
  if (atMs <= revertEnd) {
    const span = Math.max(1, revertEnd - end);
    const t = Math.min(1, (atMs - end) / span);
    return ov.target_price + (natural - ov.target_price) * t;
  }
  return natural;
}

// ---------- Public API ----------
export async function getPriceAt(symbol: string, atMs: number): Promise<number> {
  const pair = findPair(symbol);
  if (!pair) throw new Error(`Unknown symbol ${symbol}`);
  let natural: number;
  if (pair.kind === "fx") {
    try {
      natural = await fxPriceAt(pair, atMs);
    } catch {
      // Fallback to last cached bar if available, else a synthetic shadow
      const key = `${pair.yahoo}|1m|1d`;
      const cached = yCache.get(key);
      if (cached?.bars.length) natural = cached.bars[cached.bars.length - 1].c;
      else natural = pair.basePrice ?? 1;
    }
  } else {
    natural = syntheticPrice(pair, atMs);
  }
  const overrides = await loadOverrides();
  const ov = overrides.find((o) => o.symbol === symbol);
  if (!ov) return natural;
  return applyOverride(natural, ov, atMs);
}

export async function getQuoteNow(symbol: string) {
  return getPriceAt(symbol, Date.now());
}

// ---------- Candle builder ----------
// For FX/metals: pull real OHLC from Yahoo at the right interval.
// For synthetics: build candles from getPriceAt samples.
const YAHOO_INTERVAL: Record<number, { interval: string; range: string }> = {
  15_000: { interval: "1m", range: "5d" },
  60_000: { interval: "1m", range: "5d" },
  300_000: { interval: "5m", range: "1mo" },
  900_000: { interval: "15m", range: "1mo" },
  3_600_000: { interval: "60m", range: "2y" },
  14_400_000: { interval: "60m", range: "2y" },
  86_400_000: { interval: "1d", range: "max" },
  604_800_000: { interval: "1wk", range: "max" },
  2_592_000_000: { interval: "1mo", range: "max" },
};

export async function buildCandles(symbol: string, stepMs: number, count: number) {
  const pair = findPair(symbol);
  if (!pair) throw new Error("Unknown pair");
  const now = Date.now();

  if (pair.kind === "fx") {
    const cfg = YAHOO_INTERVAL[stepMs] ?? YAHOO_INTERVAL[60_000];
    let bars: YBar[] = [];
    try {
      bars = await fetchYahoo(pair.yahoo!, cfg.interval, cfg.range);
    } catch {
      bars = [];
    }
    const overrides = await loadOverrides();
    const ov = overrides.find((o) => o.symbol === symbol);
    const sliced = bars.slice(-count).map((b) => {
      if (!ov) return b;
      const o = applyOverride(b.o, ov, b.t - stepMs);
      const c = applyOverride(b.c, ov, b.t);
      const h = applyOverride(b.h, ov, b.t - stepMs / 2);
      const l = applyOverride(b.l, ov, b.t - stepMs / 2);
      return { t: b.t, o, h: Math.max(o, c, h), l: Math.min(o, c, l), c };
    });
    if (sliced.length) return sliced;
    // Fallback synthetic walk if Yahoo fails entirely
  }

  // Synthetic / fallback path — build OHLC from dense intra-candle samples so
  // long timeframes (1d / 1w / 1M) capture true highs and lows. Sample density
  // scales with step so 4× 1w candles aggregate cleanly into a 1M candle.
  const subN = Math.max(5, Math.min(60, Math.floor(stepMs / 60_000)));
  const out: { t: number; o: number; h: number; l: number; c: number }[] = [];
  for (let i = count; i > 0; i--) {
    const tEnd = now - (i - 1) * stepMs;
    const tStart = tEnd - stepMs;
    const samples = await Promise.all(
      Array.from({ length: subN + 1 }, (_, k) => getPriceAt(symbol, tStart + (stepMs * k) / subN)),
    );
    const o = samples[0];
    const c = samples[samples.length - 1];
    let h = o,
      l = o;
    for (const s of samples) {
      if (s > h) h = s;
      if (s < l) l = s;
    }
    out.push({ t: tEnd, o, h, l, c });
  }
  return out;
}
