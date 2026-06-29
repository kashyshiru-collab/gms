import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const QuoteInput = z.object({ symbol: z.string().min(3).max(16) });

function toFinnhubSymbol(pair: string): string {
  const clean = pair.replace("/", "_").toUpperCase();
  return `OANDA:${clean}`;
}

export const getForexQuote = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => QuoteInput.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) return { ok: false as const, reason: "missing_key" as const };
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(toFinnhubSymbol(data.symbol))}&token=${key}`;
      const res = await fetch(url);
      if (!res.ok) return { ok: false as const, reason: "upstream" as const, status: res.status };
      const j = (await res.json()) as { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };
      if (!j?.c) return { ok: false as const, reason: "no_data" as const };
      return {
        ok: true as const,
        symbol: data.symbol,
        price: j.c,
        change: j.d ?? 0,
        changePct: j.dp ?? 0,
        high: j.h ?? j.c,
        low: j.l ?? j.c,
        open: j.o ?? j.c,
        prevClose: j.pc ?? j.c,
        ts: j.t ?? Math.floor(Date.now() / 1000),
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
    const key = process.env.FINNHUB_API_KEY;
    const now = Math.floor(Date.now() / 1000);
    const resSecs: Record<string, number> = { "1": 60, "5": 300, "15": 900, "60": 3600, "D": 86400 };
    const span = resSecs[data.resolution] * data.count;
    const from = now - span;

    if (!key) return { ok: false as const, reason: "missing_key" as const };
    try {
      const url = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(toFinnhubSymbol(data.symbol))}&resolution=${data.resolution}&from=${from}&to=${now}&token=${key}`;
      const res = await fetch(url);
      if (!res.ok) return { ok: false as const, reason: "upstream" as const, status: res.status };
      const j = (await res.json()) as { s?: string; o?: number[]; h?: number[]; l?: number[]; c?: number[]; t?: number[] };
      if (j.s !== "ok" || !j.t?.length) return { ok: false as const, reason: "no_data" as const };
      const candles = j.t.map((t, i) => ({
        t,
        o: j.o![i],
        h: j.h![i],
        l: j.l![i],
        c: j.c![i],
      }));
      return { ok: true as const, symbol: data.symbol, candles };
    } catch (e) {
      return { ok: false as const, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });
